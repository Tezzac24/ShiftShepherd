# Supabase Integration Plan

How to take Shift Shepherd from the current mock-data scaffold to a real Supabase backend **without breaking the working app at any step**. The schema and RLS in `supabase/migrations/` are ready; this document is the wiring order.

Guiding principle: the app was built so that screens never touch data directly — they go through `AppDataContext` actions, `selectors.ts`, and `permissions/`. Integration therefore means replacing the *insides* of those modules one feature at a time, while every other feature keeps running on mock data.

---

## Integration order

Each step leaves the app fully working. Don't start a step until the previous one is demoable.

### 1. Supabase project & environment setup

- Create a **dev** project (and later a separate **production** project — never share one).
- Run the three migrations in order (see `supabase/README.md` for CLI filename requirements vs dashboard paste order).
- Run `supabase/seed/dev_seed.sql` and link 4–5 auth users (see `supabase/seed/README.md`).
- `npx expo install @supabase/supabase-js`, create the client in `src/lib/supabase/client.ts` from `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` (copy `.env.example` → `.env`).
- The app still runs 100% on mocks at this point; the client just exists.

### 2. Auth + profiles

The single riskiest step — do it alone, in its own PR.

- Add a `handle_new_user` trigger (new migration) that inserts a `profiles` row on signup. For V1 single-church, it can hard-code the Grace Community organisation id and a `general_member` org role:
  ```sql
  create function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
  begin
    insert into public.profiles (auth_user_id, organisation_id, full_name, email)
    values (new.id, '<org-uuid>', coalesce(new.raw_user_meta_data->>'full_name', new.email), new.email);
    return new;
  end $$;
  create trigger on_auth_user_created after insert on auth.users
    for each row execute function public.handle_new_user();
  ```
  Multi-church later replaces the hard-coded org with invite codes.
- Rework `src/lib/auth/AuthContext.tsx` internals: `signInWithEmail` → `supabase.auth.signInWithPassword`, `signOut` → `supabase.auth.signOut`, and build `SessionUser` (profile + orgRole + memberships) from a query instead of mock arrays. **The context's public API does not change**, so no screen changes.
- Keep the **test-account selector working** during development: behind `__DEV__` or an env flag, map each test account to a real seeded auth user and sign in with a known password. This preserves the multi-role demo workflow.
- Add session persistence (`AsyncStorage` adapter) and an auth-state listener so cold starts restore the session.

### 3. Organisations & roles

Mostly free after step 2 — `SessionUser` already carries org + role. Point the organisation name on Home at the fetched row. No UI changes.

### 4. Announcements — the first vertical slice ⭐

Announcements are the ideal first table: church-wide + team visibility exercises the core RLS patterns, it has full CRUD in the UI, and failure is low-stakes (no cascading features depend on it).

Pattern to establish (then repeat for every feature):

1. Create `src/lib/supabase/services/announcements.ts` with `list / create / update / remove` functions returning the existing `Announcement` type.
2. In `AppDataContext`, replace the `announcements` slice: fetch on login, keep the same state shape, make `addAnnouncement`/`updateAnnouncement`/`deleteAnnouncement` call the service with **optimistic updates + rollback on error** (surface "Your changes could not be saved. Please try again.").
3. Screens and selectors don't change at all.
4. Verify RLS from the app: log in as Ruth (can read, no create button, and a hand-crafted insert fails server-side), Miriam (church-wide CRUD), Sarah (choir announcements only).

### 5. Events

Same pattern as announcements (`events` + read-only `event_categories`). Watch the field mapping: `start_time`/`end_time` come back as ISO strings — same as mocks.

Recurring events stay as base `events` rows with `is_recurring`, `recurrence_rule`, `recurrence_label`, and optional `recurrence_end_date`. The app expands upcoming occurrences through pure utilities before rendering Home and Calendar lists.

### 6. Teams & memberships

Read-only in the current UI (no team-management screens yet), so this is fetch-only: teams + memberships into context at login. Note the **team-name edge case** under Risks below.

### 7. Rotas & availability

The most relational slice. Service functions: `listEntriesWithAssignments(teamId)`, `saveEntry(entry, assignments)` (create/update + replace assignments), `deleteEntry`, `respondToAssignment(assignmentId, status, note)` — the last one is an **upsert** onto the `unique(rota_assignment_id)` constraint, with `user_id` set from the current profile and matching the assignment. Replace-assignments should be a single RPC (Postgres function) so it is transactional.

### 8. Songs & song selection

- `songs` + `song_links`: fetch with a join (`select *, links:song_links(*)`) — the nested `links` array then matches the `Song` type as-is. Saving a song writes both tables (RPC or two calls; links are small enough to delete-and-reinsert).
- `choir_rota_song_selections`: `setSongSelections(entryId, songIds)` = delete existing + insert with `order_index` — wrap in an RPC for atomicity. RLS enforces the song-leader/override rule server-side, and the DB rejects songs that do not belong to the rota entry's team; test it deliberately as Hannah (member, should fail), Michael (assigned leader for his date, should succeed), Sarah (team leader override), and a cross-team song id (should fail).

### 9. Chat

Fetch history per team + `INSERT` on send, then enable **Realtime** on `chat_messages` (add it to the `supabase_realtime` publication) and subscribe per open chat. Keep the mock unread counts client-side — real read-receipts are a schema addition (`chat_reads` table) for later.

### 10. Storage & uploads

Buckets for avatars, announcement images, and chat attachments, with storage policies mirroring the same team/org helpers. The UI already treats images/attachments as placeholders, so this unlocks them.

### 11. Push notifications

Expo Notifications: request permission, store the token in `push_tokens`, deliver via a Supabase Edge Function triggered on inserts (announcements, chat, rota changes), filtered through `notification_preferences`. Until then, preferences stay a local-state UI (they can be persisted to the table as a cheap early win during step 2–4).

---

## How RLS should be tested

Test **denials**, not just success paths — RLS bugs are almost always "someone can see/do too much".

1. **SQL-editor impersonation** (fast, no app needed): see `supabase/README.md` for the `set_config('request.jwt.claims', …)` recipe. Assert row counts per user.
2. **Two-device app testing** once a slice is wired: e.g. Sarah edits a rota on one device, Hannah sees it and *cannot* edit on another.
3. **Negative tests via the API**: with a member's JWT, attempt a forbidden mutation directly (e.g. Ruth inserts an announcement, Hannah updates song selections). Expect a policy violation, and confirm the app shows the friendly "You do not have permission to do that."

### Role test matrix (minimum)

| As | Must work | Must fail |
| --- | --- | --- |
| Daniel (admin) | see all 4 teams, all chats, edit anything | — |
| Miriam (announcement mgr) | church-wide announcement CRUD | create events; see Choir team/chat |
| Joseph (event mgr) | event CRUD | church-wide announcements |
| Sarah (choir leader) | rota CRUD, choir announcements, song-selection override | media rota edits, church-wide announcements |
| Michael (assigned song leader) | select songs **for his date**; song CRUD | select songs for Sarah's date; edit rota entries |
| Hannah (choir member) | availability on own assignment, song CRUD, choir chat | others' availability; song selections; rota edits |
| Ruth (no teams) | home, calendar, church announcements | any team, any chat, any songs |

---

## Risks & edge cases

- **Team-name visibility**: RLS hides teams you don't belong to (per spec), but event detail shows a related team's name to everyone. Once teams are wired, a non-member's event query returns `team_id` they can't resolve. Options: (a) drop the team name from event detail for non-members, or (b) relax the `teams` SELECT policy to all org members (names/descriptions aren't sensitive; memberships, rotas, and chat stay protected). **Recommendation: (b)**, as a small follow-up migration, documented as a deliberate deviation.
- **`updated_at` drift**: the DB trigger owns `updated_at`; strip it from client-side patches when wiring services so values don't fight.
- **Authored-content deletes**: `created_by`/`added_by`/`sender_id`/`selected_by` are `ON DELETE RESTRICT` — deleting a profile that authored content will fail. That's intentional for V1; GDPR-style removal should anonymise the profile (rename, null contact fields) rather than hard-delete. Revisit before public launch.
- **Time formats**: Postgres returns `time` as `HH:MM:SS`; the app renders `HH:MM`. Normalise in the rota service (`time.slice(0, 5)`).
- **Optimistic-update rollback**: every mutating service call needs a rollback path; the scaffold's plain-English error strings already exist for this.
- **Profiles without auth users** (seed data): fine as authors/assignees, but they can't respond to availability until linked. Link everyone you demo with.
- **Clock/timezone**: seed dates are computed in the DB server's timezone (UTC on Supabase); a service starting at "10:00" UTC may render as 11:00 local in the app. Acceptable for dev; production event creation happens through the app with proper timestamptz values.
- **Two sources of truth during migration**: while some slices are mock and some are live, cross-feature joins (e.g. announcement linked to a live event) can dangle. The integration order above minimises this — announcements→events are adjacent for exactly this reason.

## What stays mocked until later

- **Unread badges** — client-side simulation until a `chat_reads` table exists.
- **Notification delivery** — settings UI persists locally (or to the table) but nothing pushes until step 11.
- **Images & attachments** — placeholders until step 10 (Storage).
- **Social/phone sign-in** — buttons stay "coming soon" until OAuth/SMS providers are configured; email/password is the wired path first.
- **Team management UI** (create teams, assign leaders) — admin does this via the dashboard until a screen exists.

## Recommended immediate next task

Step 1 + 2 together: stand up a dev Supabase project, apply migrations, run the seed, link five auth users, then swap `AuthContext` internals to real Supabase Auth behind the unchanged context API — keeping the dev test-account selector working. Everything else stays on mocks. That single PR proves the schema, the RLS helpers, and the auth link end-to-end.
