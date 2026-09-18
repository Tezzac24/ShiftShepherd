-- ============================================================================
-- Chat read cursor conflict target fix
--
-- mark_team_chat_read returns a table whose columns include team_id. PL/pgSQL
-- exposes those result columns as variables, so the unqualified conflict
-- target in its read-state upsert,
--   on conflict (user_id, team_id) do update
-- is ambiguous with the chat_read_states column. PostgreSQL raises SQLSTATE
-- 42702 the first time that statement runs, which is every call. The function
-- compiles cleanly, so the defect has been deployed since 20260711173139: the
-- server-authoritative read cursor has never advanced, markTeamChatRead has
-- always failed, and team chat unread counts have never cleared. Only the
-- rollout baseline rows written by that migration exist, and they are correct.
--
-- This forward-only replacement is the definition deployed by
-- 20260711173139_add_team_chat_read_cursor.sql with one change: the conflict
-- target names the existing unique constraint
-- chat_read_states_user_id_team_id_key (unique on user_id, team_id), which is
-- not subject to PL/pgSQL name resolution. The signature, result columns,
-- forward-only guard, caller derived from auth.uid(), server-derived cursor
-- timestamp, team access check, SECURITY DEFINER, pinned search_path, and
-- authenticated-only EXECUTE are unchanged. No table, column, policy, trigger,
-- index, publication, grant on any other object, or existing row changes.
--
-- get_team_chat_unread_summary (last replaced by 20260715004513) was checked
-- for the same defect: it performs no insert, has no conflict target, and
-- qualifies every column reference with a table alias, so it is unaffected.
-- ============================================================================

begin;

create or replace function public.mark_team_chat_read(
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
  on conflict on constraint chat_read_states_user_id_team_id_key do update
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

revoke all on function public.mark_team_chat_read(uuid, uuid) from public, anon;
grant execute on function public.mark_team_chat_read(uuid, uuid) to authenticated;

commit;
