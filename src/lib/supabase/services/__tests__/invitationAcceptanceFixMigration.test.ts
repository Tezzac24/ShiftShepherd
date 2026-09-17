import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = join(process.cwd(), 'supabase/migrations');
const NAME = '20260917180127_fix_invitation_acceptance_role_conflict_target.sql';
const ROTA_PUSH = '20260917124856_add_rota_push_delivery.sql';
const MEMBERSHIP = '20260712103321_add_organisation_membership_role_management.sql';
const BASELINE_CONFLICT = '  on conflict (organisation_id, user_id) do nothing;';
const FIXED_CONFLICT =
  '  on conflict on constraint organisation_roles_organisation_id_user_id_key do nothing;';

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

interface FunctionDefinition {
  name: string;
  header: string;
  body: string;
}

/**
 * The definition of every public function that the migrations leave in place:
 * each file in version order, each `create`/`drop` in statement order, with a
 * later statement replacing or removing an earlier one of the same name.
 */
function effectiveFunctions(files: string[]): Map<string, FunctionDefinition> {
  const definitions = new Map<string, FunctionDefinition>();
  const statement = /(create(?: or replace)? function|drop function(?: if exists)?) public\.(\w+)\b/gi;
  for (const file of files) {
    const sql = text(file);
    for (const match of sql.matchAll(statement)) {
      const name = match[2].toLowerCase();
      if (match[1].toLowerCase().startsWith('drop')) {
        definitions.delete(name);
        continue;
      }
      const open = sql.indexOf('as $$', match.index);
      const close = sql.indexOf('$$', open + 'as $$'.length);
      if (open < 0 || close < 0) throw new Error(`Unterminated function ${name} in ${file}`);
      definitions.set(name, {
        name,
        header: sql.slice(match.index, open).toLowerCase(),
        body: sql.slice(open + 'as $$'.length, close).toLowerCase(),
      });
    }
  }
  return definitions;
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

/**
 * PL/pgSQL exposes `returns table` columns as variables, so an unqualified
 * `on conflict (column, ...)` target that shares a result column's name raises
 * SQLSTATE 42702 ("column reference is ambiguous") the first time the
 * statement runs, even though the function compiles. Returns
 * `function:column` for every such collision the migrations leave deployed.
 */
function ambiguousConflictTargets(files: string[]): string[] {
  const collisions: string[] = [];
  for (const definition of effectiveFunctions(files).values()) {
    if (!/\blanguage plpgsql\b/.test(definition.header)) continue;
    if (definition.body.includes('#variable_conflict')) continue;
    const columns = new Set(resultColumns(definition.header));
    for (const target of definition.body.matchAll(/on\s+conflict\s*\(([^)]*)\)/g)) {
      for (const column of target[1].split(',').map((part) => part.trim())) {
        if (columns.has(column)) collisions.push(`${definition.name}:${column}`);
      }
    }
  }
  return collisions.sort();
}

// Static SQL contract checks only: they pin the migration text that will be
// deployed, not a live PostgreSQL execution of it.
describe('invitation acceptance role conflict target fix migration', () => {
  const migration = text(NAME);
  const normalized = migration.toLowerCase();
  const baseline = functionSql(text(MEMBERSHIP), 'accept_organisation_invitation_internal');
  const replacement = functionSql(migration, 'accept_organisation_invitation_internal');

  it('is the only new migration and preserves all 36 earlier migrations byte-for-byte', () => {
    const files = migrationFiles();
    expect(files).toHaveLength(37);
    expect(files.at(-1)).toBe(NAME);
    expect(files.at(-2)).toBe(ROTA_PUSH);
    const historical = files.filter((file) => file < NAME);
    const hash = createHash('sha256');
    for (const file of historical) {
      hash.update(file);
      hash.update('\0');
      hash.update(text(file));
      hash.update('\0');
    }
    expect(historical).toHaveLength(36);
    expect(hash.digest('hex').toUpperCase()).toBe(
      'B4DA974092196BAE837422319383B1A2AE74179A09032C91D31A359BA56D3098',
    );
  });

  it('runs as one transaction', () => {
    expect(normalized.trim().startsWith('-- ====')).toBe(true);
    expect(normalized).toMatch(/\nbegin;\n/);
    expect(normalized.trim().endsWith('commit;')).toBe(true);
  });

  it('replaces only accept_organisation_invitation_internal and changes no schema or data', () => {
    expect(normalized.match(/create(?: or replace)? function/g)).toHaveLength(1);
    expect(normalized).toContain(
      'create or replace function public.accept_organisation_invitation_internal(',
    );
    const outsideFunction = normalized.replace(replacement.toLowerCase(), '');
    expect(outsideFunction).not.toMatch(
      /\b(create|alter|drop)\s+(table|index|policy|trigger|type|view|extension|schema)\b/,
    );
    expect(outsideFunction).not.toMatch(/^\s*(insert into|update|delete from|truncate)\b/m);
    expect(outsideFunction).not.toMatch(/\bcomment on\b/);
  });

  it('is the deployed definition with only the role conflict target changed', () => {
    expect(baseline.split(BASELINE_CONFLICT)).toHaveLength(2);
    expect(replacement.split(FIXED_CONFLICT)).toHaveLength(2);
    expect(replacement).toBe(baseline.replace(BASELINE_CONFLICT, FIXED_CONFLICT));
    expect(replacement).not.toContain(BASELINE_CONFLICT.trim());
  });

  it('keeps the signature, result columns, definer rights, and empty search path', () => {
    const lower = replacement.toLowerCase();
    expect(lower).toContain(
      'p_caller_auth_user_id uuid,\n  p_token_hash_hex text,\n  p_global_display_name text\n)',
    );
    expect(resultColumns(lower)).toEqual([
      'invitation_id',
      'profile_id',
      'organisation_id',
      'organisation_name',
      'global_display_name',
      'already_accepted',
    ]);
    expect(lower).toContain('language plpgsql');
    expect(lower).toContain('security definer');
    expect(lower).toContain("set search_path = ''");
  });

  it('keeps the transactional acceptance checks and baseline-only reactivation', () => {
    const lower = replacement.toLowerCase();
    expect(lower).toContain('where invitation.token_hash = decode(p_token_hash_hex, \'hex\')\n  for update;');
    expect(lower).toContain("message = 'verified_email_required'");
    expect(lower).toContain("message = 'invitation_email_mismatch'");
    expect(lower).toContain("message = 'invitation_acceptance_incomplete'");
    expect(lower).toContain("message = 'organisation_already_joined'");
    expect(lower).toContain('v_was_removed := v_profile.access_status = \'removed\';');
    expect(lower).toContain(
      "insert into public.organisation_roles (organisation_id, user_id, role)\n  values (v_profile.organisation_id, v_profile.id, 'general_member')",
    );
    expect(lower).toContain(
      'update public.user_accounts\n  set active_profile_id = v_profile.id\n  where auth_user_id = p_caller_auth_user_id;',
    );
  });

  it('restates service-role-only execution', () => {
    expect(normalized).toContain(
      'revoke all on function public.accept_organisation_invitation_internal(uuid, text, text)\n  from public, anon, authenticated;',
    );
    expect(normalized).toContain(
      'grant execute on function public.accept_organisation_invitation_internal(uuid, text, text)\n  to service_role;',
    );
    expect(normalized.match(/^(grant|revoke) /gm)).toHaveLength(2);
    expect(normalized).not.toMatch(/^grant [^;]* to (anon|authenticated|public)\b/m);
  });
});

describe('PL/pgSQL conflict targets never shadow result columns', () => {
  it('detects the acceptance defect in the migrations deployed before this fix', () => {
    const beforeFix = migrationFiles().filter((file) => file < NAME);
    expect(ambiguousConflictTargets(beforeFix)).toEqual([
      'accept_organisation_invitation_internal:organisation_id',
      'mark_team_chat_read:team_id',
    ]);
  });

  it('leaves only the known chat read cursor collision after this fix', () => {
    // mark_team_chat_read (20260711173139) has the same defect: its
    // `on conflict (user_id, team_id)` target shadows the `team_id` result
    // column, and the deployed function raises 42702 on every call. It is
    // outside invitation acceptance and is tracked separately; remove it from
    // this list when it is fixed. Any new collision fails here.
    expect(ambiguousConflictTargets(migrationFiles())).toEqual(['mark_team_chat_read:team_id']);
  });
});
