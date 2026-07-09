# Supabase Backend Foundation

This folder holds the database foundation for Shift Shepherd's intended production backend. **The app is partially wired to Supabase**: auth + profile lookup and the **announcements** feature slice run live (when `EXPO_PUBLIC_SUPABASE_*` env vars are configured); everything else still runs on mock data (`src/lib/mockData/` + `src/lib/appData/`). See `docs/supabase-integration-plan.md` for the wiring order.

> **Current dev-project state:** migrations `001`–`002` were applied manually via the dashboard SQL editor, so there is **no tracked migration history** (`supabase_migrations.schema_migrations` doesn't exist). Migrations `003`–`005` are **not applied remotely yet** and should be, before events/songs/rota-cancellation are wired. Until history is tracked, verify the remote schema by introspection (the Supabase MCP server works well for this) rather than trusting migration history.

## Contents

```
supabase/
├── migrations/
│   ├── 001_initial_schema.sql   # 18 tables, enums, FKs, indexes, triggers
│   ├── 002_rls_policies.sql     # helper functions + RLS for every table
│   ├── 003_add_event_recurrence.sql # event recurrence metadata
│   ├── 004_add_choir_song_selection_section.sql # praise/worship sections + section-level RLS
│   └── 005_add_rota_entry_cancellation.sql # rota entry status + cancellation fields
├── seed/
│   ├── dev_seed.sql             # mock data ported to SQL (relative dates)
│   └── README.md                # how to seed + link Supabase Auth users
└── README.md
```

Migrations apply in numeric order (`001` → `005`).

Choir-specific rules worth knowing:

- `choir_rota_song_selections.section` splits a date's set list into `praise` and `worship`. RLS lets the assigned **Praise Leader** manage praise rows, the **Worship Leader** manage worship rows, a legacy **Song Leader** manage both, and the choir team leader / church admin manage everything (`can_manage_song_section()` in migration 004).
- `rota_entries.status` marks cancelled dates (e.g. a called-off rehearsal) instead of deleting them; cancelling is a plain update already covered by the leaders-manage-rota policy. Members keep updating only their own `availability_responses`.
- A choir rehearsal is just a rota entry where every choir member has a `'Choir Member'` assignment — availability tracking needs no extra tables.

## Design in one paragraph

The schema mirrors `src/types/index.ts` one-to-one (snake_case, same names) so swapping mock records for Supabase rows is mechanical. Every top-level table carries `organisation_id` for future multi-church support; child tables (assignments, responses, links, selections, attachments) reach their organisation through their parent. RLS is the server-side twin of `src/lib/permissions/index.ts`: a set of `security definer` helper functions (`is_team_member`, `is_church_admin`, `can_select_songs`, …) that policies compose, keyed off `auth.uid()` → `profiles.auth_user_id`.

## Getting started (when you're ready)

1. Install the [Supabase CLI](https://supabase.com/docs/guides/cli) and run `supabase init` in the repo root (keeps this folder; generates `config.toml`).
2. `supabase start` for a local stack, or `supabase link --project-ref <ref>` for a hosted dev project.
3. Apply migrations:
   - **Supabase CLI:** first copy or rename the migration files to the CLI's `<14-digit-timestamp>_name.sql` convention (keeping order, e.g. `20260707000001_initial_schema.sql` … `20260707000005_add_rota_entry_cancellation.sql`), then run `supabase db reset` locally or `supabase db push` for a hosted dev project.
   - **Dashboard SQL editor:** paste each migration in numeric order (`001` → `005`).
4. Seed dev data and link auth users — see `seed/README.md`.
5. Copy `.env.example` to `.env` and fill in your project URL and anon key (the anon key is safe to ship in the app; RLS is the security boundary).

## Verifying RLS quickly

In the dashboard SQL editor you can impersonate a user:

```sql
-- pretend to be Sarah (after linking her auth user)
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select auth_user_id from profiles where email = 'sarah@gracecommunity.church'), 'role', 'authenticated')::text,
  true);
set local role authenticated;

select name from teams;          -- expect: Choir only (not admin)
select count(*) from songs;      -- expect: 10 (choir member)
rollback;
```

A fuller test matrix lives in `docs/supabase-integration-plan.md`.

## Non-negotiables

- **Never** put the service role key in the app or in `EXPO_PUBLIC_*` variables.
- **Never** run `dev_seed.sql` against production.
- Schema changes go through new numbered migration files — don't edit applied ones.
