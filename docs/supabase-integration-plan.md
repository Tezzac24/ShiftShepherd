# Supabase Integration Plan

How to take Shift Shepherd from the current mock-data scaffold to a real Supabase backend **without breaking the working app at any step**. The schema and RLS in `supabase/migrations/` are ready; this document is the wiring order.

Guiding principle: the app was built so that screens never touch data directly — they go through `AppDataContext` actions, `selectors.ts`, and `permissions/`. Integration therefore means replacing the *insides* of those modules one feature at a time, while every other feature keeps running on mock data.

---

## Integration order

Each step leaves the app fully working. Don't start a step until the previous one is demoable.

### 1. Supabase project & environment setup ✅ (done)

- Create a **dev** project (and later a separate **production** project — never share one).
- Run the migrations in order (see `supabase/README.md` for the CLI vs dashboard workflow). Remote history now tracks `001`–`006`.
- Run `supabase/seed/dev_seed.sql` and link 4–5 auth users (see `supabase/seed/README.md`).
- `npx expo install @supabase/supabase-js`, create the client in `src/lib/supabase/client.ts` from `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` (copy `.env.example` → `.env`).
- The app still runs 100% on mocks at this point; the client just exists.

> **Migration history (dev project) — aligned 2026-07-09:** remote `supabase_migrations.schema_migrations` now records versions `001`–`006`, and migrations `003`–`006` are applied remotely (verified via `supabase migration list` and MCP introspection). Migrations `001`–`002` were originally run by hand via the dashboard and back-filled with `supabase migration repair`; `003`–`006` were applied with `supabase db push`. Future schema changes use the normal `supabase migration new` → `supabase db push` workflow. **Do not rename `001`–`006`** — the remote history tracks those exact version strings. See `docs/supabase-migration-alignment-checkpoint.md`.

### 2. Auth + profiles ✅ (mostly done)

The single riskiest step — done in its own pass. What shipped:

- `src/lib/supabase/client.ts` creates an env-guarded client (AsyncStorage-backed session persistence on native; demo mode when env vars are missing).
- `AuthContext` supports **two modes** behind an unchanged screen-facing API: demo (mock selector, remembered locally) and Supabase email/password with session restore + auth-state listener.
- After login the `profiles` row is fetched by `auth_user_id = auth.uid()`. Because feature data is still mocked, profiles whose email matches a demo person are bridged onto the mock identity (id, teams, permissions); unrecognised profiles get their real org role and no mock memberships. Auth users with no linked profile get a friendly message and are signed out — no auto-created profiles yet.

Still to do in this step:

- ~~Replace the email→mock-identity bridge in `buildSupabaseSession`~~ ✅ done in step 6: Supabase sessions are now built entirely from `profiles` + `organisation_roles` + `team_memberships` queries — all ids in a live session are real UUIDs.
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

### 3. Organisations & roles ✅ (done with step 6)

`SessionUser` carries org + role, and the organisation name on Home now comes from the live `organisations` row in live mode (fetched with the teams directory). No UI changes.

### 4. Announcements — the first vertical slice ⭐ ✅ (done)

Announcements are the ideal first table: church-wide + team visibility exercises the core RLS patterns, it has full CRUD in the UI, and failure is low-stakes (no cascading features depend on it).

What shipped (the pattern to repeat for every feature):

1. `src/lib/supabase/services/announcements.ts` — `listAnnouncements / createAnnouncement / updateAnnouncement / deleteAnnouncement` returning the existing `Announcement` type, with all DB↔app mapping centralized there. The live table uses `body` (not "content") and `pinned` (not "priority"); `audience` is always derived from `team_id` so the DB check constraint holds; `updated_at` is trigger-owned and never sent.
2. `AppDataContext` keeps **two announcement stores**: the persisted local/demo list (unchanged, still reset by Reset Demo Data) and a session-only live list used when `authMode === 'supabase'` and the session carries a linked profile id (`SessionUser.supabaseProfileId`). `add/update/deleteAnnouncement` are now async in both modes; in live mode they apply the server-returned row, then quietly re-sync the list. Errors reject with friendly messages and never mutate state.
3. Screens gained loading/saving/error states but kept the same selectors and data shapes.
4. ~~**Id bridging (temporary)**~~ ✅ removed in step 6: people/teams are live, so announcement rows travel with real profile/team UUIDs end-to-end and screens resolve names against the live directory. Mock ids ('team-…', 'event-…') are still refused defensively at the service boundary.
5. **Deferred:** ~~`linked_event_id` writes~~ (done in step 5 — the live picker offers live events and the service refuses mock ids) and optimistic-update-with-rollback (simple await + friendly error was safer for a first slice; revisit when a slice needs snappier UX).

Verify RLS from the app: log in as Ruth (can read, no create button, and a hand-crafted insert fails server-side), Miriam (church-wide CRUD), Sarah (choir announcements only).

### 5. Events ✅ (done)

Same pattern as announcements (`events` + read-only `event_categories`). What shipped:

1. `src/lib/supabase/services/events.ts` — `listEvents / createEvent / updateEvent / deleteEvent` returning the existing `Event` type. `created_by` is always the caller's live profile id on insert and never patched. Since step 6 the only remaining bridge is **categories matched by name** (the live seed uses the same twelve names; the app's category list is still mock) — team/profile ids pass through as real UUIDs.
2. `AppDataContext` keeps two event stores (persisted local/demo + session-only live), switching on the same condition as announcements. `add/update/deleteEvent` are async in both modes; live mutations apply the server row then quietly re-sync.
3. Calendar/Home/detail/form screens gained loading, error+retry, and saving/deleting states; recurring events still travel as base rows and are expanded client-side (`utils/recurrence`), which works unchanged for live rows.
4. **Live `linked_event_id` unlocked:** the announcement form's linked-event picker now shows in live mode too (it lists live events, so the id is a real UUID); the announcements service refuses mock `event-…` ids defensively.
5. A grants migration (`20260709093129_grant_authenticated_events_api_privileges.sql`) gives `authenticated` select on `event_categories` and select/insert/update/delete on `events` — migration 006 only covered announcements, so live events 42501'd without it. RLS (from 002) stays the authority.

Verify RLS from the app: Joseph (event manager) full CRUD; Daniel (admin) full CRUD; Ruth/Sarah read-only (no New Event button, and a hand-crafted insert fails server-side).

### 6. Teams & memberships ✅ (done, read-only)

Fetch-only, as planned (the app has no team-management screens; admins manage teams in the dashboard). What shipped:

1. `src/lib/supabase/services/teams.ts` — `fetchTeamsDirectory()` returns the caller's organisation, visible profiles, visible teams, and those teams' memberships in one parallel fetch. RLS does the filtering (members see their teams, church admins see all); migration 006's SELECT grants already covered every table, so **no new migration was needed** and there are deliberately no write grants.
2. `AuthContext` now builds Supabase sessions entirely from live rows (profile + org role + own memberships) — the email→mock-identity bridge is gone. All ids in a live session are real UUIDs.
3. `AppDataContext` gained a third live slice (`teamsLive`/`teamsLoading`/`teamsError`/`refreshTeams`): `organisation`, `users`, `teams`, and `memberships` come from the live directory for linked Supabase sessions and stay mock in demo mode. Live directory data is session-only (never persisted; cleared on sign-out).
4. The announcements/events services dropped their profile/team id bridges — live rows keep real UUIDs end-to-end and screens resolve names against the live directory. Only the **event-category name bridge** remains (categories are still mock in the app).
5. **Temporary demo bridge** (`src/lib/appData/demoBridge.ts`): rotas, songs, chat, and availability are still demo/local data keyed by mock ids, so in live mode those collections are re-keyed onto live team/profile UUIDs for display (teams by name, people by email), and local writes map ids back to mock ids so the persisted demo snapshot stays clean. Nothing in it touches Supabase; delete it slice by slice as steps 7–9 go live.
6. Teams tab, team space, Messages tab, and the Home team sections show calm loading/error+retry states while the directory loads.

Note the **team-name edge case** under Risks below — still open, and now user-visible: a non-member viewing a church-wide event linked to a team cannot resolve that team's name (RLS hides the team row), so the detail screen simply omits it.

### 7. Rotas & availability

The most relational slice — and the recommended next one.

> **Grants check (verified read-only 2026-07-09):** `rota_entries`, `rota_assignments`, `availability_responses`, `songs`, `song_links`, `choir_rota_song_selections`, and `chat_messages` have **no** `authenticated` Data API privileges yet (006 and the events grants migration didn't cover them). This slice therefore needs a small grants migration (select/insert/update/delete per the RLS policies' intent) before any of it can go live — RLS itself is already in place from 002/004/005.

Service functions: `listEntriesWithAssignments(teamId)`, `saveEntry(entry, assignments)` (create/update + replace assignments), `deleteEntry`, `cancelEntry(entryId, reason)` / `restoreEntry(entryId)` (updates `status` + `cancelled_*` from migration 005 — allowed by the existing leaders-manage-rota policy), and `respondToAssignment(assignmentId, status, note)` — the last one is an **upsert** onto the `unique(rota_assignment_id)` constraint, with `user_id` set from the current profile and matching the assignment. Replace-assignments should be a single RPC (Postgres function) so it is transactional.

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

- **Rotas, songs, chat** — demo/local data until steps 7–9; in live mode they are re-keyed onto live team/profile ids by the temporary demo bridge (`src/lib/appData/demoBridge.ts`) so they keep working next to live teams.
- **Event categories** — the app still uses the mock twelve; the events service matches live categories by name.
- **Unread badges** — client-side simulation until a `chat_reads` table exists.
- **Notification delivery** — settings UI persists locally (or to the table) but nothing pushes until step 11.
- **Images & attachments** — placeholders until step 10 (Storage).
- **Social/phone sign-in** — buttons stay "coming soon" until OAuth/SMS providers are configured; email/password is the wired path first.
- **Team management UI** (create teams, assign leaders) — admin does this via the dashboard until a screen exists.

## Recommended immediate next task

Steps 1–6 are done (auth + live sessions + organisations/roles + announcements + events + the read-only teams/people directory; rotas/songs/chat are mocked but persisted locally, re-keyed onto live ids in live mode via the temporary demo bridge). Next, in order of value:

1. ✅ **Done (2026-07-09):** migrations `003`–`006` applied remotely with aligned history; the events grants migration `20260709093129_grant_authenticated_events_api_privileges.sql` is pushed and verified.
2. ✅ **Done (2026-07-09):** **step 5 — events**, including live `linked_event_id` on announcements.
3. ✅ **Done (2026-07-09):** **step 6 — teams & memberships** (fetch-only), retiring the email/name id bridges in auth, announcements, and events.
4. Start **step 7 — rotas & availability** (needs the grants migration flagged in that step), which also lets the demo bridge start shrinking. Consider bundling the teams-SELECT relaxation (Risks: team-name visibility, option b) into the same migration pass.
5. Add the `handle_new_user` trigger migration.

Production-hardening follow-ups flagged by Supabase advisors (not blocking, do before launch): several SECURITY DEFINER helper functions are executable by `anon`/`authenticated` and should have EXECUTE revoked where not needed; `set_updated_at` and `validate_cross_table_consistency` need a pinned `search_path`; `announcements.created_by` and `announcements.linked_event_id` foreign keys are unindexed.
