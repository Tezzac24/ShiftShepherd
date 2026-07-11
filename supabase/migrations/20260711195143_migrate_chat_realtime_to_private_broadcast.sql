-- ============================================================================
-- Shift Shepherd - migrate chat freshness to private Supabase Broadcast
--
-- Forward-only corrective migration. The server-authoritative cursor schema,
-- rollout backfill, mark_team_chat_read(uuid, uuid), and
-- get_team_chat_unread_summary() were deployed by 20260711173139 and are not
-- changed here. This migration replaces only the chat event transport:
--
--   public.chat_messages INSERT
--     -> private team-chat:<team UUID> / chat_message_inserted
--
--   public.chat_read_states meaningful INSERT/UPDATE
--     -> private profile-chat-read:<profile UUID> / chat_read_state_changed
--
-- Broadcast payloads are minimal invalidation signals. Clients fetch the exact
-- message through the existing chat_messages RLS policy, or reconcile unread
-- state through the existing summary RPC. Clients receive only; they are never
-- authorized to publish Broadcast messages.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Fail-closed topic parser shared by the two SELECT policies below.
--
-- Realtime topics are untrusted client input. Require the exact prefix plus one
-- canonical UUID (including UUID version/variant bits) before casting. Returning
-- null for malformed topics avoids authorization-time cast exceptions and makes
-- every alternate/suffixed topic fail closed.
-- ----------------------------------------------------------------------------

create function public.chat_broadcast_topic_uuid(
  p_topic text,
  p_prefix text
)
returns uuid
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_value text;
begin
  if p_topic is null
     or p_prefix is null
     or left(p_topic, length(p_prefix)) <> p_prefix then
    return null;
  end if;

  v_value := substring(p_topic from length(p_prefix) + 1);
  if v_value !~ '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[1-8][0-9A-Fa-f]{3}-[89ABab][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}$' then
    return null;
  end if;

  return v_value::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

comment on function public.chat_broadcast_topic_uuid(text, text) is
  'Fail-closed parser for Shift Shepherd private chat Broadcast topics. Returns the one canonical UUID after the exact prefix, otherwise null.';

revoke all on function public.chat_broadcast_topic_uuid(text, text)
  from public, anon;
grant execute on function public.chat_broadcast_topic_uuid(text, text)
  to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Realtime Authorization: receive-only, private, exact-topic access.
--
-- Policies on realtime.messages are permissive/OR-combined. The live project
-- has no pre-existing policies; these two policies intentionally authorize
-- only Broadcast SELECT for an accessible team topic or the caller's own
-- profile read topic. No INSERT policy is created, so app clients cannot send.
-- ----------------------------------------------------------------------------

create policy "accessible users receive team chat broadcasts"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and coalesce(
    public.can_access_team(
      public.chat_broadcast_topic_uuid(
        (select realtime.topic()),
        'team-chat:'
      )
    ),
    false
  )
);

create policy "users receive their own chat read broadcasts"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and public.chat_broadcast_topic_uuid(
        (select realtime.topic()),
        'profile-chat-read:'
      ) = public.current_profile_id()
);

-- ----------------------------------------------------------------------------
-- 3. New-message signal. Topic is derived only from NEW.team_id; the payload
--    deliberately excludes body/caption/attachments/profile data/signed URLs.
-- ----------------------------------------------------------------------------

create function public.broadcast_chat_message_inserted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'version', 1,
      'message_id', new.id,
      'team_id', new.team_id,
      'sender_id', new.sender_id,
      'created_at', new.created_at
    ),
    'chat_message_inserted',
    'team-chat:' || new.team_id::text,
    true
  );

  return new;
end;
$$;

comment on function public.broadcast_chat_message_inserted() is
  'AFTER INSERT trigger function for a minimal version-1 private team chat Broadcast signal. Topic is derived only from NEW.team_id.';

revoke all on function public.broadcast_chat_message_inserted()
  from public, anon, authenticated;

create trigger chat_messages_broadcast_insert
after insert on public.chat_messages
for each row
execute function public.broadcast_chat_message_inserted();

-- ----------------------------------------------------------------------------
-- 4. Read-state invalidation. A profile receives only its own topic, and then
--    re-fetches the authoritative unread summary. Do not expose cursor values.
--    The guard suppresses UPDATE events that do not advance either cursor field.
-- ----------------------------------------------------------------------------

create function public.broadcast_chat_read_state_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.last_read_at is not distinct from old.last_read_at
     and new.last_read_message_id is not distinct from old.last_read_message_id then
    return new;
  end if;

  perform realtime.send(
    jsonb_build_object(
      'version', 1,
      'team_id', new.team_id
    ),
    'chat_read_state_changed',
    'profile-chat-read:' || new.user_id::text,
    true
  );

  return new;
end;
$$;

comment on function public.broadcast_chat_read_state_changed() is
  'AFTER INSERT/UPDATE trigger function for a minimal version-1 private owner read-state invalidation. Idempotent/non-cursor updates emit nothing.';

revoke all on function public.broadcast_chat_read_state_changed()
  from public, anon, authenticated;

create trigger chat_read_states_broadcast_change
after insert or update on public.chat_read_states
for each row
execute function public.broadcast_chat_read_state_changed();

-- ----------------------------------------------------------------------------
-- 5. Full chat transport cutover. Shared-data invalidation tables remain in
--    supabase_realtime; only these two chat-specific Postgres Changes sources
--    are removed after their private Broadcast triggers/policies exist.
-- ----------------------------------------------------------------------------

alter publication supabase_realtime
  drop table public.chat_messages, public.chat_read_states;

commit;
