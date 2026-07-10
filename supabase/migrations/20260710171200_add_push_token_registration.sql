-- ============================================================================
-- Shift Shepherd - Push Token Registration V1 (register/persist only)
--
-- public.push_tokens has existed since 001 (id, user_id -> profiles on delete
-- cascade, globally-unique token, push_platform enum, trigger-owned
-- updated_at) and 002 gave it a strictly-personal RLS policy for every
-- command, but the authenticated role has no Data API privileges on it - the
-- notification-preferences grants pass (20260709220528) deliberately skipped
-- the table. This migration wires the write path for device registration
-- without opening the table itself:
--
--  - register_push_token(p_token, p_platform): a narrow SECURITY DEFINER
--    upsert keyed on the globally-unique token column. When a device changes
--    hands (two people signing in on one shared phone), the second person's
--    registration must take over the existing token row, and a plain RLS
--    upsert cannot update a row that still belongs to someone else - hence
--    the definer function, following the set_own_profile_avatar_path
--    precedent. It validates the caller's linked profile, the Expo token
--    shape, and the platform before touching the table, and only ever writes
--    a row owned by the caller. Repeating a registration bumps updated_at
--    (the "last seen" signal) through the existing trigger.
--  - No table-level grant is added at all: authenticated cannot select,
--    insert, update, or delete push_tokens directly - every write goes
--    through the RPC, and nothing in this slice needs to read the table.
--    A later unregister/"your devices" slice can add a SELECT grant then.
--  - anon gets nothing. Push delivery, Edge Functions, receipts, and native
--    FCM/APNs token storage remain out of scope.
-- ============================================================================

begin;

create or replace function public.register_push_token(p_token text, p_platform text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_id uuid := public.current_profile_id();
  registered_at timestamptz;
begin
  if profile_id is null then
    raise exception 'No linked profile for the current user';
  end if;

  -- Expo push tokens look like ExponentPushToken[...] (historically also
  -- ExpoPushToken[...]). Enforced here, not as a table constraint, so a
  -- future format change only needs a new migration of this function.
  if p_token is null
     or char_length(p_token) > 512
     or p_token !~ '^Expo(nent)?PushToken\[[^\s\[\]]+\]$' then
    raise exception 'Invalid Expo push token';
  end if;

  if p_platform is null or p_platform not in ('ios', 'android', 'web') then
    raise exception 'Unsupported platform';
  end if;

  insert into public.push_tokens (user_id, token, platform)
  values (profile_id, p_token, p_platform::public.push_platform)
  on conflict (token) do update
    set user_id  = excluded.user_id,
        platform = excluded.platform
  returning updated_at into registered_at;

  return registered_at;
end;
$$;

revoke all on function public.register_push_token(text, text) from public;
revoke all on function public.register_push_token(text, text) from anon;
grant execute on function public.register_push_token(text, text) to authenticated;

commit;
