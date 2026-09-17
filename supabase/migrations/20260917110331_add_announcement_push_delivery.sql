-- ============================================================================
-- Shift Shepherd - Announcement Push Delivery V1
--
-- Widens the server-side push delivery foundation (20260710234443) so the
-- existing send-chat-message-push Edge Function can deliver Expo push
-- notifications for newly posted announcements through the same idempotency
-- ledger. Nothing here sends anything by itself: no triggers, no cron, no
-- workers - delivery is still only ever initiated by the Edge Function, which
-- the app calls best-effort after an announcement insert succeeds and which
-- re-validates the caller (the announcement's author, via the validated
-- active profile), the announcement (same organisation, recent, active team),
-- and every recipient (active linked same-organisation readers, team members
-- for team announcements, the announcement-related notification preference,
-- registered tokens) server-side with the service role.
--
--  - push_notification_deliveries.event_type gains 'announcement'; for those
--    rows event_id is announcements.id (still no foreign key, because the
--    column is polymorphic across event tables). The NULLS NOT DISTINCT
--    idempotency index is unchanged, so one (event, recipient, token) attempt
--    is claimed at most once no matter how many times delivery is requested.
--  - service_role gains SELECT on public.announcements (audience, author,
--    organisation, team, created_at of the row being delivered - never used
--    for notification text) and on public.organisations (the display name in
--    the church-wide notification body). Both grants are read-only and only
--    for the service role, which never ships in the app.
--  - No RLS, policy, trigger, index, anon/authenticated privilege, or existing
--    row changes. Existing ledger rows all carry 'chat_message' and satisfy
--    the widened constraint.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- Ledger: accept announcement events
-- ----------------------------------------------------------------------------

alter table public.push_notification_deliveries
  drop constraint push_notification_deliveries_event_type_check;

alter table public.push_notification_deliveries
  add constraint push_notification_deliveries_event_type_check
  check (event_type in ('chat_message', 'announcement'));

comment on column public.push_notification_deliveries.event_type is
  'chat_message (event_id = chat_messages.id) or announcement (event_id = announcements.id).';

-- ----------------------------------------------------------------------------
-- Access: narrow read grants for the Edge Function's eligibility checks
-- ----------------------------------------------------------------------------

grant select on table public.announcements to service_role;
grant select on table public.organisations to service_role;

commit;
