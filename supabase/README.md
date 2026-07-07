# Supabase Backend Foundation

This folder holds the database foundation for Shift Shepherd's intended production backend. **The app is not wired to Supabase yet** — it still runs entirely on mock data (`src/lib/mockData/` + `src/lib/appData/`). These files exist so the backend can be stood up and verified independently before any frontend wiring begins (see `docs/supabase-integration-plan.md` for the wiring order).

## Contents

```
supabase/
├── migrations/
│   ├── 001_initial_schema.sql   # 18 tables, enums, FKs, indexes, triggers
│   └── 002_rls_policies.sql     # helper functions + RLS for every table
├── seed/
│   ├── dev_seed.sql             # mock data ported to SQL (relative dates)
│   └── README.md                # how to seed + link Supabase Auth users
└── README.md
```

## Design in one paragraph

The schema mirrors `src/types/index.ts` one-to-one (snake_case, same names) so swapping mock records for Supabase rows is mechanical. Every top-level table carries `organisation_id` for future multi-church support; child tables (assignments, responses, links, selections, attachments) reach their organisation through their parent. RLS is the server-side twin of `src/lib/permissions/index.ts`: a set of `security definer` helper functions (`is_team_member`, `is_church_admin`, `can_select_songs`, …) that policies compose, keyed off `auth.uid()` → `profiles.auth_user_id`.

## Getting started (when you're ready)

1. Install the [Supabase CLI](https://supabase.com/docs/guides/cli) and run `supabase init` in the repo root (keeps this folder; generates `config.toml`).
2. `supabase start` for a local stack, or `supabase link --project-ref <ref>` for a hosted dev project.
3. Apply migrations:
   - **Local:** `supabase db reset` (runs migrations + configured seed).
   - **Hosted:** rename the migration files to the CLI's `<14-digit-timestamp>_name.sql` convention (keeping order, e.g. `20260707000001_initial_schema.sql`, `20260707000002_rls_policies.sql`) and `supabase db push` — or paste them into the dashboard SQL editor in order.
4. Seed dev data and link auth users — see `seed/README.md`.
5. Copy `.env.example` to `.env` and fill in your project URL and anon key (the anon key is safe to ship in the app; RLS is the security boundary).

## Verifying RLS quickly

In the dashboard SQL editor you can impersonate a user:

```sql
-- pretend to be Sarah (after linking her auth user)
select set_config('request.jwt.claims',
  json_build_object('sub', (select auth_user_id from profiles where email = 'sarah@gracecommunity.church'), 'role', 'authenticated')::text,
  true);
set local role authenticated;

select name from teams;          -- expect: Choir only (not admin)
select count(*) from songs;      -- expect: 10 (choir member)
```

A fuller test matrix lives in `docs/supabase-integration-plan.md`.

## Non-negotiables

- **Never** put the service role key in the app or in `EXPO_PUBLIC_*` variables.
- **Never** run `dev_seed.sql` against production.
- Schema changes go through new numbered migration files — don't edit applied ones.
