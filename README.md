# Shift Shepherd

A mobile-first church coordination app for **Grace Community Church** — events, announcements, team rotas, choir song management, and team chat, all in one calm place. Built to reduce reliance on WhatsApp.

**Status:** functional scaffold / demo MVP with optional Supabase Auth and local persistence. **Announcements are the first live Supabase data slice**: when you sign in with Supabase Auth (and your auth user is linked to a profile), announcements load from and save to the live database, protected by RLS. Everything else (events, teams, rotas, songs, chat, notification preferences) is still mocked/local, and the whole app — announcements included — still works fully offline in demo mode.

## Current Scaffold Highlights

- Home prioritises latest announcement, next upcoming event, then the user's next team responsibility.
- Event create/edit uses an inline calendar date picker, a simple readable time list, and recurrence choices including monthly weekday patterns.
- Recurring events are stored as base mock rows and expanded locally for upcoming Home and Calendar lists.
- Choir rota entries assign a **Praise Leader** and a **Worship Leader** (one person may hold both roles); the set list splits into Praise Songs and Worship Songs, each managed only by its leader (choir team leader/admin can manage both).
- **Plan the Month** lets choir leaders create a whole month of Sunday services and weekly rehearsals at once, with default leaders and per-date overrides.
- Choir rehearsals include every choir member so each can confirm availability; rota detail shows an Available / Maybe / Unavailable / Not responded tracker.
- Rehearsals (or services) can be **cancelled** instead of deleted: they stay visible with a Cancelled badge, drop out of responsibilities, and offer a prefilled team announcement (never auto-sent).
- Supabase planning includes migrations `003`–`005` (recurrence, song sections + section RLS, rota cancellation); **auth + profile lookup + announcements** are wired to live Supabase — all other feature data stays mocked. (The remote dev database currently has only `001`–`002` applied, run manually via the dashboard, so migration history isn't tracked; `003`–`005` should be applied there before wiring events/songs/rota cancellation.)
- Demo changes (announcements, rotas, songs, messages, notification settings...) persist locally via AsyncStorage and can be reset from **Profile -> Reset Demo Data**.

## Tech Stack

- React Native + Expo (SDK 54) + TypeScript (strict)
- Expo Router (file-based routing, `app/` directory)
- React context + local state (no backend yet)
- Intended production backend: Supabase + Expo Notifications

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
3. Create Supabase Auth users (Dashboard -> Authentication -> Users) for the demo people you want to log in as, and link each one to its seeded profile via `profiles.auth_user_id` - the exact steps are in `supabase/seed/README.md`.
4. Restart Expo (`npm start`) so the env vars are picked up, then log in with the real email/password. The session is restored on cold start; sign out from the Profile tab.

Notes:
- A Supabase auth user with **no linked profile** gets a friendly "account not linked yet" message - no profile is auto-created in this phase.
- Signed-in Supabase users whose profile email matches a demo person get that person's teams/permissions (feature data is still mocked, so demo identities are bridged inside the auth layer).
- The demo account selector stays available even when Supabase is configured.

### Live announcements (first Supabase data slice)

When you are signed in through **Supabase Auth with a linked profile**, the announcements screens read and write the live `announcements` table (`src/lib/supabase/services/announcements.ts`); in demo mode they keep using local data. Worth knowing:

- **RLS is the authority.** Client-side role checks only hide buttons; the server enforces that church-wide announcements need a church admin or announcement manager, team announcements need that team's leader (or an admin), and reads are limited to your organisation and accessible teams. Live announcements are **authenticated-only** — anonymous users can read nothing.
- The database columns are `body` (not "content") and `pinned` (not "priority").
- Linking an announcement to an event is demo-mode-only for now — events are still local, so the linked-event picker is hidden in live mode until events go live.
- Live announcements are session data: they are not saved into the demo AsyncStorage snapshot, and **Reset Demo Data** does not touch the live database.

To try it end to end (after the setup steps above):

1. Sign in as **Daniel** (church admin) or **Miriam** (announcement manager) — create, edit, pin, and delete a church-wide announcement; changes land in the dev database.
2. Sign in as **Sarah** (choir leader) — she can post to the Choir team but not church-wide.
3. Sign in as **Ruth** (general member) — she can read church announcements but sees no manage buttons, and the database would reject a write anyway.

### Local persistence & reset

Changes you make in the app (announcements, events, rotas, songs, messages, notification settings) are saved on-device with a versioned envelope. Corrupt or outdated saved data is discarded safely; the app falls back to the original mock examples. **Profile -> Reset Demo Data** restores everything to the original seed state. (In live mode, announcements come from Supabase instead and are unaffected by local persistence or the demo reset.)

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
    supabase/         # Env-guarded Supabase client (auth + profile lookup only)
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
