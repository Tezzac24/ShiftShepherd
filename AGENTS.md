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

The current project state is a functional scaffold with locally persisted mock data and optional Supabase slices. Profile Editing V1, Team Avatars V1, Organisation Directory + Team Membership Management V1, Membership Governance + Leave Team + Shared Live Data Freshness V1, server-authoritative unread, the private chat Broadcast cutover, the multi-organisation identity/onboarding foundation, Organisation Membership & Role Management V1, and Push Token Lifecycle V1 are deployed. Remote migration history is aligned through `20260917180127_fix_invitation_acceptance_role_conflict_target.sql` across 37 migrations (Team Creation Idempotency V1 was applied to `shift-shepherd-dev` on 2026-09-17 and hosted-contract verified; its manual app QA is pending); `manage-organisation-invitations` v3 (Production Email & Invitation Delivery Readiness V1, deployed and hosted-verified 2026-09-17) and the kind-aware, active-profile-compatible `send-chat-message-push` v7 (chat messages, announcements, and rota updates) are ACTIVE, and invitation runtime secrets/redirects are configured. Production Email & Invitation Delivery Readiness V1 revised `manage-organisation-invitations` (the three invitation secrets are validated before any invitation is issued or superseded, a path-preserving link builder for https and app-scheme bases, bounded `EMAIL_DELIVERY_REJECTED`/`EMAIL_DELIVERY_UNAVAILABLE` provider codes with a 10-second timeout and code-only logs, and a copyable fallback link in the email) and is deployed to `shift-shepherd-dev` as v3 (2026-09-17, merge commit `b9d3dcc`). Hosted verification confirmed a bundle identical to the merged source, `verify_jwt` off, unchanged secret names (a digest comparison, with values never read, matched the documented development sender and `shiftshepherd://` base, which v3 accepts with not-production-ready warnings), a clean boot through a read-only preview of a non-existent token, and unchanged fingerprints and advisors; no invitation or email was sent. Live delivery QA remains pending; the owner-controlled verified sending domain, sender, Auth custom SMTP, Site URL/redirects, and https link host are listed in `docs/production-email-readiness.md`; password reset remains deferred product work. Announcement Push Delivery V1 is deployed to `shift-shepherd-dev` behind `20260917110331_add_announcement_push_delivery.sql` (applied 2026-09-17) and `send-chat-message-push` v6, and is hosted-contract verified (schema/ACL, deployed bundle, rolled-back recipient-resolution probe); physical-device delivery QA remains pending. Rota Push Delivery V1 is deployed to `shift-shepherd-dev` behind `20260917124856_add_rota_push_delivery.sql` (applied 2026-09-17) and `send-chat-message-push` v7, and is hosted-contract verified (schema/ACL, change-marker trigger behaviour, deployed bundle, rolled-back recipient-matrix probe); physical-device delivery QA remains pending. Push Token Lifecycle V1's live database contract is verified, while native physical-device lifecycle/delivery QA remains pending. Team Creation & Editing V1 is deployed to `shift-shepherd-dev` behind `20260715004513_add_team_creation_editing_and_archive.sql` and hosted-contract verified (schema, four lifecycle RPCs, ACLs, authenticated lifecycle probes, archive/restore, history preservation, RLS isolation, invariants); manual app QA remains pending. Team Role Management V1 is deployed to `shift-shepherd-dev` behind `20260719110500_add_team_role_management.sql` (applied 2026-09-17) and hosted-contract verified (deployed definition, definer/search_path/ACL inspection, and a rolled-back authenticated probe matrix covering church-admin-only `set_team_member_role`, final-leader demotion, zero-leader recovery, self-role change, caller/target isolation, invalid role, unchanged remove/leave protections, and archived rejection); its manual app QA has not run. **No live membership, role, removal, leave, or re-invitation QA has been performed, and team-lifecycle/team-role manual app QA has not run.** Non-mutating identity-function smoke tests passed, while disposable-account membership/role QA, genuine no-organisation device QA, disposable-account invitation/multi-org QA, and physical-iPhone push delivery QA remain pending; real-user rollout stays blocked. Commits `420e12f` and `bf6a538` repaired auth sign-out persistence and account-bootstrap routing.

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
- `docs/production-email-readiness.md` (email, invitation delivery, or Auth email work)
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
npm install              # Install dependencies
npm start                # Start Expo dev server, then press a/i/w for platform
npm run android          # Run on Android emulator
npm run ios              # Run on iOS simulator
npm run web              # Run in browser
npm run lint             # Run ESLint
npm run typecheck        # TypeScript check with tsc --noEmit
npm test                 # Jest regression tests (jest-expo)
npm run test:watch       # Jest watch mode
npm run test:ci          # Jest as CI runs it (no watch, in-band)
npm run check:migrations # Offline migration filename sanity check
npx expo export          # Bundle/export sanity check
```

After meaningful changes, run the standard check sequence:

```bash
npm run typecheck
npm run lint
npm run test:ci
npx expo export
git diff --check
```

Manual QA then focuses only on the changed feature area.

If a command cannot be run in the environment, explain why in the final summary.

---

## Testing & CI

Jest runs via **jest-expo** (config in `jest.config.js`, global setup in `jest.setup.ts`) with React Native Testing Library for hook tests. Tests live in `src/**/__tests__/*.test.ts(x)` and must stay deterministic and offline:

- Mock Supabase by mocking `src/lib/supabase/client` (`jest.mock('../../client')`), and mock Expo Notifications/Constants/Device where needed. AsyncStorage is mocked globally in `jest.setup.ts`.
- Never hit the network, never use real credentials, never generate a real push token, never create live test users or persistent backend data.
- Prefer pure helpers (`src/lib/appData/selectors.ts`), services, and hooks over full-screen renders; extract small pure helpers when logic is buried in a context/component rather than rendering the whole provider tree.
- `supabase/functions/` is Deno code and stays outside the Jest run (tsconfig/ESLint/Jest all exclude it); a separate Deno test lane is a documented future addition.

The deployed Broadcast baseline was 211 tests across 31 suites and the pre-membership identity/auth-routing baseline was 296 tests across 43 suites. The current local implementation passes 840 tests across 75 suites, including production email readiness (invitation email secrets validated before issuing, app-scheme and https invitation links accepted by the app router, Resend rejected/unavailable/timeout mapping with code-only logs, saved-but-unsent invitation history, and Auth email-confirmation and email-service messages), rota push delivery (rota event selection, added-versus-changed recipients, freshness, per-device coalescing, Plan the Month batching, change-marker migration contract), announcement push delivery (kind-aware dispatch rules, recipient resolution, preference suppression, dedupe, self-exclusion, generic content, migration contract), team creation request idempotency, deterministic membership lifecycle, last-admin and cleanup-write concurrency, re-invitation, team creation/edit/archive/restore, zero-admin and optional-initial-admin contracts, church-admin-only team role management (promotion/demotion, final-leader demotion, zero-leader recovery, self-role change, archived rejection), AppData scope fencing, admin UI, and existing auth/chat/push regressions.

CI is `.github/workflows/ci.yml`, triggered on push to `main`, pull requests to `main`, and workflow_dispatch. It runs `npm ci`, `npm run typecheck`, `npm run lint`, `npm run test:ci`, `npm run check:migrations`, and `npx expo export` on Node 20. It is **check-only**: no secrets, no `.env` (the export intentionally exercises demo mode), and no deployments. Supabase migration pushes, Edge Function deploys, and EAS builds remain explicit, manually approved steps — do not add CD workflows without being asked. Future candidates (documented, not implemented): Maestro E2E smoke tests, a manually approved workflow_dispatch CD lane for Supabase migrations / Edge Function deploys, and EAS build automation.

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
- Supabase Auth, Postgres, RLS, shared-data Postgres Changes invalidation plus a separate private chat Broadcast manager (one accessible-team topic per team + one own-profile read topic) with a server-authoritative unread cursor/summary, private Storage, and the deployed kind-aware `send-chat-message-push` Edge Function (v7: chat messages, announcements, and rota updates) wired
- expo-notifications for device push token registration, deployed chat-message, announcement, and rota-update delivery; EAS project linked (`eas.json` + `extra.eas.projectId`)
- `@expo/vector-icons`
- Device-side push registration lives in `src/lib/notifications/`; chat, announcement, and rota-update delivery are deployed, but real Expo/device delivery remains pending physical-iPhone QA

---

## Architecture Patterns

### Authentication

Auth logic must remain abstracted behind `src/lib/auth/`.

Auth is dual-mode: demo login with hardcoded test profiles, and Supabase email/password Auth with open signup, session restore, an authenticated no-organisation state, and one server-validated active organisation profile. Locally, `user_accounts` owns the account-global name and active profile; existing `profiles` remain organisation identities and may share one `auth_user_id` across organisations, never within the same organisation. The forward migration drops the historical email auto-link trigger: signup creates no organisation access. Invitation acceptance requires the matching server-verified email; OAuth identities are supported only when already configured and matching, while phone-only identities are rejected. Mode selection and account/session mapping remain entirely inside `src/lib/auth/AuthContext.tsx`.

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

Supabase integration stays isolated in `src/lib/supabase/`. **Profile editing**, **team avatars**, governed **team memberships**, deployed **organisation membership/role management**, and deployed **team lifecycle** retain narrow RPC/service boundaries. `profiles.access_status` distinguishes active, unlinked directory, and removed history identities; remove/leave preserves the stable profile/global account/history/other organisations, revokes current roles/team memberships/profile push tokens, and repairs `active_profile_id` atomically. `list_organisation_members`, `set_organisation_member_role`, `remove_organisation_member`, and `leave_organisation` derive authority server-side and share an organisation-row lock for final-admin safety. Re-invitation reactivates the same removed profile with `general_member` only. Non-chat **shared live freshness** remains Postgres Changes invalidation through `sharedRealtime.ts`; the deployed publication carries 14 shared tables, including owner-RLS `user_accounts` invalidation for immediate active-scope teardown. **Chat unread state** remains server-authoritative through `get_team_chat_unread_summary()` and forward-only `mark_team_chat_read(p_team_id, p_message_id)`; direct read-state writes stay revoked. **Known deployed defect:** `mark_team_chat_read` has the same PL/pgSQL name-resolution bug the invitation acceptance fix removed (`on conflict (user_id, team_id)` shadowing its `team_id` result column), so every call fails with SQLSTATE 42702 on `shift-shepherd-dev` and the read cursor never advances; it is held by the allowlist in `invitationAcceptanceFixMigration.test.ts` and is scheduled as its own slice. `chatBroadcast.ts` uses exact private team/profile topics, strict minimal payloads, exact-message RLS fetches, dynamic membership reconciliation, and full account-switch teardown; demo opens none. The deployed identity slice retains narrow account/name/switch/create RPC services, app-owned seven-day invitation hashes, a service-role-only transactional acceptance boundary behind the JWT-validating Edge Function, and SecureStore/sessionStorage pending-link persistence. Push delivery is app-invoked and server-validated through the kind-aware `send-chat-message-push` Edge Function: `{ messageId }` after a chat send (unchanged) and `{ announcementId }` after an announcement is posted (Announcement Push Delivery V1, deployed 2026-09-17 as `send-chat-message-push` v6 behind `20260917110331`). Announcement recipients mirror the announcements SELECT policy (active linked same-organisation profiles; the team's members for team announcements; archived teams deliver nothing), the author is never notified, the existing `announcement_notifications`/`team_announcement_notifications` keys suppress delivery, the shared `push_notification_deliveries` ledger dedupes per (event, recipient, token), and payloads are generic (never announcement title/body). Rota Push Delivery V1 (deployed 2026-09-17 as `send-chat-message-push` v7 behind `20260917124856`; hosted-contract verified) adds `{ rotaEntryIds }`, sent once per live logical rota save (one entry create or edit, one cancel or restore, or one whole Plan the Month batch through `addRotaEntries`). The function requires every entry to belong to one active team of the caller's organisation that the caller may manage (team leader or church admin), notifies only active linked same-organisation current team members on those entries and never the caller, honours the existing `rota_notifications` key, and sends generic copy naming only the team: a `rota_assignment` event per assignment row created in the last five minutes, and a `rota_entry_change` event keyed by the trigger-maintained `rota_entries.details_change_id` marker (title, date, time, notes, or cancellation status changed in the last five minutes) for people already on that entry. Every ledger row newly claimed for one device in a request becomes one notification. Deleted entries, removed assignments, availability responses, and song selections notify nobody, and `event_reminders`/`availability_reminders` stay undelivered pending a product decision on their timing, cadence, and audience and approval of scheduled invocation. Push is an alert, never unread truth.

Team Creation & Editing V1 uses authenticated-only `create_team`, `update_team`, `archive_team`, and `restore_team` RPCs. They derive the active profile and organisation from the authenticated session and reserve lifecycle authority for active organisation church admins. Teams may have zero team admins; creation never adds the caller automatically, and the optional active same-organisation initial admin receives exactly one existing `team_leader` membership only when explicitly selected. `teams.archived_at` and `teams.archived_by` implement soft archive: ordinary active directories and team-scoped mutations exclude archived teams, while church admins receive an archived metadata list and can restore the same row, memberships, avatar, chat, rota, songs, and attribution. Team Creation Idempotency V1 (deployed behind `20260917093926_add_team_creation_idempotency.sql`; hosted-contract verified; manual app QA pending) replaces `create_team` with `create_team(p_name, p_description, p_initial_admin_profile_id, p_request_id uuid)`, which requires a client-generated key: the New Team screen mints one per logical submission (`newRequestId()` in `src/utils/ids.ts`), reuses it across retries of the same draft, and rotates it when the draft changes or the server reports a conflict; the service rejects non-UUID keys before any network call; the server stores the key on nullable `teams.create_request_id` (plus the request's initial-admin argument on `teams.create_request_initial_admin_id`) under a partial unique index on `(organisation_id, create_request_id)`, resolves a replay only inside the caller's server-derived organisation under the existing organisation lock, returns the same team and existing initial membership without re-inserting, raises `CREATE_REQUEST_MISMATCH` when the same key carries a different name, description, or initial-admin argument (compared symmetrically against the stored record), and keeps team names non-unique.

Team Role Management V1 (deployed behind `20260719110500_add_team_role_management.sql`; hosted-contract verified; manual app QA pending) adds authenticated-only `set_team_member_role(p_team_id, p_profile_id, p_role public.team_role)`. Authority is the active organisation church admin, server-derived — deliberately narrower than `can_manage_team`, so team leaders alone cannot promote or demote anyone (including themselves). The RPC locks the organisation-scoped team row (serializing with archive/restore and the remove/leave final-admin counts), rejects archived teams with `TEAM_ARCHIVED`, requires an existing active linked same-organisation membership, updates only that row's role idempotently, and never creates or removes a membership. Zero, one, or multiple team leaders are valid: the final leader may be deliberately demoted to a zero-leader team, a zero-leader team is recovered by promoting an existing member, and a church admin may change their own membership's role. The existing remove/leave final-leader protections are intentionally unchanged — releasing a final leader is demote-first. The UI is inline Make team admin / Remove team admin role actions on the existing Manage Members screen (confirmation dialogs, informational final-leader warning that never blocks, live-only with demo read-only). No notification is sent on role change.

The Supabase dev project is aligned remotely through deployed `20260917180127_fix_invitation_acceptance_role_conflict_target.sql` across 37 migrations; Invitation Acceptance Fix V1 is deployed to `shift-shepherd-dev` behind `20260917180127_fix_invitation_acceptance_role_conflict_target.sql` (applied 2026-09-17) and hosted-contract verified: before it, every first-time invitation acceptance failed with SQLSTATE 42702 because the baseline role insert's unqualified conflict target was ambiguous with the function's `organisation_id` result column, so nobody could join an organisation from an invitation; no stored row was ever affected, because the whole call rolled back. Native invitation QA on an iOS development build remains deferred. Push Token Lifecycle V1's live database contract is verified, and Team Creation & Editing V1, Team Role Management V1, Team Creation Idempotency V1, Announcement Push Delivery V1, and Rota Push Delivery V1 are deployed and hosted-contract verified. There is no local-only, remote-only, or repair migration entry. For Team Creation Idempotency V1, hosted verification on 2026-09-17 confirmed the deployed body is byte-identical to the migration (single `create_team(text, text, uuid, uuid)` overload, `SECURITY DEFINER`, `search_path=''`, owned by `postgres`, EXECUTE for `authenticated` only with none for `anon`, `service_role`, or `PUBLIC`), both nullable columns without a foreign key, the exact partial unique index, and unchanged policy/trigger/publication counts and RLS. A single transaction-scoped authenticated probe on the QA organisations (every mutation rolled back) passed: zero-admin create then same-key replay returned the same id with one team of that name; a new key with the same name created a second team; an initial-admin create then replay returned the same team and the same single `team_leader` membership; replaying that key with no admin, with a different admin, replaying the zero-admin key with an admin, and replaying with a different name each raised `CREATE_REQUEST_MISMATCH`; a null key raised `INVALID_REQUEST_ID`; a malformed key failed on the uuid cast (`22P02`); QA Admin C and QA Member B replaying Alpha's key each created a distinct team in their own organisation with zero visibility of Alpha's probe rows. Pre/post fingerprints (teams, memberships, profiles, organisation roles, active accounts) for Grace Community Church and the three QA organisations were identical with zero keyed rows remaining, Edge Functions stayed at `send-chat-message-push` v5 and `manage-organisation-invitations` v1, and advisors were unchanged apart from the `create_team` definer notice now carrying the new signature. Manual app QA of the retry path has not run. Announcement Push Delivery V1 is **deployed** to `shift-shepherd-dev` behind `20260917110331_add_announcement_push_delivery.sql` (applied 2026-09-17) and `send-chat-message-push` v6 (deployed from merge commit `4ecabb4`; `manage-organisation-invitations` stayed at v2); remote history aligns 35/35 with no local-only, remote-only, or repair entry. Hosted verification on 2026-09-17 confirmed the ledger CHECK accepts exactly `chat_message` and `announcement`, `service_role` holds read-only SELECT on `announcements` and `organisations`, `anon`/`authenticated` privileges, RLS, and the ledger's columns/indexes/policies/triggers are otherwise unchanged, and the v6 bundle (`index.ts` + `dispatch.ts`, `verify_jwt` on) matches the merged source. A transaction-scoped probe on QA Organisation Alpha (fixtures plus one church-wide and one team announcement created inside the transaction and rolled back; the Edge Function was never invoked and nothing was sent) showed the function's recipient set equals the RLS-visible readers minus the author, preference-suppressed profiles, and non-member church admins across base, per-kind preference, multi-path membership, linked-removal, and archived-team scenarios; unlinked and removed profiles are never recipients, and a replayed ledger claim inserts nothing. All 40 Grace Community Church/QA fingerprints matched with zero residue, and advisors were unchanged apart from usage-driven unused-index statistics. Accepted residual risks: a non-author caller receives 403 rather than 404 for an existing announcement id (mirroring the chat path), church admins who are not team members are not notified of team announcements, failed delivery rows are never retried, and a fire-and-forget call delayed past the five-minute freshness window is silently dropped. Physical-device announcement delivery QA has not run. Rota Push Delivery V1 is **deployed** to `shift-shepherd-dev` behind `20260917124856_add_rota_push_delivery.sql` (applied 2026-09-17) and `send-chat-message-push` v7 (deployed from merge commit `8b693d9`; `manage-organisation-invitations` stayed at v2); remote history aligns 36/36 with no local-only, remote-only, or repair entry. Hosted verification on 2026-09-17 confirmed the four-kind ledger CHECK, the paired nullable marker columns and the invoker change-marker trigger (`search_path=''`, no app-role EXECUTE), the two read-only `service_role` grants with app-role privileges, RLS, policies, indexes, the Realtime publication, and existing rows unchanged, and a v7 bundle identical to the merged source; a rolled-back probe on QA Organisation Alpha (the Edge Function was never invoked and nothing was sent) passed every trigger cell and every recipient-matrix cell (added versus changed recipients, actor, unlinked, removed, left-team, and cross-organisation exclusion, preference suppression, archived-team refusal, caller authority, and an idempotent ledger replay) with all 44 Grace Community Church/QA fingerprints unchanged and zero residue. Accepted residual risks: a role-only change for someone already on a date is labelled as a new assignment (the delete-and-insert save path is deliberately unchanged), and a save touching more than 50 entries is split into several requests (unreachable from the shipped screens). Physical-device rota delivery QA has not run. `manage-organisation-invitations` v3 (email readiness, deployed and hosted-verified 2026-09-17 after v2's UTC invitation-expiry presentation) and the kind-aware, active-profile-compatible `send-chat-message-push` v7 are deployed and ACTIVE; `RESEND_API_KEY`, `INVITATION_FROM_EMAIL`, `INVITATION_APP_BASE_URL`, and allowed invite redirects are configured; v3 validates those secrets before issuing and maps provider failures to bounded codes (owner actions for production email: `docs/production-email-readiness.md`). The membership SQL was applied and hosted-verified (schema, deterministic active backfill, RLS, function ACLs, publication, and 17 unchanged data fingerprints), but its destructive RPCs have never been executed against live data. The team lifecycle SQL passed hosted PostgreSQL compilation, function/ACL inspection, authenticated lifecycle probes, archive/restore, history preservation, RLS isolation, and database invariants (all mutations rolled back); its manual app QA remains pending; the deployed idempotency migration closes the ambiguous-retry duplicate-team risk. The team role SQL (applied 2026-09-17) passed hosted definition/ACL inspection and a transaction-scoped authenticated probe matrix on a disposable QA organisation (promotion, demotion, idempotency, final-leader demotion to zero, zero-leader recovery, self-role change, caller/target isolation, invalid role, unchanged remove/leave protections, archived rejection) with all mutations rolled back, every QA and Grace Community Church fingerprint unchanged, and only the expected definer-executable advisor notice added; its manual app QA remains pending. Disposable-account membership/role/remove/leave/re-invitation QA, live last-admin concurrency, team-lifecycle and team-role manual app QA, first real delivery/acceptance, disposable-account invitation/multi-org QA, genuine no-organisation device QA, and physical-iPhone push QA remain pending. Production invitation delivery is not approved and custom-scheme links are not production-ready. Never push migrations, deploy functions, change remote Auth/email settings, or send live invitations without explicit approval.

Never use or request service role keys; `.env.example` stays placeholder-only.

Supabase SQL and docs live under:

- `supabase/migrations/`
- `supabase/seed/`
- `supabase/README.md`
- `docs/supabase-integration-plan.md`

---

### iOS Simulator push-registration QA

Supported Xcode 14+ / macOS 13+ / iOS 16+ Simulator development builds are allowed to attempt Expo token registration; do not use `Device.isDevice` as a blanket iOS push gate. Runtime token failures must remain friendly and retryable. The iOS Simulator registration UI path was exercised on 2026-07-11: permission is requested only after the explicit tap and no raw token is shown, but simulator token reliability is limited. Registration state now hydrates from the versioned local persistence layer without prompting. Android QA is deferred and physical iPhone development-build QA is required to verify recipient token registration, Expo ticket creation, banner display, no self-notification, preference-off suppression, rebind, and sign-out revocation after deployment. Real push delivery covers chat messages, announcements, and rota updates (all deployed); all three remain unverified on physical devices until that QA passes, and event reminder or availability reminder delivery must not be added before then.

### Push token lifecycle (deployed; physical-device QA pending)

The active profile is the sole owner of this installation's Expo push token. Existing explicit opt-in is stored with Auth user/profile identity; registered UI is published only after server registration and durable local persistence both succeed. Push-specific read/write/clear failures remain observable to the lifecycle, and its latest durably saved in-memory snapshot can support sign-out when storage cannot be read. Generation-fenced, conditional persistence repair prevents old account/profile work from becoming the effective record after scope replacement; a different Auth account still must opt in explicitly. Push cleanup uses a bounded two-second deadline per dependency and cannot indefinitely block Supabase Auth sign-out. Account-scoped `unregister_push_token(p_token)` remains best-effort and can fail offline; local storage can also fail, but another account never trusts the stale record. `20260714200205_add_push_token_revocation.sql` is deployed and its live database contract is verified. Multi-profile notification fan-out is deferred, and native physical-device lifecycle/delivery QA remains required.

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

V1 is a functional scaffold with mocked, locally persisted data plus optional Supabase email/password Auth and the documented live slices. Storage is limited to profile avatars, team avatars, one announcement image, and one chat image per message. Shared-data Realtime is Postgres Changes invalidation-only and session-scoped; chat uses private team/profile Broadcast topics with a server-authoritative unread cursor/summary. Team Creation & Editing V1 lets church admins create zero-admin teams, optionally choose one initial team admin, edit identity, soft-archive teams, view archived metadata, and restore the same historical row; it is deployed but not manually QA-tested, and Team Creation Idempotency V1 (request-keyed replay-safe creation) is deployed and hosted-contract verified but not manually QA-tested. Team Role Management V1 lets church admins promote and demote existing team members (including final-leader demotion to zero leaders, zero-leader recovery, and self-role change) from the existing member-management screen; it is deployed and hosted-contract verified but not manually QA-tested. The deployed onboarding slice supports open signup, no-org creation, email-targeted church-admin invitations, and one active organisation at a time; Request to join, rich cross-org dashboards, new OAuth providers, phone invitations, profile merging/deletion, invitation approval queues, bulk invites, and team/role selection during acceptance remain deferred. Push delivery covers chat messages, announcements, and rota updates (all deployed), with physical-iPhone QA pending for all three; event and availability reminders await a product decision on timing, cadence, and audience plus approval of scheduled invocation. Demo/local mode intentionally remains supported.

Do not add these unless explicitly requested:

- Hard team deletion
- Team-role editing beyond the implemented church-admin-only `set_team_member_role` slice (no team-leader-driven role changes), or organisation-role expansion beyond the supported exclusive role catalog
- Invitation expansion beyond the implemented email-targeted church-admin V1
- Public organisation search, self-join, or Request-to-join backend
- Real OAuth
- Real SMS login
- Push delivery beyond team chat messages, announcements, and rota updates (event reminders, availability reminders, receipts polling, cron or queue delivery, broadcast tools)
- File uploads beyond profile/team avatars, one announcement image, and one chat image per message (no arbitrary files or galleries)
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
