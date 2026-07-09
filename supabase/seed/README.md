# Development Seed

`dev_seed.sql` ports the app's mock data (`src/lib/mockData/`) into Postgres: Grace Community Church, the 8 demo users, 4 teams, 12 event categories, 6 base events including 3 recurring church events, 5 announcements, 10 songs with links and tags, 10 rota entries with 28 assignments and mixed availability responses, choir song selections (the entry led by Michael Thompson deliberately has none, so the song-selection flow can be tested), team chat messages, and default notification preferences.

Dates are computed **relative to seed time** (same trick as the mock data generator), so events and rotas are always upcoming when you demo. Re-seed occasionally to keep them fresh.

## Running the seed

**Local Supabase (recommended):**

```bash
supabase start                 # local stack
supabase db reset              # applies migrations, then the configured seed
```

Before using the CLI, copy or rename the migration files as described in
`supabase/README.md`; the checked-in `001_...` / `002_...` / `003_...` names preserve
review order but are not Supabase CLI timestamp names.

Point the CLI at this file by adding to `supabase/config.toml`:

```toml
[db.seed]
enabled = true
sql_paths = ["./seed/dev_seed.sql"]
```

**Hosted project (dev only — never production):** paste `dev_seed.sql` into the SQL Editor in the Supabase dashboard, or run `psql "$DATABASE_URL" -f supabase/seed/dev_seed.sql`.

Re-running against an already-seeded database will fail on duplicate primary keys (fixed UUIDs — intentional). To reset, uncomment the `delete from public.organisations …` line near the top; the cascade wipes every dependent row.

## Creating and linking Supabase Auth users (do not fake this)

`auth.users` rows are **not** seeded. Inserting into `auth.users` by hand is unsupported and breaks in subtle ways (password hashing, identities table, GoTrue expectations), so profiles are seeded with `auth_user_id = NULL`.

Once `20260709233705_link_auth_users_to_existing_profiles.sql` has been explicitly pushed, the correct process for each demo user you want to log in as is:

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
2. **Let the trigger link it.** On Auth-user creation, the trigger case-insensitively matches the email to one existing profile and sets `profiles.auth_user_id` only if it is currently null.
3. **Verify the link** in the SQL editor:
   ```sql
   select email, auth_user_id
   from public.profiles
   where lower(email) = lower('sarah@gracecommunity.church');
   ```

The trigger never creates a profile, organisation role, team membership, organisation, or invitation. If there is no matching profile, the Auth user stays unlinked and the app shows its friendly setup message. Unlinked profiles still appear correctly as authors, assignees, and chat senders.

### Auth users created before the trigger

The migration deliberately does not backfill existing Auth users. For a user created before the trigger was applied, use this one-time, no-overwrite link in the SQL editor (replace the email):

```sql
update public.profiles
set auth_user_id = (
  select id
  from auth.users
  where lower(email) = lower('hannah@gracecommunity.church')
)
where lower(email) = lower('hannah@gracecommunity.church')
  and auth_user_id is null;
```

Do not run a broad backfill without reviewing matches first. After the trigger is applied, creating new Auth users for currently unlinked seeded emails such as Hannah, Michael, or Joseph should auto-link them; only Auth users that already existed before the trigger need this manual path. You only need to link users you will log in as while testing (Daniel, Sarah, Michael, Hannah, and Ruth cover every permission path).

This is still an admin-provisioned flow, not public signup or self-service onboarding: create or seed the church profile, role, and memberships first, then create the Auth user with the same email.

## Demo users reference

| Email | Role | Teams |
| --- | --- | --- |
| daniel@gracecommunity.church | Church Admin | Ushers |
| miriam@gracecommunity.church | Announcement Manager | Ushers (leader) |
| joseph@gracecommunity.church | Event Manager | Media, Ushers, Youth (leader) |
| sarah@gracecommunity.church | General member | Choir (leader) — manages both song sections |
| hannah@gracecommunity.church | General member | Choir, Youth — assigned Worship Leader on an upcoming date |
| michael@gracecommunity.church | General member | Choir, Media — assigned Praise Leader on an upcoming date |
| david@gracecommunity.church | General member | Media (leader), Youth |
| ruth@gracecommunity.church | General member | none (tests empty states) |
