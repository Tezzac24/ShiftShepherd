import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = join(process.cwd(), 'supabase/migrations');
const NAME = '20260917093926_add_team_creation_idempotency.sql';
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
describe('team creation idempotency migration contract', () => {
  const migration = text(MIGRATION);
  const normalized = migration.toLowerCase();
  const create = functionSql(migration, 'create_team');

  it('precedes only the announcement push delivery migration and preserves all 33 earlier migrations byte-for-byte', () => {
    const files = readdirSync(MIGRATIONS).filter((file) => file.endsWith('.sql')).sort();
    expect(files).toHaveLength(36);
    expect(files.at(-1)).toBe('20260917124856_add_rota_push_delivery.sql');
    expect(files.at(-2)).toBe('20260917110331_add_announcement_push_delivery.sql');
    expect(files.at(-3)).toBe(NAME);
    expect(files.at(-4)).toBe('20260719110500_add_team_role_management.sql');
    const historical = files.filter((file) => file < NAME);
    const hash = createHash('sha256');
    for (const file of historical) {
      hash.update(file);
      hash.update('\0');
      hash.update(text(join(MIGRATIONS, file)));
      hash.update('\0');
    }
    expect(historical).toHaveLength(33);
    expect(hash.digest('hex').toUpperCase()).toBe(
      '7E934DE7EFF339152704FA5C82AEE82F456CC15CCAB2A1D10BE4B3A82464D2A2',
    );
  });

  it('persists a nullable request identity that is unique per organisation only', () => {
    expect(normalized).toContain(
      'alter table public.teams\n  add column create_request_id uuid,\n  add column create_request_initial_admin_id uuid;',
    );
    expect(normalized).not.toMatch(/create_request_id uuid not null/);
    expect(normalized).not.toMatch(/create_request_initial_admin_id uuid not null/);
    // The request-argument record is deliberately not a foreign key.
    expect(normalized).not.toMatch(/create_request_initial_admin_id[^;]*references/);
    expect(normalized).toContain(
      'create unique index teams_organisation_create_request_id_key\n  on public.teams (organisation_id, create_request_id)\n  where create_request_id is not null;',
    );
    // Names stay non-unique and no global (cross-organisation) key exists.
    expect(normalized).not.toMatch(/unique[^;]*\(name\)/);
    expect(normalized).not.toMatch(/unique[^;]*\(organisation_id, name\)/);
    expect(normalized).not.toMatch(/unique[^;]*\(create_request_id\)/);
    expect(normalized).not.toMatch(/update public\.teams/);
    expect(normalized).not.toContain('backfill');
  });

  it('replaces the deployed signature instead of overloading it', () => {
    expect(normalized).toContain('drop function public.create_team(text, text, uuid);');
    expect(create).toContain(
      'create_team(\n  p_name text,\n  p_description text default null,\n  p_initial_admin_profile_id uuid default null,\n  p_request_id uuid default null\n)',
    );
    expect(normalized.match(/create function public\.create_team/g)).toHaveLength(1);
    expect(normalized).not.toMatch(/create (or replace )?function public\.(update|archive|restore)_team/);
    expect(normalized).not.toContain('set_team_member_role');
    expect(normalized).not.toContain('add_team_member');
    expect(normalized).not.toContain('leave_team');
  });

  it('keeps the same table-shaped response so a replay is indistinguishable from a first response', () => {
    expect(create).toContain(
      'returns table (\n  team_id uuid,\n  organisation_id uuid,\n  team_name text,\n  team_description text,\n  team_type public.team_type,\n  avatar_url text,\n  archived_at timestamptz,\n  archived_by uuid,\n  created_at timestamptz,\n  initial_admin_membership_id uuid,\n  initial_admin_profile_id uuid,\n  initial_admin_role public.team_role,\n  initial_admin_created_at timestamptz\n)',
    );
    // Both the replay branch and the first-time path project exactly the same
    // thirteen columns in the same order; only their indentation differs.
    const projections = [...create.matchAll(/return query select\s+([\s\S]*?);/g)].map(
      (match) => match[1].replace(/\s+/g, ''),
    );
    expect(projections).toHaveLength(2);
    expect(projections[0]).toBe(projections[1]);
    expect(projections[0]).toBe(
      'v_team.id,v_team.organisation_id,v_team.name,v_team.description,v_team.type,v_team.avatar_url,v_team.archived_at,v_team.archived_by,v_team.created_at,v_membership.id,v_membership.user_id,v_membership.role,v_membership.created_at',
    );
  });

  it('is hardened and derives caller identity, organisation, and authority server-side', () => {
    expect(create).toContain('language plpgsql');
    expect(create).toContain('security definer');
    expect(create).toContain("set search_path = ''");
    expect(create).toContain('v_auth_user_id uuid := (select auth.uid())');
    expect(create).toContain('v_caller_profile_id uuid := public.current_profile_id()');
    expect(create).toContain("profile.access_status = 'active'");
    expect(create).toContain('from public.user_accounts account');
    expect(create).toContain('account.auth_user_id = v_auth_user_id');
    expect(create).toContain('public.current_profile_id() is distinct from v_caller_profile_id');
    expect(create).toContain('if not coalesce(public.is_church_admin(v_organisation_id), false)');
    expect(create).not.toMatch(/p_(organisation|org|auth_user|caller|creator)_id/);
    expect(create).not.toContain('execute ');
    expect(create).toContain("message = 'not_authenticated'");
    expect(create).toContain("message = 'no_linked_profile'");
    expect(create).toContain("message = 'organisation_access_removed'");
    expect(create).toContain("message = 'not_authorised'");
    expect(create).toContain("message = 'invalid_team_name'");
    expect(create).toContain("message = 'invalid_team_description'");
    expect(create).toContain("message = 'invalid_initial_admin'");
  });

  it('requires a request id and resolves it only inside the caller organisation under the organisation lock', () => {
    expect(create).toContain('if p_request_id is null then');
    expect(create).toContain("message = 'invalid_request_id'");
    const orgLock = create.indexOf('from public.organisations organisation');
    const authority = create.indexOf('public.is_church_admin(v_organisation_id)');
    const lookup = create.indexOf('and team.create_request_id = p_request_id');
    const insert = create.indexOf('insert into public.teams');
    expect(orgLock).toBeGreaterThan(-1);
    expect(orgLock).toBeLessThan(authority);
    expect(authority).toBeLessThan(lookup);
    expect(lookup).toBeLessThan(insert);
    expect(create).toContain(
      'select team.* into v_team\n  from public.teams team\n  where team.organisation_id = v_organisation_id\n    and team.create_request_id = p_request_id\n  for update;',
    );
    // The replay lookup is organisation-scoped and never keyed on the id alone.
    expect(create.match(/team\.create_request_id = p_request_id/g)).toHaveLength(1);
    expect(create).not.toMatch(/where team\.create_request_id = p_request_id/);
  });

  it('returns the existing team and existing membership on replay without inserting anything', () => {
    const replayReturn = create.indexOf('return query select');
    const replayEnd = create.indexOf('    return;\n  end if;');
    const insertTeam = create.indexOf('insert into public.teams');
    const insertMembership = create.indexOf('insert into public.team_memberships');
    expect(replayReturn).toBeGreaterThan(-1);
    expect(replayReturn).toBeLessThan(replayEnd);
    expect(replayEnd).toBeLessThan(insertTeam);
    expect(insertTeam).toBeLessThan(insertMembership);
    const replayBranch = create.slice(create.indexOf('if found then'), replayEnd);
    expect(replayBranch).not.toContain('insert into');
    expect(replayBranch).not.toContain('update ');
    expect(replayBranch).not.toContain('delete from');
    expect(replayBranch).toContain("message = 'create_request_mismatch'");
    expect(replayBranch).toContain('v_team.name is distinct from v_name');
    expect(replayBranch).toContain('v_team.description is distinct from v_description');
  });

  it('compares the replayed initial admin symmetrically against the stored request argument', () => {
    const replayBranch = create.slice(
      create.indexOf('if found then'),
      create.indexOf('    return;\n  end if;'),
    );
    // Presence and identity are both checked from the persisted argument, so
    // replaying with no admin, or a different admin, cannot succeed with a
    // payload that misreports the canonical team's initial membership.
    expect(replayBranch).toContain(
      'or v_team.create_request_initial_admin_id is distinct from p_initial_admin_profile_id',
    );
    expect(replayBranch).toContain('if v_team.create_request_initial_admin_id is not null then');
    expect(replayBranch).toContain(
      'from public.team_memberships membership\n      where membership.team_id = v_team.id\n        and membership.user_id = v_team.create_request_initial_admin_id;',
    );
    // The branch never keys its lookup on the incoming argument alone.
    expect(replayBranch).not.toContain('if p_initial_admin_profile_id is not null then');
    expect(replayBranch).not.toContain('membership.user_id = p_initial_admin_profile_id');
    expect(replayBranch.match(/create_request_mismatch/g)).toHaveLength(2);
  });

  it('stores the request id on the new row and keeps zero-admin and initial-admin semantics', () => {
    expect(create).toContain(
      "values (\n    v_organisation_id,\n    v_name,\n    v_description,\n    'generic'::public.team_type,\n    null,\n    null,\n    p_request_id,\n    p_initial_admin_profile_id\n  )",
    );
    expect(create).toContain(
      "values (v_team.id, p_initial_admin_profile_id, 'team_leader'::public.team_role)",
    );
    expect(create).toContain('on conflict on constraint team_memberships_team_id_user_id_key');
    expect(create).toContain('profile.id = p_initial_admin_profile_id');
    expect(create).toContain('profile.organisation_id = v_organisation_id');
    expect(create).toContain('profile.auth_user_id is not null');
    expect(create).not.toMatch(
      /values\s*\(\s*v_team\.id\s*,\s*v_caller_profile_id\s*,\s*'team_leader'/,
    );
    expect(create.match(/insert into public\.team_memberships/g)).toHaveLength(1);
    expect(create.match(/insert into public\.teams/g)).toHaveLength(1);
    expect(create).toContain(
      'when serialization_failure or deadlock_detected or unique_violation then',
    );
    expect(create).toContain("message = 'conflict_retry'");
  });

  it('grants execution of the replacement signature to authenticated only', () => {
    expect(normalized).toContain(
      'revoke all on function public.create_team(text, text, uuid, uuid)\n  from public, anon, authenticated',
    );
    expect(normalized).toContain(
      'grant execute on function public.create_team(text, text, uuid, uuid) to authenticated',
    );
    expect(normalized).not.toContain('service_role');
    expect(normalized).not.toMatch(/grant [^;]*to (public|anon)\b/);
  });

  it('changes no policy, trigger, publication, enum, other table, or existing data', () => {
    expect(normalized.match(/alter table/g)).toHaveLength(1);
    expect(normalized).not.toMatch(/create table|drop table|drop column/);
    expect(normalized).not.toMatch(/create type|alter type|drop type/);
    expect(normalized).not.toMatch(/create policy|alter policy|drop policy/);
    expect(normalized).not.toMatch(/create trigger|drop trigger/);
    expect(normalized).not.toMatch(/drop index/);
    expect(normalized).not.toContain('alter publication');
    expect(normalized).not.toContain('auth.users');
    expect(normalized).not.toContain('push_tokens');
    expect(normalized).not.toContain('organisation_invitations');
    expect(normalized).not.toMatch(/delete from/);
  });
});
