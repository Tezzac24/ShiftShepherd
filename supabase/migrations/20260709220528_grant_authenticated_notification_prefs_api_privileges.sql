-- ============================================================================
-- Shift Shepherd - authenticated Data API privileges for notification
-- preferences
--
-- The RLS policy for notification_preferences exists (002: strictly personal
-- - every command requires user_id = current_profile_id()), but the
-- authenticated role has no Data API privileges on the table, so loading or
-- saving live notification settings fails with 42501 without this. RLS
-- remains enabled and is still the authority for row-level access.
--
-- Deliberately narrow for this pass:
--  - no delete grant (the app never deletes a preferences row; saves are an
--    upsert onto the unique(user_id) constraint);
--  - no grants on push_tokens (device token registration is deferred until
--    the app runs as a development build with expo-notifications and an EAS
--    project id - Expo Go cannot receive remote pushes since SDK 53);
--  - nothing is granted to anon - notification settings are
--    authenticated-only.
-- ============================================================================

begin;

grant select, insert, update on table public.notification_preferences to authenticated;

commit;
