-- ============================================================================
-- Shift Shepherd - Push Token Lifecycle V1: account-scoped revocation
--
-- A device keeps one globally unique Expo token row. Registration already
-- moves that row to the current active profile through register_push_token.
-- This narrow companion RPC lets an authenticated account remove its own
-- device token before sign-out without trusting any caller/profile/tenant id.
-- Delivery history is preserved by the existing ON DELETE SET NULL foreign
-- key on push_notification_deliveries.push_token_id.
-- ============================================================================

begin;

create function public.unregister_push_token(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := (select auth.uid());
  v_deleted_count integer;
begin
  if p_token is null or pg_catalog.char_length(p_token) > 512 then
    raise exception using errcode = 'P0001', message = 'INVALID_EXPO_PUSH_TOKEN';
  end if;

  delete from public.push_tokens as token_row
  using public.profiles as profile
  where token_row.token = p_token
    and profile.id = token_row.user_id
    and profile.auth_user_id = v_auth_user_id;

  get diagnostics v_deleted_count = row_count;
  return v_deleted_count > 0;
end;
$$;

comment on function public.unregister_push_token(text) is
  'Deletes one Expo push token only when its profile belongs to auth.uid(); returns false for missing, repeated, or differently-owned tokens.';

revoke all on function public.unregister_push_token(text) from public, anon, authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;

commit;
