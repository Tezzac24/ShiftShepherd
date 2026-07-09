# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

**Shift Shepherd** is a mobile-first church coordination app built with React Native + Expo + TypeScript. The Expo app lives in the repository root (`app/` for Expo Router routes, `src/` for features/lib/types). The `docs/` directory contains detailed product and technical specifications.

The app replaces WhatsApp for church operations: scheduling, rotas, team communication, choir song management, and announcements.

## Key Documentation

- `docs/shift_shepherd_design_doc.md` — Full product spec: screens, data model, roles/permissions, UX principles, all user flows
- `docs/one-shot-build-prompt.md` — Technical build spec: architecture, component list, data types, acceptance criteria

Always read these before making architectural decisions.

## Development Commands

All commands run from the repository root:

```bash
npm install          # Install dependencies
npm start            # Start Expo dev server (then press a/i/w for platform)
npm run android      # Run on Android emulator
npm run ios          # Run on iOS simulator
npm run web          # Run in browser
npm run lint         # Run ESLint
npm run typecheck    # TypeScript check (tsc --noEmit)
```

No test runner is configured yet.

## Repo Setup

The repository root is the Shift Shepherd project root. The Expo app already exists at the root — do not create a nested `ShiftShepherd/` or `shift-shepherd/` app directory. All commands run from the repository root.

## Architecture

The app uses Expo Router: `app/` contains file-based routes (thin re-exports), `src/` contains the implementation:

```
├── app/                    # Expo Router routes
│  ├── _layout.tsx          # Providers + auth-protected root stack
│  ├── index.tsx            # Redirect (login vs tabs)
│  ├── login.tsx
│  ├── (tabs)/              # Home, Calendar, Teams, Messages, Profile
│  ├── announcements/       # list / [id] / edit
│  ├── events/              # [id] / edit
│  ├── teams/[teamId]/      # team space, chat, rota/, songs/
│  └── settings/
├── src/
│  ├── features/
│  │   ├── auth/
│  │   ├── home/
│  │   ├── announcements/
│  │   ├── calendar/
│  │   ├── teams/
│  │   ├── rota/
│  │   ├── choir/
│  │   ├── chat/
│  │   ├── profile/
│  │   └── notifications/
│  ├── components/
│  ├── lib/
│  │   ├── auth/
│  │   ├── mockData/
│  │   ├── permissions/
│  │   ├── storage/
│  │   ├── supabase/
│  │   └── notifications/
│  ├── types/
│  └── utils/
├── constants/
│  └── theme.ts
├── docs/
├── assets/
├── app.json
├── tsconfig.json
├── package.json
└── eslint.config.js
```

## Tech Stack

- **React Native** with **Expo** (~54)
- **TypeScript** (strict mode)
- **Expo Router** (file-based routing; `app/` routes re-export screens from `src/features/`)
- **Supabase** — production backend. Currently wired: **email/password Auth + live sessions (profile/role/memberships) + the announcements, events, read-only people/teams-directory, rotas/availability, choir songs/song selections, team chat, and notification preferences data slices** (env-guarded client in `src/lib/supabase/client.ts`; demo mode when env vars are missing). Push token registration and real push delivery stay deferred (they need a development build with `expo-notifications` and an EAS project id — neither exists yet). The notification-preferences grants migration (`20260709220528_grant_authenticated_notification_prefs_api_privileges.sql`) has been pushed and verified.
  The chat grants migration (`20260709205903_grant_authenticated_chat_api_privileges.sql`) is committed locally but **not pushed yet** — until it is applied remotely, live chat screens show a friendly load-error state.
- **AsyncStorage** — versioned local persistence for demo/mock state (`src/lib/storage/persistence.ts`)
- **@expo/vector-icons**; notifications are stubbed (`src/lib/notifications/`)

## Architecture Patterns

### Authentication
Auth logic stays abstracted behind `src/lib/auth/AuthContext.tsx`, which is dual-mode: **demo login** with hardcoded test user profiles (always available; the only mode when Supabase env vars are missing), and **Supabase email/password Auth** with session restore, an auth-state listener, and a session built entirely from live rows (`profiles.auth_user_id = auth.uid()` lookup + `organisation_roles` + `team_memberships`) mapped into the app's `SessionUser` shape — all ids in a live session are real UUIDs. Do not spread mode selection or session mapping across screens.

### Role-Based UI
All screens render conditionally based on the current user's `OrganisationRole`. Permission checks belong in `src/lib/permissions/`, not inline in components.

### Mock Data & Local Persistence
All mock data goes in `src/lib/mockData/`. The data models must match the intended Supabase schema (defined in `docs/one-shot-build-prompt.md`, section 5) — even for mocked data. Mutable app state is persisted to AsyncStorage through `src/lib/storage/persistence.ts` (version envelope, safe fallback to mock seeds on invalid data); the mock seeds remain the reset source of truth (**Profile → Reset Demo Data**).

### Backend Abstraction
API calls go through a service layer (`src/lib/supabase/services/`). Live Supabase currently serves: auth/session operations, **announcements** (`announcements.ts`, including live `linked_event_id`), **events** (`events.ts`, including recurrence fields), the **read-only people/teams directory** (`teams.ts` — organisation, profiles, teams, memberships; no team-management UI exists, so no write path), **rotas/availability** (`rotas.ts` — entries, assignments, availability-response upsert, cancel/restore from migration 005), **choir songs/song selections** (`songs.ts` — songs, song links, and praise/worship rota selections), **team chat** (`chat.ts` — text-only list/send; no realtime, so live messages refresh on screen open/send/manual refresh; unread badges are demo-only), and **notification preferences** (`notifications.ts` — one row per profile upserted on `unique(user_id)`, all-on defaults assumed client-side until first save; push tokens deliberately not handled yet) — live only for Supabase-Auth sessions with a linked profile; demo mode stays local. The temporary mock↔live id bridge (`src/lib/appData/demoBridge.ts`) is gone — demo mode runs on pure mock ids. DB↔app mapping stays centralized in the services (the live announcements table uses `body` and `pinned`; rota `time` values are normalised to `HH:MM`; live ids are real UUIDs end-to-end, with only event categories still name-bridged onto mock ids). Never use service role keys; `.env.example` stays placeholder-only.

The Supabase MCP server is configured against the **dev** project — use it to inspect the live schema/data. Migration history is now aligned and tracked: remote `supabase_migrations.schema_migrations` records `001`–`006` plus the pushed events, rota, songs, and notification-preferences grants migrations (see `docs/supabase-migration-alignment-checkpoint.md`). The local chat grants migration (`20260709205903_grant_authenticated_chat_api_privileges.sql`) still needs explicit approval before `supabase db push`. Do not rename `001`–`006` (remote history tracks those exact version strings); create future migrations with `supabase migration new <descriptive_name>` and keep the generated timestamped filename. `supabase db push` is the normal workflow now, but don't run it — or any remote database write — casually; only after normal preflight checks and explicit approval.

## Data Models

All TypeScript types live in `src/types/`. Key interfaces (from the build spec):

`Organisation`, `UserProfile`, `Team`, `TeamMembership`, `OrganisationRole`, `Announcement`, `Event`, `EventCategory`, `RotaEntry`, `RotaAssignment`, `AvailabilityResponse`, `Song`, `SongLink`, `ChoirSongSelection`, `ChatMessage`, `NotificationPreferences`

## Navigation Structure

```
Root Stack (app/_layout.tsx, auth-gated with Stack.Protected)
├── login
└── (tabs): Home · Calendar · Teams · Messages · Profile
    ├── teams/[teamId] → rota/ · chat · songs/ (choir)
    ├── announcements/ · events/ · settings/
```

Expo Router is the routing approach — do not add a parallel `src/navigation/` React Navigation setup.

## Design Principles

The app targets older, less technically confident users. Prioritise:
- Large touch targets, clear labels, no hidden menus
- Calm, simple, welcoming visual style
- Empty states on every list
- Confirmation dialogs before destructive actions (e.g. deleting a song)

Colour tokens, typography, and spacing are in `constants/theme.ts`.

## Scope Notes

V1 is a **functional scaffold with mocked, locally persisted data** plus optional real Supabase email/password Auth and live announcements, events, read-only people/teams-directory, rotas/availability, choir songs/song selections, team chat, and notification preferences slices — not a production app. Do not wire team-management writes, realtime, storage, push token registration, push delivery, OAuth, or SMS login unless explicitly requested. Use clear `// TODO: wire to Supabase` comments at integration points.

The choir feature is a first-class priority for V1 (song database, song selection for rota dates, choir-specific rota).

## Instruction File Sync Rule

This repo uses two AI instruction files:

- `CLAUDE.md` for Claude Code
- `AGENTS.md` for Codex

When making changes that affect persistent project guidance, keep both files in sync.

Update both files when changing:
- architecture
- folder structure
- development commands
- validation commands
- routing approach
- backend/Supabase integration approach
- testing workflow
- coding conventions
- AI working rules
- source-of-truth documentation paths

Do not update these files for normal feature work, bug fixes, UI tweaks, or copy changes unless the guidance itself changes.

If only one agent-specific behaviour changes, update only that agent’s file and mention that in the final summary.

## Token/Planning Constraint

Avoid long planning-only passes. When asked to implement, produce a short execution checklist, then begin building.

Prioritise a working scaffold over excessive explanation.

Document important deviations briefly, but do not spend large amounts of context on speculative architecture.
