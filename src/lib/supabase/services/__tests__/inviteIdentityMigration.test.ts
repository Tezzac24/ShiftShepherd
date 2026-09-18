import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const MIGRATIONS = join(ROOT, 'supabase/migrations');
const NEW_NAME = '20260712001940_add_invite_onboarding_identity_foundation.sql';
const MEMBERSHIP_NAME = '20260712103321_add_organisation_membership_role_management.sql';
const PUSH_LIFECYCLE_NAME = '20260714200205_add_push_token_revocation.sql';
const TEAM_LIFECYCLE_NAME = '20260715004513_add_team_creation_editing_and_archive.sql';
const TEAM_ROLE_NAME = '20260719110500_add_team_role_management.sql';
const TEAM_CREATION_IDEMPOTENCY_NAME = '20260917093926_add_team_creation_idempotency.sql';
const ANNOUNCEMENT_PUSH_NAME = '20260917110331_add_announcement_push_delivery.sql';
const ROTA_PUSH_NAME = '20260917124856_add_rota_push_delivery.sql';
const ACCEPTANCE_FIX_NAME = '20260917180127_fix_invitation_acceptance_role_conflict_target.sql';
const CHAT_READ_FIX_NAME = '20260917223118_fix_chat_read_cursor_conflict_target.sql';
const MIGRATION = join(MIGRATIONS, NEW_NAME);

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

describe('invite/onboarding identity foundation migration', () => {
  const migration = text(MIGRATION);
  const normalized = migration.toLowerCase();

  it('preserves the identity baseline and every migration before it byte-for-byte', () => {
    const files = readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql')).sort();
    expect(files).toContain(NEW_NAME);
    expect(files.at(-9)).toBe(MEMBERSHIP_NAME);
    expect(files.at(-8)).toBe(PUSH_LIFECYCLE_NAME);
    expect(files.at(-7)).toBe(TEAM_LIFECYCLE_NAME);
    expect(files.at(-6)).toBe(TEAM_ROLE_NAME);
    expect(files.at(-5)).toBe(TEAM_CREATION_IDEMPOTENCY_NAME);
    expect(files.at(-4)).toBe(ANNOUNCEMENT_PUSH_NAME);
    expect(files.at(-3)).toBe(ROTA_PUSH_NAME);
    expect(files.at(-2)).toBe(ACCEPTANCE_FIX_NAME);
    expect(files.at(-1)).toBe(CHAT_READ_FIX_NAME);
    expect(files).toHaveLength(38);

    const historical = files.filter(
      (name) =>
        name !== NEW_NAME &&
        name !== MEMBERSHIP_NAME &&
        name !== PUSH_LIFECYCLE_NAME &&
        name !== TEAM_LIFECYCLE_NAME &&
        name !== TEAM_ROLE_NAME &&
        name !== TEAM_CREATION_IDEMPOTENCY_NAME &&
        name !== ANNOUNCEMENT_PUSH_NAME &&
        name !== ROTA_PUSH_NAME &&
        name !== ACCEPTANCE_FIX_NAME &&
        name !== CHAT_READ_FIX_NAME,
    );
    const hash = createHash('sha256');
    for (const name of historical) {
      hash.update(name);
      hash.update('\0');
      hash.update(text(join(MIGRATIONS, name)));
      hash.update('\0');
    }
    expect(historical).toHaveLength(28);
    expect(hash.digest('hex').toUpperCase()).toBe(
      'B4FAC39AFA0A3EB055A398E985617F79963B3C7D8CD790A10011F1DEC5968983',
    );
  });

  it('removes automatic email linking and introduces account-global active identity', () => {
    expect(normalized).toContain(
      'drop trigger if exists on_auth_user_created_link_existing_profile on auth.users',
    );
    expect(normalized).toContain('drop function if exists public.link_auth_user_to_existing_profile()');
    expect(normalized).toContain('create table public.user_accounts');
    expect(normalized).toContain('global_display_name text');
    expect(normalized).toContain('active_profile_id uuid references public.profiles');
    expect(normalized).toContain('create function public.create_user_account_for_auth_user()');
    const authTrigger = functionSql(migration, 'create_user_account_for_auth_user');
    expect(authTrigger).toContain('insert into public.user_accounts');
    expect(authTrigger).not.toContain('update public.profiles');
    expect(authTrigger).not.toContain('organisation_roles');
    expect(authTrigger).not.toContain('team_memberships');
  });

  it('supports one linked profile per account per organisation without re-keying profiles', () => {
    expect(normalized).toContain('drop constraint if exists profiles_auth_user_id_key');
    expect(normalized).toContain('profiles_auth_user_organisation_uidx');
    expect(normalized).toMatch(
      /on public\.profiles \(auth_user_id, organisation_id\)\s+where auth_user_id is not null/,
    );
    expect(normalized).toContain('profiles_organisation_email_lower_uidx');
    expect(normalized).not.toMatch(/update public\.profiles\s+set id\s*=/);
    expect(normalized).not.toMatch(/update public\.(team_memberships|rota_assignments|chat_messages|chat_read_states|notification_preferences|push_tokens)/);
  });

  it('makes current profile deterministic and validates every switch server-side', () => {
    const current = functionSql(migration, 'current_profile_id');
    expect(current).toContain('account.active_profile_id');
    expect(current).toContain('profile.auth_user_id = account.auth_user_id');
    expect(current).toContain('account.auth_user_id = (select auth.uid())');
    expect(current).not.toContain('limit 1');

    const switcher = functionSql(migration, 'switch_active_profile');
    expect(switcher).toContain('profile.id = p_profile_id');
    expect(switcher).toContain('profile.auth_user_id = v_auth_user_id');
    expect(switcher).toContain('set active_profile_id = p_profile_id');
    expect(normalized).toContain('validate_user_account_active_profile');
    expect(normalized).not.toMatch(/grant (insert|update).*user_accounts.*authenticated/);
  });

  it('backfills global names while preserving effective names and supports scoped overrides', () => {
    expect(normalized).toContain('order by profile.created_at, profile.id');
    expect(normalized).toContain('set display_name_override = case');
    expect(normalized).toContain('profile.full_name is distinct from account.global_display_name');
    const globalName = functionSql(migration, 'set_global_display_name');
    expect(globalName).toContain('update public.profiles');
    expect(globalName).toContain('profile.display_name_override is null');
    const override = functionSql(migration, 'set_organisation_display_name_override');
    expect(override).toContain('v_profile_id uuid := public.current_profile_id()');
    expect(override).toContain('full_name = coalesce(v_override, v_global_name)');
    const combined = functionSql(migration, 'set_profile_display_names');
    expect(combined).toContain('public.set_global_display_name');
    expect(combined).toContain('public.set_organisation_display_name_override');
    expect(normalized).toContain(
      'grant execute on function public.set_profile_display_names(text, text) to authenticated',
    );
  });

  it('creates transactional no-org organisations with one creator admin and no fake team', () => {
    const create = functionSql(migration, 'create_organisation');
    expect(create).toContain('v_auth_user_id uuid := (select auth.uid())');
    expect(create).toContain('email_confirmed_at');
    expect(create).toContain('name_confirmed_at');
    expect(create).toContain('if exists (\n    select 1 from public.profiles');
    expect(create).toContain('insert into public.organisations');
    expect(create).toContain('insert into public.profiles');
    expect(create).toContain("values (v_organisation_id, v_profile_id, 'church_admin')");
    expect(create).toContain('set active_profile_id = v_profile_id');
    expect(create).not.toContain('insert into public.teams');
    expect(create).not.toContain('insert into public.team_memberships');
  });

  it('stores only unique 32-byte token hashes with deterministic pending uniqueness', () => {
    expect(normalized).toContain('create table public.organisation_invitations');
    expect(normalized).toContain('token_hash bytea not null');
    expect(normalized).toContain('octet_length(token_hash) = 32');
    expect(normalized).toContain('organisation_invitations_token_hash_uidx');
    expect(normalized).toContain('organisation_invitations_pending_email_uidx');
    expect(normalized).toContain("where status = 'pending'");
    expect(normalized).toContain('organisation_invitations_pending_target_uidx');
    expect(normalized).toContain("now() + interval '7 days'");
    expect(normalized).not.toMatch(/\braw_token\b|invitation_token\s+text/);
    expect(normalized).not.toMatch(/where[^;]*now\(\)[^;]*create unique index/s);
  });

  it('keeps invitation administration church-admin-only and token internals service-only', () => {
    for (const name of [
      'issue_organisation_invitation_internal',
      'resend_organisation_invitation_internal',
      'revoke_organisation_invitation_internal',
    ]) {
      const fn = functionSql(migration, name);
      expect(fn).toContain("role_row.role = 'church_admin'");
      expect(fn).toContain('public.user_accounts');
    }
    expect(normalized).toContain(
      'revoke all on table public.organisation_invitations from public, anon, authenticated',
    );
    expect(normalized).not.toMatch(/grant (insert|update|delete).*organisation_invitations.*authenticated/);
    expect(normalized).toMatch(
      /grant execute on function public\.issue_organisation_invitation_internal[\s\S]*to service_role/,
    );
    expect(normalized).not.toMatch(
      /grant execute on function public\.issue_organisation_invitation_internal[\s\S]{0,100}to authenticated/,
    );
    const issue = functionSql(migration, 'issue_organisation_invitation_internal');
    expect(issue).toContain('lower(pg_catalog.btrim(profile.email)) = v_email');
    expect(issue).toContain('v_target_profile_id, v_target_auth_user_id');
  });

  it('accepts transactionally with verified matching email, row locks, and baseline membership only', () => {
    const accept = functionSql(migration, 'accept_organisation_invitation_internal');
    expect(accept).toContain('for update');
    expect(accept).toContain('auth_user.email_confirmed_at');
    expect(accept).toContain('v_auth_email <> v_invitation.invited_email_normalized');
    expect(accept).toContain('invitation_email_mismatch');
    expect(accept).toContain('verified_email_required');
    expect(accept).toContain('profile.auth_user_id is not null');
    expect(accept).toContain('profile_already_linked');
    expect(accept).toContain('on conflict (organisation_id, user_id) do nothing');
    expect(accept).toContain("'general_member'");
    expect(accept).toContain("status = 'accepted'");
    expect(accept).toContain('set active_profile_id = v_profile.id');
    expect(accept).not.toContain('insert into public.team_memberships');
    expect(accept).not.toContain("'church_admin'");
    expect(accept).not.toContain("'team_leader'");
  });

  it('enforces target identity invariants again at the invitation table boundary', () => {
    const validator = functionSql(migration, 'validate_organisation_invitation');
    expect(validator).toContain('invitation_inviter_wrong_organisation');
    expect(validator).toContain('invitation_target_wrong_organisation');
    expect(validator).toContain('invitation_target_email_mismatch');
    expect(validator).toContain("new.status = 'pending' and v_target_auth_user_id is not null");
    expect(validator).toContain('invitation_acceptor_mismatch');
  });

  it('rotates resend secrets, blocks terminal replay, and keeps every definer search path empty', () => {
    const resend = functionSql(migration, 'resend_organisation_invitation_internal');
    expect(resend).toContain("set status = 'superseded', superseded_at = now()");
    expect(resend).toContain('decode(p_token_hash_hex');
    const validator = functionSql(migration, 'validate_organisation_invitation');
    expect(validator).toContain("old.status <> 'pending'");
    expect(validator).toContain('invitation_terminal');

    const definitions = [...migration.matchAll(/create(?: or replace)? function public\.([a-z0-9_]+)[\s\S]*?\n\$\$;/gi)];
    expect(definitions.length).toBeGreaterThan(15);
    for (const definition of definitions) {
      if (/security definer/i.test(definition[0])) {
        expect(definition[0].toLowerCase()).toContain("set search_path = ''");
      }
    }
  });
});
