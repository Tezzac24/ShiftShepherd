-- Fix the chat image upload policy's outer object-path reference. Within the
-- teams subquery, the unqualified `name` resolved to `teams.name`, so every
-- valid message-scoped path was rejected before either chat RPC ran.
--
-- This keeps the same private bucket, image/path checks, and team-access
-- predicate. It only explicitly qualifies the storage object's path.

begin;

drop policy "team members upload chat image objects"
  on storage.objects;

create policy "team members upload chat image objects"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = 'teams'
    and (storage.foldername(name))[3] = 'messages'
    and (storage.foldername(name))[4] is not null
    and lower(storage.extension(name)) = any (array['jpg', 'jpeg', 'png', 'webp'])
    and exists (
      select 1
      from public.teams t
      where t.id::text = (storage.foldername(storage.objects.name))[2]
        and public.can_access_team(t.id)
    )
  );

commit;
