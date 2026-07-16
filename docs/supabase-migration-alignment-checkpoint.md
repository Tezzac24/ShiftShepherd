# Supabase Migration Alignment

**Current status on 2026-07-16: remote history is aligned through deployed `20260715004513_add_team_creation_editing_and_archive.sql`. All 32 remote migrations are applied, with no local-only, remote-only, or repair entry.**
This document preserves the earlier pre-Broadcast and membership-start checkpoints as history, then records the deployed invitation/onboarding, membership, push-token lifecycle, and Team Creation & Editing V1 slices.
`20260710234443_add_push_delivery_foundation.sql` (the chat push delivery ledger + service_role grants) is pushed and verified; the matching `send-chat-message-push` Edge Function is deployed and ACTIVE with JWT verification.
`20260711024931_harden_security_definer_functions.sql` through `20260712001940_add_invite_onboarding_identity_foundation.sql` are pushed and verified. Membership governance, shared freshness, server-authoritative unread, and private Broadcast passed their documented manual QA. `manage-organisation-invitations` v1 and active-profile-compatible `send-chat-message-push` v5 are ACTIVE; invitation runtime secrets/redirects are configured and non-mutating smoke tests passed. Genuine no-organisation device QA, first real invitation delivery/acceptance, disposable-account invitation/multi-org QA, and physical-iPhone push QA remain pending.
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
- `20260712001940_add_invite_onboarding_identity_foundation.sql` (**deployed + verified**): adds account-global identity/active profile, multi-org uniqueness, deterministic backfill, display-name overrides, invitation lifecycle, verified-email acceptance, no-org organisation creation, and active-aware helpers/RPCs. `manage-organisation-invitations` v1 and active-profile-compatible `send-chat-message-push` v5 are deployed; invitation runtime configuration is present. Live invitation/no-org device QA remains deferred.
- `20260712103321_add_organisation_membership_role_management.sql` (**deployed + hosted-verified; live QA pending**): adds explicit active/removed profile access, active-profile repair, bounded church-admin directory/role/removal RPCs, caller-owned Leave organisation, same-row final-admin locking, removed-profile baseline re-invitation, direct-write hardening, and owner-RLS `user_accounts` invalidation. It retains stable identities/history/other organisations while revoking current roles, team memberships, and profile push tokens. Applied 2026-07-12 in one transaction. Hosted verification confirmed the enum/columns/constraint/indexes/trigger, a deterministic `active` backfill of every existing profile with empty removal audit, organisation-row and target-profile locks in the deployed function bodies, no `PUBLIC`/`anon` EXECUTE on any new function (internal repair and trigger validators are `postgres`-only), revoked direct authenticated writes, `user_accounts` published exactly once under owner-only RLS, and 17/17 matching pre/post data fingerprints with no application row mutated. Advisors gained only the four expected definer-executable notices and improved multiple-permissive-policies 6→5. Live membership/role/remove/leave/re-invitation QA and live last-admin concurrency remain pending.
- `20260714200205_add_push_token_revocation.sql` (**deployed + live-contract verified; device QA pending**): adds the account-scoped token revocation boundary used by the identity-bound, generation-fenced Push Token Lifecycle V1. The active profile is the sole installation-token owner; bounded sign-out cleanup cannot indefinitely block Auth. Native physical-device lifecycle and delivery QA remains pending.
- `20260715004513_add_team_creation_editing_and_archive.sql` (**deployed 2026-07-16; hosted-contract verified; manual app QA pending**): adds nullable `teams.archived_at`/`archived_by` (`profiles` FK `ON DELETE SET NULL`), active/archived listing indexes, active-only team access helpers, and authenticated-only `create_team`, `update_team`, `archive_team`, and `restore_team`. Authority is derived from the authenticated active profile/organisation and restricted to church admins. Teams may have zero team admins; the creator is not auto-added; an explicitly selected active same-organisation profile receives exactly one `team_leader` membership atomically. Archive deletes no row and restore reuses the same team/memberships/history. Its first hosted PostgreSQL execution passed schema, RPC/ACL, authenticated lifecycle-probe, archive/restore, history-preservation, RLS-isolation, and database-invariant verification (all probe mutations rolled back).

## iOS Simulator registration QA correction

On supported Xcode 14+ / macOS 13+ / iOS 16+ versions, the iOS Simulator development build is allowed to attempt notification permission and Expo token registration. Token acquisition failures remain friendly and retryable rather than being pre-blocked.

**iOS Simulator UI exercise (2026-07-11):** the live Device notifications card appears, the OS permission prompt only follows the button tap, and no raw token is ever shown. Simulator token behavior is not reliable enough to mark real delivery QA complete. Android QA is deferred and physical iPhone development-build QA remains required. Known accepted polish deferral: the card's "registered" state is session-only and does not persist after leaving and returning to the screen — re-registering succeeds, which is fine for now. Real Push Delivery V1 is deployed narrowly for chat messages only.

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

The remote dev schema and migration history are aligned through deployed `20260715004513` across 32 versions; there is no local-only, remote-only, or repair entry. Push Token Lifecycle V1's database contract is live-verified and Team Creation & Editing V1 is deployed and hosted-contract verified. The Team Creation & Editing V1 deployment changed no Edge Function, Auth/email, secret, Realtime, invitation, or real-organisation data.
Private chat Broadcast is live, its deployment/security checks passed, and the full
documented manual QA matrix passed; chat no longer uses Postgres Changes. The shared-data
publication now carries 14 tables — the original 13 plus owner-RLS `user_accounts` — and
the chat tables remain outside it. The current local Team Creation & Editing V1 export passes for Android, iOS, and web; its deterministic suite passes 515/59.
The historical deployed Broadcast baseline was 211 tests across 31 suites.

The deployed `20260712001940_add_invite_onboarding_identity_foundation.sql` and
`manage-organisation-invitations` v1 implement open signup/no-org/create-org,
global identity, active multi-org profiles, app-owned seven-day invitations, matching
verified-email acceptance, and display-name ownership. Remote Auth redirects, email
provider secrets, allowed redirects, and sender configuration are now present; non-mutating
function smoke tests passed. No live invitation acceptance/delivery QA has occurred.
`send-chat-message-push` v5 includes the active-profile-compatible sender resolution
without changing delivery semantics.

The pre-membership regression suite passed 296 tests across 43 suites, compared with
the deployed Broadcast baseline of 211/31. The current local implementation passes
515 tests across 59 suites. Commits `420e12f` and `bf6a538` repaired auth sign-out
persistence and account-bootstrap routing races; `c54da51` implements the membership
slice, `7628569` hardens invalidation when a non-active organisation is removed, and
`ad09ae9` serializes team/token creation with removal cleanup.

The independent read-only review and the controlled deployment of `20260715004513` to `shift-shepherd-dev` are complete: the seven reviewed commits were pushed, the migration was applied, and hosted RPC/ACL/archive/history/database-invariant verification passed (all probe mutations rolled back). The exact next team-lifecycle task is manual app QA of team create/edit/avatar/archive/restore. The deployed membership slice still needs disposable-account member-list, role, last-admin, remove/leave, active-profile, re-invitation, access-loss, stale-channel, invitation, and push regression scenarios. Its destructive RPCs have never been executed against live data and live last-admin concurrency has never been run, so no claim is made that removal, leave, role management, or re-invitation works end to end.
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
self-notification, and preference-off suppression; do not expand beyond chat until then.
