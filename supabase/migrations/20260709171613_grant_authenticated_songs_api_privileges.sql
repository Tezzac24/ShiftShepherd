-- ============================================================================
-- Shift Shepherd - authenticated Data API privileges for live choir songs
--
-- The choir songs vertical slice goes live (see
-- docs/supabase-integration-plan.md, step 8). Existing RLS policies already
-- restrict row-level access:
--
--   - songs: choir team members and church admins can read, create, update,
--     and delete songs; added_by = current_profile_id() is enforced on insert
--   - song_links: readable/manageable only through an accessible parent song
--   - choir_rota_song_selections: team members can read; only the assigned
--     section leader, choir team leader, or church admin can change that
--     section's selections
--
-- These grants expose those tables to authenticated Data API clients so the
-- policies can run. RLS stays enabled and remains the authority for row-level
-- access. This migration intentionally grants nothing to anon.
-- ============================================================================

begin;

grant select, insert, update, delete on table
  public.songs,
  public.song_links,
  public.choir_rota_song_selections
to authenticated;

commit;
