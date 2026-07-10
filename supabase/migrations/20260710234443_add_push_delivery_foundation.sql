-- ============================================================================
-- Shift Shepherd - Push Delivery Foundation V1 (chat messages only)
--
-- Server-side foundation for sending Expo push notifications from a Supabase
-- Edge Function (supabase/functions/send-chat-message-push). Nothing here
-- sends anything by itself: no triggers, no cron, no workers - delivery is
-- only ever initiated by the Edge Function, which the app calls best-effort
-- after a chat message send succeeds.
--
--  - push_notification_deliveries is the idempotency ledger and calm error
--    log: one row per (event, recipient, token) attempt. The Edge Function
--    claims work by inserting 'pending' rows with ON CONFLICT DO NOTHING
--    against the NULLS NOT DISTINCT unique index, so a duplicate call (app
--    retry, double tap, races) simply finds the rows already claimed and
--    sends nothing twice. Skips (preference off / no registered token) are
--    logged with a machine-readable reason so "why didn't I get a push?" is
--    answerable later.
--  - event_type is deliberately restricted to 'chat_message' for now; a
--    future migration widens the CHECK when announcement/event/rota delivery
--    is actually built.
--  - RLS is enabled with NO policies and no anon/authenticated grants: app
--    users can never read or write delivery logs (they contain push_token
--    references and error details). The Edge Function's service role is the
--    only reader/writer.
--  - This project does not auto-grant new-table privileges to the Data API
--    roles, and service_role holds no table privileges at all (verified via
--    read-only introspection 2026-07-11: bypassrls only skips RLS, not
--    GRANTs). The Edge Function validates the caller and recipients itself,
--    so it needs narrow read grants on the tables involved in chat push
--    eligibility - SELECT only, and only for service_role, which never
--    ships in the app.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- Delivery ledger
-- ----------------------------------------------------------------------------

create table public.push_notification_deliveries (
  id                uuid primary key default gen_random_uuid(),
  -- Generic (event_type, event_id) so later slices reuse the ledger; no FK,
  -- because each event type points at a different table (chat_messages now).
  event_type        text not null
    constraint push_notification_deliveries_event_type_check
    check (event_type in ('chat_message')),
  event_id          uuid not null,
  recipient_user_id uuid not null references public.profiles (id) on delete cascade,
  -- Null for logged skips (no registered token / preference off). SET NULL
  -- keeps the audit row meaningful if the token row is ever deleted.
  push_token_id     uuid references public.push_tokens (id) on delete set null,
  status            text not null default 'pending'
    constraint push_notification_deliveries_status_check
    check (status in ('pending', 'sent', 'skipped', 'failed')),
  expo_ticket_id    text,
  -- Machine-readable reason (Expo error code or skip reason); never a token.
  error_code        text,
  error_message     text,
  created_at        timestamptz not null default now(),
  sent_at           timestamptz,
  updated_at        timestamptz not null default now()
);

comment on table public.push_notification_deliveries is
  'Idempotency ledger and calm error log for server-side push delivery. Edge Function (service role) only - app users have no access.';

-- The idempotency arbiter: one attempt per (event, recipient, token), where
-- "no token" (a logged skip) counts as one slot too - hence NULLS NOT
-- DISTINCT (PG15+; the project runs PG17). ON CONFLICT DO NOTHING against
-- this index is what makes duplicate Edge Function calls harmless.
create unique index push_notification_deliveries_idempotency_idx
  on public.push_notification_deliveries
    (event_type, event_id, recipient_user_id, push_token_id)
  nulls not distinct;

-- Event lookup is covered by the idempotency index prefix; these cover
-- recipient history and the push_token FK (for ON DELETE SET NULL).
create index push_notification_deliveries_recipient_idx
  on public.push_notification_deliveries (recipient_user_id);
create index push_notification_deliveries_push_token_idx
  on public.push_notification_deliveries (push_token_id);

create trigger push_notification_deliveries_set_updated_at
  before update on public.push_notification_deliveries
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Access: service role only
-- ----------------------------------------------------------------------------

-- RLS on with no policies: even if a Data API grant ever appeared, app roles
-- would still see nothing. service_role bypasses RLS but needs the GRANTs.
alter table public.push_notification_deliveries enable row level security;

revoke all on table public.push_notification_deliveries from public;
revoke all on table public.push_notification_deliveries from anon;
revoke all on table public.push_notification_deliveries from authenticated;

grant select, insert, update on table public.push_notification_deliveries to service_role;

-- Narrow read access for the Edge Function's server-side eligibility checks:
-- caller->profile lookup, the message row, sender team access (membership or
-- church_admin), recipient memberships, chat notification preferences,
-- registered tokens, and the team name for the notification body.
grant select on table public.profiles                  to service_role;
grant select on table public.organisation_roles       to service_role;
grant select on table public.teams                    to service_role;
grant select on table public.team_memberships         to service_role;
grant select on table public.chat_messages            to service_role;
grant select on table public.notification_preferences to service_role;
grant select on table public.push_tokens              to service_role;

commit;
