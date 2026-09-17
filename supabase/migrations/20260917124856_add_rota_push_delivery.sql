-- ============================================================================
-- Shift Shepherd - Rota Push Delivery V1
--
-- Widens the server-side push delivery foundation (20260710234443, widened
-- for announcements by 20260917110331) so the existing send-chat-message-push
-- Edge Function can deliver the existing "Rota updates" preference
-- (notification_preferences.rota_notifications: "When you are added to a
-- rota or a rota changes") through the same idempotency ledger. Nothing here
-- sends anything by itself: no queue, cron, worker, or push-sending trigger.
-- Delivery is still only ever initiated by the Edge Function, which the app
-- calls best-effort after a live rota save succeeds and which re-validates
-- the caller (an active leader of the entry's active team, or a church admin
-- of its organisation), the saved entries, and every recipient server-side
-- with the service role.
--
--  - rota_entries gains a server-maintained change marker
--    (details_change_id, details_changed_at). A BEFORE INSERT OR UPDATE
--    trigger clears both on insert, issues a fresh random id and server
--    timestamp whenever a member-visible detail (title, date, time, notes,
--    or active/cancelled status) actually changes, and otherwise keeps the
--    previous values. A client can therefore neither forge nor replay a
--    marker, and no-op or assignment-only saves never look like a change.
--    The trigger only rewrites NEW (no table access), so it runs as the
--    invoker like set_updated_at.
--  - push_notification_deliveries.event_type gains 'rota_assignment'
--    (event_id = rota_assignments.id: the assignee was added to a rota) and
--    'rota_entry_change' (event_id = rota_entries.details_change_id: a rota
--    entry the recipient was already on changed). The NULLS NOT DISTINCT
--    idempotency index is unchanged, so each (event, recipient, token) is
--    claimed at most once no matter how often delivery is requested.
--  - service_role gains SELECT on public.rota_entries and
--    public.rota_assignments. The function reads routing columns only (entry
--    organisation, team, change marker; assignment entry, assignee,
--    created_at) - never titles, dates, times, notes, or role names. Both
--    grants are read-only and only for the service role, which never ships
--    in the app.
--  - No RLS, policy, index, anon/authenticated privilege, or existing row
--    changes. Existing entries keep null markers, and existing ledger rows
--    satisfy the widened constraint.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- Rota entries: server-maintained change marker
-- ----------------------------------------------------------------------------

alter table public.rota_entries
  add column details_change_id uuid,
  add column details_changed_at timestamptz;

alter table public.rota_entries
  add constraint rota_entries_details_change_marker_check
  check ((details_change_id is null) = (details_changed_at is null));

comment on column public.rota_entries.details_change_id is
  'Server-maintained id of the latest change to title, date, time, notes, or status (null until the first change). Keys rota push delivery; clients cannot set it.';
comment on column public.rota_entries.details_changed_at is
  'Server time of the latest change to title, date, time, notes, or status (null until the first change). Set by the same trigger as details_change_id.';

create function public.track_rota_entry_details_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.details_change_id := null;
    new.details_changed_at := null;
  elsif (new.title, new.date, new.time, new.notes, new.status)
        is distinct from (old.title, old.date, old.time, old.notes, old.status) then
    new.details_change_id := gen_random_uuid();
    new.details_changed_at := now();
  else
    new.details_change_id := old.details_change_id;
    new.details_changed_at := old.details_changed_at;
  end if;
  return new;
end;
$$;

revoke all on function public.track_rota_entry_details_change()
  from public, anon, authenticated;

create trigger rota_entries_track_details_change
  before insert or update on public.rota_entries
  for each row execute function public.track_rota_entry_details_change();

-- ----------------------------------------------------------------------------
-- Ledger: accept rota events
-- ----------------------------------------------------------------------------

alter table public.push_notification_deliveries
  drop constraint push_notification_deliveries_event_type_check;

alter table public.push_notification_deliveries
  add constraint push_notification_deliveries_event_type_check
  check (event_type in ('chat_message', 'announcement', 'rota_assignment', 'rota_entry_change'));

comment on column public.push_notification_deliveries.event_type is
  'chat_message (event_id = chat_messages.id), announcement (event_id = announcements.id), rota_assignment (event_id = rota_assignments.id), or rota_entry_change (event_id = rota_entries.details_change_id).';

-- ----------------------------------------------------------------------------
-- Access: narrow read grants for the Edge Function's eligibility checks
-- ----------------------------------------------------------------------------

grant select on table public.rota_entries to service_role;
grant select on table public.rota_assignments to service_role;

commit;
