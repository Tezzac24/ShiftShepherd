import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const HISTORICAL_MIGRATION = join(
  ROOT,
  'supabase/migrations/20260711173139_add_team_chat_read_cursor.sql',
);
const CORRECTIVE_MIGRATION = join(
  ROOT,
  'supabase/migrations/20260711195143_migrate_chat_realtime_to_private_broadcast.sql',
);

function text(path: string): string {
  return readFileSync(path, 'utf8');
}

function sqlFunction(sql: string, name: string): string {
  const start = sql.indexOf(`create function public.${name}`);
  const end = sql.indexOf('\n$$;', start);
  if (start < 0 || end < 0) throw new Error(`Missing SQL function ${name}`);
  return sql.slice(start, end + 4);
}

function sourceFiles(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const full = join(path, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe('private chat Broadcast corrective migration', () => {
  const migration = text(CORRECTIVE_MIGRATION);
  const normalized = migration.toLowerCase();

  it('keeps the deployed read-cursor migration byte-for-byte immutable', () => {
    const hash = createHash('sha256').update(text(HISTORICAL_MIGRATION)).digest('hex').toUpperCase();
    expect(hash).toBe('550DF0CDC0D89B7761FAE8BD9DB5ADEF88AD82D0DC818432F58D9C78E9F5B11C');
  });

  it('creates minimal private message and read-state database broadcasts', () => {
    expect(normalized).toContain('create function public.broadcast_chat_message_inserted()');
    expect(normalized).toContain('create function public.broadcast_chat_read_state_changed()');
    expect(normalized).toContain("'chat_message_inserted'");
    expect(normalized).toContain("'chat_read_state_changed'");
    expect(normalized).toContain("'team-chat:' || new.team_id::text");
    expect(normalized).toContain("'profile-chat-read:' || new.user_id::text");
    expect(normalized.match(/perform realtime\.send\(/g)).toHaveLength(2);

    const messageFunction = sqlFunction(normalized, 'broadcast_chat_message_inserted()');
    expect(messageFunction).toContain("'version', 1");
    expect(messageFunction).toContain("'message_id', new.id");
    expect(messageFunction).toContain("'team_id', new.team_id");
    expect(messageFunction).toContain("'sender_id', new.sender_id");
    expect(messageFunction).toContain("'created_at', new.created_at");
    expect(messageFunction).not.toMatch(/'body'|'caption'|'file_url'|'email'|'phone'/);
    expect(messageFunction).toMatch(/'team-chat:' \|\| new\.team_id::text,\s*true/);

    const readFunction = sqlFunction(normalized, 'broadcast_chat_read_state_changed()');
    expect(readFunction).toContain("'version', 1");
    expect(readFunction).toContain("'team_id', new.team_id");
    expect(readFunction).not.toContain("'last_read_at'");
    expect(readFunction).not.toContain("'last_read_message_id'");
    expect(readFunction).toContain("tg_op = 'update'");
    expect(readFunction).toContain('is not distinct from old.last_read_at');
    expect(readFunction).toMatch(/'profile-chat-read:' \|\| new\.user_id::text,\s*true/);
  });

  it('uses hardened trigger functions and the intended trigger timing', () => {
    for (const name of [
      'broadcast_chat_message_inserted()',
      'broadcast_chat_read_state_changed()',
    ]) {
      const fn = sqlFunction(normalized, name);
      expect(fn).toContain('security definer');
      expect(fn).toContain("set search_path = ''");
    }
    expect(normalized).toContain('after insert on public.chat_messages');
    expect(normalized).toContain('after insert or update on public.chat_read_states');
    expect(normalized).toContain(
      'revoke all on function public.broadcast_chat_message_inserted()\n  from public, anon, authenticated',
    );
    expect(normalized).toContain(
      'revoke all on function public.broadcast_chat_read_state_changed()\n  from public, anon, authenticated',
    );
  });

  it('authorizes only exact fail-closed Broadcast SELECT topics', () => {
    expect(normalized).toContain('create function public.chat_broadcast_topic_uuid');
    expect(normalized).toContain('when invalid_text_representation then');
    expect(normalized).toContain("'team-chat:'");
    expect(normalized).toContain("'profile-chat-read:'");
    expect(normalized).toContain('public.can_access_team(');
    expect(normalized).toContain('= public.current_profile_id()');
    expect(normalized.match(/on realtime\.messages\s+for select\s+to authenticated/g)).toHaveLength(2);
    expect(normalized.match(/realtime\.messages\.extension = 'broadcast'/g)).toHaveLength(2);
    expect(normalized).not.toMatch(/on realtime\.messages\s+for insert/);
    expect(normalized).not.toMatch(/using\s*\(\s*true\s*\)/);
  });

  it('cuts over only the two chat publication tables and adds no unsafe transport', () => {
    expect(normalized).toContain(
      'drop table public.chat_messages, public.chat_read_states',
    );
    expect(normalized).not.toContain('add table public.chat_read_states');
    expect(normalized).not.toContain('replica identity full');
    expect(normalized).not.toMatch(/http|webhook|edge function/);
  });

  it('guards the repository against chat-specific Postgres Changes listeners', () => {
    const offenders = sourceFiles(join(ROOT, 'src'))
      .filter((path) => !path.split(/[\\/]/).includes('__tests__'))
      .filter((path) => {
        const contents = text(path);
        return (
          contents.includes('postgres_changes') &&
          /chat_messages|chat_read_states/.test(contents)
        );
      })
      .map((path) => relative(ROOT, path));
    expect(offenders).toEqual([]);

    const sharedRealtime = text(join(ROOT, 'src/lib/supabase/services/sharedRealtime.ts'));
    expect(sharedRealtime).toContain("'postgres_changes'");
    const broadcastClient = text(join(ROOT, 'src/lib/supabase/services/chatBroadcast.ts'));
    expect(broadcastClient).toContain("config: { private: true }");
    expect(broadcastClient).not.toMatch(/\.send\s*\(/);
  });
});
