# Development Seed

`dev_seed.sql` ports the app's mock data (`src/lib/mockData/`) into Postgres: Grace Community Church, the 8 demo users, 4 teams, 12 event categories, 6 events, 5 announcements, 10 songs with links and tags, 10 rota entries with 28 assignments and mixed availability responses, choir song selections (the entry led by Michael Thompson deliberately has none, so the song-selection flow can be tested), team chat messages, and default notification preferences.

Dates are computed **relative to seed time** (same trick as the mock data generator), so events and rotas are always upcoming when you demo. Re-seed occasionally to keep them fresh.

## Running the seed

**Local Supabase (recommended):**

```bash
supabase start                 # local stack
supabase db reset              # applies migrations, then the configured seed
```

Point the CLI at this file by adding to `supabase/config.toml`:

```toml
[db.seed]
enabled = true
sql_paths = ["./seed/dev_seed.sql"]
```

**Hosted project (dev only — never production):** paste `dev_seed.sql` into the SQL Editor in the Supabase dashboard, or run `psql "$DATABASE_URL" -f supabase/seed/dev_seed.sql`.

Re-running against an already-seeded database will fail on duplicate primary keys (fixed UUIDs — intentional). To reset, uncomment the `delete from public.organisations …` line near the top; the cascade wipes every dependent row.

## Linking Supabase Auth users (do not fake this)

`auth.users` rows are **not** seeded. Inserting into `auth.users` by hand is unsupported and breaks in subtle ways (password hashing, identities table, GoTrue expectations), so profiles are seeded with `auth_user_id = NULL` and linked afterwards.

The correct process for each demo user you actually want to log in as:

1. **Create the auth user** properly, either:
   - Dashboard → Authentication → Users → *Add user* (email + password, e.g. `sarah@gracecommunity.church`), or
   - Admin API from a trusted script (never the client):
     ```ts
     const { data } = await adminClient.auth.admin.createUser({
       email: 'sarah@gracecommunity.church',
       password: 'demo-password',
       email_confirm: true,
     });
     ```
2. **Link it to the seeded profile** (SQL editor, as service role):
   ```sql
   update public.profiles
   set auth_user_id = (select id from auth.users where email = 'sarah@gracecommunity.church')
   where email = 'sarah@gracecommunity.church' and auth_user_id is null;
   ```

You only need to link the users you'll log in as while testing (Daniel, Sarah, Michael, Hannah, and Ruth cover every permission path). Unlinked profiles still appear correctly as authors, assignees, and chat senders.

For **production**, the flow inverts: a `handle_new_user` trigger on `auth.users` creates the profile at signup (see `docs/supabase-integration-plan.md`, step 2) — this seed-then-link dance is for development convenience only.

## Demo users reference

| Email | Role | Teams |
| --- | --- | --- |
| daniel@gracecommunity.church | Church Admin | Ushers |
| miriam@gracecommunity.church | Announcement Manager | Ushers (leader) |
| joseph@gracecommunity.church | Event Manager | Media, Ushers, Youth (leader) |
| sarah@gracecommunity.church | General member | Choir (leader) |
| hannah@gracecommunity.church | General member | Choir, Youth |
| michael@gracecommunity.church | General member | Choir, Media — assigned Song Leader on an upcoming date |
| david@gracecommunity.church | General member | Media (leader), Youth |
| ruth@gracecommunity.church | General member | none (tests empty states) |
