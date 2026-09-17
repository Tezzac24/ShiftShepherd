import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = join(process.cwd(), 'supabase/migrations');
const NAME = '20260714200205_add_push_token_revocation.sql';
const TEAM_LIFECYCLE = '20260715004513_add_team_creation_editing_and_archive.sql';
const TEAM_ROLE = '20260719110500_add_team_role_management.sql';
const TEAM_CREATION_IDEMPOTENCY = '20260917093926_add_team_creation_idempotency.sql';
const ANNOUNCEMENT_PUSH = '20260917110331_add_announcement_push_delivery.sql';

function text(path: string): string {
  return readFileSync(path, 'utf8');
}

function functionSql(sql: string, name: string): string {
  const marker = new RegExp(`create(?: or replace)? function public\\.${name}\\b`, 'i');
  const match = marker.exec(sql);
  if (!match) throw new Error(`Missing function ${name}`);
  const end = sql.indexOf('\n$$;', match.index);
  if (end < 0) throw new Error(`Unterminated function ${name}`);
  return sql.slice(match.index, end + 4).toLowerCase();
}

describe('push token lifecycle migration contract', () => {
  const migration = text(join(MIGRATIONS, NAME));
  const normalized = migration.toLowerCase();
  const unregister = functionSql(migration, 'unregister_push_token');

  it('remains immediately before the team lifecycle, team role, team creation idempotency, and announcement push delivery migrations', () => {
    const files = readdirSync(MIGRATIONS).filter((file) => file.endsWith('.sql')).sort();
    expect(files).toHaveLength(35);
    expect(files.at(-1)).toBe(ANNOUNCEMENT_PUSH);
    expect(files.at(-2)).toBe(TEAM_CREATION_IDEMPOTENCY);
    expect(files.at(-3)).toBe(TEAM_ROLE);
    expect(files.at(-4)).toBe(TEAM_LIFECYCLE);
    expect(files.at(-5)).toBe(NAME);
    expect(files.at(-6)).toBe(
      '20260712103321_add_organisation_membership_role_management.sql',
    );
  });

  it('creates one p_token-only SECURITY DEFINER function with an empty search path', () => {
    expect(normalized).toContain(
      'create function public.unregister_push_token(p_token text)',
    );
    expect(unregister).toContain('returns boolean');
    expect(unregister).toContain('language plpgsql');
    expect(unregister).toContain('security definer');
    expect(unregister).toContain("set search_path = ''");
    expect(unregister).not.toMatch(/p_(auth|user|profile|organisation|caller)/);
  });

  it('derives auth.uid server-side and deletes only account-owned profile tokens', () => {
    expect(unregister).toContain('v_auth_user_id uuid := (select auth.uid())');
    expect(unregister).toContain('delete from public.push_tokens');
    expect(unregister).toContain('using public.profiles');
    expect(unregister).toContain('profile.id = token_row.user_id');
    expect(unregister).toContain('profile.auth_user_id = v_auth_user_id');
    expect(unregister).not.toContain('public.current_profile_id()');
  });

  it('validates only unsafe input bounds and returns idempotent deletion status', () => {
    expect(unregister).toContain('p_token is null');
    expect(unregister).toContain('pg_catalog.char_length(p_token) > 512');
    expect(unregister).toContain("errcode = 'p0001'");
    expect(unregister).toContain("message = 'invalid_expo_push_token'");
    expect(unregister).toContain('get diagnostics v_deleted_count = row_count');
    expect(unregister).toContain('return v_deleted_count > 0');
    expect(unregister).not.toContain('token_not_found');
  });

  it('exposes execute to authenticated only', () => {
    expect(normalized).toContain(
      'revoke all on function public.unregister_push_token(text) from public, anon, authenticated',
    );
    expect(normalized).toContain(
      'grant execute on function public.unregister_push_token(text) to authenticated',
    );
  });

  it('does not alter push tables, preferences, history, or unrelated access state', () => {
    expect(normalized).not.toMatch(/alter table public\.(push_tokens|notification_preferences|push_notification_deliveries)/);
    expect(normalized).not.toMatch(/(insert into|update|delete from) public\.notification_preferences/);
    expect(normalized).not.toMatch(/(insert into|update|delete from) public\.push_notification_deliveries/);
    expect(normalized).not.toMatch(/(insert into|update|delete from) public\.(user_accounts|team_memberships|organisation_roles)/);
    expect(normalized).not.toContain('access_status');
  });

  it('relies on the existing delivery-history ON DELETE SET NULL foreign key', () => {
    const deliveryFoundation = text(
      join(MIGRATIONS, '20260710234443_add_push_delivery_foundation.sql'),
    ).toLowerCase();
    expect(deliveryFoundation).toMatch(
      /push_token_id\s+uuid references public\.push_tokens \(id\) on delete set null/,
    );
  });
});
