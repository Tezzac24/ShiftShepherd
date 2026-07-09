-- ============================================================================
-- Shift Shepherd - authenticated Data API privileges for the live chat slice
--
-- The RLS policies for chat_messages exist (002: team members/admins can read
-- a team's messages; members/admins can insert only as themselves), but the
-- authenticated role has no Data API privileges on the table, so live chat
-- fails with 42501 without this. RLS remains enabled and is still the
-- authority for row-level access.
--
-- Deliberately narrow for text-only V1:
--  - no update/delete grants (editing/deleting messages is out of scope and
--    has no RLS policies);
--  - no grants on chat_attachments (no attachment UI until the Storage slice);
--  - nothing is granted to anon — live chat is authenticated-only.
-- ============================================================================

begin;

grant select, insert on table public.chat_messages to authenticated;

commit;
