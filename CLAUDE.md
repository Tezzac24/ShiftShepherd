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

Jest runs via **jest-expo** (config in `jest.config.js`, global setup in `jest.setup.ts`) with React Native Testing Library. Tests live in `src/**/__tests__/*.test.ts(x)` and must stay deterministic/offline. Current coverage includes push/chat/notification regressions plus profile-edit allow-list/RPC behavior, team-avatar validation/path/cleanup/signing, leader/admin permissions, and focused control presentation.

**CI** (`.github/workflows/ci.yml`) runs on push to `main`, pull requests to `main`, and workflow_dispatch: `npm ci` → typecheck → lint → `test:ci` → `check:migrations` → `npx expo export` on Node 20. It is check-only — no secrets, no `.env` (export runs in demo mode by design), no deployments. Supabase migration pushes, Edge Function deploys, and EAS builds remain explicit manual steps. The deployed Broadcast baseline was 211 tests across 31 suites and the pre-membership identity/auth-routing baseline was 296/43; the current membership implementation passes 359 tests across 48 suites with lifecycle, last-admin and cleanup-write concurrency, cleanup/history, re-invitation, admin UI, role, leave, routing, and forced stale-scope coverage.

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
- **Supabase** — production backend. Established profile/team/membership/shared-data slices, secure private chat Broadcast, the multi-organisation identity/onboarding foundation, and Organisation Membership & Role Management V1 are deployed; remote history is aligned through `20260712103321`. `manage-organisation-invitations` v1 and active-profile-compatible `send-chat-message-push` v5 are ACTIVE, with runtime invitation configuration present. Live membership/role/invitation/no-org device QA remains deferred. Demo mode stays isolated.
- **AsyncStorage** — versioned local persistence for demo/mock state (`src/lib/storage/persistence.ts`)
- **@expo/vector-icons**; `src/lib/notifications/` owns the device-side Expo push registration flow (expo-notifications/expo-device/expo-constants; chat delivery is live, but real Expo/device delivery remains pending physical-iPhone QA)

## Architecture Patterns

### Authentication
Auth logic stays abstracted behind `src/lib/auth/AuthContext.tsx`, which is dual-mode: demo login, and Supabase email/password Auth with open signup, session restore, an authenticated no-organisation state, account-global identity, and one server-validated active organisation profile. Existing `profiles` remain organisation identities; one Auth user may own one per organisation. The deployed identity migration removes historical email auto-linking, so signup creates no organisation access. Invitation acceptance requires the matching server-verified email; already-configured matching OAuth identities work, while phone-only identities do not. Do not spread mode selection or session mapping across screens.

### Role-Based UI
All screens render conditionally based on the current user's `OrganisationRole`. Permission checks belong in `src/lib/permissions/`, not inline in components.

### Mock Data & Local Persistence
All mock data goes in `src/lib/mockData/`. The data models must match the intended Supabase schema (defined in `docs/one-shot-build-prompt.md`, section 5) — even for mocked data. Mutable app state is persisted to AsyncStorage through `src/lib/storage/persistence.ts` (version envelope, safe fallback to mock seeds on invalid data); the mock seeds remain the reset source of truth (**Profile → Reset Demo Data**).

### Backend Abstraction
Profile Editing V1 uses `profiles.ts` + the one-argument `update_own_profile(p_full_name)` for only `full_name` — phone is never sent. Team Avatars V1 uses `teamAvatars.ts`, private `team-avatars` paths, signed URLs, and manager-only `set_team_avatar_path`. Team membership writes use authenticated-only `add_team_member(p_team_id, p_profile_id)`, refined `remove_team_member(p_team_id, p_profile_id)`, and caller-owned `leave_team(p_team_id)`: caller/organisation authority and roles are server-derived; church admins with ordinary team membership are not protected; team admins cannot remove peer admins; church admins may remove a non-final team admin; self-removal uses Leave Team; and a common team-row lock serializes final-admin checks. `team_memberships` stays SELECT-only to authenticated and unavailable to anon. Canonical AppData membership patches update member lists/counts/candidates and the current session/My Teams/access snapshot together before a coalesced quiet refresh. Shared live freshness uses one session-scoped channel for announcements, events, rotas, songs, and directory tables; payloads only invalidate RLS-scoped loaders, reconnect/foreground catches up, and cleanup prevents stale-session callbacks. Open-chat Realtime remains separate and push is not a synchronization source. Demo/mock ids are rejected.
API calls go through `src/lib/supabase/services/`. `chat.ts` owns canonical list/send and exact `(team_id,id)` message reads with a bounded attachment join. **Chat unread state** remains server-authoritative in `chatReadState.ts`: `get_team_chat_unread_summary()` and forward-only `mark_team_chat_read(p_team_id,p_message_id)` accept no profile/caller/timestamp. `chatBroadcast.ts` owns the receive-only private transport: exact `team-chat:<teamId>` topics for canonical accessible teams, one `profile-chat-read:<profileId>` topic, explicit Realtime `setAuth` before subscribe and on same-account token refresh, strict minimal v1 decoders, exact-row RLS fetch, dynamic membership add/remove, aggregate reconnect health, and complete account-switch cleanup. Database triggers derive topics from `NEW`, send no message text/attachment/profile data, and `realtime.messages` has narrow SELECT policies only—no client INSERT/send. The existing single-flight summary scheduler, active-chat behavior, foreground/reconnect repair, image previews, own-message exclusion, and demo isolation remain. Non-chat shared freshness stays on Postgres Changes. Chat images, push tokens, and deployed chat push delivery are unchanged; push remains an alert, never unread truth. Never use service-role keys in the app.

The deployed onboarding foundation uses `user_accounts` for the global default name and validated active profile, keeps `profiles` as stable organisation identities, and preserves existing profile IDs/relationships. `current_profile_id()` scopes normal RLS access to the active organisation. Account/name/switch/create actions use narrow authenticated RPCs; invitations use seven-day SHA-256 hashes, no direct app table writes, and a service-role-only transactional boundary behind `manage-organisation-invitations`, which validates user JWTs manually because token preview is public. Native pending links use SecureStore and web uses sessionStorage. Effective name is organisation override ?? global default; existing `profiles.full_name` stays synchronized for compatibility.

Organisation Membership & Role Management V1 is **deployed** to `shift-shepherd-dev` (implemented in `c54da51`, access-loss invalidation hardened in `7628569`, cleanup-write serialization in `ad09ae9`), behind `20260712103321_add_organisation_membership_role_management.sql`, applied 2026-07-12 as the only remote mutation of that task. Stable profiles gain explicit active/removed access; admin removal and caller leave revoke current roles/team memberships/profile push tokens while retaining history/global identity/other organisations; active-profile transitions are atomic; every removal invalidates and clears the affected account scope; concurrent team/token writes cannot survive cleanup; all last-admin mutations share an organisation-row lock; removed-profile re-invitation restores only `general_member`. Profile exposes admin **Organisation members** and user-owned **Leave organisation** flows. Hosted verification passed: local/remote history aligns through `20260712103321` with no repair entry, the enum/columns/constraint/indexes/trigger deployed as written, all 8 existing profiles deterministically backfilled `active` with empty removal audit, function ACLs expose no PUBLIC/anon execute (internal repair and trigger validators are `postgres`-only), direct authenticated writes to profiles/roles/teams/tokens/invitations remain revoked, `user_accounts` is published exactly once under owner-only RLS, and all 17 pre/post data fingerprints matched with no application row mutated. `20260714200205_add_push_token_revocation.sql` is the one newer local-only migration and has not been deployed. Advisors added only the four expected "authenticated can execute SECURITY DEFINER" notices for the deployed membership RPCs and improved multiple-permissive-policies 6→5; no new actionable security finding. **No live membership, role, removal, leave, or re-invitation QA has been performed** — those flows are deployed but unexercised. `manage-organisation-invitations` v1 and active-profile-compatible `send-chat-message-push` v5 remain deployed/ACTIVE and untouched with invitation configuration present. Disposable-account membership/role/remove/leave/re-invitation QA, genuine no-organisation device QA, first real invitation delivery/acceptance, multi-organisation live QA, and physical-iPhone push QA remain pending; real-user rollout stays blocked. Production invitation delivery is not approved and custom-scheme links are not production-ready. Never push migrations, deploy functions, change remote Auth/email settings, or send live invitations without explicit approval.

### iOS Simulator push-registration QA

Supported Xcode 14+ / macOS 13+ / iOS 16+ Simulator development builds are allowed to attempt Expo token registration; do not use `Device.isDevice` as a blanket iOS push gate. Runtime token failures must remain friendly and retryable. The iOS Simulator registration UI path was exercised on 2026-07-11: permission is requested only after the explicit tap and no raw token is shown, but simulator token reliability is limited. Registration state now hydrates from the versioned local persistence layer without prompting. Android QA is deferred and physical iPhone development-build QA is required to verify recipient token registration, Expo ticket creation, banner display, no self-notification, preference-off suppression, rebind, and sign-out revocation after deployment. Real Push Delivery V1 must remain chat-only until that passes.

### Push token lifecycle (local-only, not deployed)

The active profile is the sole owner of this installation's Expo push token. Existing explicit opt-in is stored with Auth user/profile identity; registered UI is published only after server registration and durable local persistence both succeed. Push-specific read/write/clear failures remain observable to the lifecycle, and its latest durably saved in-memory snapshot can support sign-out when storage cannot be read. Generation-fenced, conditional persistence repair prevents old account/profile work from becoming the effective record after scope replacement; a different Auth account still must opt in explicitly. Push cleanup uses a bounded two-second deadline per dependency and cannot indefinitely block Supabase Auth sign-out. Account-scoped `unregister_push_token(p_token)` remains best-effort and can fail offline; local storage can also fail, but another account never trusts the stale record. `20260714200205_add_push_token_revocation.sql` remains local-only and undeployed. Multi-profile notification fan-out is deferred, and native physical-device QA remains required after deployment.

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

V1 is a **functional scaffold with mocked, locally persisted data** plus optional real Supabase Auth and documented live slices. Storage and membership scope remain narrow. Shared-data Realtime stays Postgres Changes invalidation-only; chat uses private database Broadcast with a server-authoritative unread cursor/summary. Organisation membership and the four existing exclusive organisation roles are locally managed; team-role editing/leader reassignment, broader team creation/editing, and invitation expansion remain out of scope. Visible read receipts, delivered/typing/presence indicators, message edit/delete, native app-icon badge sync, and push expansion remain out of scope. Demo/local mode intentionally remains supported.

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
