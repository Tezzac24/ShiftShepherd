# Shift Shepherd

A mobile-first church coordination app for **Grace Community Church** — events, announcements, team rotas, choir song management, and team chat, all in one calm place. Built to reduce reliance on WhatsApp.

**Status:** functional scaffold / demo MVP with optional Supabase Auth and local persistence. **Announcements, events, the people/teams directory, rotas/availability, choir songs/song selections, team chat, and notification preferences are the live Supabase data slices**: when you sign in with Supabase Auth (and your auth user is linked to a profile), announcements, calendar events, your teams/members (read-only), team rotas with availability responses, choir songs/selections, team chat messages, and your notification settings load from the live database, protected by RLS — and your session itself (profile, role, memberships) is built from live rows. **The open team chat updates in realtime** (new messages stream in over Supabase Realtime while the chat is on screen; the database stays the source of truth). Push token registration and actual push delivery are still deferred (notification settings save, but nothing pushes yet), and the whole app — live slices included — still works fully offline in demo mode.
Every local migration through the chat realtime publication is pushed and verified; the chat read-states migration (`20260710031212_add_chat_read_states.sql`, private unread tracking) is local-only pending an approved push — until it lands, live mode simply shows no unread badges.

## Current Scaffold Highlights

- Home prioritises latest announcement, next upcoming event, then the user's next team responsibility.
- Event create/edit uses an inline calendar date picker, a simple readable time list, and recurrence choices including monthly weekday patterns.
- Recurring events are stored as base mock rows and expanded locally for upcoming Home and Calendar lists.
- Choir rota entries assign a **Praise Leader** and a **Worship Leader** (one person may hold both roles); the set list splits into Praise Songs and Worship Songs, each managed only by its leader (choir team leader/admin can manage both).
- **Plan the Month** lets choir leaders create a whole month of Sunday services and weekly rehearsals at once, with default leaders and per-date overrides.
- Choir rehearsals include every choir member so each can confirm availability; rota detail shows an Available / Maybe / Unavailable / Not responded tracker.
- Rehearsals (or services) can be **cancelled** instead of deleted: they stay visible with a Cancelled badge, drop out of responsibilities, and offer a prefilled team announcement (never auto-sent).
- Supabase migrations `001`–`006`, the events/rota/songs/chat/notification-preferences grants migrations, the Auth/profile auto-link migration (`20260709233705`), and the chat realtime publication migration (`20260710020944`) are all applied to the dev project with tracked history; the chat read-states migration (`20260710031212`) is local-only pending an approved push (see `docs/supabase-migration-alignment-checkpoint.md`). **Auth + live sessions + announcements + events + the read-only people/teams directory + rotas/availability + choir songs/song selections + team chat (realtime for the open conversation) + notification preferences** are wired to live Supabase. Push token registration and real push delivery stay deferred (they need a development build with `expo-notifications` and an EAS project id).
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
npm run lint       # ESLint
npm run typecheck  # TypeScript check
npx expo export    # Bundle/export sanity check
```

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
- Chat is text-only with **realtime for the open conversation**: while a team chat is on screen, new messages stream in automatically, and the app refetches on screen focus, app foreground, and channel reconnect so nothing is missed. A manual "check for new messages" bar appears only as a fallback while realtime is unhealthy. **Unread badges are private per-user read state** (`chat_read_states`, one row per person + team): messages from other people newer than your read point count on the Messages tab, opening a chat marks it read, your own messages never count for you, and nobody ever sees anyone else's read state — these are unread badges, not read receipts. Live badges appear once the `20260710031212_add_chat_read_states.sql` migration is pushed (they hide gracefully until then); demo mode keeps its simulated counts. Attachments stay a "coming soon" placeholder in both modes.
- Notification settings save one row per person (`unique(user_id)` upsert; the row is only created on your first change). Saving works, but **no push notification is sent yet** — registering the device token needs a development build with `expo-notifications` and an EAS project id, so the screen simply explains delivery isn't active yet.

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
    notifications/    # Stub (TODO: Expo Notifications)
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
