-- ============================================================================
-- Shift Shepherd - authenticated Data API privileges for live events
--
-- The events vertical slice goes live (see docs/supabase-integration-plan.md,
-- step 5). Migration 006 granted table privileges for the auth/profile lookup
-- and announcements only, so authenticated clients currently get "permission
-- denied" on events and event_categories even though the RLS policies from
-- migration 002 already restrict who may read and manage them:
--
--   - select: org members only (is_org_member)
--   - insert/update/delete: church admins and event managers only, with
--     created_by = current_profile_id() enforced on insert
--
-- Categories are read-only in the app UI, so they get select only. RLS stays
-- enabled and remains the authority for row-level access. This migration
-- intentionally grants nothing to anon.
-- ============================================================================

begin;

grant select on table
  public.event_categories
to authenticated;

grant select, insert, update, delete on table
  public.events
to authenticated;

commit;
