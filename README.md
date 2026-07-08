# Shift Shepherd

A mobile-first church coordination app for **Grace Community Church** — events, announcements, team rotas, choir song management, and team chat, all in one calm place. Built to reduce reliance on WhatsApp.

**Status:** functional scaffold / demo MVP. All data is mocked and lives in local state; the architecture is ready for Supabase (auth, Postgres, RLS, realtime) to be wired in later.

## Current Scaffold Highlights

- Home prioritises latest announcement, next upcoming event, then the user's next team responsibility.
- Event create/edit uses an inline calendar date picker, a simple readable time list, and recurrence choices including monthly weekday patterns.
- Recurring events are stored as base mock rows and expanded locally for upcoming Home and Calendar lists.
- Supabase planning includes `003_add_event_recurrence.sql`; the app is still not wired to live Supabase.

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

## Demo Login

The login screen has a **test account selector**. Pick any account to explore that role:

| User | Role | Good for testing |
| --- | --- | --- |
| Daniel Okafor | Church Admin | Sees every team, all admin actions |
| Miriam Blake | Announcement Manager | Creating church-wide announcements; leads Ushers |
| Joseph Carter | Event Manager | Creating/editing calendar events; leads Youth Team |
| Sarah Williams | Choir Team Leader | Managing choir rota, overriding song selections |
| Hannah Adeyemi | Choir Member | Song database add/edit/delete, availability |
| Michael Thompson | Assigned Choir Song Leader | **Selecting songs** for the rota date he leads |
| David Chen | Media Team Leader | Managing the media rota |
| Ruth Johnson | General Member | Empty states (no teams, no responsibilities) |

You can also "log in" with any mock user's email (e.g. `michael@gracecommunity.church`) and any password.

## Project Structure

```
app/                  # Expo Router routes (thin re-exports of feature screens)
src/
  features/           # Screen implementations, grouped by feature
  components/         # Reusable UI (buttons, cards, badges, dialogs, fields…)
  lib/
    auth/             # Auth abstraction (mock login — Supabase Auth later)
    appData/          # App state store + selectors (mock CRUD — Supabase later)
    mockData/         # Realistic seed data matching the Supabase schema
    permissions/      # All role/permission checks live here
    supabase/         # Placeholder client (TODO: wire to Supabase)
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
