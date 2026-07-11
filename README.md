# Shift Shepherd

A mobile-first church coordination app for **Grace Community Church** — events, announcements, team rotas, choir song management, and team chat, all in one calm place. Built to reduce reliance on WhatsApp.

**Status:** functional scaffold / demo MVP with optional Supabase Auth and local persistence. Established live slices cover announcements, events, people/teams, rotas, choir songs, chat, and notification preferences. **Profile Editing V1** now lets linked users change only their own name and phone; **Team Avatars V1** lets team leaders/admins manage one private team photo. Both new paths remain unavailable to demo mode and require the local-only migration below before live QA. Chat Message Push Delivery V1 remains deployed with physical-device delivery QA pending.
Every migration through Chat Message Push Delivery V1 (`20260710234443_add_push_delivery_foundation.sql`) is pushed and verified — live unread badges, profile photo uploads, announcement images, chat image attachments, the narrow `register_push_token` RPC, and the secured push-delivery ledger are active. Chat supports exactly one optional image per message (no arbitrary files, audio/video, galleries, camera capture, full-screen viewer, or message edit/delete). iOS Simulator token-registration UI was exercised, but simulator token reliability is limited; physical iPhone development-build QA is still required before real Expo delivery is considered verified.

Security hardening migration `20260711024931_harden_security_definer_functions.sql` is **pushed and verified**. Profile Editing V1 + Team Avatars V1 adds local-only `20260711041539_add_profile_editing_and_team_avatars.sql`; it has not been pushed. Remote history remains aligned through `20260711024931`.

## Current Scaffold Highlights

- Home prioritises latest announcement, next upcoming event, then the user's next team responsibility.
- Event create/edit uses an inline calendar date picker, a simple readable time list, and recurrence choices including monthly weekday patterns.
- Recurring events are stored as base mock rows and expanded locally for upcoming Home and Calendar lists.
- Choir rota entries assign a **Praise Leader** and a **Worship Leader** (one person may hold both roles); the set list splits into Praise Songs and Worship Songs, each managed only by its leader (choir team leader/admin can manage both).
- **Plan the Month** lets choir leaders create a whole month of Sunday services and weekly rehearsals at once, with default leaders and per-date overrides.
- Choir rehearsals include every choir member so each can confirm availability; rota detail shows an Available / Maybe / Unavailable / Not responded tracker.
- Rehearsals (or services) can be **cancelled** instead of deleted: they stay visible with a Cancelled badge, drop out of responsibilities, and offer a prefilled team announcement (never auto-sent).
- Profile Editing V1 uses a quiet card action and lets linked users edit only `full_name` and optional `phone`; email, role, organisation, and memberships remain read-only.
- Team Avatars V1 displays private signed photos on team cards/details; only team leaders or church admins see add/change/remove controls. JPEG/PNG/WebP uploads are limited to 5 MB and demo teams retain initials.
- Remote Supabase migrations are applied through `20260711024931`; the new profile/team-avatar migration is local-only. Established live slices remain wired, while the two new paths await push/QA. The deployed chat function remains unchanged and physical-device Expo ticket/banner QA is pending.
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

**Tests** live in `src/**/__tests__/*.test.ts(x)` and are deterministic: Supabase, Expo Notifications/Constants/Device, and AsyncStorage are mocked, no test uses the network or real credentials, and no real push token is ever generated. Coverage includes push/chat/notification regressions plus profile field allow-listing and RPC behavior, team-avatar validation/path/cleanup/signing, manager permissions, and profile/team-avatar control presentation.

**The standard local check sequence** before pushing any slice:

```bash
npm run typecheck
npm run lint
npm run test:ci
npx expo export
git diff --check
```

**CI** (`.github/workflows/ci.yml`) runs on every push to `main`, on pull requests targeting `main`, and manually via workflow_dispatch. It runs exactly: `npm ci`, `npm run typecheck`, `npm run lint`, `npm run test:ci`, `npm run check:migrations`, `npx expo export`. It is **check-only**: it needs no secrets and no `.env` (the export intentionally runs in demo mode), and it never deploys anything — Supabase migration pushes, Edge Function deploys, and EAS builds all remain explicit, manually approved steps.

**Still manual:** after the local migration is explicitly pushed, verify live profile save/cancel/persistence and leader/admin team-photo add/change/remove versus an ordinary member; also check the compact layouts on a small iPhone. Physical-iPhone push banner QA remains pending. The Edge Function remains outside Jest.

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
3. Create Supabase Auth users (Dashboard -> Authentication -> Users) with emails matching the seeded profiles. The auto-link trigger (migration `20260709233705`, applied) links each new Auth user automatically. Auth users created before that migration still need the one-time manual link documented in `supabase/seed/README.md`.
4. Restart Expo (`npm start`) so the env vars are picked up, then log in with the real email/password. The session is restored on cold start; sign out from the Profile tab.

Notes:
- A Supabase Auth user with **no matching profile** remains unlinked and gets a friendly setup message. The trigger never creates profiles, roles, memberships, organisations, or invitations.
- A Supabase session is built entirely from live rows: your profile, organisation role, and team memberships come from the database (real UUIDs — no demo-identity bridging in the auth layer any more).
- The demo account selector stays available even when Supabase is configured.

### Live announcements, events, teams, rotas, choir songs, chat & notification settings (Supabase data slices)

When you are signed in through **Supabase Auth with a linked profile**, the announcements and calendar/events screens read and write the live `announcements` and `events` tables, the Teams/Messages/Home/Profile screens show your live teams, members, and organisation (read-only — team management still happens in the Supabase dashboard), the rota screens read and write the live `rota_entries`, `rota_assignments`, and `availability_responses` tables, choir song screens read and write live `songs`, `song_links`, and `choir_rota_song_selections` rows, team chat reads and writes the live `chat_messages` table, and the notification settings screen reads and writes your `notification_preferences` row. All of it goes through `src/lib/supabase/services/`; in demo mode everything keeps using local data. Worth knowing:

- **RLS is the authority.** Client-side role checks only hide buttons; the server enforces that church-wide announcements need a church admin or announcement manager, team announcements need that team's leader (or an admin), events can only be created/edited/deleted by a church admin or event manager, rota entries and assignments can only be managed by that team's leader (or an admin), availability responses can only be written by the person the assignment belongs to, choir songs can be managed by choir members, song selections can be changed only by the assigned section leader or choir team leader/admin, and chat messages can be read and sent only by that team's members (or an admin) — and only as yourself. Reads are limited to your organisation and accessible teams. Live data is **authenticated-only** — anonymous users can read nothing.
- The announcements columns are `body` (not "content") and `pinned` (not "priority").
- Linking an announcement to an event works in both modes: the picker lists live events in live mode (real UUIDs) and local events in demo mode.
- Recurring events are stored as single base rows (rule + label + optional end date) and expanded into upcoming occurrences on-device — same as demo mode.
- Availability responses are an upsert (one per assignment): Available / Maybe / Unavailable with an always-optional note; Home's "Your Next Responsibility" card is live-backed too.
- Live announcements, events, the teams directory, rotas, choir songs/selections, chat messages, and notification preferences are session data: they are not saved into the demo AsyncStorage snapshot, and **Reset Demo Data** does not touch the live database.
- Chat has **realtime for the open conversation**: while a team chat is on screen, new messages stream in automatically, and the app refetches on screen focus, app foreground, channel reconnect, and shortly after each realtime insert so attachment metadata catches up. A manual "check for new messages" bar appears only as a fallback while realtime is unhealthy. **Unread badges are private per-user read state** (`chat_read_states`, one row per person + team): messages from other people newer than your read point count on the Messages tab, opening a chat marks it read, your own messages never count for you, and nobody ever sees anyone else's read state — these are unread badges, not read receipts. Chat Image Attachments V1 adds one optional JPEG/PNG/WebP image (under 5 MB) per live message in a private `chat-attachments` bucket, with image-only messages supported; its migrations (`20260710124206` plus the `20260710162415` permission fix) are pushed and QA'd, so live chat images are active. Demo chat stays local and text-only.
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
