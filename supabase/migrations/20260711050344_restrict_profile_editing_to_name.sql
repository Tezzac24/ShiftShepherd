-- ============================================================================
-- Shift Shepherd - Restrict Profile Editing V1 to full_name only
--
-- Phone is an identity/contact field reserved for a future verified account
-- flow (e.g. phone sign-in). It must not be changeable through ordinary
-- profile editing, so the two-argument update_own_profile(text, text) is
-- dropped and replaced with a one-argument full-name-only function.
--
-- Stored phone values are not touched: existing profiles keep their phone
-- for read-only display, and no phone-auth columns or verification state
-- are added here.
-- ============================================================================

begin;

-- Remove the two-argument signature entirely. It has no policy/trigger
-- dependencies (it is only ever called via PostgREST RPC) and the app no
-- longer references it after this slice.
drop function if exists public.update_own_profile(text, text);

create or replace function public.update_own_profile(
  p_full_name text
)
returns table (
  profile_id uuid,
  full_name text,
  phone text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_full_name text := pg_catalog.btrim(p_full_name);
begin
  select p.id
  into v_profile_id
  from public.profiles p
  where p.auth_user_id = (select auth.uid());

  if v_profile_id is null then
    raise exception 'No linked profile for the current user';
  end if;

  if v_full_name is null or pg_catalog.char_length(v_full_name) < 2 then
    raise exception 'Full name must be at least 2 characters';
  end if;

  if pg_catalog.char_length(v_full_name) > 100 then
    raise exception 'Full name must be 100 characters or fewer';
  end if;

  return query
  update public.profiles p
  set full_name = v_full_name
  where p.id = v_profile_id
  returning p.id, p.full_name, p.phone;
end;
$$;

comment on function public.update_own_profile(text) is
  'Updates only the calling linked profile full_name. Phone is reserved for a future verified account flow; email, auth linkage, organisation, roles, and memberships cannot be changed.';

revoke all on function public.update_own_profile(text)
  from public, anon, authenticated;
grant execute on function public.update_own_profile(text)
  to authenticated;

commit;
