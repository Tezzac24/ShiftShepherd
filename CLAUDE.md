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
- **Supabase** — production backend. Currently wired: **email/password Auth + live sessions (profile/role/memberships) + announcements (including one optional private image), events, read-only people/teams-directory, rotas/availability, choir songs/song selections, team chat (realtime, private unread tracking, and one optional private image per message), notification preferences, and profile avatar storage** (env-guarded client in `src/lib/supabase/client.ts`; demo mode when env vars are missing). Announcement Images V1 and Chat Image Attachments V1 are pushed and QA'd (`20260710114621`, `20260710124206`, and the `20260710162415` permission fix). Push Token Registration V1 (`20260710171200_add_push_token_registration.sql`) is pushed, DB/RPC-verified, and passed iOS Simulator runtime QA (Android and physical iPhone QA deferred); real push delivery stays deferred.
- **AsyncStorage** — versioned local persistence for demo/mock state (`src/lib/storage/persistence.ts`)
- **@expo/vector-icons**; `src/lib/notifications/` owns the device-side Expo push registration flow (expo-notifications/expo-device/expo-constants; registration only — nothing is delivered)

## Architecture Patterns

### Authentication
Auth logic stays abstracted behind `src/lib/auth/AuthContext.tsx`, which is dual-mode: **demo login** with hardcoded test user profiles (always available; the only mode when Supabase env vars are missing), and **Supabase email/password Auth** with session restore, an auth-state listener, and a session built entirely from live rows (`profiles.auth_user_id = auth.uid()` lookup + `organisation_roles` + `team_memberships`) mapped into the app's `SessionUser` shape — all ids in a live session are real UUIDs. Migration `20260709233705_link_auth_users_to_existing_profiles.sql` (pushed and QA'd) case-insensitively links newly created Auth users to an existing unlinked profile with the same email; the trigger never creates profiles/roles/memberships or overwrites an existing link. Unmatched users get the app's friendly setup message. Do not spread mode selection or session mapping across screens.

### Role-Based UI
All screens render conditionally based on the current user's `OrganisationRole`. Permission checks belong in `src/lib/permissions/`, not inline in components.

### Mock Data & Local Persistence
All mock data goes in `src/lib/mockData/`. The data models must match the intended Supabase schema (defined in `docs/one-shot-build-prompt.md`, section 5) — even for mocked data. Mutable app state is persisted to AsyncStorage through `src/lib/storage/persistence.ts` (version envelope, safe fallback to mock seeds on invalid data); the mock seeds remain the reset source of truth (**Profile → Reset Demo Data**).

### Backend Abstraction
API calls go through `src/lib/supabase/services/`. In addition to the established live slices, **chat images** use `chatAttachments.ts`: one JPEG/PNG/WebP under 5 MB, private `chat-attachments` path `teams/<teamId>/messages/<messageId>/<file>`, atomic message+metadata insert through narrow SECURITY INVOKER RPCs, one-hour signed URLs, and best-effort failed-send cleanup. `chat.ts` performs joined message/attachment reads with a text-only pre-migration fallback; the open chat keeps its single `chat_messages` subscription and coalesces a refetch after inserts so attachments appear without duplicates. Image-only messages are supported. Demo chat stays local/text-only and never calls Storage. Profile avatars and announcement images remain unchanged. **Push tokens** use `pushTokens.ts`: registration-only writes through the narrow SECURITY DEFINER `register_push_token` RPC (no table-level grants; upsert keyed on the globally-unique token so re-registering refreshes `updated_at` and a shared device follows its current signed-in owner), with the device-side permission/token flow in `src/lib/notifications/` — strictly user-initiated, demo mode never calls push or Supabase APIs, and tokens are never logged or shown. Arbitrary files, multiple attachments, chat edit/delete, visible receipts, and push delivery remain deferred. Never use service role keys; `.env.example` stays placeholder-only.

The Supabase MCP server is configured against the **dev** project — use it to inspect the live schema/data. Remote migration history is aligned through pushed/verified `20260710171200`; Push Token Registration V1 passed iOS Simulator runtime QA (Android and physical iPhone QA deferred). Do not rename `001`–`006` or timestamped migrations; create future migrations with `supabase migration new <descriptive_name>` and keep the generated filename. Never run `supabase db push` or another remote database write without explicit approval.

### iOS Simulator push-registration QA

Supported Xcode 14+ / macOS 13+ / iOS 16+ Simulator development builds are allowed to attempt Expo token registration; do not use `Device.isDevice` as a blanket iOS push gate. Runtime token failures must remain friendly and retryable. iOS Simulator QA passed (2026-07-11): registration succeeds, permission is requested only after the explicit tap, and no raw token is shown. The registration card's "registered" state is session-only (resets on leave/return; re-registering succeeds — accepted polish deferral). Android QA is deferred and physical iPhone QA is the most representative later step. Real Push Delivery V1 must start narrowly with chat messages only.

## Data Models

All TypeScript types live in `src/types/`. Key interfaces (from the build spec):

`Organisation`, `UserProfile`, `Team`, `TeamMembership`, `OrganisationRole`, `Announcement`, `Event`, `EventCategory`, `RotaEntry`, `RotaAssignment`, `AvailabilityResponse`, `Song`, `SongLink`, `ChoirSongSelection`, `ChatMessage`, `ChatReadState`, `NotificationPreferences`, `PushToken`

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

V1 is a **functional scaffold with mocked, locally persisted data** plus optional real Supabase email/password Auth and the documented live slices — not a production app. Storage is limited to profile avatars, one announcement image, and one chat image per message — all live and QA'd; there are no arbitrary/multiple file uploads, no audio/video, no gallery/camera capture, no full-screen viewer, and no message edit/delete. Push Token Registration V1 is implemented, its migration is pushed, and iOS Simulator QA passed; Android and physical iPhone QA are deferred. Do not wire team-management writes, realtime beyond the open team chat, arbitrary/multiple file uploads, push delivery, OAuth, or SMS login unless explicitly requested. Demo/local mode intentionally remains supported.

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
