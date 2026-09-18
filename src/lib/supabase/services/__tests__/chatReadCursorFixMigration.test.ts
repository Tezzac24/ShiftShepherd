import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = join(process.cwd(), 'supabase/migrations');
const NAME = '20260917223118_fix_chat_read_cursor_conflict_target.sql';
const ACCEPTANCE_FIX = '20260917180127_fix_invitation_acceptance_role_conflict_target.sql';
const READ_CURSOR = '20260711173139_add_team_chat_read_cursor.sql';
const READ_STATES_TABLE = '20260710031212_add_chat_read_states.sql';
const TEAM_LIFECYCLE = '20260715004513_add_team_creation_editing_and_archive.sql';
const BASELINE_CONFLICT = '  on conflict (user_id, team_id) do update';
const FIXED_CONFLICT =
  '  on conflict on constraint chat_read_states_user_id_team_id_key do update';
const CREATE = 'create function public.mark_team_chat_read(';
const CREATE_OR_REPLACE = 'create or replace function public.mark_team_chat_read(';

function text(file: string): string {
  return readFileSync(join(MIGRATIONS, file), 'utf8');
}

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((file) => file.endsWith('.sql'))
    .sort();
}

/** The complete `create ... function public.<name>` statement, as written. */
function functionSql(sql: string, name: string): string {
  const marker = new RegExp(`create(?: or replace)? function public\\.${name}\\b`, 'i');
  const match = marker.exec(sql);
  if (!match) throw new Error(`Missing function ${name}`);
  const end = sql.indexOf('\n$$;', match.index);
  if (end < 0) throw new Error(`Unterminated function ${name}`);
  return sql.slice(match.index, end + 4);
}

/** Top-level column names of a `returns table (...)` clause. */
function resultColumns(header: string): string[] {
  const start = header.indexOf('returns table');
  if (start < 0) return [];
  const open = header.indexOf('(', start);
  let depth = 0;
  let current = '';
  const columns: string[] = [];
  for (const character of header.slice(open)) {
    if (character === '(') {
      depth += 1;
      if (depth === 1) continue;
    }
    if (character === ')') {
      depth -= 1;
      if (depth === 0) {
        columns.push(current);
        break;
      }
    }
    if (character === ',' && depth === 1) {
      columns.push(current);
      current = '';
      continue;
    }
    current += character;
  }
  return columns.map((column) => column.trim().split(/\s+/)[0]).filter(Boolean);
}

// Static SQL contract checks only: they pin the migration text that will be
// deployed, not a live PostgreSQL execution of it.
describe('chat read cursor conflict target fix migration', () => {
  const migration = text(NAME);
  const normalized = migration.toLowerCase();
  const baseline = functionSql(text(READ_CURSOR), 'mark_team_chat_read');
  const replacement = functionSql(migration, 'mark_team_chat_read');

  it('is the only new migration and preserves all 37 earlier migrations byte-for-byte', () => {
    const files = migrationFiles();
    expect(files).toHaveLength(38);
    expect(files.at(-1)).toBe(NAME);
    expect(files.at(-2)).toBe(ACCEPTANCE_FIX);
    const historical = files.filter((file) => file < NAME);
    const hash = createHash('sha256');
    for (const file of historical) {
      hash.update(file);
      hash.update('\0');
      hash.update(text(file));
      hash.update('\0');
    }
    expect(historical).toHaveLength(37);
    expect(hash.digest('hex').toUpperCase()).toBe(
      '3E24E60331A41B1512787162FF184745C6CD6360D7032E127057B04E42BA49EE',
    );
  });

  it('runs as one transaction', () => {
    expect(normalized.trim().startsWith('-- ====')).toBe(true);
    expect(normalized).toMatch(/\nbegin;\n/);
    expect(normalized.trim().endsWith('commit;')).toBe(true);
  });

  it('replaces only mark_team_chat_read and changes no schema or data', () => {
    expect(normalized.match(/create(?: or replace)? function/g)).toHaveLength(1);
    expect(normalized).toContain(CREATE_OR_REPLACE);
    const outsideFunction = normalized.replace(replacement.toLowerCase(), '');
    expect(outsideFunction).not.toMatch(
      /\b(create|alter|drop)\s+(table|index|policy|trigger|type|view|extension|schema|publication)\b/,
    );
    expect(outsideFunction).not.toMatch(/^\s*(insert into|update|delete from|truncate)\b/m);
    expect(outsideFunction).not.toMatch(/\bcomment on\b/);
    // The rollout backfill and the publication change belong to the original
    // migration and must never be replayed.
    expect(normalized).not.toContain('alter publication');
    expect(normalized).not.toContain('chat_read_states rs\nset');
  });

  it('is the deployed definition with only the conflict target changed', () => {
    expect(baseline.split(BASELINE_CONFLICT)).toHaveLength(2);
    expect(baseline.split(CREATE)).toHaveLength(2);
    expect(replacement.split(FIXED_CONFLICT)).toHaveLength(2);
    expect(replacement).toBe(
      baseline.replace(CREATE, CREATE_OR_REPLACE).replace(BASELINE_CONFLICT, FIXED_CONFLICT),
    );
    expect(replacement).not.toContain(BASELINE_CONFLICT.trim());
  });

  it('names a unique constraint the migration history actually creates', () => {
    // `unique (user_id, team_id)` declared inline on public.chat_read_states
    // gets PostgreSQL's default constraint name, which is what the fixed
    // conflict target must reference. A named constraint is not resolved
    // against PL/pgSQL variables, which is the whole point of the change.
    const table = text(READ_STATES_TABLE).toLowerCase();
    expect(table).toContain('create table public.chat_read_states (');
    expect(table).toContain('unique (user_id, team_id)');
    expect(table).not.toMatch(/constraint\s+\w+\s+unique\s*\(user_id,\s*team_id\)/);
    expect(FIXED_CONFLICT).toContain('chat_read_states_user_id_team_id_key');
    const others = migrationFiles().filter(
      (file) => file !== READ_STATES_TABLE && file !== NAME,
    );
    for (const file of others) {
      expect(text(file)).not.toMatch(/chat_read_states[\s\S]{0,200}?drop constraint/i);
    }
  });

  it('keeps the signature, result columns, volatility, definer rights, and empty search path', () => {
    const lower = replacement.toLowerCase();
    expect(lower).toContain('p_team_id uuid,\n  p_message_id uuid\n)');
    expect(resultColumns(lower)).toEqual([
      'team_id',
      'last_read_message_id',
      'last_read_at',
    ]);
    expect(lower).toContain('language plpgsql');
    expect(lower).toContain('volatile');
    expect(lower).toContain('security definer');
    expect(lower).toContain("set search_path = ''");
  });

  it('keeps the caller-derived profile, access check and server-derived cursor', () => {
    const lower = replacement.toLowerCase();
    expect(lower).toContain('v_profile_id := public.current_profile_id();');
    expect(lower).toContain("raise exception 'no linked profile for the current user';");
    expect(lower).toContain('if not public.can_access_team(p_team_id) then');
    expect(lower).toContain("raise exception 'team chat is not accessible';");
    expect(lower).toContain("raise exception 'message not found for team';");
    // The cursor timestamp is read from the message, never supplied.
    expect(lower).toContain('select cm.created_at into v_created_at');
    expect(lower).not.toMatch(/p_(profile|user|caller|read|last_read)_/);
    expect(lower).not.toContain('now()');
  });

  it('keeps the forward-only upsert guard exactly', () => {
    expect(replacement).toContain(
      '    where excluded.last_read_at > rs.last_read_at\n' +
        '       or (excluded.last_read_at = rs.last_read_at\n' +
        '           and (rs.last_read_message_id is null\n' +
        '                or excluded.last_read_message_id > rs.last_read_message_id));',
    );
    expect(replacement).toContain(
      '    set last_read_message_id = excluded.last_read_message_id,\n' +
        '        last_read_at = excluded.last_read_at',
    );
  });

  it('restates authenticated-only execution', () => {
    expect(normalized).toContain(
      'revoke all on function public.mark_team_chat_read(uuid, uuid) from public, anon;',
    );
    expect(normalized).toContain(
      'grant execute on function public.mark_team_chat_read(uuid, uuid) to authenticated;',
    );
    expect(normalized.match(/^(grant|revoke) /gm)).toHaveLength(2);
    expect(normalized).not.toMatch(/^grant [^;]* to (anon|public|service_role)\b/m);
  });
});

describe('the rest of the chat read-state function family', () => {
  // The other half of the pair. It was last replaced by the team lifecycle
  // migration, so that is the definition deployed today.
  const summary = functionSql(text(TEAM_LIFECYCLE), 'get_team_chat_unread_summary');

  it('is only ever defined by the read cursor and team lifecycle migrations', () => {
    const definers = migrationFiles().filter((file) =>
      /create(?: or replace)? function public\.get_team_chat_unread_summary\b/.test(text(file)),
    );
    expect(definers).toEqual([READ_CURSOR, TEAM_LIFECYCLE]);
    const markers = migrationFiles().filter((file) =>
      /create(?: or replace)? function public\.mark_team_chat_read\b/.test(text(file)),
    );
    expect(markers).toEqual([READ_CURSOR, NAME]);
  });

  it('reads only, so it has no conflict target to be ambiguous', () => {
    const lower = summary.toLowerCase();
    expect(lower).toContain('stable');
    expect(lower).not.toContain('on conflict');
    expect(lower).not.toMatch(/\b(insert into|update\s+public\.|delete from)\b/);
  });

  it('qualifies every column reference, so no result column can shadow one', () => {
    const lower = summary.toLowerCase();
    const body = lower.slice(lower.indexOf('return query'));
    const columns = resultColumns(lower);
    expect(columns).toContain('team_id');
    expect(columns).toContain('last_read_at');
    // Every occurrence of a result column name inside the query body is either
    // alias-qualified, a `... as <name>` output label, or part of the `from`
    // list - never a bare column reference PL/pgSQL could bind to a variable.
    for (const column of columns) {
      for (const match of body.matchAll(new RegExp(`(.{0,24})\\b${column}\\b`, 'g'))) {
        const prefix = match[1];
        const qualified = /\w\.$/.test(prefix);
        const labelled = /\bas\s+$/.test(prefix);
        expect(qualified || labelled).toBe(true);
      }
    }
  });
});
