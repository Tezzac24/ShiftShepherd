# Supabase Migration Alignment

**Status: aligned through `20260710234443` on 2026-07-11** against the repo-configured Supabase MCP/CLI dev project.
This document records the completed remote checkpoint, including Chat Message Push Delivery V1, and the rules that keep history aligned.
`20260710234443_add_push_delivery_foundation.sql` (the chat push delivery ledger + service_role grants) is pushed and verified; the matching `send-chat-message-push` Edge Function is deployed and ACTIVE with JWT verification.
**One migration is currently local-only:** `20260711024931_harden_security_definer_functions.sql` revokes inherited anon/default-PUBLIC execution from RLS helpers, preserves authenticated execution required by policies and the two privileged app RPCs, removes app-role execution from trigger helpers, and pins function search paths. It awaits an explicitly approved push and verification pass.
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
- `supabase migration list` shows every migration through `20260710171200` on **both** local and remote.
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

The remote dev schema matches the repo migrations through `20260710171200`, migration
history is tracked, and both Announcement Images V1 and Chat Image Attachments V1
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
