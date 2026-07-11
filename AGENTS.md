# AGENTS.md

This file provides guidance to Codex when working with code in this repository.

---

## Project Overview

**Shift Shepherd** is a mobile-first church coordination app built with React Native, Expo, TypeScript, and Expo Router.

The Expo app lives in the repository root:

- `app/` contains Expo Router routes
- `src/` contains features, shared components, libraries, types, mock data, and business logic
- `docs/` contains detailed product and technical specifications
- `supabase/` contains backend planning, migrations, seed files, and Supabase documentation

The app replaces WhatsApp for church operations: scheduling, rotas, team communication, choir song management, and announcements.

The current project state is a functional scaffold with locally persisted mock data. Auth supports two modes behind one abstraction: demo mode (mock test users, always available) and real Supabase email/password Auth when `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY` are configured. Live Supabase serves auth/session, announcements (including one optional image), events, rotas/availability, choir songs/selections, team chat (realtime, private unread tracking, and one optional image per message), notification preferences, profile avatars, and the read-only people/teams directory — only for linked Supabase sessions; demo mode keeps everything local. Announcement Images V1 and Chat Image Attachments V1 are pushed and QA'd (`20260710114621`, `20260710124206`, and the `20260710162415` permission fix). Push Token Registration V1 (`20260710171200_add_push_token_registration.sql`) is pushed and DB/RPC-verified; iOS Simulator registration UI was exercised, though simulator token reliability is limited. Chat Message Push Delivery V1 is deployed: `20260710234443_add_push_delivery_foundation.sql` is pushed/verified and `send-chat-message-push` is ACTIVE with JWT verification. Backend QA verified invocation, sender exclusion, recipient/team selection, preference handling, and safe `no_push_token` skips without token/message leakage. Real Expo delivery remains unverified pending physical iPhone development-build QA; no other push delivery exists.

---

## Required Reading

Before making product, architecture, database, or implementation decisions, read the relevant files first.

Always read:

- `README.md`
- `CLAUDE.md`
- `docs/shift_shepherd_design_doc.md`
- `docs/one-shot-build-prompt.md`

For Supabase/backend work, also read:

- `docs/supabase-integration-plan.md`
- `supabase/README.md`
- `supabase/migrations/001_initial_schema.sql`
- `supabase/migrations/002_rls_policies.sql`
- `supabase/seed/README.md`

Treat the current working codebase as the implementation source of truth if the docs and code differ.

Do not rebuild from scratch unless explicitly asked.

---

## Development Commands

All commands run from the repository root.

```bash
npm install          # Install dependencies
npm start            # Start Expo dev server, then press a/i/w for platform
npm run android      # Run on Android emulator
npm run ios          # Run on iOS simulator
npm run web          # Run in browser
npm run lint         # Run ESLint
npm run typecheck    # TypeScript check with tsc --noEmit
npx expo export      # Bundle/export sanity check
```

No test runner is configured yet.

After meaningful changes, run:

```bash
npm run typecheck
npm run lint
```

Run this when routing, build config, or broad app structure changes:

```bash
npx expo export
```

If a command cannot be run in the environment, explain why in the final summary.

---

## Repo Setup Rules

The repository root is the Shift Shepherd project root.

Do not create a nested `ShiftShepherd/` or `shift-shepherd/` app directory.

Do not add a parallel manual React Navigation setup unless explicitly asked. The project uses Expo Router.

Do not create a real `.env` file.

Do not commit secrets, service role keys, database passwords, access tokens, or real Supabase credentials.

Only `.env.example` should contain public placeholder variables such as:

```env
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

---

## Architecture

The app uses Expo Router. Route files in `app/` should stay thin and should delegate real implementation to `src/features/`.

Current architecture:

```text
├── app/                    # Expo Router routes
│  ├── _layout.tsx          # Providers + auth-protected root stack
│  ├── index.tsx            # Redirect: login vs authenticated tabs
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
│  │   ├── appData/
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
├── supabase/
├── assets/
├── app.json
├── tsconfig.json
├── package.json
└── eslint.config.js
```

---

## Tech Stack

- React Native with Expo
- TypeScript in strict mode
- Expo Router for file-based routing
- Local mocked data and local app state for the scaffold
- Supabase as the intended production backend
- Supabase Auth, Postgres, RLS, Realtime (team chat only), private Storage (profile avatars, announcement images, chat images — all QA'd), and the deployed `send-chat-message-push` Edge Function wired
- expo-notifications for device push token registration and deployed chat-message delivery; EAS project linked (`eas.json` + `extra.eas.projectId`)
- `@expo/vector-icons`
- Device-side push registration lives in `src/lib/notifications/`; chat delivery is live but real Expo/device delivery remains pending physical-iPhone QA

---

## Architecture Patterns

### Authentication

Auth logic must remain abstracted behind `src/lib/auth/`.

Auth is dual-mode: demo login with hardcoded test user profiles (always available; the only mode when Supabase env vars are missing), and Supabase email/password Auth with session restore and a session built entirely from live rows (`profiles.auth_user_id` lookup + `organisation_roles` + `team_memberships` — all real UUIDs). Migration `20260709233705_link_auth_users_to_existing_profiles.sql` (pushed and QA'd) case-insensitively links newly created Auth users to an existing unlinked profile with the same email; the trigger never creates profiles/roles/memberships or overwrites an existing link. Unmatched users get the app's friendly setup message. Mode selection and Supabase-profile-to-session mapping live entirely inside `src/lib/auth/AuthContext.tsx`.

Do not scatter auth/session logic across screens.

Future Supabase Auth integration should happen behind the existing auth abstraction where possible.

### Role-Based UI and Permissions

Permission logic must stay in `src/lib/permissions/`.

Do not scatter complex role checks inline across components.

Screens should call permission helpers for decisions like:

- Can this user create announcements?
- Can this user create events?
- Can this user manage this team?
- Can this user edit this rota?
- Can this user confirm this assignment?
- Can this user add/edit/delete songs?
- Can this user select songs for this choir rota date?
- Can this user view this team chat?

Client-side permissions only hide/show UI. Supabase RLS is the future server-side enforcement layer.

### App Data and Local State

Feature data continues to use local app state (persisted to AsyncStorage via `src/lib/storage/persistence.ts`, with a version envelope and safe fallback to mock seeds) unless explicitly asked to wire Supabase. "Reset Demo Data" on the Profile screen restores the mock seeds.

App-wide data/actions/selectors should stay in the existing `src/lib/appData/` structure.

Do not replace the current app state pattern with a large state management library unless there is a clear, justified benefit.

### Mock Data

Mock data belongs in `src/lib/mockData/`.

The mock data should stay realistic and should continue to map closely to the intended Supabase schema.

### Supabase

Supabase integration code belongs in `src/lib/supabase/`. The client (`client.ts`) is env-guarded: it returns null without `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY` and the app runs in demo mode.

Supabase integration stays isolated in `src/lib/supabase/`. In addition to the established live slices, **chat images** use `services/chatAttachments.ts`: one JPEG/PNG/WebP under 5 MB, private `chat-attachments` path `teams/<teamId>/messages/<messageId>/<file>`, atomic message+metadata insert through narrow SECURITY INVOKER RPCs, one-hour signed URLs, and best-effort failed-send cleanup. `chat.ts` performs joined reads with a text-only pre-migration fallback; the open chat keeps its single `chat_messages` subscription and coalesces a refetch after inserts so attachments appear without duplicates. Image-only messages are supported. Demo chat stays local/text-only and never calls Storage. Profile avatars and announcement images remain unchanged. **Push tokens** use `services/pushTokens.ts`: registration-only writes through the narrow SECURITY DEFINER `register_push_token` RPC (no table-level grants; upsert keyed on the globally-unique token so re-registering refreshes `updated_at` and a shared device follows its current signed-in owner), with the device-side permission/token flow in `src/lib/notifications/` — strictly user-initiated, demo mode never calls push or Supabase APIs, and tokens are never logged or shown. **Chat push delivery** uses `services/pushDelivery.ts`: one best-effort, fire-and-forget call to the `send-chat-message-push` Edge Function with just the `messageId`, made only from the live chat send-success path (never from realtime arrivals or refetches; demo mode never calls it, and failures never block or surface on the send). The Edge Function re-validates everything server-side with the service role (sender-only, ≤5-minute recency, team access), respects `chat_notifications` (missing preferences row = the app's all-on defaults), never notifies the sender, sends a generic payload (no message text or image details), and is idempotent via the service-role-only `push_notification_deliveries` ledger. Arbitrary files, multiple attachments, chat edit/delete, visible receipts, receipts polling, cron/triggers, and push delivery beyond team chat messages remain deferred. DB↔app mapping stays centralized; live ids are real UUIDs end-to-end and demo mode uses pure mock ids.

The Supabase MCP server is configured against the dev project — use it to inspect the live schema/data. Remote history is aligned through pushed/verified `20260710234443`; `send-chat-message-push` is deployed and ACTIVE with JWT verification. Backend QA verified only the invocation and no-token skip path; physical iPhone development-build QA must still verify recipient registration, Expo ticket creation, banner display, no self-notification, and preference-off suppression. Android QA remains deferred. Do not expand delivery beyond chat messages until that QA passes. Do not rename `001`–`006` or timestamped migrations; create future migrations with `supabase migration new <descriptive_name>` and keep the generated filename. Never run `supabase db push`, `supabase functions deploy`, or another remote write without explicit approval.

Never use or request service role keys; `.env.example` stays placeholder-only.

Supabase SQL and docs live under:

- `supabase/migrations/`
- `supabase/seed/`
- `supabase/README.md`
- `docs/supabase-integration-plan.md`

---

### iOS Simulator push-registration QA

Supported Xcode 14+ / macOS 13+ / iOS 16+ Simulator development builds are allowed to attempt Expo token registration; do not use `Device.isDevice` as a blanket iOS push gate. Runtime token failures must remain friendly and retryable. The iOS Simulator registration UI path was exercised on 2026-07-11: permission is requested only after the explicit tap and no raw token is shown, but simulator token reliability is limited. The registration card's "registered" state is session-only (resets on leave/return; re-registering succeeds — accepted polish deferral). Android QA is deferred and physical iPhone development-build QA is required to verify recipient token registration, Expo ticket creation, banner display, no self-notification, and preference-off suppression. Real Push Delivery V1 must remain chat-only until that passes.

## Data Models

All TypeScript types live in `src/types/`.

Important entities include:

- `Organisation`
- `UserProfile`
- `Team`
- `TeamMembership`
- `OrganisationRole`
- `Announcement`
- `Event`
- `EventCategory`
- `RotaEntry`
- `RotaAssignment`
- `AvailabilityResponse`
- `Song`
- `SongLink`
- `ChoirSongSelection`
- `ChatMessage`
- `ChatAttachment`
- `ChatReadState`
- `NotificationPreferences`
- `PushToken`

Fields generally use `snake_case` to mirror the Supabase schema.

When updating data models, keep TypeScript types, mock data, app selectors/actions, and Supabase planning files consistent.

---

## Product Priorities

The app is for church members with mixed technical confidence, including older and less technical users.

Prioritise:

- Mobile-first UX
- Clear labels
- Large readable text
- Large touch targets
- Calm, simple, welcoming visual design
- Helpful empty states
- Confirmation dialogs before destructive actions
- Plain English
- No hidden gestures
- No dense dashboards
- No confusing technical language

The choir feature is first-class for V1:

- Choir rota
- Song database
- Add/edit/delete songs
- Select songs for assigned rota dates
- Choir-specific song leader permissions

---

## Current Scope

V1 is a functional scaffold with mocked, locally persisted data plus optional Supabase email/password Auth and the documented live slices. Storage is limited to profile avatars, one announcement image, and one chat image per message — all live and QA'd (no arbitrary files, galleries, or message edit/delete). Realtime stays limited to the open team chat. Push Token Registration V1 is implemented and pushed; iOS Simulator registration UI was exercised but physical iPhone QA remains the representative token test, while Android QA is deferred. Chat Message Push Delivery V1 is deployed (Edge Function + pushed ledger migration): backend invocation and no-token skips are verified, but real Expo delivery awaits physical-device QA. Demo/local mode intentionally remains supported.

Do not add these unless explicitly requested:

- Team-management writes
- Real OAuth
- Real SMS login
- Push delivery beyond team chat messages (announcements/events/rota/availability, receipts polling, cron/triggers, broadcast tools)
- File uploads beyond profile avatars, one announcement image, and one chat image per message (no arbitrary files or galleries)
- Donations or payments
- Livestreaming
- Sermon archive
- Separate admin web dashboard
- Multi-church onboarding UI
- Advanced chat features
- Voice notes
- Message reactions
- Message replies
- Polls
- Read receipts
- Automatic rota generation
- Complex rota swaps
- General event RSVP
- Attendance tracking
- Advanced analytics
- Uploaded audio hosting
- Full embedded music streaming

Use TODO comments for future integrations where helpful.

---

## Working Style for Codex

Prefer focused changes over broad rewrites.

Before changing files:

1. Inspect `git status`.
2. Read the relevant files.
3. Understand the current architecture.
4. Preserve working flows.

When implementing:

- Do not rebuild from scratch.
- Do not undo working architecture decisions.
- Keep route files thin.
- Keep reusable UI in `src/components/`.
- Keep feature screens in `src/features/`.
- Keep permissions in `src/lib/permissions/`.
- Keep mock data in `src/lib/mockData/`.
- Keep app state/actions/selectors in `src/lib/appData/`.
- Keep auth abstraction in `src/lib/auth/`.
- Keep Supabase integration points isolated.

After changes:

1. Run the relevant checks.
2. Fix obvious errors.
3. Summarise what changed.
4. List any limitations or follow-up work.

Avoid long planning-only responses. Provide a concise checklist, then implement.

---

## Sync With Claude Instructions

`CLAUDE.md` is the Claude Code instruction file.

`AGENTS.md` is the Codex instruction file.

If project architecture, commands, conventions, or persistent AI instructions change, keep both files consistent enough that Claude Code and Codex do not drift.

When possible, update shared instructions in both files or create a shared docs file and point both wrappers to it.

Do not duplicate large product specs here. The long-form source of truth remains in `docs/`.

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

---

## Final Response Expectations

When finishing a task, summarise:

1. What changed
2. What checks were run
3. Whether checks passed
4. Any known limitations
5. Recommended next step

For backend/Supabase work, also summarise:

1. Whether app functionality was touched
2. Whether any credentials or real environment files were created
3. What manual Supabase testing is still needed
