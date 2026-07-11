-- ============================================================================
-- Shift Shepherd - Harden database function execution and search paths
--
-- The RLS helper functions must remain executable by authenticated because
-- Postgres evaluates them as part of authenticated users' policies. They do
-- not need to be callable by anon or through the default PUBLIC grant.
--
-- SECURITY DEFINER remains necessary for these helpers to perform the small
-- cross-table lookups used by RLS without recursive-policy failures. Empty
-- search paths are safe because their relation/function references are schema
-- qualified (pg_catalog remains implicitly available).
-- ============================================================================

begin;

-- Prevent future postgres-owned functions in the exposed public schema from
-- inheriting Postgres's default EXECUTE grant to PUBLIC. Intended RPCs must be
-- granted explicitly by their own migration.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- RLS SECURITY DEFINER helpers: authenticated policy execution only.
-- ----------------------------------------------------------------------------

alter function public.assignment_team(uuid) set search_path = '';
revoke all on function public.assignment_team(uuid) from public, anon, authenticated;
grant execute on function public.assignment_team(uuid) to authenticated;

alter function public.can_access_team(uuid) set search_path = '';
revoke all on function public.can_access_team(uuid) from public, anon, authenticated;
grant execute on function public.can_access_team(uuid) to authenticated;

alter function public.can_manage_song_section(uuid, text) set search_path = '';
revoke all on function public.can_manage_song_section(uuid, text) from public, anon, authenticated;
grant execute on function public.can_manage_song_section(uuid, text) to authenticated;

alter function public.can_manage_team(uuid) set search_path = '';
revoke all on function public.can_manage_team(uuid) from public, anon, authenticated;
grant execute on function public.can_manage_team(uuid) to authenticated;

alter function public.can_select_songs(uuid) set search_path = '';
revoke all on function public.can_select_songs(uuid) from public, anon, authenticated;
grant execute on function public.can_select_songs(uuid) to authenticated;

alter function public.current_profile_id() set search_path = '';
revoke all on function public.current_profile_id() from public, anon, authenticated;
grant execute on function public.current_profile_id() to authenticated;

alter function public.entry_team(uuid) set search_path = '';
revoke all on function public.entry_team(uuid) from public, anon, authenticated;
grant execute on function public.entry_team(uuid) to authenticated;

alter function public.has_org_role(uuid, public.organisation_role_name) set search_path = '';
revoke all on function public.has_org_role(uuid, public.organisation_role_name) from public, anon, authenticated;
grant execute on function public.has_org_role(uuid, public.organisation_role_name) to authenticated;

alter function public.is_choir_team(uuid) set search_path = '';
revoke all on function public.is_choir_team(uuid) from public, anon, authenticated;
grant execute on function public.is_choir_team(uuid) to authenticated;

alter function public.is_church_admin(uuid) set search_path = '';
revoke all on function public.is_church_admin(uuid) from public, anon, authenticated;
grant execute on function public.is_church_admin(uuid) to authenticated;

alter function public.is_my_assignment(uuid) set search_path = '';
revoke all on function public.is_my_assignment(uuid) from public, anon, authenticated;
grant execute on function public.is_my_assignment(uuid) to authenticated;

alter function public.is_org_member(uuid) set search_path = '';
revoke all on function public.is_org_member(uuid) from public, anon, authenticated;
grant execute on function public.is_org_member(uuid) to authenticated;

alter function public.is_section_leader_for_entry(uuid, text) set search_path = '';
revoke all on function public.is_section_leader_for_entry(uuid, text) from public, anon, authenticated;
grant execute on function public.is_section_leader_for_entry(uuid, text) to authenticated;

alter function public.is_song_leader_for_entry(uuid) set search_path = '';
revoke all on function public.is_song_leader_for_entry(uuid) from public, anon, authenticated;
grant execute on function public.is_song_leader_for_entry(uuid) to authenticated;

alter function public.is_team_leader(uuid) set search_path = '';
revoke all on function public.is_team_leader(uuid) from public, anon, authenticated;
grant execute on function public.is_team_leader(uuid) to authenticated;

alter function public.is_team_member(uuid) set search_path = '';
revoke all on function public.is_team_member(uuid) from public, anon, authenticated;
grant execute on function public.is_team_member(uuid) to authenticated;

alter function public.message_team(uuid) set search_path = '';
revoke all on function public.message_team(uuid) from public, anon, authenticated;
grant execute on function public.message_team(uuid) to authenticated;

alter function public.song_team(uuid) set search_path = '';
revoke all on function public.song_team(uuid) from public, anon, authenticated;
grant execute on function public.song_team(uuid) to authenticated;

alter function public.team_org(uuid) set search_path = '';
revoke all on function public.team_org(uuid) from public, anon, authenticated;
grant execute on function public.team_org(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Authenticated-only SECURITY DEFINER RPCs: preserve their required API while
-- tightening their already-explicit search path from public to empty.
-- ----------------------------------------------------------------------------

alter function public.register_push_token(text, text) set search_path = '';
revoke all on function public.register_push_token(text, text) from public, anon, authenticated;
grant execute on function public.register_push_token(text, text) to authenticated;

alter function public.set_own_profile_avatar_path(text) set search_path = '';
revoke all on function public.set_own_profile_avatar_path(text) from public, anon, authenticated;
grant execute on function public.set_own_profile_avatar_path(text) to authenticated;

-- The Auth-link helper already has search_path='' and no app-role execution.

-- ----------------------------------------------------------------------------
-- Trigger/event-trigger helpers are invoked by their triggers, never by app
-- roles. Remove default direct execution and pin mutable trigger search paths.
-- ----------------------------------------------------------------------------

alter function public.set_updated_at() set search_path = '';
revoke all on function public.set_updated_at() from public, anon, authenticated;

alter function public.validate_cross_table_consistency() set search_path = '';
revoke all on function public.validate_cross_table_consistency() from public, anon, authenticated;

-- Supabase's RLS auto-enable event-trigger helper is platform/trigger-only and
-- already has search_path=pg_catalog; remove its inherited app-role execution.
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

commit;
