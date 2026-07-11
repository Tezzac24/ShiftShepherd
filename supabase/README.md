# Supabase Backend Foundation

This folder holds the database foundation for Shift Shepherd's intended production backend. **The app is partially wired to Supabase**: auth/live sessions, announcements, events, rotas/availability, choir songs/selections, team chat, notification preferences, and the people/teams directory run live when `EXPO_PUBLIC_SUPABASE_*` is configured. Organisation Directory + Team Membership Management V1 and Membership Governance + Leave Team + Shared Live Data Realtime V1 are pushed/verified and manual-QA complete. The server-authoritative chat read cursor and unread summary are also live. The client now receives chat freshness through secure private Broadcast, backed by exactly one new local-only corrective migration. Push Token Registration V1 is live, while Chat Message Push Delivery V1 remains deployed/ACTIVE with physical-iPhone delivery QA pending; push is an alert only and is not used for shared-data or unread synchronization.

> **Current dev-project state:** remote migration history is aligned through applied immutable `20260711173139_add_team_chat_read_cursor.sql`. Only `20260711195143_migrate_chat_realtime_to_private_broadcast.sql` is local-only. It must be pushed before or together with the Broadcast client. `send-chat-message-push` remains ACTIVE with physical-iPhone delivery QA pending. **Do not rename or edit applied migrations.**

## Contents

```
supabase/
├── migrations/
│   ├── 001_initial_schema.sql   # 18 tables, enums, FKs, indexes, triggers
│   ├── 002_rls_policies.sql     # helper functions + RLS for every table
│   ├── 003_add_event_recurrence.sql # event recurrence metadata
│   ├── 004_add_choir_song_selection_section.sql # praise/worship sections + section-level RLS
│   ├── 005_add_rota_entry_cancellation.sql # rota entry status + cancellation fields
│   ├── 006_grant_authenticated_api_privileges.sql # authenticated Data API grants
│   ├── 20260709093129_grant_authenticated_events_api_privileges.sql # events/categories grants for the live events slice
│   ├── 20260709154733_grant_authenticated_rota_api_privileges.sql # rota entries/assignments/availability grants for the live rotas slice
│   ├── 20260709171613_grant_authenticated_songs_api_privileges.sql # songs/links/selections grants for the live choir songs slice
│   ├── 20260709205903_grant_authenticated_chat_api_privileges.sql # chat_messages select/insert grants for the live chat slice
│   ├── 20260709220528_grant_authenticated_notification_prefs_api_privileges.sql # notification_preferences grants for the live settings slice
│   ├── 20260709233705_link_auth_users_to_existing_profiles.sql # link new Auth users to matching existing profiles
│   ├── 20260710020944_enable_realtime_for_chat_messages.sql # add chat_messages to the supabase_realtime publication (live chat realtime)
│   ├── 20260710031212_add_chat_read_states.sql # private per-user chat read states for unread badges (cursor added by 20260711173139)
│   ├── 20260710105140_add_profile_avatar_storage.sql # pushed: private profile-avatars bucket, policies, avatar RPC
│   ├── 20260710114621_add_announcement_image_storage.sql # pushed: private announcement-images bucket + policies
│   ├── 20260710124206_add_chat_image_attachments.sql # pushed: private chat images + attachment grants/RPCs
│   ├── 20260710162415_fix_chat_image_attachment_permissions.sql # pushed: qualify the chat upload policy's object path
│   ├── 20260710171200_add_push_token_registration.sql # pushed: register_push_token RPC (no table grants)
│   ├── 20260710234443_add_push_delivery_foundation.sql # pushed: push_notification_deliveries ledger + service_role grants
│   ├── 20260711024931_harden_security_definer_functions.sql # pushed: revoke anon/PUBLIC helper execution, pin search paths
│   ├── 20260711041539_add_profile_editing_and_team_avatars.sql # pushed: narrow RPCs + private team-avatar bucket
│   ├── 20260711050344_restrict_profile_editing_to_name.sql # pushed: drop two-arg update_own_profile, add name-only RPC
│   ├── 20260711063412_add_team_membership_management.sql # pushed: narrow add/remove membership RPCs
│   ├── 20260711154126_refine_team_membership_governance.sql # pushed: governed removal + Leave Team
│   ├── 20260711154134_enable_shared_live_data_realtime.sql # pushed: shared-domain publication tables
│   ├── 20260711173139_add_team_chat_read_cursor.sql # pushed: server-authoritative chat read cursor + unread summary
│   └── 20260711195143_migrate_chat_realtime_to_private_broadcast.sql # local-only: secure private chat Broadcast transport
├── functions/
│   └── send-chat-message-push/  # Edge Function (deployed, JWT verified): chat push delivery
├── seed/
│   ├── dev_seed.sql             # mock data ported to SQL (relative dates)
│   └── README.md                # how to seed + link Supabase Auth users
└── README.md
```

Migrations apply in version order: `001` → `006`, then the timestamped ones (the CLI sorts them the same way).

Choir-specific rules worth knowing:

- `choir_rota_song_selections.section` splits a date's set list into `praise` and `worship`. RLS lets the assigned **Praise Leader** manage praise rows, the **Worship Leader** manage worship rows, a legacy **Song Leader** manage both, and the choir team leader / church admin manage everything (`can_manage_song_section()` in migration 004).
- `rota_entries.status` marks cancelled dates (e.g. a called-off rehearsal) instead of deleting them; cancelling is a plain update already covered by the leaders-manage-rota policy. Members keep updating only their own `availability_responses`.
- A choir rehearsal is just a rota entry where every choir member has a `'Choir Member'` assignment — availability tracking needs no extra tables.

## Design in one paragraph

The schema mirrors `src/types/index.ts` one-to-one (snake_case, same names) so swapping mock records for Supabase rows is mechanical. Every top-level table carries `organisation_id` for future multi-church support; child tables (assignments, responses, links, selections, attachments) reach their organisation through their parent. RLS is the server-side twin of `src/lib/permissions/index.ts`: a set of `security definer` helper functions (`is_team_member`, `is_church_admin`, `can_select_songs`, …) that policies compose, keyed off `auth.uid()` → `profiles.auth_user_id`.

## Getting started (when you're ready)

### Current chat Broadcast migration

`20260711063412_add_team_membership_management.sql` is already pushed, verified, and manually QA-complete. It remains unchanged.

`20260711154126_refine_team_membership_governance.sql` replaces `remove_team_member(p_team_id uuid, p_profile_id uuid)` and adds `leave_team(p_team_id uuid)`. Both return `(membership_id, team_id, profile_id, role, created_at)`, derive identity/organisation/roles server-side, use `SECURITY DEFINER` with `search_path=''`, and expose authenticated EXECUTE only. Organisation role never protects an ordinary target team membership. Team admins cannot remove peer admins; church admins may remove a non-self team admin only when another remains. Both leader-removal paths lock the same team row before membership/count/delete, preventing concurrent final-admin loss. The migration explicitly leaves authenticated with SELECT-only `team_memberships` access and no anon table access. It changes no profile, Auth user, organisation role, other team membership, data row, invite, or role assignment.

`20260711154134_enable_shared_live_data_realtime.sql` adds exactly the 13 existing tables used by the shared announcements/events/rotas/songs/directory loaders to `supabase_realtime`. It does not republish chat tables, set `REPLICA IDENTITY FULL`, alter RLS/grants, create a webhook/Edge Function, or add data. Events are invalidation signals; AppData re-runs RLS-scoped loaders. AppState foreground catch-up is mandatory because a removed member may not receive the membership DELETE after RLS access is lost.

`20260711173139_add_team_chat_read_cursor.sql` is applied and immutable. It owns the server-authoritative cursor, rollout backfill, narrow mark/summary RPCs, and write restrictions. Those contracts are unchanged.

`20260711195143_migrate_chat_realtime_to_private_broadcast.sql` is the only local-only migration. It adds receive-only private Broadcast authorization on `realtime.messages`, then uses database triggers to emit minimal v1 invalidations:

- `team-chat:<teamId>` / `chat_message_inserted`: `version`, `message_id`, `team_id`, `sender_id`, and `created_at` only. The client fetches that exact `(team_id, id)` row through normal RLS, including its bounded attachment join.
- `profile-chat-read:<profileId>` / `chat_read_state_changed`: `version` and `team_id` only. The client reconciles the authoritative summary.

The policies are SELECT-only and use `realtime.topic()` plus canonical UUID parsing; there is no client Broadcast INSERT policy or client send path. Team topics authorize normal members and same-organisation church admins through `can_access_team`; profile topics authorize only the current profile. Trigger functions are `SECURITY DEFINER`, pin `search_path=''`, derive topics from `NEW`, and are not executable by app roles. The migration removes only `chat_messages` and `chat_read_states` from the `supabase_realtime` publication after the triggers/policies exist. The 13 non-chat shared-data tables remain on Postgres Changes.

After an explicitly approved controlled push, verify the new migration version, both private-topic policies, trigger definitions/privileges, minimal payloads, and absence of both chat tables from the publication. Then run the two-user/multi-device, church-admin, membership removal/re-add, same-account token refresh, reconnect, foreground, image preview, and account-switch QA in the integration plan. The live database still uses chat Postgres Changes until this migration is applied, so do not ship the Broadcast client first.

1. Install the [Supabase CLI](https://supabase.com/docs/guides/cli) and run `supabase init` in the repo root (keeps this folder; generates `config.toml`).
2. `supabase start` for a local stack, or `supabase link --project-ref <ref>` for a hosted dev project.
3. Apply migrations:
   - **Hosted dev:** remote history is aligned through `20260711173139`; only `20260711195143_migrate_chat_realtime_to_private_broadcast.sql` is local-only. New changes go through `supabase migration new <name>` (leave the generated filename unchanged) followed by an explicitly approved `supabase db push`. **Do not rename `001`–`006` or timestamped migrations.** `npm run check:migrations` is an offline filename guard; local/remote alignment still requires `npx supabase migration list`.
   - **A fresh project from scratch:** `supabase db push` applies `001`–`006` and the timestamped migrations in order (numeric prefixes are accepted by the CLI); or paste each migration in version order in the dashboard SQL editor. `supabase db reset` (local stack) requires Docker.
4. Seed dev profiles, then create Auth users with matching emails. Once migration `20260709233705` is applied, new Auth users link automatically; see `seed/README.md` for verification and the manual path for users created earlier.
5. Copy `.env.example` to `.env` and fill in your project URL and anon key (the anon key is safe to ship in the app; RLS is the security boundary).

## Chat message push delivery (deployed; backend skip path verified)

Chat Message Push Delivery V1 is server-side only — the app never talks to Expo's push API itself. After a live chat send succeeds, the app makes one best-effort, fire-and-forget call to the `send-chat-message-push` Edge Function with just the `messageId` (see `src/lib/supabase/services/pushDelivery.ts`); chat send UX is never blocked by delivery. The function re-validates everything against the database using the service role (which exists only in the Edge Function runtime):

- caller holds a valid user JWT (`verify_jwt` is on in `config.toml`) and maps to a linked profile;
- the message exists, the caller **is its sender**, it is at most 5 minutes old (anti-replay), and the caller can access the team (membership or `church_admin`);
- recipients are the team's other members with `notification_preferences.chat_notifications` enabled (a missing row means the app's all-on defaults) and at least one registered push token; the sender is never notified.

Idempotency comes from the `push_notification_deliveries` ledger (migration `20260710234443`): each (event, recipient, token) attempt is claimed with `ON CONFLICT DO NOTHING` on a `NULLS NOT DISTINCT` unique index, so duplicate calls can never double-send. Outcomes (sent + Expo ticket id, failed + safe error code, skipped + reason) are recorded per row; app roles have **no** access to the ledger, and push tokens are never logged or returned. The notification itself is deliberately generic — title "New team message", body "You have a new message in <Team Name>.", `data: { type: 'chat_message', teamId, messageId }` — no message text or image details. There are no triggers, cron, receipts polling, or other event types.

The migration and function are already live. Backend QA confirmed authenticated invocation and expected `no_push_token` skips, with no raw tokens or message content in logs/ledger. Real Expo delivery is still unverified: physical iPhone development-build QA must confirm recipient registration, Expo ticket creation, banner display, no self-notification, and preference-off suppression. Do not add announcement, event, rota, or availability delivery until that chat QA passes.

The hosted Edge runtime injects `SUPABASE_URL` and the service role key (`SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEYS`) automatically — no manual secret is required. Only if the Expo project has "Enhanced Security for Push Notifications" enabled: `npx supabase secrets set EXPO_ACCESS_TOKEN=<token>`.

## Auth user to profile linking

After `20260709233705_link_auth_users_to_existing_profiles.sql` is applied, an `after insert` trigger on `auth.users` case-insensitively matches the new Auth email to an existing `public.profiles.email`. It sets `profiles.auth_user_id` only when that column is null. It does nothing for null/no-match emails and never overwrites a profile already linked to a different user.

The migration also enforces unique `lower(profiles.email)` values so a match cannot be ambiguous. `profiles.auth_user_id` was already unique. The trigger does **not** create profiles, organisation roles, team memberships, organisations, invitations, or public signup. Existing Auth users are not backfilled; use the one-time manual link in `seed/README.md` if they predate the trigger.

## Verifying RLS quickly

In the dashboard SQL editor you can impersonate a user:

```sql
-- pretend to be Sarah (after linking her auth user)
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select auth_user_id from profiles where email = 'sarah@gracecommunity.church'), 'role', 'authenticated')::text,
  true);
set local role authenticated;

select name from teams;          -- expect: Choir only (not admin)
select count(*) from songs;      -- expect: 10 (choir member)
rollback;
```

A fuller test matrix lives in `docs/supabase-integration-plan.md`.

## Non-negotiables

- **Never** put the service role key in the app or in `EXPO_PUBLIC_*` variables.
- The Expo app uses only `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- **Never** run `dev_seed.sql` against production.
- Schema changes go through new migration files created with `supabase migration new` — don't edit or rename already-applied ones (`001`–`006` are tracked in remote history).
