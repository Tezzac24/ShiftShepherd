-- Enable invalidation-only Realtime for the shared AppData domains.
--
-- `chat_messages` is already published and retains its separate, focus-scoped
-- chat lifecycle. These tables feed one session-scoped shared-data channel;
-- clients refetch through existing RLS-scoped loaders rather than rebuilding
-- joined state from payloads. Default replica identity is sufficient.

alter publication supabase_realtime add table
  public.announcements,
  public.events,
  public.rota_entries,
  public.rota_assignments,
  public.availability_responses,
  public.songs,
  public.song_links,
  public.choir_rota_song_selections,
  public.organisations,
  public.profiles,
  public.teams,
  public.team_memberships,
  public.organisation_roles;
