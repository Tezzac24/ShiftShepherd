# Supabase Backend Foundation

This folder holds the database foundation for Shift Shepherd's intended production backend. **The app is partially wired to Supabase**: auth + live sessions, the **announcements**, **events**, **rotas/availability**, **choir songs/song selections**, **team chat** (with realtime for the open conversation and one optional private image per message), and **notification preferences** feature slices, and the **read-only people/teams directory** (organisations, profiles, teams, team memberships) run live (when `EXPO_PUBLIC_SUPABASE_*` env vars are configured). Push Token Registration V1 is implemented in the app (`expo-notifications` and the EAS project id are configured; a development build is needed — Expo Go cannot register), and its migration `20260710171200_add_push_token_registration.sql` is **pushed and DB/RPC-verified**; iOS Simulator registration UI was exercised, but simulator token reliability is limited. **Chat Message Push Delivery V1** is deployed: the `send-chat-message-push` Edge Function is ACTIVE with JWT verification and `20260710234443_add_push_delivery_foundation.sql` is pushed/verified. Backend QA confirmed invocation, sender exclusion, recipient/team selection, preference handling, and safe `no_push_token` skips with no token/message leakage. Real Expo delivery still requires physical iPhone development-build QA. Announcement/event/rota/availability push delivery is not implemented. The Auth/profile auto-link migration (`20260709233705`) and the chat realtime publication migration (`20260710020944`) have both been pushed and verified, alongside the earlier grants migrations. See `docs/supabase-integration-plan.md` for the wiring order.

> **Current dev-project state:** remote migration history is aligned through pushed/verified `20260711041539_add_profile_editing_and_team_avatars.sql` (self-only profile editing and private manager-controlled team avatars; no anon/broad table grants). `20260711050344_restrict_profile_editing_to_name.sql` is local-only and awaits explicit push approval plus live QA: it narrows profile editing to `full_name` only by dropping `update_own_profile(text, text)` and creating the name-only `update_own_profile(text)` — phone is reserved for a future verified account flow and stored values are untouched. `send-chat-message-push` remains ACTIVE with physical-iPhone delivery QA pending. **Do not rename old or timestamped migrations.**

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
│   ├── 20260710031212_add_chat_read_states.sql # private per-user chat read states for unread badges
│   ├── 20260710105140_add_profile_avatar_storage.sql # pushed: private profile-avatars bucket, policies, avatar RPC
│   ├── 20260710114621_add_announcement_image_storage.sql # pushed: private announcement-images bucket + policies
│   ├── 20260710124206_add_chat_image_attachments.sql # pushed: private chat images + attachment grants/RPCs
│   ├── 20260710162415_fix_chat_image_attachment_permissions.sql # pushed: qualify the chat upload policy's object path
│   ├── 20260710171200_add_push_token_registration.sql # pushed: register_push_token RPC (no table grants)
│   ├── 20260710234443_add_push_delivery_foundation.sql # pushed: push_notification_deliveries ledger + service_role grants
│   ├── 20260711024931_harden_security_definer_functions.sql # pushed: revoke anon/PUBLIC helper execution, pin search paths
│   ├── 20260711041539_add_profile_editing_and_team_avatars.sql # pushed: narrow RPCs + private team-avatar bucket
│   └── 20260711050344_restrict_profile_editing_to_name.sql # local-only: drop two-arg update_own_profile, add name-only RPC
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

### Pending name-only profile editing correction

`20260711050344_restrict_profile_editing_to_name.sql` is local-only. It drops `update_own_profile(text, text)` (the original name+phone signature from the pushed `20260711041539`) and creates `update_own_profile(text)`, which validates and updates only the caller's `full_name` (2–100 characters) and returns the profile id, name, and unchanged stored phone. SECURITY DEFINER with empty `search_path`; EXECUTE revoked from public/anon and granted to authenticated only. Phone is deliberately read-only in the app — reserved for a future verified account flow — and this migration does not touch stored phone values, add phone-auth columns, or change Supabase Auth configuration. Team-avatar RPCs, bucket, and policies from `20260711041539` are unchanged.

After an explicitly approved push, verify the two-argument function no longer exists, the one-argument function is authenticated-only with an empty search path, a linked user's name save persists, and their phone value is unchanged.

1. Install the [Supabase CLI](https://supabase.com/docs/guides/cli) and run `supabase init` in the repo root (keeps this folder; generates `config.toml`).
2. `supabase start` for a local stack, or `supabase link --project-ref <ref>` for a hosted dev project.
3. Apply migrations:
   - **Hosted dev:** remote history is aligned through `20260711041539`; `20260711050344` is local-only. New changes go through `supabase migration new <name>` (leave the generated filename unchanged) followed by an explicitly approved `supabase db push`. **Do not rename `001`–`006` or timestamped migrations.** `npm run check:migrations` is an offline filename guard; local/remote alignment still requires `npx supabase migration list`.
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
