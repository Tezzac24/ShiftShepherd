import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = join(process.cwd(), 'supabase/migrations');
const NAME = '20260719110500_add_team_role_management.sql';
const MIGRATION = join(MIGRATIONS, NAME);

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

// Static SQL contract checks only: they pin the migration text that will be
// deployed, not a live PostgreSQL execution of it.
describe('team role management migration contract', () => {
  const migration = text(MIGRATION);
  const normalized = migration.toLowerCase();
  const setRole = functionSql(migration, 'set_team_member_role');

  it('is the only new migration and preserves all 32 earlier migrations byte-for-byte', () => {
    const files = readdirSync(MIGRATIONS).filter((file) => file.endsWith('.sql')).sort();
    expect(files).toHaveLength(33);
    expect(files.at(-1)).toBe(NAME);
    expect(files.at(-2)).toBe('20260715004513_add_team_creation_editing_and_archive.sql');
    const historical = files.filter((file) => file !== NAME);
    const hash = createHash('sha256');
    for (const file of historical) {
      hash.update(file);
      hash.update('\0');
      hash.update(text(join(MIGRATIONS, file)));
      hash.update('\0');
    }
    expect(historical).toHaveLength(32);
    expect(hash.digest('hex').toUpperCase()).toBe(
      '66B72EC08522683D19C935037FBD71AD065FAC778C0D45C4A937BE77232162EB',
    );
  });

  it('is hardened and derives caller identity and organisation server-side', () => {
    expect(setRole).toContain(
      'set_team_member_role(\n  p_team_id uuid,\n  p_profile_id uuid,\n  p_role public.team_role\n)',
    );
    expect(setRole).toContain('language plpgsql');
    expect(setRole).toContain('security definer');
    expect(setRole).toContain("set search_path = ''");
    expect(setRole).toContain('v_auth_user_id uuid := (select auth.uid())');
    expect(setRole).toContain('v_caller_profile_id uuid := public.current_profile_id()');
    expect(setRole).toContain("profile.access_status = 'active'");
    expect(setRole).toContain('public.is_church_admin(v_organisation_id)');
    expect(setRole).toContain('from public.user_accounts account');
    expect(setRole).toContain('account.auth_user_id = v_auth_user_id');
    expect(setRole).toContain('public.current_profile_id() is distinct from v_caller_profile_id');
    expect(setRole).not.toMatch(/p_(organisation|org|auth_user|caller)_id/);
    expect(setRole).not.toContain('execute ');
    expect(setRole).toContain("message = 'not_authenticated'");
    expect(setRole).toContain("message = 'no_linked_profile'");
    expect(setRole).toContain("message = 'organisation_access_removed'");
    expect(setRole).toContain("message = 'not_authorised'");
  });

  it('requires church-admin authority rather than can_manage_team', () => {
    expect(setRole).not.toContain('can_manage_team');
    expect(setRole).not.toContain('is_team_leader');
    expect(setRole).toContain('if not coalesce(public.is_church_admin(v_organisation_id), false)');
  });

  it('locks the organisation-scoped team before the membership and rejects archived teams', () => {
    expect(setRole).toContain('team.organisation_id = v_organisation_id');
    expect(setRole).toContain("message = 'team_not_found'");
    expect(setRole).toContain('v_team.archived_at is not null');
    expect(setRole).toContain("message = 'team_archived'");
    const teamLock = setRole.indexOf('from public.teams team');
    const membershipLock = setRole.indexOf('from public.team_memberships membership');
    const update = setRole.indexOf('update public.team_memberships');
    expect(teamLock).toBeGreaterThan(-1);
    expect(teamLock).toBeLessThan(membershipLock);
    expect(membershipLock).toBeLessThan(update);
    expect(setRole.indexOf("message = 'team_archived'")).toBeLessThan(update);
    // Both the team row and the target membership row are locked before write.
    expect(setRole.match(/for update/g)!.length).toBeGreaterThanOrEqual(3);
  });

  it('requires an existing active same-organisation linked target membership', () => {
    expect(setRole).toContain('profile.id = p_profile_id');
    expect(setRole).toContain('profile.organisation_id = v_team.organisation_id');
    expect(setRole).toContain('profile.auth_user_id is not null');
    expect(setRole).toContain("message = 'membership_not_found'");
    expect(setRole).toContain('membership.team_id = p_team_id');
    expect(setRole).toContain('membership.user_id = p_profile_id');
  });

  it('updates only the existing membership role, idempotently, with no final-leader block', () => {
    expect(setRole).toContain("message = 'invalid_role'");
    expect(setRole).toContain('if v_membership.role is distinct from p_role then');
    expect(setRole).toContain('set role = p_role');
    expect(setRole).not.toContain('insert into');
    expect(setRole).not.toContain('delete from');
    expect(setRole).not.toContain('final_team_admin');
    expect(setRole).not.toContain('count(*)');
    expect(setRole).not.toContain('v_caller_profile_id, ');
    expect(setRole).toContain("message = 'conflict_retry'");
    expect(setRole).toContain(
      'return query select\n    v_membership.id,\n    v_membership.team_id,\n    v_membership.user_id,\n    v_membership.role,\n    v_membership.created_at;',
    );
  });

  it('grants execution to authenticated only', () => {
    expect(normalized).toContain(
      'revoke all on function public.set_team_member_role(uuid, uuid, public.team_role)\n  from public, anon, authenticated',
    );
    expect(normalized).toContain(
      'grant execute on function public.set_team_member_role(uuid, uuid, public.team_role) to authenticated',
    );
    expect(normalized).not.toContain('service_role');
  });

  it('changes no table, column, enum, policy, trigger, publication, or existing data', () => {
    expect(normalized).not.toMatch(/create table|alter table|drop table|drop column|add column/);
    expect(normalized).not.toMatch(/create type|alter type|drop type/);
    expect(normalized).not.toMatch(/create policy|alter policy|drop policy/);
    expect(normalized).not.toMatch(/create trigger|drop trigger/);
    expect(normalized).not.toMatch(/create index|drop index/);
    expect(normalized).not.toContain('alter publication');
    expect(normalized).not.toContain('auth.users');
    expect(normalized).not.toMatch(/update public\.(?!team_memberships)/);
    expect(normalized).not.toContain('push_tokens');
    expect(normalized).not.toContain('organisation_invitations');
  });
});
