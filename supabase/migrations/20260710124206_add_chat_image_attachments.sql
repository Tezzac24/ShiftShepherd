-- ============================================================================
-- Shift Shepherd - chat image attachments (Storage slice 3)
--
-- One optional image per immutable chat message. The existing
-- public.chat_attachments table is reused; this migration adds the missing
-- Data API grants, one-per-message enforcement, size metadata, a private
-- `chat-attachments` bucket, and tightly scoped object policies.
--
-- Object path convention (enforced by table/storage policies and the RPC):
--   teams/<teamId>/messages/<messageId>/<generatedFileName>
--
-- Upload happens before the database write. A narrow UUID helper lets the
-- client build that final path first; send_chat_image_message then inserts
-- the chat message and attachment metadata atomically under the caller's
-- existing RLS permissions. Both functions are SECURITY INVOKER and are
-- executable only by authenticated users.
--
-- Deliberately out of scope: arbitrary files/documents, multiple attachments,
-- object replacement, message editing/deleting, anon access, public buckets,
-- push delivery, backfill.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- Existing attachment table: image-only metadata and exactly one row per
-- message. file_size_bytes remains nullable for schema compatibility with any
-- pre-migration rows, but the INSERT policy and RPC require it for every new
-- row created by this slice.
-- ----------------------------------------------------------------------------

alter table public.chat_attachments
  add column file_size_bytes bigint;

alter table public.chat_attachments
  add constraint chat_attachments_image_type_check
    check (file_type in ('image/jpeg', 'image/png', 'image/webp')),
  add constraint chat_attachments_file_size_check
    check (file_size_bytes is null or file_size_bytes between 1 and 5242880),
  add constraint chat_attachments_file_name_check
    check (length(btrim(file_name)) > 0),
  add constraint chat_attachments_one_per_message unique (message_id);

-- The unique constraint replaces the original non-unique FK lookup index.
drop index public.chat_attachments_message_idx;

comment on column public.chat_attachments.file_url is
  'Private chat-attachments storage path, never a public or signed URL.';
comment on column public.chat_attachments.file_size_bytes is
  'Original image size in bytes. Required by the V1 INSERT policy; nullable only for pre-migration compatibility.';

-- ----------------------------------------------------------------------------
-- RLS already exists. Keep member SELECT unchanged, but tighten INSERT to the
-- sender's own message, the final message-scoped path, image-only metadata,
-- and the 5 MB limit. No UPDATE/DELETE table policy or grant is added.
-- ----------------------------------------------------------------------------

drop policy "senders attach files to their own messages"
  on public.chat_attachments;

create policy "senders attach one image to their own messages"
  on public.chat_attachments for insert to authenticated
  with check (
    file_type in ('image/jpeg', 'image/png', 'image/webp')
    and file_size_bytes between 1 and 5242880
    and exists (
      select 1
      from public.chat_messages m
      where m.id = message_id
        and m.sender_id = public.current_profile_id()
        and public.can_access_team(m.team_id)
        and file_url like
          'teams/' || m.team_id::text || '/messages/' || m.id::text || '/_%'
    )
  );

grant select, insert on table public.chat_attachments to authenticated;
revoke all on table public.chat_attachments from anon;

-- ----------------------------------------------------------------------------
-- Private image bucket: bucket settings are the server-side type/size
-- enforcement backstop. Nothing is granted to anon.
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-attachments',
  'chat-attachments',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Read only when the object has canonical attachment metadata for an
-- accessible team's message. Uploaded-but-unsent or failed objects are not
-- readable through signed URLs and can only be cleaned up by their owner.
create policy "team members can view chat image objects"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = 'teams'
    and (storage.foldername(name))[3] = 'messages'
    and exists (
      select 1
      from public.chat_messages m
      join public.chat_attachments a on a.message_id = m.id
      where m.team_id::text = (storage.foldername(name))[2]
        and m.id::text = (storage.foldername(name))[4]
        and a.file_url = name
        and public.can_access_team(m.team_id)
    )
  );

-- The message row does not exist yet at upload time, so path team access is
-- checked directly. The later atomic RPC validates the exact message id/path.
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
      where t.id::text = (storage.foldername(name))[2]
        and public.can_access_team(t.id)
    )
  );

-- Best-effort rollback after a failed send: only the Storage-recorded owner
-- may remove an object. No object update/upsert policy exists in V1.
create policy "uploaders delete their own chat image objects"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'chat-attachments'
    and owner_id = (select auth.uid()::text)
  );

-- ----------------------------------------------------------------------------
-- RPC 1: database-owned UUID before upload, so the final object path can be
-- message-scoped without a client UUID dependency.
-- ----------------------------------------------------------------------------

create function public.new_chat_message_id()
returns uuid
language sql
volatile
security invoker
set search_path = ''
as $$
  select pg_catalog.gen_random_uuid();
$$;

comment on function public.new_chat_message_id() is
  'Returns a UUID for a pending chat image message so its final private Storage path can be built before upload. Creates no row.';

revoke all on function public.new_chat_message_id() from public, anon;
grant execute on function public.new_chat_message_id() to authenticated;

-- ----------------------------------------------------------------------------
-- RPC 2: atomic message + one attachment metadata insert after upload.
-- SECURITY INVOKER preserves the existing chat_messages/chat_attachments RLS
-- and table grants; a failure rolls both inserts back together.
-- ----------------------------------------------------------------------------

create function public.send_chat_image_message(
  p_message_id uuid,
  p_organisation_id uuid,
  p_team_id uuid,
  p_sender_id uuid,
  p_body text,
  p_file_url text,
  p_file_type text,
  p_file_name text,
  p_file_size_bytes bigint
)
returns public.chat_messages
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  saved_message public.chat_messages;
begin
  if p_file_type not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'Unsupported chat attachment image type';
  end if;
  if p_file_size_bytes is null or p_file_size_bytes not between 1 and 5242880 then
    raise exception 'Chat attachment image is too large or empty';
  end if;
  if p_file_url not like
     'teams/' || p_team_id::text || '/messages/' || p_message_id::text || '/_%' then
    raise exception 'Chat attachment path does not match its team and message';
  end if;
  if length(btrim(p_file_name)) = 0 then
    raise exception 'Chat attachment file name is required';
  end if;

  insert into public.chat_messages (
    id,
    organisation_id,
    team_id,
    sender_id,
    body
  ) values (
    p_message_id,
    p_organisation_id,
    p_team_id,
    p_sender_id,
    coalesce(btrim(p_body), '')
  )
  returning * into saved_message;

  insert into public.chat_attachments (
    message_id,
    file_url,
    file_type,
    file_name,
    file_size_bytes
  ) values (
    p_message_id,
    p_file_url,
    p_file_type,
    btrim(p_file_name),
    p_file_size_bytes
  );

  return saved_message;
end;
$$;

comment on function public.send_chat_image_message(uuid, uuid, uuid, uuid, text, text, text, text, bigint) is
  'Atomically inserts one immutable chat message and its single image attachment metadata row under the caller''s existing RLS permissions.';

revoke all on function public.send_chat_image_message(uuid, uuid, uuid, uuid, text, text, text, text, bigint)
  from public, anon;
grant execute on function public.send_chat_image_message(uuid, uuid, uuid, uuid, text, text, text, text, bigint)
  to authenticated;

commit;
