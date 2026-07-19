import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = join(process.cwd(), 'supabase/migrations');
const NAME = '20260715004513_add_team_creation_editing_and_archive.sql';
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

describe('team creation, editing, and archive migration contract', () => {
  const migration = text(MIGRATION);
  const normalized = migration.toLowerCase();

  it('precedes only the local team role migration and preserves all 31 earlier migrations byte-for-byte', () => {
    const files = readdirSync(MIGRATIONS).filter((file) => file.endsWith('.sql')).sort();
    expect(files).toHaveLength(33);
    expect(files.at(-1)).toBe('20260719110500_add_team_role_management.sql');
    expect(files.at(-2)).toBe(NAME);
    expect(files.at(-3)).toBe('20260714200205_add_push_token_revocation.sql');
    const historical = files.filter((file) => file < NAME);
    const hash = createHash('sha256');
    for (const file of historical) {
      hash.update(file);
      hash.update('\0');
      hash.update(text(join(MIGRATIONS, file)));
      hash.update('\0');
    }
    expect(historical).toHaveLength(31);
    expect(hash.digest('hex').toUpperCase()).toBe(
      'B7533674ED869C77183581D513F8B8662527F59485E072758B42238247B53782',
    );
  });

  it('adds nullable archive attribution, the SET NULL profile FK, and listing indexes', () => {
    expect(normalized).toContain('add column archived_at timestamptz');
    expect(normalized).toContain('add column archived_by uuid');
    expect(normalized).toContain('constraint teams_archived_by_fkey');
    expect(normalized).toMatch(
      /foreign key \(archived_by\)[\s\S]*?references public\.profiles \(id\)[\s\S]*?on delete set null/,
    );
    expect(normalized).toContain('teams_organisation_active_name_idx');
    expect(normalized).toContain('where archived_at is null');
    expect(normalized).toContain('teams_organisation_archived_at_idx');
    expect(normalized).toContain('where archived_at is not null');
    expect(normalized).toContain('teams_archived_by_idx');
    expect(normalized).not.toContain('unique (organisation_id, name)');
  });

  it.each(['create_team', 'update_team', 'archive_team', 'restore_team'])(
    '%s is hardened and derives caller authority server-side',
    (name) => {
      const fn = functionSql(migration, name);
      expect(fn).toContain('language plpgsql');
      expect(fn).toContain('security definer');
      expect(fn).toContain("set search_path = ''");
      expect(fn).toContain('v_auth_user_id uuid := (select auth.uid())');
      expect(fn).toContain('v_caller_profile_id uuid := public.current_profile_id()');
      expect(fn).toContain("profile.access_status = 'active'");
      expect(fn).toContain('public.is_church_admin(v_organisation_id)');
      expect(fn).toContain('from public.user_accounts account');
      expect(fn).toContain('account.auth_user_id = v_auth_user_id');
      expect(fn).toContain('public.current_profile_id() is distinct from v_caller_profile_id');
      expect(fn).not.toMatch(/p_(organisation|org|auth_user|caller|creator)_id/);
    },
  );

  it('creates a valid zero-admin team and never auto-adds the creator', () => {
    const create = functionSql(migration, 'create_team');
    expect(create).toContain('p_initial_admin_profile_id uuid default null');
    expect(create).toContain("v_name text := pg_catalog.btrim(p_name)");
    expect(create).toContain("message = 'invalid_team_name'");
    expect(create).toContain("message = 'invalid_team_description'");
    expect(create).toContain("'generic'::public.team_type");
    expect(create).toContain('if p_initial_admin_profile_id is not null then');
    expect(create).not.toMatch(
      /values\s*\(\s*v_team\.id\s*,\s*v_caller_profile_id\s*,\s*'team_leader'/,
    );
    expect(create).not.toContain('hidden fallback');
    expect(create).not.toContain('final_team_admin');
  });

  it('validates and atomically inserts exactly the selected active same-org initial admin', () => {
    const create = functionSql(migration, 'create_team');
    expect(create).toContain('profile.id = p_initial_admin_profile_id');
    expect(create).toContain('profile.organisation_id = v_organisation_id');
    expect(create).toContain('profile.auth_user_id is not null');
    expect(create).toContain("profile.access_status = 'active'");
    expect(create).toContain('for update');
    expect(create).toContain("message = 'invalid_initial_admin'");
    expect(create).toContain("values (v_team.id, p_initial_admin_profile_id, 'team_leader'::public.team_role)");
    expect(create).toContain('on conflict on constraint team_memberships_team_id_user_id_key');
    expect(create.indexOf('insert into public.teams')).toBeLessThan(
      create.indexOf('insert into public.team_memberships'),
    );
    expect(create).toContain('initial_admin_membership_id uuid');
    expect(create).toContain('initial_admin_profile_id uuid');
  });

  it('locks organisation-scoped targets and uses explicit archive-state errors', () => {
    const update = functionSql(migration, 'update_team');
    const archive = functionSql(migration, 'archive_team');
    const restore = functionSql(migration, 'restore_team');
    for (const fn of [update, archive, restore]) {
      expect(fn).toContain('team.organisation_id = v_organisation_id');
      expect(fn).toContain('for update');
      expect(fn).toContain("message = 'team_not_found'");
      expect(fn).toContain("message = 'conflict_retry'");
    }
    expect(update).toContain("message = 'team_archived'");
    expect(archive).toContain("message = 'team_already_archived'");
    expect(archive).toContain('set archived_at = pg_catalog.now()');
    expect(archive).toContain('archived_by = v_caller_profile_id');
    expect(restore).toContain("message = 'team_not_archived'");
    expect(restore).toContain('set archived_at = null');
    expect(restore).toContain('archived_by = null');
  });

  it('archives and restores only the existing team row without child deletion or recreation', () => {
    const archive = functionSql(migration, 'archive_team');
    const restore = functionSql(migration, 'restore_team');
    expect(archive).toContain('update public.teams');
    expect(restore).toContain('update public.teams');
    expect(archive).not.toContain('delete from');
    expect(restore).not.toContain('delete from');
    expect(restore).not.toContain('insert into');
    for (const child of [
      'team_memberships',
      'rota_entries',
      'rota_assignments',
      'availability_responses',
      'chat_messages',
      'chat_read_states',
      'songs',
      'song_links',
      'choir_rota_song_selections',
    ]) {
      expect(archive).not.toContain(child);
      expect(restore).not.toContain(child);
    }
  });

  it('makes the central membership, team, rota, choir, chat, and avatar helpers active-only', () => {
    for (const name of [
      'team_org',
      'is_team_member',
      'is_team_leader',
      'is_choir_team',
      'entry_team',
      'assignment_team',
      'song_team',
      'message_team',
      'is_my_assignment',
      'is_song_leader_for_entry',
      'is_section_leader_for_entry',
    ]) {
      expect(functionSql(migration, name)).toContain('archived_at is null');
    }
    expect(functionSql(migration, 'can_access_team')).toContain('public.team_org(team)');
    expect(functionSql(migration, 'can_manage_team')).toContain('public.team_org(team)');
    expect(functionSql(migration, 'add_team_member')).toContain("message = 'team_archived'");
    const leaveTeam = functionSql(migration, 'leave_team');
    expect(leaveTeam).toContain('v_team.archived_at is not null');
    expect(leaveTeam).toContain("message = 'team_archived'");
    expect(leaveTeam.indexOf("message = 'team_archived'")).toBeLessThan(
      leaveTeam.indexOf('delete from public.team_memberships'),
    );
    const unreadSummary = functionSql(migration, 'get_team_chat_unread_summary');
    expect(unreadSummary).toContain("set search_path = ''");
    expect(unreadSummary.match(/team_row\.archived_at is null/g)).toHaveLength(2);
    expect(normalized).toContain('drop policy if exists "church admins manage teams"');
  });

  it('keeps archived team-linked events and referenced images from active mutation', () => {
    expect(normalized).toContain(
      '(team_id is null or public.team_org(team_id) = organisation_id)',
    );
    expect(normalized).toContain(
      'drop policy if exists "uploaders delete their own chat image objects"',
    );
    const chatReference = functionSql(
      migration,
      'is_chat_attachment_object_referenced',
    );
    expect(chatReference).toContain('security definer');
    expect(chatReference).toContain("set search_path = ''");
    expect(chatReference).toContain('attachment.file_url = p_object_name');
    expect(normalized).toContain(
      'not public.is_chat_attachment_object_referenced(name)',
    );
    expect(normalized).toContain(
      'drop policy if exists "announcement editors delete announcement image objects"',
    );
    const announcementReference = functionSql(
      migration,
      'is_announcement_image_object_referenced',
    );
    expect(announcementReference).toContain('security definer');
    expect(announcementReference).toContain("set search_path = ''");
    expect(announcementReference).toContain('announcement.image_url = p_object_name');
    expect(normalized).toContain(
      'not public.is_announcement_image_object_referenced(name)',
    );
    expect(normalized).toContain('public.can_manage_team(announcement.team_id)');
    for (const signature of [
      'is_chat_attachment_object_referenced(text)',
      'is_announcement_image_object_referenced(text)',
    ]) {
      expect(normalized).toContain(
        `revoke all on function public.${signature}\n  from public, anon, authenticated`,
      );
      expect(normalized).toContain(
        `grant execute on function public.${signature}\n  to authenticated`,
      );
    }
  });

  it('exposes only the four lifecycle RPCs to authenticated and no service role', () => {
    for (const signature of [
      'create_team(text, text, uuid)',
      'update_team(uuid, text, text)',
      'archive_team(uuid)',
      'restore_team(uuid)',
    ]) {
      expect(normalized).toContain(
        `revoke all on function public.${signature}\n  from public, anon, authenticated`,
      );
      expect(normalized).toContain(
        `grant execute on function public.${signature} to authenticated`,
      );
      expect(normalized).not.toContain(
        `grant execute on function public.${signature} to service_role`,
      );
    }
  });

  it('adds no hard-delete path, service credential, publication change, or unrelated schema', () => {
    expect(normalized).not.toMatch(/delete from public\.teams/);
    expect(normalized).not.toMatch(/drop table|drop column/);
    expect(normalized).not.toContain('service_role');
    expect(normalized).not.toContain('alter publication');
    expect(normalized).not.toContain('auth.users');
    expect(normalized).not.toContain('push_tokens');
    expect(normalized).not.toContain('organisation_invitations');
  });
});
