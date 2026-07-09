# Supabase Integration Plan

How to take Shift Shepherd from the current mock-data scaffold to a real Supabase backend **without breaking the working app at any step**. The schema and RLS in `supabase/migrations/` are ready; this document is the wiring order.

Guiding principle: the app was built so that screens never touch data directly — they go through `AppDataContext` actions, `selectors.ts`, and `permissions/`. Integration therefore means replacing the *insides* of those modules one feature at a time, while every other feature keeps running on mock data.

---

## Integration order

Each step leaves the app fully working. Don't start a step until the previous one is demoable.

### 1. Supabase project & environment setup ✅ (done)

- Create a **dev** project (and later a separate **production** project — never share one).
- Run the migrations in order (see `supabase/README.md` for CLI filename requirements vs dashboard paste order).
- Run `supabase/seed/dev_seed.sql` and link 4–5 auth users (see `supabase/seed/README.md`).
- `npx expo install @supabase/supabase-js`, create the client in `src/lib/supabase/client.ts` from `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` (copy `.env.example` → `.env`).
- The app still runs 100% on mocks at this point; the client just exists.

> **Migration-history caveat (dev project, checked July 2026):** migrations `001`–`002` were run manually through the dashboard SQL editor, so `supabase_migrations.schema_migrations` does not exist and the CLI/MCP migration history is empty — **don't treat Supabase migration history as a source of truth**; use live schema introspection (e.g. the Supabase MCP server) together with the local migration files. Migration `006` records the manual authenticated Data API grants already needed by auth/profile lookup and live announcements. Migrations `003`–`005` are **not applied remotely yet** (verified: `events.is_recurring`, `choir_rota_song_selections.section`, and `rota_entries.status` are all absent). Align the remote dev DB with `003`–`006` before wiring events, songs, or rota cancellation, and do not run `supabase db push` blindly until migration history is reconciled. See `docs/supabase-migration-alignment-checkpoint.md`.

### 2. Auth + profiles ✅ (mostly done)

The single riskiest step — done in its own pass. What shipped:

- `src/lib/supabase/client.ts` creates an env-guarded client (AsyncStorage-backed session persistence on native; demo mode when env vars are missing).
- `AuthContext` supports **two modes** behind an unchanged screen-facing API: demo (mock selector, remembered locally) and Supabase email/password with session restore + auth-state listener.
- After login the `profiles` row is fetched by `auth_user_id = auth.uid()`. Because feature data is still mocked, profiles whose email matches a demo person are bridged onto the mock identity (id, teams, permissions); unrecognised profiles get their real org role and no mock memberships. Auth users with no linked profile get a friendly message and are signed out — no auto-created profiles yet.

Still to do in this step:

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
- Replace the email→mock-identity bridge in `buildSupabaseSession` with sessions built entirely from `profiles` + `organisation_roles` + `team_memberships` queries. This happens naturally once teams/memberships go live (step 6) — until then live team UUIDs would not match mock team ids.

### 3. Organisations & roles

Mostly free after step 2 — `SessionUser` already carries org + role. Point the organisation name on Home at the fetched row. No UI changes.

### 4. Announcements — the first vertical slice ⭐ ✅ (done)

Announcements are the ideal first table: church-wide + team visibility exercises the core RLS patterns, it has full CRUD in the UI, and failure is low-stakes (no cascading features depend on it).

What shipped (the pattern to repeat for every feature):

1. `src/lib/supabase/services/announcements.ts` — `listAnnouncements / createAnnouncement / updateAnnouncement / deleteAnnouncement` returning the existing `Announcement` type, with all DB↔app mapping centralized there. The live table uses `body` (not "content") and `pinned` (not "priority"); `audience` is always derived from `team_id` so the DB check constraint holds; `updated_at` is trigger-owned and never sent.
2. `AppDataContext` keeps **two announcement stores**: the persisted local/demo list (unchanged, still reset by Reset Demo Data) and a session-only live list used when `authMode === 'supabase'` and the session carries a linked profile id (`SessionUser.supabaseProfileId`). `add/update/deleteAnnouncement` are now async in both modes; in live mode they apply the server-returned row, then quietly re-sync the list. Errors reject with friendly messages and never mutate state.
3. Screens gained loading/saving/error states but kept the same selectors and data shapes.
4. **Id bridging (temporary):** because people/teams are still mocked, the service maps live profile UUIDs ↔ mock user ids by email and live team UUIDs ↔ mock team ids by name (same philosophy as the auth email bridge). Remove when step 6 (teams) goes live.
5. **Deferred:** `linked_event_id` writes (events are still local — the picker is hidden in live mode) and optimistic-update-with-rollback (simple await + friendly error was safer for a first slice; revisit when a slice needs snappier UX).

Verify RLS from the app: log in as Ruth (can read, no create button, and a hand-crafted insert fails server-side), Miriam (church-wide CRUD), Sarah (choir announcements only).

### 5. Events

Same pattern as announcements (`events` + read-only `event_categories`). Watch the field mapping: `start_time`/`end_time` come back as ISO strings — same as mocks.

Recurring events stay as base `events` rows with `is_recurring`, `recurrence_rule`, `recurrence_label`, and optional `recurrence_end_date`. The app expands upcoming occurrences through pure utilities before rendering Home and Calendar lists.

### 6. Teams & memberships

Read-only in the current UI (no team-management screens yet), so this is fetch-only: teams + memberships into context at login. Note the **team-name edge case** under Risks below.

### 7. Rotas & availability

The most relational slice. Service functions: `listEntriesWithAssignments(teamId)`, `saveEntry(entry, assignments)` (create/update + replace assignments), `deleteEntry`, `cancelEntry(entryId, reason)` / `restoreEntry(entryId)` (updates `status` + `cancelled_*` from migration 005 — allowed by the existing leaders-manage-rota policy), and `respondToAssignment(assignmentId, status, note)` — the last one is an **upsert** onto the `unique(rota_assignment_id)` constraint, with `user_id` set from the current profile and matching the assignment. Replace-assignments should be a single RPC (Postgres function) so it is transactional.

Choir specifics that ride on this slice:

- **Praise/Worship leaders** are plain assignments with role names `'Praise Leader'` / `'Worship Leader'` (legacy `'Song Leader'` still means "leads both"). No schema change needed.
- **Rehearsal availability**: a rehearsal is a rota entry where every choir member has a `'Choir Member'` assignment; the availability upsert above is the whole tracker. The app's "Plan the Month" flow creates a month of service + rehearsal entries client-side with the same `saveEntry` call in a loop (or one RPC later if it needs to be atomic).
- **Cancellations** are soft: cancelled entries stay queryable and visible until the date passes. Nothing auto-deletes them.

### 8. Songs & song selection

- `songs` + `song_links`: fetch with a join (`select *, links:song_links(*)`) — the nested `links` array then matches the `Song` type as-is. Saving a song writes both tables (RPC or two calls; links are small enough to delete-and-reinsert).
- `choir_rota_song_selections`: `setSongSelections(entryId, section, songIds)` = delete that **section's** existing rows + insert with per-section `order_index` — wrap in an RPC for atomicity, leaving the other section untouched. RLS (migration 004, `can_manage_song_section()`) enforces the section rule server-side: the Praise Leader may only write `section = 'praise'` rows, the Worship Leader only `'worship'`, a legacy Song Leader / choir team leader / admin both. The DB still rejects songs that do not belong to the rota entry's team. Test deliberately as Hannah (worship leader on her date: praise writes should fail), Michael (praise leader on his date: worship writes should fail), Sarah (team leader override: both succeed), a plain member (all writes fail), and a cross-team song id (fails).

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
| Sarah (choir leader) | rota CRUD incl. cancel/restore, choir announcements, both song sections (override) | media rota edits, church-wide announcements |
| Michael (praise leader on his date) | praise songs **for his date**; song CRUD | worship songs for his date; songs for Sarah's date; edit/cancel rota entries |
| Hannah (worship leader on Michael's date; member elsewhere) | worship songs for that date; availability on own assignments; song CRUD; choir chat | praise songs; others' availability; rota edits |
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

Steps 1–2 and 4 are done (auth + profile lookup + announcements are live; everything else is mocked but persisted locally). Next, in order of value:

1. After explicit approval, apply migrations `003`–`006` to the remote dev DB manually in order, then reconcile/baseline migration history before using CLI `supabase db push` for hosted dev.
2. Add the `handle_new_user` trigger migration.
3. Start **step 5 — events**, repeating the announcements service pattern (which also unblocks live `linked_event_id`).

Production-hardening follow-ups flagged by Supabase advisors (not blocking, do before launch): several SECURITY DEFINER helper functions are executable by `anon`/`authenticated` and should have EXECUTE revoked where not needed; `set_updated_at` and `validate_cross_table_consistency` need a pinned `search_path`; `announcements.created_by` and `announcements.linked_event_id` foreign keys are unindexed.
