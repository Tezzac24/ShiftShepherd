-- ============================================================================
-- Shift Shepherd - authenticated Data API privileges
--
-- Records the manual grants needed by the currently live Supabase app surface:
-- Auth/profile lookup plus live announcements. RLS remains enabled and is still
-- the authority for row-level access.
--
-- This migration intentionally grants nothing to anon. Live announcements are
-- authenticated-only, and Expo clients should use only public project values:
-- EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.
-- ============================================================================

begin;

grant usage on schema public to authenticated;

grant select on table
  public.organisations,
  public.profiles,
  public.organisation_roles,
  public.teams,
  public.team_memberships
to authenticated;

grant select, insert, update, delete on table
  public.announcements
to authenticated;

commit;
