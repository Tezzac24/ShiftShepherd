import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = join(process.cwd(), 'supabase/migrations');
const NAME = '20260712103321_add_organisation_membership_role_management.sql';
const PUSH_LIFECYCLE = '20260714200205_add_push_token_revocation.sql';
const TEAM_LIFECYCLE = '20260715004513_add_team_creation_editing_and_archive.sql';
const TEAM_ROLE = '20260719110500_add_team_role_management.sql';
const TEAM_CREATION_IDEMPOTENCY = '20260917093926_add_team_creation_idempotency.sql';
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

describe('organisation membership and role management migration', () => {
  const migration = text(MIGRATION);
  const normalized = migration.toLowerCase();

  it('preserves the membership migration and all 29 migrations before it byte-for-byte', () => {
    const files = readdirSync(MIGRATIONS).filter((file) => file.endsWith('.sql')).sort();
    expect(files).toHaveLength(34);
    expect(files.at(-5)).toBe(NAME);
    expect(files.at(-4)).toBe(PUSH_LIFECYCLE);
    expect(files.at(-3)).toBe(TEAM_LIFECYCLE);
    expect(files.at(-2)).toBe(TEAM_ROLE);
    expect(files.at(-1)).toBe(TEAM_CREATION_IDEMPOTENCY);
    const historical = files.filter(
      (file) =>
        file !== NAME &&
        file !== PUSH_LIFECYCLE &&
        file !== TEAM_LIFECYCLE &&
        file !== TEAM_ROLE &&
        file !== TEAM_CREATION_IDEMPOTENCY,
    );
    const hash = createHash('sha256');
    for (const file of historical) {
      hash.update(file);
      hash.update('\0');
      hash.update(text(join(MIGRATIONS, file)));
      hash.update('\0');
    }
    expect(historical).toHaveLength(29);
    expect(hash.digest('hex').toUpperCase()).toBe(
      '10DC3C175DFD22CCA439C2EE101B82086B81B25AFAB1325D6FD707C926AF16FC',
    );
  });

  it('adds explicit active/removed profile state with audit consistency and indexes', () => {
    expect(normalized).toContain("create type public.organisation_access_status as enum ('active', 'removed')");
    expect(normalized).toContain("access_status public.organisation_access_status not null default 'active'");
    expect(normalized).toContain('profiles_access_state_consistency_check');
    expect(normalized).toContain("access_removal_reason in ('admin_removed', 'self_left')");
    expect(normalized).toContain('profiles_organisation_access_name_idx');
    expect(normalized).toContain('profiles_auth_active_idx');
    expect(normalized).not.toMatch(/update public\.profiles\s+set id\s*=/);
  });

  it('prevents an inactive profile from remaining or becoming the active profile', () => {
    const validator = functionSql(migration, 'validate_user_account_active_profile');
    expect(validator).toContain("profile.access_status = 'active'");
    const transition = functionSql(migration, 'validate_profile_access_transition');
    expect(transition).toContain('account.active_profile_id = new.id');
    expect(transition).toContain('active_profile_repair_required');
    expect(normalized).toContain('profiles_validate_access_transition');
  });

  it('excludes removed access from current profile, account context, switching, and no-org creation checks', () => {
    expect(functionSql(migration, 'current_profile_id')).toContain("profile.access_status = 'active'");
    const context = functionSql(migration, 'get_account_context');
    expect(context).toContain("profile.access_status = 'active'");
    expect(context).toContain("active_profile.access_status = 'active'");
    expect(functionSql(migration, 'switch_active_profile')).toContain("profile.access_status = 'active'");
    expect(functionSql(migration, 'create_organisation')).toContain("profile.access_status = 'active'");
  });

  it('repairs active profile deterministically for zero, one, several, and non-active removals', () => {
    const repair = functionSql(migration, 'repair_active_profile_after_access_loss');
    expect(repair).toContain('for update');
    expect(repair).toContain("profile.access_status = 'active'");
    expect(repair).toContain('array_agg(profile.id order by profile.created_at, profile.id)');
    expect(repair).toContain("v_remaining_count = 1");
    expect(repair).toContain("'selected_remaining'");
    expect(repair).toContain("'choose_organisation'");
    expect(repair).toContain("'no_organisations'");
    expect(repair).toContain("'active_unchanged'");
    expect(repair).toContain('set updated_at = now()');
    expect(repair).toContain('security invoker');
  });

  it('provides one bounded, case-insensitive, stable admin member read model', () => {
    const list = functionSql(migration, 'list_organisation_members');
    expect(list).toContain('v_caller_profile_id uuid := public.current_profile_id()');
    expect(list).toContain('public.is_church_admin(v_organisation_id)');
    expect(list).toContain('least(greatest(coalesce(p_limit, 100), 1), 200)');
    expect(list).toContain('pg_catalog.strpos(lower(profile.full_name), v_search)');
    expect(list).toContain('pg_catalog.strpos(lower(profile.email), v_search)');
    expect(list).toContain('order by');
    expect(list).toContain('lower(profile.full_name)');
    expect(list).toContain('count(distinct membership.id)');
    expect(list).not.toContain('token_hash');
    expect(list).not.toContain('push_tokens');
    expect(list).not.toContain('auth_user_id uuid');
  });

  it('uses only the four supported exclusive roles and rejects arbitrary strings', () => {
    const role = functionSql(migration, 'set_organisation_member_role');
    for (const value of ['church_admin', 'announcement_manager', 'event_manager', 'general_member']) {
      expect(role).toContain(`'${value}'`);
    }
    expect(role).toContain('invalid_role');
    expect(role).toContain('p_role::public.organisation_role_name');
    expect(role).toContain('on conflict (organisation_id, user_id) do update');
    expect(role).toContain('set role = excluded.role');
  });

  it('allows role management only for active linked same-org targets by a current admin', () => {
    const role = functionSql(migration, 'set_organisation_member_role');
    expect(role).toContain('v_caller_profile_id uuid := public.current_profile_id()');
    expect(role).toContain('profile.organisation_id = v_organisation_id');
    expect(role).toContain("v_target.access_status <> 'active'");
    expect(role).toContain('v_target.auth_user_id is null');
    expect(role).toContain('public.is_church_admin(v_organisation_id)');
  });

  it('serializes every last-admin mutation on the same organisation row', () => {
    for (const name of [
      'set_organisation_member_role',
      'remove_organisation_member',
      'leave_organisation',
    ]) {
      const fn = functionSql(migration, name);
      const lock = fn.indexOf('from public.organisations organisation');
      const forUpdate = fn.indexOf('for update', lock);
      const count = fn.indexOf('select count(*)::integer', forUpdate);
      expect(lock).toBeGreaterThan(0);
      expect(forUpdate).toBeGreaterThan(lock);
      expect(count).toBeGreaterThan(forUpdate);
      expect(fn).toContain("role_row.role = 'church_admin'");
      expect(fn).toContain("profile.access_status = 'active'");
      expect(fn).toContain('profile.auth_user_id is not null');
      expect(fn).toContain('last_church_admin');
    }
  });

  it('admin removal rejects self/cross-org/inactive/unlinked targets and repairs before removal', () => {
    const remove = functionSql(migration, 'remove_organisation_member');
    expect(remove).toContain('cannot_remove_self_here');
    expect(remove).toContain('profile.organisation_id = v_organisation_id');
    expect(remove).toContain('member_not_found');
    expect(remove).toContain('already_removed');
    expect(remove).toContain('member_not_linked');
    expect(remove.indexOf('public.repair_active_profile_after_access_loss')).toBeLessThan(
      remove.indexOf("set access_status = 'removed'"),
    );
  });

  it('removal revokes only current authority/access/delivery endpoints', () => {
    for (const name of ['remove_organisation_member', 'leave_organisation']) {
      const fn = functionSql(migration, name);
      expect(fn).toContain('delete from public.organisation_roles');
      expect(fn).toContain('delete from public.team_memberships');
      expect(fn).toContain('delete from public.push_tokens');
      expect(fn).not.toContain('delete from public.profiles');
      expect(fn).not.toContain('delete from public.user_accounts');
      expect(fn).not.toContain('auth.users');
      for (const historical of [
        'chat_messages',
        'rota_assignments',
        'availability_responses',
        'announcements',
        'events',
        'songs',
        'notification_preferences',
        'chat_read_states',
        'push_notification_deliveries',
      ]) {
        expect(fn).not.toContain(`delete from public.${historical}`);
      }
    }
  });

  it('leave derives identity entirely server-side and has no organisation/profile input', () => {
    const leave = functionSql(migration, 'leave_organisation');
    expect(leave).toContain('v_auth_user_id uuid := (select auth.uid())');
    expect(leave).toContain('v_caller_profile_id uuid := public.current_profile_id()');
    expect(normalized).toContain('create function public.leave_organisation()');
    expect(normalized).not.toContain('create function public.leave_organisation(p_');
  });

  it('prevents removed profiles from being added back to teams directly', () => {
    const addTeam = functionSql(migration, 'add_team_member');
    expect(addTeam).toContain("profile.access_status = 'active'");
    expect(addTeam).toContain('profile.auth_user_id is not null');
    expect(addTeam).toContain('for update');
  });

  it('serializes push registration with access removal on the same profile row', () => {
    const register = functionSql(migration, 'register_push_token');
    expect(register).toContain('v_profile_id uuid := public.current_profile_id()');
    expect(register).toContain("profile.access_status = 'active'");
    expect(register).toContain('profile.auth_user_id = v_auth_user_id');
    expect(register).toContain('for update');
    expect(register).toContain('organisation_access_removed');
    expect(normalized).toContain(
      'revoke all on function public.register_push_token(text, text) from public, anon, authenticated',
    );
    expect(normalized).toContain(
      'grant execute on function public.register_push_token(text, text) to authenticated',
    );
  });

  it('publishes only the owner-RLS account row as an active-scope invalidation', () => {
    expect(normalized).toContain(
      'alter publication supabase_realtime add table public.user_accounts',
    );
    expect(normalized).not.toContain('replica identity full');
  });

  it('allows removed-profile invitation targeting without allowing active linked duplicates', () => {
    const validator = functionSql(migration, 'validate_organisation_invitation');
    const issue = functionSql(migration, 'issue_organisation_invitation_internal');
    expect(validator).toContain("v_target_access_status <> 'removed'");
    expect(issue).toContain("v_target_access_status <> 'removed'");
    expect(issue).toContain('profile_already_linked');
    expect(issue).toContain("profile.access_status = 'active'");
  });

  it('reactivates the same profile with baseline role and no stale authority', () => {
    const accept = functionSql(migration, 'accept_organisation_invitation_internal');
    expect(accept).toContain('where profile.id = v_invitation.target_profile_id');
    expect(accept).toContain("v_was_removed := v_profile.access_status = 'removed'");
    expect(accept).toContain("access_status = 'active'");
    expect(accept).toContain('access_removed_at = null');
    expect(accept).toContain('delete from public.organisation_roles');
    expect(accept).toContain('delete from public.team_memberships');
    expect(accept).toContain('delete from public.push_tokens');
    expect(accept).toContain("values (v_profile.organisation_id, v_profile.id, 'general_member')");
    expect(accept).not.toContain("values (v_profile.organisation_id, v_profile.id, 'church_admin')");
    expect(accept).toContain('set active_profile_id = v_profile.id');
  });

  it('keeps accepted invitation replay safe for the same account', () => {
    const accept = functionSql(migration, 'accept_organisation_invitation_internal');
    expect(accept).toContain("if v_invitation.status = 'accepted'");
    expect(accept).toContain('v_invitation.accepted_by_auth_user_id <> p_caller_auth_user_id');
    expect(accept).toContain("profile.access_status = 'active'");
    expect(accept).toContain('true');
  });

  it('removes the permissive direct role-write policy and retains SELECT-only app grants', () => {
    expect(normalized).toContain('drop policy if exists "church admins manage organisation roles"');
    expect(normalized).toContain('revoke all on table public.organisation_roles from anon, authenticated');
    expect(normalized).toContain('grant select on table public.organisation_roles to authenticated');
    expect(normalized).toContain('revoke insert, update, delete on table public.profiles from anon, authenticated');
    expect(normalized).not.toMatch(/grant (insert|update|delete) on table public\.organisation_roles to authenticated/);
  });

  it('exposes only intended app RPCs and keeps internal/service functions restricted', () => {
    for (const name of [
      'list_organisation_members(text, integer)',
      'set_organisation_member_role(uuid, text)',
      'remove_organisation_member(uuid)',
      'leave_organisation()',
    ]) {
      expect(normalized).toContain(`revoke all on function public.${name} from public, anon, authenticated`);
      expect(normalized).toContain(`grant execute on function public.${name} to authenticated`);
    }
    expect(normalized).toContain(
      'revoke all on function public.repair_active_profile_after_access_loss(uuid, uuid)',
    );
    expect(normalized).not.toContain(
      'grant execute on function public.repair_active_profile_after_access_loss(uuid, uuid) to authenticated',
    );
    expect(normalized).toMatch(
      /grant execute on function public\.issue_organisation_invitation_internal[\s\S]*?to service_role/,
    );
  });

  it('pins every SECURITY DEFINER search path to empty', () => {
    const definitions = [
      ...migration.matchAll(/create(?: or replace)? function public\.([a-z0-9_]+)[\s\S]*?\n\$\$;/gi),
    ];
    expect(definitions.length).toBeGreaterThan(12);
    for (const definition of definitions) {
      if (/security definer/i.test(definition[0])) {
        expect(definition[0].toLowerCase()).toContain("set search_path = ''");
      }
    }
  });
});
