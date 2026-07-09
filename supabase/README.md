# Supabase Backend Foundation

This folder holds the database foundation for Shift Shepherd's intended production backend. **The app is partially wired to Supabase**: auth + live sessions, the **announcements**, **events**, **rotas/availability**, **choir songs/song selections**, **team chat**, and **notification preferences** feature slices, and the **read-only people/teams directory** (organisations, profiles, teams, team memberships) run live (when `EXPO_PUBLIC_SUPABASE_*` env vars are configured). Push token registration and actual push delivery stay deferred (they need a development build with `expo-notifications` and an EAS project id). The chat and notification-preferences grants migrations (`20260709205903_grant_authenticated_chat_api_privileges.sql`, `20260709220528_grant_authenticated_notification_prefs_api_privileges.sql`) have both been pushed and verified. The Auth/profile auto-link migration (`20260709233705_link_auth_users_to_existing_profiles.sql`) is local-only pending explicit push approval. See `docs/supabase-integration-plan.md` for the wiring order.

> **Current dev-project state:** remote migration history is tracked and aligned through `001`–`006` plus the pushed events, rota, songs, chat, and notification-preferences grants migrations. The new Auth/profile auto-link migration (`20260709233705`) intentionally appears local-only until an explicitly approved `supabase db push`. Migrations `001`–`002` were originally applied by hand and back-filled into history; later applied migrations used `supabase db push`. **Do not rename old or timestamped migrations.** See `docs/supabase-migration-alignment-checkpoint.md`.

## Contents

```
supabase/
├── migrations/
│   ├── 001_initial_schema.sql   # 18 tables, enums, FKs, indexes, triggers
│   ├── 002_rls_policies.sql     # helper functions + RLS for every table
│   ├── 003_add_event_recurrence.sql # event recurrence metadata
│   ├── 004_add_choir_song_selection_section.sql # praise/worship sections + section-level RLS
│   ├── 005_add_rota_entry_cancellation.sql # rota entry status + cancellation fields
│   ├── 006_grant_authenticated_api_privileges.sql # authenticated Data API grants
│   ├── 20260709093129_grant_authenticated_events_api_privileges.sql # events/categories grants for the live events slice
│   ├── 20260709154733_grant_authenticated_rota_api_privileges.sql # rota entries/assignments/availability grants for the live rotas slice
│   ├── 20260709171613_grant_authenticated_songs_api_privileges.sql # songs/links/selections grants for the live choir songs slice
│   ├── 20260709205903_grant_authenticated_chat_api_privileges.sql # chat_messages select/insert grants for the live chat slice
│   ├── 20260709220528_grant_authenticated_notification_prefs_api_privileges.sql # notification_preferences grants for the live settings slice
│   └── 20260709233705_link_auth_users_to_existing_profiles.sql # local-only: link new Auth users to matching existing profiles
├── seed/
│   ├── dev_seed.sql             # mock data ported to SQL (relative dates)
│   └── README.md                # how to seed + link Supabase Auth users
└── README.md
```

Migrations apply in version order: `001` → `006`, then the timestamped ones (the CLI sorts them the same way).

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
   - **Hosted dev:** remote history is aligned through the notification-preferences grants migration; `20260709233705_link_auth_users_to_existing_profiles.sql` is the expected local-only pending migration. Apply it only with an explicitly approved `supabase db push`. **Do not rename `001`–`006` or timestamped migrations.** Create future migrations with `supabase migration new <name>` and leave the generated filename unchanged.
   - **A fresh project from scratch:** `supabase db push` applies `001`–`006` and the timestamped migrations in order (numeric prefixes are accepted by the CLI); or paste each migration in version order in the dashboard SQL editor. `supabase db reset` (local stack) requires Docker.
4. Seed dev profiles, then create Auth users with matching emails. Once migration `20260709233705` is applied, new Auth users link automatically; see `seed/README.md` for verification and the manual path for users created earlier.
5. Copy `.env.example` to `.env` and fill in your project URL and anon key (the anon key is safe to ship in the app; RLS is the security boundary).

## Auth user to profile linking

After `20260709233705_link_auth_users_to_existing_profiles.sql` is applied, an `after insert` trigger on `auth.users` case-insensitively matches the new Auth email to an existing `public.profiles.email`. It sets `profiles.auth_user_id` only when that column is null. It does nothing for null/no-match emails and never overwrites a profile already linked to a different user.

The migration also enforces unique `lower(profiles.email)` values so a match cannot be ambiguous. `profiles.auth_user_id` was already unique. The trigger does **not** create profiles, organisation roles, team memberships, organisations, invitations, or public signup. Existing Auth users are not backfilled; use the one-time manual link in `seed/README.md` if they predate the trigger.

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
- The Expo app uses only `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- **Never** run `dev_seed.sql` against production.
- Schema changes go through new migration files created with `supabase migration new` — don't edit or rename already-applied ones (`001`–`006` are tracked in remote history).
