# Supabase Migration Alignment

**Current status on 2026-09-17: remote history is aligned through deployed `20260917124856_add_rota_push_delivery.sql`. All 36 remote migrations are applied, with no local-only, remote-only, or repair entry.**
This document preserves the earlier pre-Broadcast and membership-start checkpoints as history, then records the deployed invitation/onboarding, membership, push-token lifecycle, Team Creation & Editing V1, Team Role Management V1, Team Creation Idempotency V1, Announcement Push Delivery V1, and Rota Push Delivery V1 slices.
`20260710234443_add_push_delivery_foundation.sql` (the chat push delivery ledger + service_role grants) is pushed and verified; the matching `send-chat-message-push` Edge Function is deployed and ACTIVE with JWT verification (now v7, which also delivers announcements and rota updates through the widened ledger).
`20260711024931_harden_security_definer_functions.sql` through `20260712001940_add_invite_onboarding_identity_foundation.sql` are pushed and verified. Membership governance, shared freshness, server-authoritative unread, and private Broadcast passed their documented manual QA. `manage-organisation-invitations` v1 and active-profile-compatible `send-chat-message-push` v5 were deployed with that slice (now v3 and v7); invitation runtime secrets/redirects are configured and non-mutating smoke tests passed. Genuine no-organisation device QA, first real invitation delivery/acceptance, disposable-account invitation/multi-org QA, and physical-iPhone push QA remain pending.
Every timestamped migration (the events/rota/songs/chat/notification-preferences
grants, the Auth/profile auto-link `20260709233705`, the chat realtime publication
`20260710020944`, the chat read-states `20260710031212`, the profile avatar storage
`20260710105140`, the announcement image storage `20260710114621`, and the chat image
attachments `20260710124206` with its `20260710162415` permission fix) has been pushed
with explicit approval, verified, and covered by manual QA.

## Outcome (TL;DR)

- Remote `supabase_migrations.schema_migrations` now exists and records versions
  `001, 002, 003, 004, 005, 006`.
- Migrations `003`–`006` are applied remotely; `001`–`002` (originally run by hand)
  are back-filled into history.
- `supabase migration list` at the Organisation Membership & Role Management V1 preflight showed local/remote alignment through `20260712001940` with 29 migrations and no mismatch.
- The implementation generated `20260712103321_add_organisation_membership_role_management.sql` with the Supabase CLI. There are now 30 local migrations, and on 2026-07-12 a controlled deployment task applied exactly this one version — a dry run listed it alone, `supabase db push --yes` applied it in a single transaction, and no repair, seed, reset, or historical replay occurred. Local and remote history now match through `20260712103321`.
- A later controlled task deployed and live-contract-verified `20260714200205_add_push_token_revocation.sql`; remote history then contained 31 aligned versions through that migration. Native physical-device lifecycle/delivery QA remains pending.
- Team Creation & Editing V1 generated `20260715004513_add_team_creation_editing_and_archive.sql` with the CLI (version 32). A separate controlled task on 2026-07-16 pushed the seven reviewed commits and applied exactly this migration to `shift-shepherd-dev` via `supabase db push` in a single transaction — a dry run listed it alone, and no repair, reset, seed, Edge Function, Auth, secret, or Realtime change occurred. Local and remote history now match through `20260715004513`.
- The normal Supabase CLI workflow (`supabase migration new` → `supabase db push`) is
  now safe for future schema changes.

## Safety Constraints (still in force)

- The Expo app uses only:
  - `EXPO_PUBLIC_SUPABASE_URL`
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- The service role / secret key must never be used in the app or committed to the repo.
- Do not put secrets, `.env`, `.temp`, or backup dumps into the repo.

## Connected Project

- MCP/CLI project URL: `https://kqhhslsowhnaktygrcjc.supabase.co`
- Project ref: `kqhhslsowhnaktygrcjc`
- Local `.mcp.json` points the Supabase MCP server at this same ref.
- This is the configured **dev/test** project (Grace Community Church seed shape).

## Local Migrations

- `001_initial_schema.sql`: base schema, enums, tables, indexes, updated-at triggers,
  and cross-table consistency triggers.
- `002_rls_policies.sql`: enables RLS on every public app table and adds helper
  functions plus policies for organisations, profiles, roles, teams, events,
  announcements, rotas, songs, chat, notification preferences, and push tokens.
- `003_add_event_recurrence.sql`: event recurrence fields and constraints
  (`is_recurring`, `recurrence_rule`, `recurrence_label`, `recurrence_end_date`).
- `004_add_choir_song_selection_section.sql`: `choir_rota_song_selections.section`,
  per-section ordering, section-leader helper functions, and section-aware song
  selection write policies.
- `005_add_rota_entry_cancellation.sql`: `rota_entry_status` plus
  `rota_entries.status`, `cancelled_at`, `cancelled_by`, and `cancellation_reason`
  with consistency checks.
- `006_grant_authenticated_api_privileges.sql`: authenticated Data API grants for
  auth/profile lookup and live announcement CRUD. Grants nothing to `anon`.
- `20260710114621_add_announcement_image_storage.sql` (**pushed + QA'd**): private
  `announcement-images` bucket (JPEG/PNG/WebP, 5 MB), authenticated storage-object
  policies tied to announcement visibility/management, and no table change or RPC.
  `announcements.image_url` stores one optional storage path, never a signed URL.
- `20260710124206_add_chat_image_attachments.sql` (**pushed + QA'd**): reuses
  `chat_attachments` for one image per message, adds narrow SELECT/INSERT grants,
  private `chat-attachments` bucket policies, size/type/path enforcement, and
  two authenticated SECURITY INVOKER RPCs for safe image-only sends. No anon,
  message update/delete, arbitrary file, or multiple-attachment access.
- `20260710162415_fix_chat_image_attachment_permissions.sql` (**pushed + QA'd**):
  recreates the chat image upload policy with an explicitly qualified storage object
  path — the original policy's unqualified `name` resolved to `teams.name` inside its
  subquery and rejected every valid message-scoped upload path. Same private bucket,
  image/path checks, and team-access predicate.
- `20260710171200_add_push_token_registration.sql` (**pushed + DB/RPC-verified**): adds
  `register_push_token(p_token, p_platform)`, a narrow SECURITY DEFINER upsert onto
  the existing `push_tokens` table keyed on its globally-unique token column
  (validates the caller's linked profile, the `ExponentPushToken[…]` shape, and the
  platform; re-registering bumps `updated_at`; a shared device follows its current
  signed-in owner). Deliberately **no table-level grants** — the RPC is the only
  write path, RLS (002) stays authoritative, EXECUTE is revoked from public/anon and
  granted to authenticated only. No delivery, Edge Functions, or receipts.
- `20260711041539_add_profile_editing_and_team_avatars.sql` (**pushed + verified**): adds narrow authenticated-only `update_own_profile` and `set_team_avatar_path` SECURITY DEFINER RPCs, nullable constrained `teams.avatar_url`, and private 5 MB JPEG/PNG/WebP `team-avatars` policies. Team-avatar reads require team access and writes require team management. No anon or broad table write grants.
- `20260711050344_restrict_profile_editing_to_name.sql` (**pushed + verified**): drops the two-argument `update_own_profile(text, text)` and creates the name-only `update_own_profile(text)` (SECURITY DEFINER, empty search_path, authenticated-only EXECUTE). Phone remains read-only, stored values are untouched, and no phone-auth configuration changed.
- `20260711063412_add_team_membership_management.sql` (**pushed + verified + manual QA complete**): introduced authenticated-only `add_team_member(uuid, uuid)` and `remove_team_member(uuid, uuid)` with caller/organisation authority derived server-side and no direct membership writes.
- `20260711154126_refine_team_membership_governance.sql` (**pushed + verified + manual QA complete**): replaces `remove_team_member(uuid, uuid)` and adds `leave_team(uuid)` with identical canonical membership return fields. Target protection uses team role, church admins may remove only non-final team admins, team admins cannot remove peer admins, self-removal routes to Leave Team, and both leader-removal paths lock the team row before membership/count/delete. It explicitly narrows `team_memberships` to authenticated SELECT only and grants both RPCs to authenticated only. (The two multi-admin removal branches remain deferred until a safe multi-admin fixture exists.)
- `20260711154134_enable_shared_live_data_realtime.sql` (**pushed + verified + manual QA complete**): adds the 13 user-visible shared-data tables for announcements, events, rotas, songs, and directory/session access to `supabase_realtime`. Chat was separately published at this historical point; the later Broadcast migration removes only the two chat tables.
- `20260711173139_add_team_chat_read_cursor.sql` (**applied + immutable**): adds `chat_read_states.last_read_message_id` (server-derived read cursor), a deterministic rollout backfill, narrow authenticated-only SECURITY DEFINER mark/summary RPCs, and read-state write restrictions. Its cursor/RPC/backfill contracts remain unchanged.
- `20260711195143_migrate_chat_realtime_to_private_broadcast.sql` (**pushed + verified + manual QA complete**): adds canonical private `team-chat:<teamId>` and `profile-chat-read:<profileId>` Broadcast authorization through SELECT-only `realtime.messages` policies; adds locked-down database triggers that emit minimal v1 message/read invalidations; and removes only `chat_messages` and `chat_read_states` from `supabase_realtime`. There is no client send/INSERT policy or sensitive payload data. The two-user/multi-device, membership, reconnect/foreground, image, account-switch, and demo matrix passed.
- `20260712001940_add_invite_onboarding_identity_foundation.sql` (**deployed + verified**): adds account-global identity/active profile, multi-org uniqueness, deterministic backfill, display-name overrides, invitation lifecycle, verified-email acceptance, no-org organisation creation, and active-aware helpers/RPCs. `manage-organisation-invitations` v1 and active-profile-compatible `send-chat-message-push` v5 were deployed with it (now v3 and v7); invitation runtime configuration is present. Live invitation/no-org device QA remains deferred.
- `20260712103321_add_organisation_membership_role_management.sql` (**deployed + hosted-verified; live QA pending**): adds explicit active/removed profile access, active-profile repair, bounded church-admin directory/role/removal RPCs, caller-owned Leave organisation, same-row final-admin locking, removed-profile baseline re-invitation, direct-write hardening, and owner-RLS `user_accounts` invalidation. It retains stable identities/history/other organisations while revoking current roles, team memberships, and profile push tokens. Applied 2026-07-12 in one transaction. Hosted verification confirmed the enum/columns/constraint/indexes/trigger, a deterministic `active` backfill of every existing profile with empty removal audit, organisation-row and target-profile locks in the deployed function bodies, no `PUBLIC`/`anon` EXECUTE on any new function (internal repair and trigger validators are `postgres`-only), revoked direct authenticated writes, `user_accounts` published exactly once under owner-only RLS, and 17/17 matching pre/post data fingerprints with no application row mutated. Advisors gained only the four expected definer-executable notices and improved multiple-permissive-policies 6→5. Live membership/role/remove/leave/re-invitation QA and live last-admin concurrency remain pending.
- `20260714200205_add_push_token_revocation.sql` (**deployed + live-contract verified; device QA pending**): adds the account-scoped token revocation boundary used by the identity-bound, generation-fenced Push Token Lifecycle V1. The active profile is the sole installation-token owner; bounded sign-out cleanup cannot indefinitely block Auth. Native physical-device lifecycle and delivery QA remains pending.
- `20260715004513_add_team_creation_editing_and_archive.sql` (**deployed 2026-07-16; hosted-contract verified; manual app QA pending**): adds nullable `teams.archived_at`/`archived_by` (`profiles` FK `ON DELETE SET NULL`), active/archived listing indexes, active-only team access helpers, and authenticated-only `create_team`, `update_team`, `archive_team`, and `restore_team`. Authority is derived from the authenticated active profile/organisation and restricted to church admins. Teams may have zero team admins; the creator is not auto-added; an explicitly selected active same-organisation profile receives exactly one `team_leader` membership atomically. Archive deletes no row and restore reuses the same team/memberships/history. Its first hosted PostgreSQL execution passed schema, RPC/ACL, authenticated lifecycle-probe, archive/restore, history-preservation, RLS-isolation, and database-invariant verification (all probe mutations rolled back).
- `20260719110500_add_team_role_management.sql` (**deployed 2026-09-17; hosted-contract verified; manual app QA pending**): adds exactly one authenticated-only SECURITY DEFINER RPC, `set_team_member_role(p_team_id uuid, p_profile_id uuid, p_role public.team_role)`, returning the canonical membership row. Authority is the active organisation church admin (server-derived; team leaders alone get `NOT_AUTHORISED`; self-role change allowed). The organisation-scoped team-row lock serializes with archive/restore and the remove/leave final-admin counts; archived teams raise `TEAM_ARCHIVED`; the locked target must stay an existing active linked same-organisation membership; unchanged roles are idempotent; no membership is created or removed; there is deliberately no final-leader block, so demoting the final leader to a valid zero-leader team is allowed and recovery is promotion. No table/column/enum/policy/trigger/index/publication change and no data mutation. Applied 2026-09-17 as the only remote mutation of its deployment task, with no repair. Hosted verification on 2026-09-17 confirmed that the deployed function body matches the migration, that it is `SECURITY DEFINER` with `search_path=''` and owned by `postgres`, that EXECUTE is granted to `authenticated` only (none for `anon`, `service_role`, or `PUBLIC`), and that a single transaction-scoped authenticated probe on QA Organisation Alpha (fixtures created inside the transaction; every mutation rolled back) passed promotion, idempotent repeat, demotion, final-leader demotion to zero, zero-leader recovery, church-admin self promotion/demotion, cross-organisation target (`MEMBERSHIP_NOT_FOUND`) and unknown team (`TEAM_NOT_FOUND`), cross-organisation church-admin callers (`TEAM_NOT_FOUND`), team-leader-only and general-member callers (`NOT_AUTHORISED`), invalid-role rejection, unchanged `FINAL_TEAM_ADMIN_LEAVE_BLOCKED`/`FINAL_TEAM_ADMIN_REMOVAL_BLOCKED` protections with demote-then-leave succeeding, and `TEAM_ARCHIVED` after `archive_team`, with membership id/`created_at` preserved and no duplicate row. All pre/post fingerprints (profiles, teams, memberships, organisation roles, active profiles) for the three QA organisations and Grace Community Church matched, no residue remained, and advisors gained only the expected authenticated SECURITY DEFINER notice for the new RPC with no performance change. The invalid-role path is rejected by the `public.team_role` enum cast (`22P02`) before the authority check, which is accepted as-is (public enum shape only; the app client rejects invalid roles first). Manual app QA has not run.
- `20260917093926_add_team_creation_idempotency.sql` (**deployed 2026-09-17; hosted-contract verified; manual app QA pending**): adds nullable `teams.create_request_id` and `teams.create_request_initial_admin_id` (the keyed request's initial-admin argument, no foreign key) with the partial unique index `teams_organisation_create_request_id_key (organisation_id, create_request_id)`, drops `create_team(text, text, uuid)`, and recreates authenticated-only `create_team(p_name, p_description, p_initial_admin_profile_id, p_request_id uuid)` with the same response shape and hardening. Under the existing organisation lock it resolves a replayed key only inside the caller's organisation, returns the same team and existing initial membership without inserting, raises `CREATE_REQUEST_MISMATCH` for a key bound to different content (name, description, or the initial-admin argument compared symmetrically against the stored request record), and maps `unique_violation` to `CONFLICT_RETRY`. Team names stay non-unique; historical teams keep a null key; no policy, trigger, publication, helper, or existing row changes. Generated with `supabase migration new`; static contract tests verify all 33 earlier migration bytes unchanged. Applied 2026-09-17 as the only remote mutation of its deployment task, with no repair. Hosted verification on 2026-09-17 confirmed the deployed body is byte-identical to the migration (single `create_team(text, text, uuid, uuid)` overload, `SECURITY DEFINER`, `search_path=''`, owned by `postgres`, EXECUTE for `authenticated` only with none for `anon`, `service_role`, or `PUBLIC`), both nullable columns without a foreign key, the exact partial unique index, and unchanged policy/trigger/publication counts and RLS. A single transaction-scoped authenticated probe on the QA organisations (every mutation rolled back) passed: zero-admin create then same-key replay returned the same id with one team of that name; a new key with the same name created a second team; an initial-admin create then replay returned the same team and the same single `team_leader` membership; replaying that key with no admin, with a different admin, replaying the zero-admin key with an admin, and replaying with a different name each raised `CREATE_REQUEST_MISMATCH`; a null key raised `INVALID_REQUEST_ID`; a malformed key failed on the uuid cast (`22P02`); QA Admin C and QA Member B replaying Alpha's key each created a distinct team in their own organisation with zero visibility of Alpha's probe rows. Pre/post fingerprints (teams, memberships, profiles, organisation roles, active accounts) for Grace Community Church and the three QA organisations were identical with zero keyed rows remaining, Edge Functions stayed at `send-chat-message-push` v5 and `manage-organisation-invitations` v1, and advisors were unchanged apart from the `create_team` definer notice now carrying the new signature. Manual app QA of the retry path has not run.
- `20260917110331_add_announcement_push_delivery.sql` (**deployed 2026-09-17; hosted-contract verified; physical-device delivery QA pending**): drops and re-adds `push_notification_deliveries_event_type_check` as `event_type in ('chat_message', 'announcement')`, documents the polymorphic `event_id`, and grants `service_role` read-only SELECT on `public.announcements` and `public.organisations` for the kind-aware `send-chat-message-push` Edge Function. No function, policy, trigger, index, RLS, anon/authenticated privilege, or row change. Created with `supabase migration new`; static contract tests verify all 34 earlier migration bytes unchanged. Applied 2026-09-17 with no repair (remote history aligns 35/35), followed by `send-chat-message-push` v6 from merge commit `4ecabb4`; `manage-organisation-invitations` stayed at v2. Hosted verification on 2026-09-17 confirmed the recorded migration statements match the file, the exact widened CHECK, both grants, unchanged app-role privileges and RLS on the three affected tables, an otherwise unchanged ledger (12 columns, four indexes including the `NULLS NOT DISTINCT` idempotency index, no policies, foreign-key-only triggers), and a v6 bundle (`index.ts` + `dispatch.ts`, `verify_jwt` on) identical to the merged source. A transaction-scoped probe on QA Organisation Alpha (every fixture rolled back; the Edge Function was never invoked and nothing was sent) matched the function's recipient filters against RLS impersonation of every QA account across ten scenario cells, confirming per-kind preference keys, author and non-member church-admin exclusion, removed/unlinked exclusion, archived-team refusal, idempotent ledger replay, and the CHECK still rejecting other event types; all 40 Grace Community Church/QA fingerprints matched with zero residue. Security advisors were unchanged and performance advisors changed only in usage-driven unused-index statistics (24 to 20). Accepted residual risks: 403 rather than 404 for a non-author caller on an existing announcement id, no notification for non-member church admins on team announcements, no retry of failed delivery rows, and silent drop of a call delayed past the five-minute freshness window.
- `20260917124856_add_rota_push_delivery.sql` (**deployed 2026-09-17; hosted-contract verified; physical-device delivery QA pending**): adds nullable `rota_entries.details_change_id`/`details_changed_at` (paired by `rota_entries_details_change_marker_check`) maintained by the invoker `BEFORE INSERT OR UPDATE` trigger `rota_entries_track_details_change` (cleared on insert, re-issued only when title, date, time, notes, or status change, otherwise preserved), widens `push_notification_deliveries_event_type_check` to `('chat_message', 'announcement', 'rota_assignment', 'rota_entry_change')`, and grants `service_role` read-only SELECT on `public.rota_entries` and `public.rota_assignments`. No policy, index, RLS, anon/authenticated privilege, or row change. Created with `supabase migration new`; static contract tests verify all 35 earlier migration bytes unchanged. Applied 2026-09-17 with no repair after a dry run that listed only this migration (remote history aligns 36/36), followed by `send-chat-message-push` v7 from merge commit `8b693d9`; `manage-organisation-invitations` stayed at v2. Hosted verification on 2026-09-17 confirmed the exact four-kind CHECK, the marker columns and CHECK, the trigger and its invoker function (`search_path=''`, owned by `postgres`, no EXECUTE for `anon`, `authenticated`, or `PUBLIC`, body matching the migration after line-ending normalisation), the two grants as the only privilege change, unchanged RLS/policies/indexes/Realtime publication, existing rota and ledger rows hashing identically before and after the migration, and a v7 bundle identical to the merged source. A transaction-scoped probe on QA Organisation Alpha (every fixture rolled back; the Edge Function was never invoked and nothing was sent) passed every change-marker cell (insert, no-op, non-relevant update, forged values, title/date/time/notes/cancel/restore) and every recipient-matrix cell (newly added versus pre-existing assignees, actor/unlinked/removed/left-team/cross-organisation exclusion, preference suppression, archived-team refusal, caller authority, idempotent ledger replay, a later change as a new event, the CHECK rejecting other kinds, app-role denials); all 44 Grace Community Church/QA fingerprints matched with zero residue. Security advisors were unchanged and performance advisors changed only in usage-driven unused-index statistics (20 to 19). Accepted residual risks: a role-only change for someone already on a date is labelled as a new assignment (the delete-and-insert save path is deliberately unchanged, so availability responses keep resetting on role changes), a save touching more than 50 entries is split into several requests (unreachable from the shipped screens), deleted entries and removed assignees notify nobody, non-member church admins are not notified, a non-manager caller receives 403 rather than 404, and failed rows are never retried. `event_reminders` and `availability_reminders` remain undelivered pending a product decision on timing, cadence, and audience and approval of scheduled invocation.

## iOS Simulator registration QA correction

On supported Xcode 14+ / macOS 13+ / iOS 16+ versions, the iOS Simulator development build is allowed to attempt notification permission and Expo token registration. Token acquisition failures remain friendly and retryable rather than being pre-blocked.

**iOS Simulator UI exercise (2026-07-11):** the live Device notifications card appears, the OS permission prompt only follows the button tap, and no raw token is ever shown. Simulator token behavior is not reliable enough to mark real delivery QA complete. Android QA is deferred and physical iPhone development-build QA remains required. Known accepted polish deferral: the card's "registered" state is session-only and does not persist after leaving and returning to the screen — re-registering succeeds, which is fine for now. Real push delivery is deployed narrowly for chat messages and announcements (`send-chat-message-push` v6).

## How Alignment Was Done

The remote database was originally built by running SQL by hand in the dashboard SQL
editor, so `supabase_migrations.schema_migrations` did not exist. Before alignment,
introspection confirmed: `001`/`002` effects present, `006` grants already present
(manual), and `003`/`004`/`005` effects missing.

Alignment steps (dev project, 2026-07-09), all via the Supabase CLI:

1. `supabase link --project-ref kqhhslsowhnaktygrcjc`.
2. `supabase migration list` (read-only gate): confirmed the CLI parses `001`–`006`
   and that remote history was empty.
3. `supabase migration repair --status applied 001 002` — recorded the already-present
   migrations in history **without** running their SQL.
4. `supabase db push` — applied `003`, `004`, `005`, `006` in order. `006` re-ran its
   idempotent `GRANT`s as a harmless no-op.
5. `supabase migration list` — confirmed `001`–`006` on both sides.

Note: `supabase db dump` backups were **skipped** because Docker was unavailable on the
machine (see Docker section). The migrations are additive (`003`/`004`/`005`) or
idempotent (`006`), so there was no destructive surface; the project's automatic daily
backups (Dashboard → Database → Backups) are the safety net.

## Verification (MCP introspection, post-push)

- `supabase_migrations.schema_migrations` exists; `version` set = `{001,002,003,004,005,006}`.
- `003`: `events.is_recurring` + `events_recurring_requires_rule_and_label` present.
- `004`: `choir_rota_song_selections.section`, `can_manage_song_section(...)`, the new
  per-section index, and the section-aware policies present; the pre-004 index and
  "song leaders" policies were correctly dropped.
- `005`: `rota_entry_status` type, `rota_entries.status`, and the cancellation
  consistency constraint present.
- `006`: `authenticated` has `SELECT/INSERT/UPDATE/DELETE` on `announcements`; `anon`
  has **no** data grants (only Postgres/Supabase default `REFERENCES/TRIGGER/TRUNCATE`,
  none reachable via the Data API).
- Announcements integrity intact: RLS enabled, `body` and `pinned` columns present.

## Migration Filename Rule (important)

**Do not rename `001`–`006`.** Remote migration history now records those exact version
strings (`001` … `006`). Renaming the local files (e.g. to 14-digit timestamps) would
make the CLI treat them as new, unapplied versions that no longer match remote history,
and the next `supabase db push` would try to re-run everything — causing conflicts.

**For future migrations, use the standard Supabase CLI timestamped convention:** run
`supabase migration new <descriptive_name>` and leave the generated filename unchanged.
Timestamped versions sort after `006`, so they interleave cleanly with the existing
numeric files. Never edit a migration that has already been applied — add a new one.

`npm run check:migrations` (also run by CI) is an **offline** guard over these rules:
it validates that every file in `supabase/migrations/` matches the legacy `NNN_*.sql`
or timestamped `YYYYMMDDHHMMSS_*.sql` shape with no duplicate versions. It never
connects to Supabase and does not replace `npx supabase migration list`, which remains
the authenticated way to verify local/remote alignment.

## Docker Requirements

Docker is **not** required for the normal hosted-dev migration workflow. These connect
directly to the remote database:

- `supabase migration list`
- `supabase migration repair`
- `supabase migration new`
- `supabase db push`

Docker **is** required for the following (they run a local Postgres/edge container):

- `supabase db dump`
- `supabase db diff`
- `supabase db reset`
- `supabase start` (local stack)
- local Edge Functions serving where applicable

So a Docker-blocked machine can still perform migration history and schema-push work
against hosted dev; only local-stack and dump/diff/reset operations need Docker.

## Result

The remote dev schema and migration history are aligned through deployed `20260917124856` across 36 remote versions, and there is no local-only, remote-only, or repair entry. Team Creation Idempotency V1, Announcement Push Delivery V1, and Rota Push Delivery V1 are deployed and hosted-contract verified. Push Token Lifecycle V1's database contract is live-verified, and Team Creation & Editing V1 and Team Role Management V1 are deployed and hosted-contract verified. Neither the Team Creation & Editing V1 nor the Team Role Management V1 deployment changed any Edge Function, Auth/email, secret, Realtime, invitation, or real-organisation data. The Announcement Push Delivery V1 deployment changed only the ledger constraint, two service-role read grants, and `send-chat-message-push` (now v6); its rolled-back hosted probe left every Grace Community Church and QA fingerprint unchanged. The Rota Push Delivery V1 deployment changed only the rota change marker (two nullable columns, a CHECK, and an invoker trigger), the ledger constraint, two service-role read grants, and `send-chat-message-push` (now v7); its rolled-back hosted probe likewise left every fingerprint unchanged with zero residue. The Production Email & Invitation Delivery Readiness V1 deployment (2026-09-17) changed only `manage-organisation-invitations` (now v3); it added no migration, changed no Auth/email setting or secret, sent no invitation or email, and left every fingerprint and advisor unchanged.
Private chat Broadcast is live, its deployment/security checks passed, and the full
documented manual QA matrix passed; chat no longer uses Postgres Changes. The shared-data
publication now carries 14 tables — the original 13 plus owner-RLS `user_accounts` — and
the chat tables remain outside it. The current implementation (through the deployed Production Email & Invitation Delivery Readiness V1) exports for Android, iOS, and web; its deterministic suite passes 806/73.
The historical deployed Broadcast baseline was 211 tests across 31 suites.

The deployed `20260712001940_add_invite_onboarding_identity_foundation.sql` and
`manage-organisation-invitations` (v1; v2 since the 2026-09-17 UTC expiry-presentation deploy; v3 since the 2026-09-17 email-readiness deploy) implement open signup/no-org/create-org,
global identity, active multi-org profiles, app-owned seven-day invitations, matching
verified-email acceptance, and display-name ownership. Remote Auth redirects, email
provider secrets, allowed redirects, and sender configuration are now present; non-mutating
function smoke tests passed. No live invitation acceptance/delivery QA has occurred.
`send-chat-message-push` v5 added the active-profile-compatible sender resolution
without changing delivery semantics; v6 (2026-09-17) keeps it and adds announcement delivery, and v7 (2026-09-17) adds rota-update delivery.

The pre-membership regression suite passed 296 tests across 43 suites, compared with
the deployed Broadcast baseline of 211/31. The current implementation passes
806 tests across 73 suites. Commits `420e12f` and `bf6a538` repaired auth sign-out
persistence and account-bootstrap routing races; `c54da51` implements the membership
slice, `7628569` hardens invalidation when a non-active organisation is removed, and
`ad09ae9` serializes team/token creation with removal cleanup.

The independent read-only review and the controlled deployment of `20260715004513` to `shift-shepherd-dev` are complete: the seven reviewed commits were pushed, the migration was applied, and hosted RPC/ACL/archive/history/database-invariant verification passed (all probe mutations rolled back). The exact next team-lifecycle task is manual app QA of team create/edit/avatar/archive/restore. The independent read-only review and controlled deployment of Team Role Management V1 (`20260719110500`) are also complete: the migration was applied on 2026-09-17 as the only remote mutation, and hosted RPC/ACL/authority/role-transition/final-leader-demotion/zero-leader-recovery/archived-rejection/cross-organisation-isolation/invariant verification passed with all probe mutations rolled back and every fingerprint unchanged. Its exact next task is manual app QA of promote/demote/zero-leader recovery. The controlled deployment of Team Creation Idempotency V1 (`20260917093926`) is also complete: the migration was applied on 2026-09-17 as the only remote mutation, and hosted definition/ACL/index/replay/mismatch/cross-organisation/invariant verification passed with all probe mutations rolled back and every fingerprint unchanged. Its exact next task is manual app QA of the create-retry path. The deployed membership slice still needs disposable-account member-list, role, last-admin, remove/leave, active-profile, re-invitation, access-loss, stale-channel, invitation, and push regression scenarios. Its destructive RPCs have never been executed against live data and live last-admin concurrency has never been run, so no claim is made that removal, leave, role management, or re-invitation works end to end.
Genuine no-organisation device QA and disposable-account open-signup/invitation/multi-org
QA remain deferred; do not invite real users before those scenarios pass. Production
invitation delivery is not approved and custom-scheme links are not production-ready.
Both Announcement Images V1 and Chat Image Attachments V1
passed manual QA (after the `20260710162415` permission fix: members can send images
in their teams, admins in teams they administer, non-members stay blocked, and text
chat/realtime/unread tracking still work). Chat supports exactly one optional image
per message — no arbitrary files, audio/video, galleries, camera capture, full-screen
viewer, or message edit/delete. **Push Token Registration V1** and its migration
`20260710171200_add_push_token_registration.sql` are pushed and DB/RPC-verified;
the iOS Simulator registration UI path was exercised on 2026-07-11, though token
reliability remains limited (Android and physical iPhone QA deferred). **Chat Message
Push Delivery V1** is deployed: the `send-chat-message-push` Edge Function is ACTIVE
with JWT verification and `20260710234443_add_push_delivery_foundation.sql` is pushed.
Backend QA verified invocation, sender exclusion, recipient/team selection, preference
handling, and safe `no_push_token` skips without token/message leakage. Physical iPhone
development-build QA must still verify a recipient token, Expo ticket, banner, no
self-notification, and preference-off suppression. **Announcement Push Delivery V1** (`20260917110331`, first shipped in `send-chat-message-push` v6) and **Rota Push Delivery V1** (`20260917124856` plus `send-chat-message-push` v7) are deployed and hosted-contract verified through the same function and ledger; do not add event or availability reminder delivery until that device QA passes.
