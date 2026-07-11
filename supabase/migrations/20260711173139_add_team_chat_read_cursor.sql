-- ============================================================================
-- Shift Shepherd - server-authoritative team chat read cursor + unread summary
--
-- Chat Unread State & Session-Wide Messaging Freshness V1.
--
-- Evolves the existing private public.chat_read_states table from a
-- client-written last_read_at timestamp into a server-authoritative read
-- cursor, and adds two narrow RPCs so unread state is correct across a
-- profile's devices and freshness no longer depends on the Messages screen:
--
--   * mark_team_chat_read(p_team_id, p_message_id)  - forward-only cursor
--   * get_team_chat_unread_summary()                - per-accessible-team unread
--
-- Security hardening: read-state writes previously used broad authenticated
-- INSERT/UPDATE grants with a client-supplied last_read_at. That is removed;
-- the only writer is now the SECURITY DEFINER mark RPC, which derives the
-- caller from auth.uid(), verifies team access, and derives the cursor
-- timestamp from a real message. SELECT stays owner-scoped so a profile can
-- read its own rows and Realtime can authorize its own read-state events -
-- read state is never exposed to anyone else (no "seen by" surface).
--
-- Rollout: existing memberships (and church admins) are initialised to the
-- latest currently accessible message so deployment starts with zero unread
-- rather than a historical flood. New memberships after deployment fall back
-- to their join time as the baseline (messages before joining never count).
--
-- Realtime: chat_read_states joins supabase_realtime so a read on one device
-- reconciles the same profile's other active devices. chat_messages is already
-- published; default replica identity (primary key) is sufficient because only
-- payload.new is ever read. No Broadcast, triggers, webhooks, or Edge Function.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Server-derived read cursor: pair last_read_at with the message it points
--    at, so ordering matches the app's (created_at, id) message order. ON
--    DELETE SET NULL keeps a future message deletion (out of scope) from
--    resetting the timestamp cursor, which stays authoritative.
-- ----------------------------------------------------------------------------

alter table public.chat_read_states
  add column last_read_message_id uuid
    references public.chat_messages (id) on delete set null;

comment on column public.chat_read_states.last_read_message_id is
  'Server-derived read-cursor message id, paired with last_read_at as a (created_at, id) tuple. Nullable for pre-cursor rows and future message deletion; the timestamp remains the authoritative cursor.';

-- ----------------------------------------------------------------------------
-- 2a. Backfill existing rows: point last_read_message_id at the newest message
--     at or before the row's existing last_read_at, preserving genuine read
--     positions instead of advancing them.
-- ----------------------------------------------------------------------------

update public.chat_read_states rs
set last_read_message_id = (
  select cm.id
  from public.chat_messages cm
  where cm.team_id = rs.team_id
    and cm.created_at <= rs.last_read_at
  order by cm.created_at desc, cm.id desc
  limit 1
)
where rs.last_read_message_id is null;

-- ----------------------------------------------------------------------------
-- 2b. Rollout baseline: initialise read state for every currently accessible
--     (team member OR church admin) profile+team that has messages and no row
--     yet, pinned to the latest message. Deployment therefore starts with zero
--     unread and no sudden historical flood. Teams with no messages get no row
--     (the summary treats them as zero). Deterministic and idempotent.
-- ----------------------------------------------------------------------------

insert into public.chat_read_states (user_id, team_id, last_read_message_id, last_read_at)
select access.profile_id, access.team_id, latest.id, latest.created_at
from (
  select m.user_id as profile_id, m.team_id
  from public.team_memberships m
  union
  select r.user_id as profile_id, t.id as team_id
  from public.organisation_roles r
  join public.teams t on t.organisation_id = r.organisation_id
  where r.role = 'church_admin'
) access
join lateral (
  select cm.id, cm.created_at
  from public.chat_messages cm
  where cm.team_id = access.team_id
  order by cm.created_at desc, cm.id desc
  limit 1
) latest on true
on conflict (user_id, team_id) do nothing;

-- ----------------------------------------------------------------------------
-- 3. Lock down direct writes. The cursor is now server-derived, so remove the
--    broad authenticated INSERT/UPDATE (which accepted a client last_read_at).
--    Keep the owner-scoped SELECT policy and grant: owners read their own rows
--    and Realtime authorizes their own read-state events against it.
-- ----------------------------------------------------------------------------

drop policy "users create their own chat read states" on public.chat_read_states;
drop policy "users update their own chat read states" on public.chat_read_states;

revoke insert, update on table public.chat_read_states from authenticated;

-- ----------------------------------------------------------------------------
-- 4. mark_team_chat_read: forward-only read cursor for the caller's own team
--    read state. Caller is derived from auth.uid(); no profile/caller/read
--    timestamp is ever accepted. The cursor timestamp is read from the target
--    message server-side, and the upsert only ever advances.
-- ----------------------------------------------------------------------------

create function public.mark_team_chat_read(
  p_team_id uuid,
  p_message_id uuid
)
returns table (
  team_id uuid,
  last_read_message_id uuid,
  last_read_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_created_at timestamptz;
begin
  v_profile_id := public.current_profile_id();
  if v_profile_id is null then
    raise exception 'No linked profile for the current user';
  end if;

  if not public.can_access_team(p_team_id) then
    raise exception 'Team chat is not accessible';
  end if;

  select cm.created_at into v_created_at
  from public.chat_messages cm
  where cm.id = p_message_id
    and cm.team_id = p_team_id;

  if v_created_at is null then
    raise exception 'Message not found for team';
  end if;

  insert into public.chat_read_states as rs
    (user_id, team_id, last_read_message_id, last_read_at)
  values
    (v_profile_id, p_team_id, p_message_id, v_created_at)
  on conflict (user_id, team_id) do update
    set last_read_message_id = excluded.last_read_message_id,
        last_read_at = excluded.last_read_at
    where excluded.last_read_at > rs.last_read_at
       or (excluded.last_read_at = rs.last_read_at
           and (rs.last_read_message_id is null
                or excluded.last_read_message_id > rs.last_read_message_id));

  return query
    select rs.team_id, rs.last_read_message_id, rs.last_read_at
    from public.chat_read_states rs
    where rs.user_id = v_profile_id
      and rs.team_id = p_team_id;
end;
$$;

comment on function public.mark_team_chat_read(uuid, uuid) is
  'Advances the caller''s own read cursor for one accessible team to the given message (forward-only, idempotent). Derives caller and cursor timestamp server-side; never accepts a profile id or read timestamp.';

revoke all on function public.mark_team_chat_read(uuid, uuid) from public, anon;
grant execute on function public.mark_team_chat_read(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. get_team_chat_unread_summary: one row per team the caller can access
--    (their memberships, plus every org team for church admins), including
--    zero-unread teams. The caller's own messages never count. The effective
--    baseline per team is the later of the read cursor and the membership join
--    time; teams with neither (e.g. admin-only access, never opened) report
--    zero rather than flooding. Uses the (team_id, created_at) index.
-- ----------------------------------------------------------------------------

create function public.get_team_chat_unread_summary()
returns table (
  team_id uuid,
  unread_count integer,
  latest_message_id uuid,
  latest_message_created_at timestamptz,
  latest_message_sender_id uuid,
  last_read_message_id uuid,
  last_read_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_org_id uuid;
begin
  v_profile_id := public.current_profile_id();
  if v_profile_id is null then
    raise exception 'No linked profile for the current user';
  end if;

  select p.organisation_id into v_org_id
  from public.profiles p
  where p.id = v_profile_id;

  return query
  with accessible as (
    select tm.team_id, tm.created_at as membership_created_at
    from public.team_memberships tm
    where tm.user_id = v_profile_id
    union all
    select t.id as team_id, null::timestamptz as membership_created_at
    from public.teams t
    where public.is_church_admin(v_org_id)
      and t.organisation_id = v_org_id
  ),
  team_access as (
    select a.team_id, max(a.membership_created_at) as membership_created_at
    from accessible a
    group by a.team_id
  ),
  cursors as (
    select ta.team_id,
           rs.last_read_at,
           rs.last_read_message_id,
           greatest(rs.last_read_at, ta.membership_created_at) as effective_at
    from team_access ta
    left join public.chat_read_states rs
      on rs.user_id = v_profile_id and rs.team_id = ta.team_id
  )
  select
    c.team_id,
    coalesce((
      select count(*)::integer
      from public.chat_messages m
      where m.team_id = c.team_id
        and m.sender_id <> v_profile_id
        and c.effective_at is not null
        and (
          m.created_at > c.effective_at
          or (
            m.created_at = c.effective_at
            and c.last_read_message_id is not null
            and c.effective_at = c.last_read_at
            and m.id > c.last_read_message_id
          )
        )
    ), 0) as unread_count,
    latest.id as latest_message_id,
    latest.created_at as latest_message_created_at,
    latest.sender_id as latest_message_sender_id,
    c.last_read_message_id,
    c.last_read_at
  from cursors c
  left join lateral (
    select m.id, m.created_at, m.sender_id
    from public.chat_messages m
    where m.team_id = c.team_id
    order by m.created_at desc, m.id desc
    limit 1
  ) latest on true;
end;
$$;

comment on function public.get_team_chat_unread_summary() is
  'Returns per-accessible-team unread counts and latest-message metadata for the caller (derived from auth.uid()). Excludes the caller''s own messages; applies the read-cursor/membership baseline; never accepts a profile id.';

revoke all on function public.get_team_chat_unread_summary() from public, anon;
grant execute on function public.get_team_chat_unread_summary() to authenticated;

-- ----------------------------------------------------------------------------
-- 6. Publish read-state changes so a read on one device reconciles the same
--    profile's other devices. Owner-scoped SELECT policy authorizes delivery;
--    only the row owner ever receives their own read-state events. Default
--    replica identity is sufficient (only payload.new is read).
-- ----------------------------------------------------------------------------

alter publication supabase_realtime add table public.chat_read_states;

commit;
