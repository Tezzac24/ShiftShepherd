-- Enable Supabase Realtime for team chat.
--
-- The supabase_realtime publication was empty, so postgres_changes
-- subscriptions never received events. Adding chat_messages lets the app
-- subscribe to new-message INSERTs for the open team chat.
--
-- Security is unchanged: Realtime authorizes every delivered row per
-- subscriber against the existing RLS SELECT policy on chat_messages
-- ("team members can view chat messages" — can_access_team(team_id)).
-- No grants change, nothing is exposed to anon, and no other table joins
-- the publication.

alter publication supabase_realtime add table public.chat_messages;
