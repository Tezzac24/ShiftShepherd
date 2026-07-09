-- ============================================================================
-- Shift Shepherd - authenticated Data API privileges for live rotas
--
-- The rotas & availability vertical slice goes live (see
-- docs/supabase-integration-plan.md, step 7). Migrations 006 and
-- 20260709093129 granted table privileges for the auth/profile lookup,
-- announcements, and events only, so authenticated clients currently get
-- "permission denied" on the rota tables even though the RLS policies from
-- migration 002 (plus the cancellation columns from 005) already restrict who
-- may read and manage them:
--
--   - rota_entries: team members view; team leaders / church admins
--     create/update/delete, with created_by = current_profile_id() enforced
--     on insert (cancel/restore is a plain update on status/cancelled_*)
--   - rota_assignments: team members view; team leaders / church admins
--     manage (FOR ALL)
--   - availability_responses: team members view; the assigned person
--     creates/updates/deletes only their own response
--     (user_id = current_profile_id() and is_my_assignment())
--
-- The grants mirror that policy surface exactly. RLS stays enabled and
-- remains the authority for row-level access. This migration intentionally
-- grants nothing to anon.
-- ============================================================================

begin;

grant select, insert, update, delete on table
  public.rota_entries,
  public.rota_assignments,
  public.availability_responses
to authenticated;

commit;
