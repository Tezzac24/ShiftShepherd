# Shift Shepherd

A mobile-first church coordination app for **Grace Community Church** — events, announcements, team rotas, choir song management, and team chat, all in one calm place. Built to reduce reliance on WhatsApp.

**Status:** functional scaffold / demo MVP with optional Supabase Auth and local persistence. The private chat Broadcast cutover and server-authoritative unread state are live and manually QA-complete: chat uses private team/profile database Broadcast, while the 13 unrelated shared-data tables continue using Postgres Changes. Profile editing, team avatars, governed membership, shared-data freshness, notification preferences, and chat push foundations remain live. Demo mode stays isolated from live channels. Physical-iPhone push delivery QA remains pending.
Every migration through Chat Message Push Delivery V1 (`20260710234443_add_push_delivery_foundation.sql`) is pushed and verified — live unread badges, profile photo uploads, announcement images, chat image attachments, the narrow `register_push_token` RPC, and the secured push-delivery ledger are active. Chat supports exactly one optional image per message (no arbitrary files, audio/video, galleries, camera capture, full-screen viewer, or message edit/delete). iOS Simulator token-registration UI was exercised, but simulator token reliability is limited; physical iPhone development-build QA is still required before real Expo delivery is considered verified.

Remote history is aligned through deployed `20260711195143_migrate_chat_realtime_to_private_broadcast.sql`. Its exact-topic policies and minimal triggers are live, `chat_messages` and `chat_read_states` are no longer in `supabase_realtime`, Expo export passed for Android/iOS/web, and the documented two-user, multi-device, membership, reconnect, foreground, image, account-switch, and demo QA passed.

Invite, Open Signup Onboarding, No-Organisation State, Organisation Creation, and Multi-Organisation Identity Foundation V1 is deployed through `20260712001940_add_invite_onboarding_identity_foundation.sql`. `manage-organisation-invitations` v1 and the active-profile-compatible `send-chat-message-push` v5 are ACTIVE, invitation runtime secrets and allowed redirects are configured, and non-mutating function smoke tests passed. Live invitation acceptance/delivery and genuine no-organisation device QA remain deferred. Commits `420e12f` and `bf6a538` repaired sign-out persistence and account-bootstrap routing races.

Organisation Membership & Role Management V1 (commits `c54da51`, `7628569`, `ad09ae9`) is **deployed** to `shift-shepherd-dev` via `20260712103321_add_organisation_membership_role_management.sql`, applied 2026-07-12. Church admins have a bounded searchable member directory and exclusive-role editor; admins can revoke another member's access, and members can leave an organisation from Profile. Stable profiles/history and other organisations are preserved, current roles/teams/profile push tokens are revoked, active-profile transitions are atomic, every removal invalidates the affected account scope, concurrent team/token writes cannot survive cleanup, the final effective church admin is protected under one organisation-row lock, and re-invitation restores only baseline membership. Hosted verification passed (schema, deterministic active backfill, RLS, ACLs, publication, and unchanged data fingerprints), but **the membership/role/remove/leave/re-invitation flows have not been exercised against live data or manually QA-tested**.

Push Token Lifecycle V1 is deployed through `20260714200205_add_push_token_revocation.sql`, and its live database contract is verified. Native physical-device lifecycle and delivery QA remains pending.

Team Creation & Editing V1 is **deployed** to `shift-shepherd-dev` behind `20260715004513_add_team_creation_editing_and_archive.sql`. Active church admins can create teams with zero admins or one explicitly selected active same-organisation initial admin, edit name/description/avatar, soft-archive teams, inspect archived metadata, and restore the same team ID. The creator is never added automatically; archive retains memberships, avatar, chat, rota, songs, attribution, and all other team-linked history. Team Role Management V1 remains deferred. Its hosted PostgreSQL schema, four lifecycle RPCs, ACLs, authenticated lifecycle probes, archive/restore, history preservation, RLS isolation, and database invariants are verified (all probe mutations rolled back); manual app QA remains pending, and ambiguous network retries may still create duplicate teams (no request-id schema).

Local verification passes with 515 tests across 59 suites, typecheck, lint, migration filename validation, Android/iOS/web Expo export, and diff checks. Hosted migration history is aligned through `20260715004513` across 32 migrations, with no local-only, remote-only, or repair entry.

## Current Scaffold Highlights

- Home prioritises latest announcement, next upcoming event, then the user's next team responsibility.
- Event create/edit uses an inline calendar date picker, a simple readable time list, and recurrence choices including monthly weekday patterns.
- Recurring events are stored as base mock rows and expanded locally for upcoming Home and Calendar lists.
- Choir rota entries assign a **Praise Leader** and a **Worship Leader** (one person may hold both roles); the set list splits into Praise Songs and Worship Songs, each managed only by its leader (choir team leader/admin can manage both).
- **Plan the Month** lets choir leaders create a whole month of Sunday services and weekly rehearsals at once, with default leaders and per-date overrides.
- Choir rehearsals include every choir member so each can confirm availability; rota detail shows an Available / Maybe / Unavailable / Not responded tracker.
- Rehearsals (or services) can be **cancelled** instead of deleted: they stay visible with a Cancelled badge, drop out of responsibilities, and offer a prefilled team announcement (never auto-sent).
- Profile Editing V1 uses a quiet card action and lets linked users edit only `full_name`; phone is displayed read-only (changes arrive through a future verified account flow), and email, role, organisation, and memberships remain read-only.
- Team Avatars V1 displays private signed photos on team cards/details. The normal team screen shows no management controls; team leaders/church admins reach add/change/remove through a subtle **Team settings** action. JPEG/PNG/WebP uploads are limited to 5 MB and demo teams retain initials.
- Team membership governance now distinguishes organisation role from team role: a church admin with an ordinary team membership is removable like any ordinary member; team admins cannot remove peer admins; a church admin may remove a non-final team admin; self-removal uses **Leave Team**; and the database serializes final-admin checks with a team-row lock. Promotions, demotions, and leadership transfer remain deferred.
- Church admins now have **New team** and **Archived teams** actions. Creation defaults to no team admin, can explicitly select one active organisation profile as the initial team admin, and never auto-adds the creator. Editing stays organisation-admin-only.
- Team archive is non-destructive: ordinary active lists and team routes exclude archived teams, while the admin archive view can restore the same row with memberships, chat, rota, songs, avatar, and attribution intact.
- Every current member can find a restrained **Leave team** action on the normal team page without gaining administrative settings. Confirmation explains the real consequence and preserves the church profile/account/organisation role; a final team admin receives “Another team admin must be appointed before you can leave.”
- Canonical directory membership state now updates member lists, counts, candidates, Profile → Your Teams, and access gates together immediately after a successful mutation, then queues a quiet scoped refresh.
- Active linked sessions use one shared Realtime invalidation channel for announcements, events, rotas, songs, and the teams/directory domain. A short domain scheduler coalesces bursts and AppState foreground transitions always catch up; open-chat Realtime remains separate. Push notifications and Edge Functions are not synchronization sources.
- Remote Supabase migrations are aligned through deployed `20260715004513_add_team_creation_editing_and_archive.sql` (32 migrations); the team lifecycle migration is deployed and hosted-contract verified. `manage-organisation-invitations` v1 and active-profile-compatible `send-chat-message-push` v5 are deployed. Disposable-account invitation/multi-org QA, team lifecycle manual app QA, and physical-device Expo ticket/banner QA are pending.
- Live identity now has three explicit deployed layers: Supabase Auth identity, one account-global `user_accounts` identity, and one `profiles` row per organisation. A server-validated active profile scopes every normal app query to exactly one organisation.
- Open signup creates no organisation access. Signed-in accounts with no organisations can confirm a global name, create an organisation transactionally, see the intentionally unavailable Request to join placeholder, or sign out.
- Church admins can invite an existing unlinked directory person or use Add & invite with email only. Seven-day app-owned invitations store only a SHA-256 hash, rotate on resend, support revoke, and require the matching server-verified email at acceptance. Acceptance adds only baseline `general_member` membership, no team/admin authority.
- Church admins reach **Organisation members** from Profile to search the bounded directory, review active/unlinked/removed access, see role/team/invitation status, replace one supported organisation role, or remove another person's access after confirmation. Removed profiles remain visible for history and can be invited again from Organisation invitations.
- Live members can **Leave organisation** from Profile. The server protects the final effective church admin, removes current roles/team memberships/profile push tokens, preserves all historical attribution/global identity/other organisations, and routes through refreshed account state to the remaining Home, organisation selector, or **No organisations yet**.
- Global display name is account-owned; an optional organisation override wins for the active profile. A minimal Profile selector safely switches linked organisations and remounts all organisation-scoped app data/channels.
- Demo changes (announcements, rotas, songs, messages, notification settings...) persist locally via AsyncStorage and can be reset from **Profile -> Reset Demo Data**.

## Tech Stack

- React Native + Expo (SDK 54) + TypeScript (strict)
- Expo Router (file-based routing, `app/` directory)
- React context + local state with session-only Supabase live slices
- Production backend path: Supabase + Expo Notifications

## Getting Started

```bash
npm install
npm start          # then press a (Android), i (iOS), or w (web)
```

Other commands:

```bash
npm run lint             # ESLint
npm run typecheck        # TypeScript check
npm test                 # Jest regression tests
npm run test:watch       # Jest in watch mode
npm run test:ci          # Jest as CI runs it (no watch, in-band)
npm run check:migrations # Offline migration filename sanity check
npx expo export          # Bundle/export sanity check
```

## Testing & CI

The repo has an automated regression foundation (jest-expo + React Native Testing Library) plus a check-only GitHub Actions workflow.

**Tests** live in `src/**/__tests__/*.test.ts(x)` and are deterministic: Supabase, Expo Notifications/Constants/Device/SecureStore, and AsyncStorage are mocked, no test uses the network or real credentials, and no real push token or invitation is generated. The deployed Broadcast baseline was **211 tests across 31 suites**; the pre-membership identity/auth-routing baseline was **296 tests across 43 suites**; the current implementation passes **515 tests across 59 suites**. Coverage pins migration history, profile and team lifecycles, active-profile outcomes, same-organisation authority, zero-admin and optional-initial-admin creation, archive/history/restore contracts, last-admin and cleanup-write serialization, safe service errors, canonical AppData patching and stale-scope fencing, admin route visibility/forms, avatar-after-create failure handling, and all existing auth/chat/push regressions.

**The standard local check sequence** before pushing any slice:

```bash
npm run typecheck
npm run lint
npm run test:ci
npx expo export
git diff --check
```

**CI** (`.github/workflows/ci.yml`) runs on every push to `main`, on pull requests targeting `main`, and manually via workflow_dispatch. It runs exactly: `npm ci`, `npm run typecheck`, `npm run lint`, `npm run test:ci`, `npm run check:migrations`, `npx expo export`. It is **check-only**: it needs no secrets and no `.env` (the export intentionally runs in demo mode), and it never deploys anything — Supabase migration pushes, Edge Function deploys, and EAS builds all remain explicit, manually approved steps.

**Still manual:** `20260712103321` was deployed and hosted-verified in a controlled task (schema, deterministic active backfill, RLS, function ACLs, publication, and 17 unchanged data fingerprints), but no live membership mutation was performed. `20260714200205` is deployed and live-contract verified, but native push lifecycle/delivery remains unexercised. `20260715004513` is deployed and hosted-contract verified (schema, RPCs, ACLs, authenticated lifecycle probes, archive/restore, history preservation, RLS isolation, and database invariants; all probe mutations rolled back), but no team create/edit/avatar/archive/restore manual app QA has run. The member-list/role/remove/leave/re-invite/multi-org matrix still has to be run with disposable accounts, and live last-admin concurrency has never been executed. The deployed identity functions are configured and non-mutating-smoke-tested, but genuine no-organisation device routing and disposable-account QA for open signup, first real invitation delivery/acceptance, both invitation paths, resend/revoke/expiry, wrong account, OAuth, phone-only rejection, names, and multi-org switching remain deferred. Production invitation delivery is not approved and custom-scheme links are not production-ready. Physical-iPhone push banner QA remains separately pending; push is unrelated to unread truth. Edge Functions remain outside Jest. Real-user rollout remains blocked.

## Running the App

### Demo mode (no configuration needed)

With no `.env` file the app runs fully offline on mock data. Pick a test account on the login screen (see table below), or type any mock email (e.g. `michael@gracecommunity.church`) with any password. The selected account is remembered between launches.

### With Supabase Auth

1. Copy `.env.example` to `.env` and fill in from your Supabase dev project (Settings -> API):
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
   ```
   These are public, RLS-protected values. **Never** put a service_role key in the app.
2. Make sure the migrations and `supabase/seed/dev_seed.sql` have been run.
3. The deployed identity migration removed historical email auto-linking. Open signup creates only an Auth/global-account shell and never grants organisation access by email match; use the invitation or no-org creation flows instead.
4. Restart Expo (`npm start`) so the env vars are picked up, then log in with the real email/password. The session is restored on cold start; sign out from the Profile tab.

Notes:
- In the deployed onboarding implementation, a Supabase Auth user with no organisation reaches **No organisations yet** rather than being signed out. Open signup does not search the directory or auto-link by email.
- A live session is built from one account-global identity and its server-validated active organisation profile. Organisation role and team memberships remain canonical database rows with real UUIDs.
- The demo account selector stays available even when Supabase is configured.

Invitation runtime uses configured `RESEND_API_KEY`, `INVITATION_FROM_EMAIL`, and `INVITATION_APP_BASE_URL`, an allowed `/invite/accept` Auth/app redirect, and a verified sender. These remain runtime-only and out of Expo and committed files. The migration, `manage-organisation-invitations` v1, and active-profile-compatible `send-chat-message-push` v5 are deployed; use disposable accounts for the still-pending QA before any real invitations.

### Live announcements, events, teams, rotas, choir songs, chat & notification settings (Supabase data slices)

When you are signed in through **Supabase Auth with a linked profile**, the announcements and calendar/events screens read and write the live `announcements` and `events` tables, the Teams/Messages/Home/Profile screens show your live teams, members, and organisation, and authorised leaders/admins manage memberships from Team Settings. The rota screens read and write `rota_entries`, `rota_assignments`, and `availability_responses`; choir screens use `songs`, `song_links`, and `choir_rota_song_selections`; team chat uses `chat_messages`; and notification settings use `notification_preferences`. All access goes through `src/lib/supabase/services/`; demo mode keeps local data and never calls membership or shared-Realtime services. Worth knowing:

- **RLS is the authority.** Client-side role checks only hide buttons; the server enforces that church-wide announcements need a church admin or announcement manager, team announcements need that team's leader (or an admin), events can only be created/edited/deleted by a church admin or event manager, rota entries and assignments can only be managed by that team's leader (or an admin), availability responses can only be written by the person the assignment belongs to, choir songs can be managed by choir members, song selections can be changed only by the assigned section leader or choir team leader/admin, and chat messages can be read and sent only by that team's members (or an admin) — and only as yourself. Reads are limited to your organisation and accessible teams. Live data is **authenticated-only** — anonymous users can read nothing.
- **Membership writes stay narrow.** `add_team_member`, refined `remove_team_member`, and new `leave_team` derive the caller from `auth.uid()` and accept no caller/organisation/role authority. Target protection uses the target membership's team role—not organisation role. The common team-row lock makes final-admin removal/leave transaction-safe; the app role retains SELECT-only `team_memberships` access, with no anon write/read API, invite/signup, role editor, or membership notification.
- **Shared freshness is invalidation + refetch.** The applied shared-data migration publishes `announcements`, `events`, rota tables, song tables, `organisations`, `profiles`, `teams`, `team_memberships`, and `organisation_roles`. These non-chat domains continue using Postgres Changes; the chat Broadcast correction does not convert them. Raw payloads only select a scoped loader, bursts coalesce, and reconnect/foreground catch-up remains authoritative after access loss.
- The announcements columns are `body` (not "content") and `pinned` (not "priority").
- Linking an announcement to an event works in both modes: the picker lists live events in live mode (real UUIDs) and local events in demo mode.
- Recurring events are stored as single base rows (rule + label + optional end date) and expanded into upcoming occurrences on-device — same as demo mode.
- Availability responses are an upsert (one per assignment): Available / Maybe / Unavailable with an always-optional note; Home's "Your Next Responsibility" card is live-backed too.
- Live announcements, events, the teams directory, rotas, choir songs/selections, chat messages, and notification preferences are session data: they are not saved into the demo AsyncStorage snapshot, and **Reset Demo Data** does not touch the live database.
- Chat freshness is **session-scoped, not screen-scoped**. The client authenticates Realtime before joining private channels, maintains `team-chat:<teamId>` for each canonical accessible team plus `profile-chat-read:<profileId>` for the caller, updates Realtime auth on token refresh, and removes old/lost-access channels promptly. Database triggers send only versioned ids/timestamps (`chat_message_inserted`) or a team-id invalidation (`chat_read_state_changed`); the client validates them, fetches exactly one message by team+id through RLS (including its bounded attachment join), and coalesces read invalidations into `get_team_chat_unread_summary()`. `realtime.messages` policies allow SELECT only through `can_access_team` or the caller's exact profile topic; there is no client INSERT/send policy. Broadcast is transport, never unread truth: the forward-only cursor and unread summary remain authoritative, foreground/reconnect catch-up repairs missed events, own messages never count, opening Messages alone clears nothing, and viewing one chat clears only that team. Demo mode creates no private channel or live call. Non-chat shared data remains on Postgres Changes, and push delivery remains a separate alert path.
- Notification settings save one row per person (`unique(user_id)` upsert; the row is only created on your first change). The screen also has a **Device notifications** card (live mode only): tapping **Enable device notifications** asks for OS permission (only then), fetches this device's Expo push token, and registers it through a narrow `register_push_token` RPC — re-registering just refreshes the row, and a shared phone follows whoever is signed in. The deployed chat-delivery function safely skips recipients without a token; no real Expo ticket or banner has yet been verified. A development build is needed for a reliable real-device token (Expo Go can't register); iOS Simulator token-registration UI was exercised, while Android and physical-iPhone QA are deferred.

### iOS Simulator push-registration QA — passed (2026-07-11)

Supported iOS Simulators are allowed to attempt registration. Expo documents support for Xcode 14+ on macOS 13+ with an iOS 16+ Simulator. If permission or token acquisition fails at runtime, the app keeps its friendly retry state; it does not pre-block the Simulator.

Push Token Registration V1 and its database RPC are pushed and verified, and **iOS Simulator QA has passed**: the live Device notifications card appears, the OS permission prompt happens only after the button tap, the device registers successfully, no raw token is ever shown, and a second signed-in user can re-register the same simulator token (the shared-device takeover path). Demo/local mode hides the card and makes no push API or Supabase calls. Android QA is deferred and physical iPhone QA remains the most representative later step.

To reproduce on a MacBook, build and install the iOS Simulator development client, then start Metro for that client:

```bash
npx eas-cli build --profile ios-simulator --platform ios
npx expo start --dev-client
```

Known accepted polish deferral: the card's "registered" state is session-only and doesn't persist after leaving and returning to the screen — re-registering succeeds, which is fine for now.

Real Push Delivery V1 is deliberately narrow: **chat messages only**. After a live chat send succeeds, the app makes one best-effort call to the deployed `send-chat-message-push` Supabase Edge Function, which validates everything server-side (sender-only, recent messages, team access), respects each recipient's chat notification preference, never notifies the sender, and sends a **generic** notification ("New team message" / "You have a new message in <Team Name>." — never the message text). Delivery is idempotent via a server-side ledger and never blocks or fails a chat send; demo/local mode sends nothing. Backend QA verified invocation and safe `no_push_token` skips without token or message-content leakage. **Real Expo delivery is not yet verified**: physical iPhone development-build QA must confirm recipient registration, Expo ticket creation, visible banner, no self-notification, and preference-off suppression. Announcements, events, rota, and availability pushes are not implemented and must not be expanded until that QA passes.
- **Profile photos** are the first live Supabase Storage slice: from the Profile screen you can add, change, or remove your own photo (JPEG/PNG/WebP, under 5 MB). Photos live in a **private** `profile-avatars` bucket, display through short-lived signed URLs (initials are always the fallback), and storage policies let you write only inside your own folder while anyone in your church can see your photo. The `20260710105140_add_profile_avatar_storage.sql` migration is pushed and QA'd, so live photo uploads are active. Demo mode keeps initials and never calls Storage.
- **Announcement Images V1** is active and QA'd: one optional JPEG/PNG/WebP image (under 5 MB) per announcement, stored as a path in `announcements.image_url` within the **private** `announcement-images` bucket. Signed URLs render it on cards and detail; add/change/remove is live-session-only and demo announcements remain text-only. There are no multi-image galleries, and announcement push delivery is not implemented.

To try it end to end (after the setup steps above):

1. Sign in as **Daniel** (church admin) or **Miriam** (announcement manager) — create, edit, pin, and delete a church-wide announcement; changes land in the dev database.
2. Sign in as **Sarah** (choir leader) — she can post to the Choir team but not church-wide, and she gets no New Event button.
3. Sign in as **Joseph** (event manager) — create, edit, and delete calendar events, including recurring ones.
4. Sign in as **Ruth** (general member) — she can read church announcements and events but sees no manage buttons, and the database would reject a write anyway.

### Local persistence & reset

Changes you make in the app (announcements, events, rotas, songs, messages, notification settings) are saved on-device with a versioned envelope. Corrupt or outdated saved data is discarded safely; the app falls back to the original mock examples. **Profile -> Reset Demo Data** restores everything to the original seed state. (In live mode, announcements, events, rotas, choir songs/selections, chat messages, and notification settings come from Supabase instead and are unaffected by local persistence or the demo reset.)

## Demo Login

The login screen has a **test account selector**. Pick any account to explore that role:

| User | Role | Good for testing |
| --- | --- | --- |
| Daniel Okafor | Church Admin | Sees every team, all admin actions |
| Miriam Blake | Announcement Manager | Creating church-wide announcements; leads Ushers |
| Joseph Carter | Event Manager | Creating/editing calendar events; leads Youth Team |
| Sarah Williams | Choir Team Leader | Managing choir rota, Plan the Month, overriding both song sections |
| Hannah Adeyemi | Choir Member / Worship Leader | Rehearsal availability; **worship songs** for the date she leads |
| Michael Thompson | Assigned Praise Leader | **Praise songs** for the rota date he leads (not worship) |
| David Chen | Media Team Leader | Managing the media rota |
| Ruth Johnson | General Member | Empty states (no teams, no responsibilities) |

When Supabase is **not** configured, you can also "log in" with any mock user's email (e.g. `michael@gracecommunity.church`) and any password. When Supabase **is** configured, the email/password form performs real Supabase Auth sign-in instead.

## Project Structure

```
app/                  # Expo Router routes (thin re-exports of feature screens)
src/
  features/           # Screen implementations, grouped by feature
  components/         # Reusable UI (buttons, cards, badges, dialogs, fields…)
  lib/
    auth/             # Auth abstraction (demo mode + real Supabase Auth)
    appData/          # App state store + selectors (mock CRUD, persisted locally)
    mockData/         # Realistic seed data matching the Supabase schema
    permissions/      # All role/permission checks live here
    storage/          # Versioned AsyncStorage persistence helpers
    supabase/         # Env-guarded Supabase client + live services
    notifications/    # Device-side Expo push registration flow
  types/              # Entity types mirroring the intended Supabase schema
  utils/              # Dates, ids
constants/theme.ts    # Design tokens (colours, type, spacing)
supabase/             # Backend foundation: schema + RLS migrations, dev seed
docs/                 # Product & build specs
```

## Docs

- `docs/shift_shepherd_design_doc.md` — full product spec
- `docs/one-shot-build-prompt.md` — technical build spec
- `docs/supabase-integration-plan.md` — how and in what order to wire Supabase
- `supabase/README.md` — schema/RLS overview and setup steps
