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
npm install              # Install dependencies
npm start                # Start Expo dev server (then press a/i/w for platform)
npm run android          # Run on Android emulator
npm run ios              # Run on iOS simulator
npm run web              # Run in browser
npm run lint             # Run ESLint
npm run typecheck        # TypeScript check (tsc --noEmit)
npm test                 # Jest regression tests (jest-expo)
npm run test:watch       # Jest watch mode
npm run test:ci          # Jest as CI runs it (no watch, in-band)
npm run check:migrations # Offline migration filename sanity check
```

The standard check sequence after any implementation slice: `npm run typecheck`, `npm run lint`, `npm run test:ci`, `npx expo export`, `git diff --check`. Manual QA then focuses only on the changed feature area.

## Testing & CI

Jest runs via **jest-expo** (config in `jest.config.js`, global setup in `jest.setup.ts`) with React Native Testing Library for hook tests. Tests live in `src/**/__tests__/*.test.ts(x)` and must stay deterministic and offline: mock Supabase (via `jest.mock` of `src/lib/supabase/client`), Expo Notifications/Constants/Device, and AsyncStorage; never hit the network, never use real credentials, never generate a real push token, and never create live test users or backend rows. Prefer testing pure helpers (`selectors.ts`), services, and hooks over full-screen renders; extract small pure helpers rather than rendering providers when logic is buried in context. The current suite guards push registration states, the `register_push_token` RPC contract, the fire-and-forget chat push delivery trigger, chat previews/unread counting, notification preference defaults, and demo/live separation.

**CI** (`.github/workflows/ci.yml`) runs on push to `main`, pull requests to `main`, and workflow_dispatch: `npm ci` → typecheck → lint → `test:ci` → `check:migrations` → `npx expo export` on Node 20. It is check-only — no secrets, no `.env` (export runs in demo mode by design), no deployments. Supabase migration pushes, Edge Function deploys, and EAS builds remain explicit manual steps; do not add CD without being asked. The Edge Function's Deno code stays outside Jest (a separate Deno test lane is a documented future addition; Maestro E2E smoke tests are another).

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
- **Supabase** — production backend. Currently wired: **email/password Auth + live sessions (profile/role/memberships) + announcements (including one optional private image), events, read-only people/teams-directory, rotas/availability, choir songs/song selections, team chat (realtime, private unread tracking, and one optional private image per message), notification preferences, and profile avatar storage** (env-guarded client in `src/lib/supabase/client.ts`; demo mode when env vars are missing). Announcement Images V1 and Chat Image Attachments V1 are pushed and QA'd (`20260710114621`, `20260710124206`, and the `20260710162415` permission fix). Push Token Registration V1 (`20260710171200_add_push_token_registration.sql`) is pushed and DB/RPC-verified; iOS Simulator registration UI was exercised, though simulator token reliability is limited. Chat Message Push Delivery V1 is deployed: `20260710234443_add_push_delivery_foundation.sql` is pushed/verified and `send-chat-message-push` is ACTIVE with JWT verification. Backend QA verified invocation, sender exclusion, recipient/team selection, preference handling, and safe `no_push_token` skips without token/message leakage. Real Expo delivery remains unverified pending physical iPhone development-build QA; no other push delivery exists.
- **AsyncStorage** — versioned local persistence for demo/mock state (`src/lib/storage/persistence.ts`)
- **@expo/vector-icons**; `src/lib/notifications/` owns the device-side Expo push registration flow (expo-notifications/expo-device/expo-constants; chat delivery is live, but real Expo/device delivery remains pending physical-iPhone QA)

## Architecture Patterns

### Authentication
Auth logic stays abstracted behind `src/lib/auth/AuthContext.tsx`, which is dual-mode: **demo login** with hardcoded test user profiles (always available; the only mode when Supabase env vars are missing), and **Supabase email/password Auth** with session restore, an auth-state listener, and a session built entirely from live rows (`profiles.auth_user_id = auth.uid()` lookup + `organisation_roles` + `team_memberships`) mapped into the app's `SessionUser` shape — all ids in a live session are real UUIDs. Migration `20260709233705_link_auth_users_to_existing_profiles.sql` (pushed and QA'd) case-insensitively links newly created Auth users to an existing unlinked profile with the same email; the trigger never creates profiles/roles/memberships or overwrites an existing link. Unmatched users get the app's friendly setup message. Do not spread mode selection or session mapping across screens.

### Role-Based UI
All screens render conditionally based on the current user's `OrganisationRole`. Permission checks belong in `src/lib/permissions/`, not inline in components.

### Mock Data & Local Persistence
All mock data goes in `src/lib/mockData/`. The data models must match the intended Supabase schema (defined in `docs/one-shot-build-prompt.md`, section 5) — even for mocked data. Mutable app state is persisted to AsyncStorage through `src/lib/storage/persistence.ts` (version envelope, safe fallback to mock seeds on invalid data); the mock seeds remain the reset source of truth (**Profile → Reset Demo Data**).

### Backend Abstraction
API calls go through `src/lib/supabase/services/`. In addition to the established live slices, **chat images** use `chatAttachments.ts`: one JPEG/PNG/WebP under 5 MB, private `chat-attachments` path `teams/<teamId>/messages/<messageId>/<file>`, atomic message+metadata insert through narrow SECURITY INVOKER RPCs, one-hour signed URLs, and best-effort failed-send cleanup. `chat.ts` performs joined message/attachment reads with a text-only pre-migration fallback; the open chat keeps its single `chat_messages` subscription and coalesces a refetch after inserts so attachments appear without duplicates. Image-only messages are supported. Demo chat stays local/text-only and never calls Storage. Profile avatars and announcement images remain unchanged. **Push tokens** use `pushTokens.ts`: registration-only writes through the narrow SECURITY DEFINER `register_push_token` RPC (no table-level grants; upsert keyed on the globally-unique token so re-registering refreshes `updated_at` and a shared device follows its current signed-in owner), with the device-side permission/token flow in `src/lib/notifications/` — strictly user-initiated, demo mode never calls push or Supabase APIs, and tokens are never logged or shown. **Chat push delivery** uses `pushDelivery.ts`: one best-effort, fire-and-forget call to the `send-chat-message-push` Edge Function with just the `messageId`, made only from the live chat send-success path (never from realtime arrivals or refetches; demo mode never calls it, and failures never block or surface on the send). The Edge Function re-validates everything server-side with the service role (sender-only, ≤5-minute recency, team access), respects `chat_notifications` (missing preferences row = the app's all-on defaults), never notifies the sender, sends a generic payload (no message text or image details), and is idempotent via the service-role-only `push_notification_deliveries` ledger. Arbitrary files, multiple attachments, chat edit/delete, visible receipts, receipts polling, cron/triggers, and push delivery beyond team chat messages remain deferred. Never use service role keys in the app — the Edge Function runtime env is the only place the service role exists; `.env.example` stays placeholder-only.

The Supabase MCP server is configured against the **dev** project — use it to inspect the live schema/data. Remote migration history is fully aligned through pushed/verified `20260711024931_harden_security_definer_functions.sql` (revokes anon/default-PUBLIC execution from RLS helpers, preserves authenticated execution required by policies/RPCs, and pins function search paths); there are no local-only migrations. `send-chat-message-push` is deployed and ACTIVE with JWT verification. Backend QA verified only the invocation and no-token skip path; physical iPhone development-build QA must still verify recipient registration, Expo ticket creation, banner display, no self-notification, and preference-off suppression. Android QA remains deferred. Do not expand delivery beyond chat messages until that QA passes. Do not rename `001`–`006` or timestamped migrations; create future migrations with `supabase migration new <descriptive_name>` and keep the generated filename. Never run `supabase db push`, `supabase functions deploy`, or another remote write without explicit approval.

### iOS Simulator push-registration QA

Supported Xcode 14+ / macOS 13+ / iOS 16+ Simulator development builds are allowed to attempt Expo token registration; do not use `Device.isDevice` as a blanket iOS push gate. Runtime token failures must remain friendly and retryable. The iOS Simulator registration UI path was exercised on 2026-07-11: permission is requested only after the explicit tap and no raw token is shown, but simulator token reliability is limited. The registration card's "registered" state is session-only (resets on leave/return; re-registering succeeds — accepted polish deferral). Android QA is deferred and physical iPhone development-build QA is required to verify recipient token registration, Expo ticket creation, banner display, no self-notification, and preference-off suppression. Real Push Delivery V1 must remain chat-only until that passes.

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

V1 is a **functional scaffold with mocked, locally persisted data** plus optional real Supabase email/password Auth and the documented live slices — not a production app. Storage is limited to profile avatars, one announcement image, and one chat image per message — all live and QA'd; there are no arbitrary/multiple file uploads, no audio/video, no gallery/camera capture, no full-screen viewer, and no message edit/delete. Push Token Registration V1 is implemented and pushed; iOS Simulator registration UI was exercised but physical iPhone QA remains the representative token test, while Android QA is deferred. Chat Message Push Delivery V1 is deployed (Edge Function + pushed ledger migration): backend invocation and no-token skips are verified, but real Expo delivery awaits physical-device QA. Do not wire team-management writes, realtime beyond the open team chat, arbitrary/multiple file uploads, push delivery beyond team chat messages, OAuth, or SMS login unless explicitly requested. Demo/local mode intentionally remains supported.

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
