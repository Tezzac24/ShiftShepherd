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

**CI** (`.github/workflows/ci.yml`) runs on push to `main`, pull requests to `main`, and workflow_dispatch: `npm ci` → typecheck → lint → `test:ci` → `check:migrations` → `npx expo export` on Node 20. It is check-only — no secrets, no `.env` (export runs in demo mode by design), no deployments. Supabase migration pushes, Edge Function deploys, and EAS builds remain explicit manual steps. The deployed Broadcast baseline was 211 tests across 31 suites and the pre-membership identity/auth-routing baseline was 296/43; the current local implementation passes 691 tests across 70 suites, including rota push delivery (rota event selection, added-versus-changed recipients, freshness, per-device coalescing, Plan the Month batching, change-marker migration contract), announcement push delivery (kind-aware dispatch rules, recipient resolution, preference suppression, dedupe, self-exclusion, generic content, migration contract), team creation request idempotency, membership lifecycle, last-admin and cleanup-write concurrency, re-invitation, team creation/edit/archive/restore, zero-admin and optional-initial-admin contracts, church-admin-only team role management (promotion/demotion, final-leader demotion, zero-leader recovery, self-role change, archived rejection), AppData scope fencing, admin UI, and existing auth/chat/push regressions.

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
- **Supabase** — production backend. Established profile/team/membership/shared-data slices, secure private chat Broadcast, the multi-organisation identity/onboarding foundation, Organisation Membership & Role Management V1, and Push Token Lifecycle V1 are deployed; remote history is aligned through `20260917110331_add_announcement_push_delivery.sql` across 35 migrations; Team Creation Idempotency V1 is deployed to `shift-shepherd-dev` (applied 2026-09-17) and hosted-contract verified, with manual app QA of the retry path pending. Team Creation & Editing V1 is deployed to `shift-shepherd-dev` and hosted-contract verified behind `20260715004513`; manual app QA remains pending. Team Role Management V1 is deployed to `shift-shepherd-dev` behind `20260719110500_add_team_role_management.sql` (applied 2026-09-17) and hosted-contract verified; manual app QA remains pending. `manage-organisation-invitations` v2 (UTC invitation-expiry presentation, deployed and verified 2026-09-17) and the kind-aware, active-profile-compatible `send-chat-message-push` v6 (chat messages and announcements) are ACTIVE, with runtime invitation configuration present. Live membership/role/invitation/no-org device QA and team-lifecycle/team-role manual app QA remain deferred. Announcement Push Delivery V1 is deployed to `shift-shepherd-dev` behind `20260917110331_add_announcement_push_delivery.sql` (applied 2026-09-17) and `send-chat-message-push` v6, and is hosted-contract verified (schema/ACL, deployed bundle, rolled-back recipient-resolution probe); physical-device delivery QA remains pending. Rota Push Delivery V1 is implemented locally behind the **local-only, undeployed** `20260917124856_add_rota_push_delivery.sql` and an undeployed revision of `send-chat-message-push` (no hosted execution, no physical-device QA). Demo mode stays isolated.
- **AsyncStorage** — versioned local persistence for demo/mock state (`src/lib/storage/persistence.ts`)
- **@expo/vector-icons**; `src/lib/notifications/` owns the device-side Expo push registration flow (expo-notifications/expo-device/expo-constants; chat and announcement delivery are deployed and rota delivery is implemented locally pending deployment, but real Expo/device delivery remains pending physical-iPhone QA)

## Architecture Patterns

### Authentication
Auth logic stays abstracted behind `src/lib/auth/AuthContext.tsx`, which is dual-mode: demo login, and Supabase email/password Auth with open signup, session restore, an authenticated no-organisation state, account-global identity, and one server-validated active organisation profile. Existing `profiles` remain organisation identities; one Auth user may own one per organisation. The deployed identity migration removes historical email auto-linking, so signup creates no organisation access. Invitation acceptance requires the matching server-verified email; already-configured matching OAuth identities work, while phone-only identities do not. Do not spread mode selection or session mapping across screens.

### Role-Based UI
All screens render conditionally based on the current user's `OrganisationRole`. Permission checks belong in `src/lib/permissions/`, not inline in components.

### Mock Data & Local Persistence
All mock data goes in `src/lib/mockData/`. The data models must match the intended Supabase schema (defined in `docs/one-shot-build-prompt.md`, section 5) — even for mocked data. Mutable app state is persisted to AsyncStorage through `src/lib/storage/persistence.ts` (version envelope, safe fallback to mock seeds on invalid data); the mock seeds remain the reset source of truth (**Profile → Reset Demo Data**).

### Backend Abstraction
Profile Editing V1 uses `profiles.ts` + the one-argument `update_own_profile(p_full_name)` for only `full_name` — phone is never sent. Team Avatars V1 uses `teamAvatars.ts`, private `team-avatars` paths, signed URLs, and manager-only `set_team_avatar_path`. Team membership writes use authenticated-only `add_team_member(p_team_id, p_profile_id)`, refined `remove_team_member(p_team_id, p_profile_id)`, and caller-owned `leave_team(p_team_id)`: caller/organisation authority and roles are server-derived; church admins with ordinary team membership are not protected; team admins cannot remove peer admins; church admins may remove a non-final team admin; self-removal uses Leave Team; and a common team-row lock serializes final-admin checks. `team_memberships` stays SELECT-only to authenticated and unavailable to anon. Team Creation & Editing V1 uses authenticated-only `create_team`, `update_team`, `archive_team`, and `restore_team`; caller/organisation authority is server-derived and restricted to active church admins. Team Creation Idempotency V1 (deployed behind `20260917093926`; hosted-contract verified; manual app QA pending) replaces `create_team` with `create_team(p_name, p_description, p_initial_admin_profile_id, p_request_id uuid)`: the New Team screen mints one `requestId` per logical submission (`newRequestId()` in `src/utils/ids.ts`), reuses it across retries of the same draft, and rotates it when the draft changes or the server reports a conflict; the service rejects non-UUID keys before any network call; the server persists the key on nullable `teams.create_request_id` (plus the request's initial-admin argument on `teams.create_request_initial_admin_id`) under a partial unique index on `(organisation_id, create_request_id)`, resolves a replay only inside the caller's server-derived organisation under the existing organisation lock, returns the same team and existing initial membership without re-inserting, raises `CREATE_REQUEST_MISMATCH` (mapped to the conflict copy) when the same key carries a different name, description, or initial-admin argument (compared symmetrically against the stored record), and never makes team names unique. Teams may have zero team admins, the creator is never auto-added, and one active same-organisation profile receives the existing `team_leader` role only when explicitly selected. `archived_at`/`archived_by` preserve the row and every child record while active helpers exclude archived teams from normal access; church admins retain archived metadata/restore authority. Team Role Management V1 (deployed behind `20260719110500`; hosted-contract verified; manual app QA pending) adds authenticated-only `set_team_member_role(p_team_id, p_profile_id, p_role public.team_role)`: authority is the active organisation church admin only (narrower than `can_manage_team` — team leaders alone cannot promote or demote anyone, including themselves); the organisation-scoped team-row lock serializes with archive/restore and the remove/leave final-admin counts; archived teams return `TEAM_ARCHIVED`; the target must already be an active linked same-organisation member; the update is idempotent and never creates or removes a membership. Zero, one, or many team leaders stay valid — final-leader demotion to zero is allowed, zero-leader teams are recovered by promotion, self-role change is allowed, and the existing remove/leave final-leader protections are unchanged (demote first). Role actions are inline on the existing Manage Members screen, live-only, with an informational never-blocking final-leader warning; no notification is sent. Canonical AppData membership and team patches update session, My Teams, directory, and access snapshots before a coalesced quiet refresh. Shared live freshness uses one session-scoped channel for announcements, events, rotas, songs, and directory tables; payloads only invalidate RLS-scoped loaders, reconnect/foreground catches up, and cleanup prevents stale-session callbacks. Open-chat Realtime remains separate and push is not a synchronization source. Demo/mock ids are rejected.
API calls go through `src/lib/supabase/services/`. `chat.ts` owns canonical list/send and exact `(team_id,id)` message reads with a bounded attachment join. **Chat unread state** remains server-authoritative in `chatReadState.ts`: `get_team_chat_unread_summary()` and forward-only `mark_team_chat_read(p_team_id,p_message_id)` accept no profile/caller/timestamp. `chatBroadcast.ts` owns the receive-only private transport: exact `team-chat:<teamId>` topics for canonical accessible teams, one `profile-chat-read:<profileId>` topic, explicit Realtime `setAuth` before subscribe and on same-account token refresh, strict minimal v1 decoders, exact-row RLS fetch, dynamic membership add/remove, aggregate reconnect health, and complete account-switch cleanup. Database triggers derive topics from `NEW`, send no message text/attachment/profile data, and `realtime.messages` has narrow SELECT policies only—no client INSERT/send. The existing single-flight summary scheduler, active-chat behavior, foreground/reconnect repair, image previews, own-message exclusion, and demo isolation remain. Non-chat shared freshness stays on Postgres Changes. Chat images and push tokens are unchanged. Push delivery is app-invoked and server-validated through the kind-aware `send-chat-message-push` Edge Function: `{ messageId }` after a chat send (unchanged) and `{ announcementId }` after an announcement is posted (Announcement Push Delivery V1, deployed 2026-09-17 as `send-chat-message-push` v6 behind `20260917110331`). Announcement recipients mirror the announcements SELECT policy (active linked same-organisation profiles; the team's members for team announcements; archived teams deliver nothing), the author is never notified, the existing `announcement_notifications`/`team_announcement_notifications` keys suppress delivery, the shared `push_notification_deliveries` ledger dedupes per (event, recipient, token), and payloads are generic (never announcement title/body). Rota Push Delivery V1 (implemented locally; `20260917124856` and the function revision are pending deployment) adds `{ rotaEntryIds }`, sent once per live logical rota save (one entry create or edit, one cancel or restore, or one whole Plan the Month batch through `addRotaEntries`). The function requires every entry to belong to one active team of the caller's organisation that the caller may manage (team leader or church admin), notifies only active linked same-organisation current team members on those entries and never the caller, honours the existing `rota_notifications` key, and sends generic copy naming only the team: a `rota_assignment` event per assignment row created in the last five minutes, and a `rota_entry_change` event keyed by the trigger-maintained `rota_entries.details_change_id` marker (title, date, time, notes, or cancellation status changed in the last five minutes) for people already on that entry. Every ledger row newly claimed for one device in a request becomes one notification. Deleted entries, removed assignments, availability responses, and song selections notify nobody, and `event_reminders`/`availability_reminders` stay unimplemented because the product docs define no trigger timing. Push remains an alert, never unread truth. Never use service-role keys in the app.

The deployed onboarding foundation uses `user_accounts` for the global default name and validated active profile, keeps `profiles` as stable organisation identities, and preserves existing profile IDs/relationships. `current_profile_id()` scopes normal RLS access to the active organisation. Account/name/switch/create actions use narrow authenticated RPCs; invitations use seven-day SHA-256 hashes, no direct app table writes, and a service-role-only transactional boundary behind `manage-organisation-invitations`, which validates user JWTs manually because token preview is public. Native pending links use SecureStore and web uses sessionStorage. Effective name is organisation override ?? global default; existing `profiles.full_name` stays synchronized for compatibility.

Organisation Membership & Role Management V1 is **deployed** to `shift-shepherd-dev` (implemented in `c54da51`, access-loss invalidation hardened in `7628569`, cleanup-write serialization in `ad09ae9`), behind `20260712103321_add_organisation_membership_role_management.sql`, applied 2026-07-12 as the only remote mutation of that task. Stable profiles gain explicit active/removed access; admin removal and caller leave revoke current roles/team memberships/profile push tokens while retaining history/global identity/other organisations; active-profile transitions are atomic; every removal invalidates and clears the affected account scope; concurrent team/token writes cannot survive cleanup; all last-admin mutations share an organisation-row lock; removed-profile re-invitation restores only `general_member`. Profile exposes admin **Organisation members** and user-owned **Leave organisation** flows. Hosted verification passed for that slice, including 17 unchanged data fingerprints. Remote migration history now aligns through deployed `20260719110500_add_team_role_management.sql` across 33 migrations; Push Token Lifecycle V1's live database contract is verified. Team Creation & Editing V1 is **deployed** to `shift-shepherd-dev` behind `20260715004513_add_team_creation_editing_and_archive.sql` (first PostgreSQL execution 2026-07-16); its hosted schema, four lifecycle RPCs, ACLs, zero-admin/optional-initial-admin creation contract, archive/restore lifecycle, cross-organisation isolation, image retention, history preservation, and database invariants passed transactional (rolled-back) verification, while manual app QA remains pending. Team Role Management V1 is **deployed** to `shift-shepherd-dev` behind `20260719110500_add_team_role_management.sql` (applied 2026-09-17 as the only remote mutation of its deployment task); the deployed definition, definer/search_path/ACL contract, and a rolled-back authenticated probe matrix (promotion, demotion, idempotency, final-leader demotion to zero, zero-leader recovery, self-role change, caller/target isolation, invalid role, unchanged remove/leave final-leader protections, archived rejection) passed with every QA and Grace Community Church fingerprint unchanged. Team Creation Idempotency V1 is **deployed** to `shift-shepherd-dev` behind `20260917093926_add_team_creation_idempotency.sql` (applied 2026-09-17 as the only remote mutation of its deployment task); remote history then aligned 34/34 with no local-only, remote-only, or repair entry. Hosted verification on 2026-09-17 confirmed the deployed body is byte-identical to the migration (single `create_team(text, text, uuid, uuid)` overload, `SECURITY DEFINER`, `search_path=''`, owned by `postgres`, EXECUTE for `authenticated` only with none for `anon`, `service_role`, or `PUBLIC`), both nullable columns without a foreign key, the exact partial unique index, and unchanged policy/trigger/publication counts and RLS. A single transaction-scoped authenticated probe on the QA organisations (every mutation rolled back) passed: zero-admin create then same-key replay returned the same id with one team of that name; a new key with the same name created a second team; an initial-admin create then replay returned the same team and the same single `team_leader` membership; replaying that key with no admin, with a different admin, replaying the zero-admin key with an admin, and replaying with a different name each raised `CREATE_REQUEST_MISMATCH`; a null key raised `INVALID_REQUEST_ID`; a malformed key failed on the uuid cast (`22P02`); QA Admin C and QA Member B replaying Alpha's key each created a distinct team in their own organisation with zero visibility of Alpha's probe rows. Pre/post fingerprints (teams, memberships, profiles, organisation roles, active accounts) for Grace Community Church and the three QA organisations were identical with zero keyed rows remaining, Edge Functions stayed at `send-chat-message-push` v5 and `manage-organisation-invitations` v1, and advisors were unchanged apart from the `create_team` definer notice now carrying the new signature. Manual app QA of the retry path has not run. Announcement Push Delivery V1 is **deployed** to `shift-shepherd-dev` behind `20260917110331_add_announcement_push_delivery.sql` (applied 2026-09-17) and `send-chat-message-push` v6 (deployed from merge commit `4ecabb4`; `manage-organisation-invitations` stayed at v2); remote history aligns 35/35 with no local-only, remote-only, or repair entry. Hosted verification on 2026-09-17 confirmed the ledger CHECK accepts exactly `chat_message` and `announcement`, `service_role` holds read-only SELECT on `announcements` and `organisations`, `anon`/`authenticated` privileges, RLS, and the ledger's columns/indexes/policies/triggers are otherwise unchanged, and the v6 bundle (`index.ts` + `dispatch.ts`, `verify_jwt` on) matches the merged source. A transaction-scoped probe on QA Organisation Alpha (fixtures plus one church-wide and one team announcement created inside the transaction and rolled back; the Edge Function was never invoked and nothing was sent) showed the function's recipient set equals the RLS-visible readers minus the author, preference-suppressed profiles, and non-member church admins across base, per-kind preference, multi-path membership, linked-removal, and archived-team scenarios; unlinked and removed profiles are never recipients, and a replayed ledger claim inserts nothing. All 40 Grace Community Church/QA fingerprints matched with zero residue, and advisors were unchanged apart from usage-driven unused-index statistics. Accepted residual risks: a non-author caller receives 403 rather than 404 for an existing announcement id (mirroring the chat path), church admins who are not team members are not notified of team announcements, failed delivery rows are never retried, and a fire-and-forget call delayed past the five-minute freshness window is silently dropped. Physical-device announcement delivery QA has not run. **No live membership, role, removal, leave, or re-invitation QA has been performed, and team-lifecycle/team-role manual app QA has not run.** `manage-organisation-invitations` v2 and the kind-aware, active-profile-compatible `send-chat-message-push` v6 remain deployed/ACTIVE with invitation configuration present. Disposable-account membership/role/remove/leave/re-invitation QA, team lifecycle manual QA, genuine no-organisation device QA, first real invitation delivery/acceptance, multi-organisation live QA, and physical-iPhone push QA remain pending; real-user rollout stays blocked. Production invitation delivery is not approved and custom-scheme links are not production-ready. Never push migrations, deploy functions, change remote Auth/email settings, or send live invitations without explicit approval.

### iOS Simulator push-registration QA

Supported Xcode 14+ / macOS 13+ / iOS 16+ Simulator development builds are allowed to attempt Expo token registration; do not use `Device.isDevice` as a blanket iOS push gate. Runtime token failures must remain friendly and retryable. The iOS Simulator registration UI path was exercised on 2026-07-11: permission is requested only after the explicit tap and no raw token is shown, but simulator token reliability is limited. Registration state now hydrates from the versioned local persistence layer without prompting. Android QA is deferred and physical iPhone development-build QA is required to verify recipient token registration, Expo ticket creation, banner display, no self-notification, preference-off suppression, rebind, and sign-out revocation after deployment. Real push delivery covers chat messages and announcements (both deployed) and rota updates (implemented locally, pending deployment); all three remain unverified on physical devices until that QA passes, and event reminder or availability reminder delivery must not be added before then.

### Push token lifecycle (deployed; physical-device QA pending)

The active profile is the sole owner of this installation's Expo push token. Existing explicit opt-in is stored with Auth user/profile identity; registered UI is published only after server registration and durable local persistence both succeed. Push-specific read/write/clear failures remain observable to the lifecycle, and its latest durably saved in-memory snapshot can support sign-out when storage cannot be read. Generation-fenced, conditional persistence repair prevents old account/profile work from becoming the effective record after scope replacement; a different Auth account still must opt in explicitly. Push cleanup uses a bounded two-second deadline per dependency and cannot indefinitely block Supabase Auth sign-out. Account-scoped `unregister_push_token(p_token)` remains best-effort and can fail offline; local storage can also fail, but another account never trusts the stale record. `20260714200205_add_push_token_revocation.sql` is deployed and its live database contract is verified. Multi-profile notification fan-out is deferred, and native physical-device lifecycle/delivery QA remains required.

## Data Models

All TypeScript types live in `src/types/`. Key interfaces (from the build spec):

`Organisation`, `UserProfile`, `Team`, `TeamMembership`, `OrganisationRole`, `Announcement`, `Event`, `EventCategory`, `RotaEntry`, `RotaAssignment`, `AvailabilityResponse`, `Song`, `SongLink`, `ChoirSongSelection`, `ChatMessage`, `ChatReadState`, `NotificationPreferences`, `PushToken`

## Navigation Structure

```
Root Stack (app/_layout.tsx, auth-gated with Stack.Protected)
├── login
└── (tabs): Home · Calendar · Teams · Messages · Profile
    ├── teams/new · teams/archived · teams/[teamId]/edit
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

V1 is a **functional scaffold with mocked, locally persisted data** plus optional real Supabase Auth and documented live slices. Storage and membership scope remain narrow. Shared-data Realtime stays Postgres Changes invalidation-only; chat uses private database Broadcast with a server-authoritative unread cursor/summary. Organisation membership and the four existing exclusive organisation roles are locally managed. Team Creation & Editing V1 is deployed to `shift-shepherd-dev` and hosted-contract verified with zero-admin creation (coexisting with existing final-team-leader leave protection), one optional initial admin, generic-team-only creation, identity editing, soft archive, admin archived visibility, same-row restoration, retained image history, and team-linked events frozen while their team is archived; manual app QA remains pending. Team Creation Idempotency V1 (request-keyed, organisation-scoped replay-safe `create_team`) is deployed to `shift-shepherd-dev` and hosted-contract verified; its manual app QA remains pending. Team Role Management V1 (church-admin-only promotion/demotion with zero-leader recovery and final-leader demotion) is deployed to `shift-shepherd-dev` and hosted-contract verified; its manual app QA remains pending. Hard team deletion, team-leader-driven role changes, and invitation expansion remain out of scope. Visible read receipts, delivered/typing/presence indicators, message edit/delete, native app-icon badge sync, and push expansion beyond chat messages, announcements, and the locally implemented rota updates (event reminders, availability reminders, receipts polling, cron or queue delivery) remain out of scope. Demo/local mode intentionally remains supported.

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
