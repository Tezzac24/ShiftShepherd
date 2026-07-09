# Supabase Migration Alignment Checkpoint

Checked on 2026-07-09 against the repo-configured Supabase MCP project.

## Safety Constraints

- No remote migrations were applied during this checkpoint.
- No Supabase secret key was used, requested, or written to disk.
- Do not put secrets into files. The Expo app uses only:
  - `EXPO_PUBLIC_SUPABASE_URL`
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- The service role key must never be used in the app or committed to the repo.

## Connected Project

- MCP project URL: `https://kqhhslsowhnaktygrcjc.supabase.co`
- Project ref: `kqhhslsowhnaktygrcjc`
- Local `.mcp.json` points the Supabase MCP server at this same ref.
- The connected database contains the dev seed shape for Grace Community Church:
  1 organisation, 8 profiles, 4 teams, 6 events, 7 announcements, 10 rota entries,
  and 10 songs. Treat this as the configured dev/test project for this repo.

## Local Migrations

- `001_initial_schema.sql`: creates the base schema, enums, tables, indexes,
  updated-at triggers, and cross-table consistency triggers.
- `002_rls_policies.sql`: enables RLS on every public app table and adds helper
  functions plus policies for organisations, profiles, roles, teams, events,
  announcements, rotas, songs, chat, notification preferences, and push tokens.
- `003_add_event_recurrence.sql`: adds event recurrence fields and constraints:
  `is_recurring`, `recurrence_rule`, `recurrence_label`, and
  `recurrence_end_date`.
- `004_add_choir_song_selection_section.sql`: adds
  `choir_rota_song_selections.section`, per-section ordering, section leader
  helper functions, and section-aware song selection write policies.
- `005_add_rota_entry_cancellation.sql`: adds `rota_entry_status` plus
  `rota_entries.status`, `cancelled_at`, `cancelled_by`, and
  `cancellation_reason` with consistency checks.
- `006_grant_authenticated_api_privileges.sql`: records the authenticated Data
  API grants needed for auth/profile lookup and live announcement CRUD.

## Remote Migration And Schema Status

The remote database was originally built by manually running SQL in the
Supabase dashboard SQL Editor. MCP reports an empty migration list, and
`to_regclass('supabase_migrations.schema_migrations')` is null. In other words,
the schema exists, but Supabase migration history is not tracking it.

Effectively present remotely:

- Migration 001 effects are present: the base tables/enums/triggers exist and
  contain seeded dev data.
- Migration 002 effects are present: RLS is enabled, the core helper functions
  exist, and the expected announcement policies exist.
- Migration 006 effects are already present from manual grants: `authenticated`
  has `USAGE` on `public`, `SELECT` on the auth/profile/organisation/team lookup
  tables, and `SELECT`, `INSERT`, `UPDATE`, `DELETE` on `announcements`.
  `anon` does not have table-level `SELECT`, `INSERT`, `UPDATE`, or `DELETE`
  on those app tables.

Missing remotely:

- Migration 003 is missing: `events.is_recurring` and recurrence columns are
  absent.
- Migration 004 is missing: `choir_rota_song_selections.section`,
  `can_manage_song_section(uuid,text)`, and section-aware song selection
  policies are absent.
- Migration 005 is missing: `rota_entry_status`, `rota_entries.status`, and
  cancellation columns are absent.

## Why Not Run `supabase db push` Blindly

Because the remote schema was created manually, the migration history is empty.
A blind `supabase db push` would not know that migrations 001 and 002 are
already effectively applied and could try to apply schema objects that already
exist. That risks failures, partial changes, or a confusing migration baseline.

Use live schema introspection as the source of truth until the migration history
is repaired or baselined.

## Alignment Options

1. Continue manual SQL temporarily.
   Paste approved migration SQL into the Supabase dashboard SQL Editor in order.
   This is lowest tooling risk while the dev project remains small, but it keeps
   migration history empty unless repaired later.

2. Use Supabase CLI migration repair/baseline later.
   After confirming the exact remote state, mark the already-applied migrations
   as applied in CLI history. Do this only with an explicit plan and a backup.

3. Apply missing migrations manually in order.
   For the current dev project, the safe manual order is `003`, `004`, `005`,
   then `006`. Migration `006` is idempotent as ordinary `GRANT` statements and
   should simply record the already-manual grant state.

4. Move to `supabase db push` only after history is reconciled.
   Once the remote migration history matches the actual schema state, use the
   CLI workflow for future migrations.

## Recommended Path Before Events

Do not wire live events yet. First, after explicit approval, apply `003`, `004`,
`005`, and `006` manually to the dev database, then verify:

- Current app behavior still works for demo/local mode.
- Supabase Auth still restores linked profiles.
- Live announcements still support the expected read/create/update/delete paths.
- `events` includes recurrence columns before any live events service is wired.

After that, either repair/baseline migration history or keep documenting manual
SQL until the project is ready for a clean CLI migration workflow.
