# Supabase Integration Plan

How to take Shift Shepherd from the current mock-data scaffold to a real Supabase backend **without breaking the working app at any step**. The schema and RLS in `supabase/migrations/` are ready; this document is the wiring order.

Guiding principle: the app was built so that screens never touch data directly — they go through `AppDataContext` actions, `selectors.ts`, and `permissions/`. Integration therefore means replacing the *insides* of those modules one feature at a time, while every other feature keeps running on mock data.

---

## Integration order

Each step leaves the app fully working. Don't start a step until the previous one is demoable.

### 1. Supabase project & environment setup ✅ (done)

- Create a **dev** project (and later a separate **production** project — never share one).
- Run the migrations in order (see `supabase/README.md` for the CLI vs dashboard workflow). Remote history now tracks `001`–`006` plus the pushed events and rota grants migrations.
- Run `supabase/seed/dev_seed.sql` and link 4–5 auth users (see `supabase/seed/README.md`).
- `npx expo install @supabase/supabase-js`, create the client in `src/lib/supabase/client.ts` from `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` (copy `.env.example` → `.env`).
- The app still runs 100% on mocks at this point; the client just exists.

> **Migration history (dev project) — aligned 2026-07-09:** remote `supabase_migrations.schema_migrations` now records versions `001`–`006` plus the pushed events and rota grants migrations, and migrations `003`–`006` are applied remotely (verified via `supabase migration list` and MCP introspection). Migrations `001`–`002` were originally run by hand via the dashboard and back-filled with `supabase migration repair`; `003`–`006` and later pushed grant migrations were applied with `supabase db push`. Future schema changes use the normal `supabase migration new` → `supabase db push` workflow. **Do not rename `001`–`006`** — the remote history tracks those exact version strings. See `docs/supabase-migration-alignment-checkpoint.md`.

### 2. Auth + profiles ✅ (mostly done)

The single riskiest step — done in its own pass. What shipped:

- `src/lib/supabase/client.ts` creates an env-guarded client (AsyncStorage-backed session persistence on native; demo mode when env vars are missing).
- `AuthContext` supports **two modes** behind an unchanged screen-facing API: demo (mock selector, remembered locally) and Supabase email/password with session restore + auth-state listener.
- After login the `profiles` row is fetched by `auth_user_id = auth.uid()`. In the first auth pass, while feature data was still mocked, profiles whose email matched a demo person were bridged onto the mock identity (id, teams, permissions); unrecognised profiles got their real org role and no mock memberships. Auth users with no linked profile got a friendly message and were signed out — no auto-created profiles yet.

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
5. ~~**Temporary demo bridge** (`src/lib/appData/demoBridge.ts`)~~ ✅ deleted in step 9: it existed to re-key still-local chat onto live team/profile UUIDs, and chat going live made it dead code. Demo mode runs on pure mock ids; live mode is real UUIDs end-to-end.
6. Teams tab, team space, Messages tab, and the Home team sections show calm loading/error+retry states while the directory loads.

Note the **team-name edge case** under Risks below — still open, and now user-visible: a non-member viewing a church-wide event linked to a team cannot resolve that team's name (RLS hides the team row), so the detail screen simply omits it.

### 7. Rotas & availability ✅ (done)

The most relational slice. What shipped (same pattern as announcements/events/teams):

1. `src/lib/supabase/services/rotas.ts` — `fetchRotaData()` (entries + assignments + responses in one parallel, RLS-scoped fetch), `createRotaEntry` / `updateRotaEntry` (with a diffed replace of the assignment list that keeps person+role matches, so their responses survive edits), `cancelRotaEntry` / `restoreRotaEntry` (the migration-005 `status` + `cancelled_*` update, covered by the leaders-manage-rota policy), `deleteRotaEntry`, and `submitAvailability` — an **upsert** onto the `unique(rota_assignment_id)` constraint, `user_id` always the caller's live profile id, note always optional. Postgres `time` values are normalised to `HH:MM` here.
2. **Deviation from the original sketch:** replace-assignments is a client-side diff (delete removed + insert added), not a transactional RPC. A failure can leave a partial list, but every mutation quietly re-syncs afterwards so the UI heals; an RPC can be added later if it ever matters in practice.
3. `AppDataContext` keeps two rota stores (persisted local/demo + session-only live), switching on the same condition as the other slices. All rota actions (`addRotaEntry`, `updateRotaEntry`, `deleteRotaEntry`, `cancelRotaEntry`, `restoreRotaEntry`, `setAvailability`) are async in both modes; live mutations apply the server rows then quietly re-sync. Live rota data is never persisted to AsyncStorage and clears on sign-out/user switch.
4. Rota list/detail/form, Plan the Month, the team space rota section, and Home's "Your Next Responsibility" gained loading, error+retry, and saving states with toast feedback; Home's responsibility card is fully live-backed in Supabase mode.
5. The demo bridge dropped its rota re-keying. After step 8, only chat still goes through the bridge.
6. A grants migration (`20260709154733_grant_authenticated_rota_api_privileges.sql`) gives `authenticated` select/insert/update/delete on `rota_entries`, `rota_assignments`, and `availability_responses` — verified missing via read-only introspection, then pushed and verified remotely. RLS (002/005) stays the authority.

Choir specifics that ride on this slice (unchanged product behaviour):

- **Praise/Worship leaders** are plain assignments with role names `'Praise Leader'` / `'Worship Leader'` (legacy `'Song Leader'` still means "leads both"). No schema change needed.
- **Rehearsal availability**: a rehearsal is a rota entry where every choir member has a `'Choir Member'` assignment; the availability upsert above is the whole tracker. "Plan the Month" creates a month of service + rehearsal entries client-side with sequential `createRotaEntry` calls (a partial failure reports how many dates were created).
- **Cancellations** are soft: cancelled entries stay queryable and visible until the date passes. Nothing auto-deletes them.

Verify RLS from the app: Daniel (admin) full rota CRUD on every team; Sarah (choir leader) CRUD incl. cancel/restore on the choir rota only; Hannah/Michael respond to their own assignments (and cannot edit entries); Ruth sees no team rotas.

### 8. Songs & song selection ✅ (done)

1. `src/lib/supabase/services/songs.ts` fetches `songs`, `song_links`, and `choir_rota_song_selections` into the existing `Song` and `ChoirSongSelection` types. DB fields stay isolated in the service, live ids are real UUIDs, songs sort by title, and selections sort by entry/section/order.
2. Song CRUD writes `songs` and replaces `song_links` when links are edited. Delete cascades through links and selections in the database. The service refuses mock ids and returns friendly load/save/delete/permission messages.
3. `setSongSelections(entryId, section, songIds)` deletes that **section's** existing rows, inserts rows with per-section `order_index`, and leaves the other section untouched. This is a client-side two-call replace, not a transactional RPC; every successful save refreshes from Supabase, and failures are surfaced without mutating the local live view.
4. `AppDataContext` keeps songs/selections in the persisted local store for demo mode and in session-only live state for Supabase Auth with a linked profile. Live song data is cleared on logout/user switch and never saved to AsyncStorage.
5. Song database, song detail/form, rota detail, rota list, select-songs, and team-space screens gained live loading/error/retry/saving states. Demo/local behaviour remains unchanged.
6. RLS (migration 004, `can_manage_song_section()`) enforces the section rule server-side: the Praise Leader may only write `section = 'praise'` rows, the Worship Leader only `'worship'`, a legacy Song Leader / choir team leader / admin both. The DB still rejects songs that do not belong to the rota entry's team.
7. Read-only introspection showed the policies already exist but authenticated Data API grants were missing. A grants migration (`20260709171613_grant_authenticated_songs_api_privileges.sql`) grants `authenticated` select/insert/update/delete on `songs`, `song_links`, and `choir_rota_song_selections`. It has since been **pushed and verified remotely** (2026-07-09; confirmed via read-only introspection), and choir songs passed manual QA.

Test deliberately as Hannah (worship leader on her date: praise writes should fail), Michael (praise leader on his date: worship writes should fail), Sarah (team leader override: both succeed), a plain member (all writes fail), and a cross-team song id (fails).

### 9. Chat ✅ (app code done — grants migration pending push)

Text-only V1, same pattern as the earlier slices. What shipped:

1. `src/lib/supabase/services/chat.ts` — `listChatMessages()` (one RLS-scoped fetch of every message the caller can see, oldest first) and `sendChatMessage(teamId, body, liveProfileId)` (trims the text, rejects empty/whitespace-only messages, refuses mock ids, always sends as the caller's live profile — RLS enforces that server-side too). DB fields stay isolated in the service; `created_at` is DB-owned.
2. `AppDataContext` keeps two chat stores (persisted local/demo + session-only live), switching on the same condition as the other slices. `sendChatMessage` is async in both modes; a live send appends the server row then quietly re-syncs (which also picks up other people's new messages). Live chat is never persisted to AsyncStorage and clears on sign-out/user switch.
3. **No realtime yet** (deliberately deferred): live messages refresh at sign-in, when a chat screen opens, after each send, and via a visible "Check for new messages" bar on the chat screen. The team chat screen gained loading, error+retry, sending, and inline failed-send states (the draft is kept so nothing is lost).
4. **Unread badges are demo-only now**: the simulated counts made no sense against live data, so live mode shows none — real unread tracking is a `chat_reads` schema addition for later. Attachments stay a "coming soon" placeholder in both modes until the Storage slice (step 10); there is no edit/delete (no RLS policies for either, matching the UI).
5. The temporary demo bridge (`src/lib/appData/demoBridge.ts`) existed only to re-key still-local chat onto live ids — chat going live made it dead code, so it is **deleted**. Demo mode runs on pure mock ids; live mode is real UUIDs end-to-end (only event categories remain name-bridged).
6. Read-only introspection confirmed the RLS policies exist but authenticated Data API grants were missing. A local grants migration (`20260709205903_grant_authenticated_chat_api_privileges.sql`) grants `authenticated` **select, insert** on `chat_messages` only (no update/delete, nothing on `chat_attachments`, nothing to anon). It has **not** been pushed. Until it is approved and pushed (`supabase db push`), live chat screens show the friendly "couldn't load messages" state with retry; demo mode is unaffected.

Verify RLS from the app: Daniel (admin) reads/sends in every team chat; Hannah sends in Choir; Ruth (no teams) sees no team chats, and a hand-crafted insert (or a send with a forged sender) fails server-side. Later: enable **Realtime** on `chat_messages` (add it to the `supabase_realtime` publication) and subscribe per open chat.

### 10. Storage & uploads

Buckets for avatars, announcement images, and chat attachments, with storage policies mirroring the same team/org helpers. The UI already treats images/attachments as placeholders, so this unlocks them.

### 11. Push notifications — preferences ✅ (done); tokens & delivery deferred

The "cheap early win" landed first: **notification preferences persist to `notification_preferences`** (2026-07-09), same pattern as the earlier slices. What shipped:

1. `src/lib/supabase/services/notifications.ts` — `fetchNotificationPreferences()` (the caller's single row, or null when they have never saved) and `saveNotificationPreferences()` (an **upsert** onto the `unique(user_id)` constraint, so the row is only created on first change; the database owns the id). RLS (002) is strictly personal — `user_id = current_profile_id()` for every command.
2. `AppDataContext` keeps two preference stores (persisted local/demo map + a session-only live row), switching on the same condition as the other slices. A user with no saved row gets the all-on defaults client-side — no row is created just by opening the screen. `updateNotificationPreferences` is async in both modes; a live save applies the server-returned row and rejects with a friendly message on failure (nothing changes locally).
3. The notification settings screen gained live loading, error+retry, per-toggle saving (the switch holds its new value while the save is in flight and reverts if it fails), a success toast, and a friendly inline save-error bar. Demo mode keeps the original instant local toggles, still covered by Reset Demo Data.
4. A pushed and verified grants migration (`20260709220528_grant_authenticated_notification_prefs_api_privileges.sql`) gives `authenticated` select/insert/update on `notification_preferences` (no delete — the app never deletes a row; nothing on `push_tokens`; nothing to anon).

**Push token registration is deferred** — this build cannot do it: `expo-notifications` is not installed, there is no EAS project id in app config (`getExpoPushTokenAsync` requires one), and Expo Go cannot receive remote pushes since SDK 53. The settings screen says delivery isn't active yet instead of offering a broken flow. When a development build exists: install `expo-notifications` via `npx expo install`, request permission from a user-initiated flow, upsert the token into `push_tokens` (RLS already covers it; add its grants then), and deliver via a Supabase Edge Function triggered on inserts (announcements, chat, rota changes), filtered through `notification_preferences`.

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

- **Event categories** — the app still uses the mock twelve; the events service matches live categories by name.
- **Unread badges** — demo-only simulation; live mode shows none until a `chat_reads` table exists.
- **Chat realtime** — live messages refresh on screen open/send/manual refresh only, until `chat_messages` joins the `supabase_realtime` publication.
- **Notification delivery** — preferences persist to the table now (step 11, first half), but no push token is registered and nothing pushes until a development build + Edge Function pass.
- **Images & attachments** — placeholders until step 10 (Storage).
- **Social/phone sign-in** — buttons stay "coming soon" until OAuth/SMS providers are configured; email/password is the wired path first.
- **Team management UI** (create teams, assign leaders) — admin does this via the dashboard until a screen exists.

## Recommended immediate next task

Steps 1–9 are done in app code (auth + live sessions + organisations/roles + announcements + events + the read-only teams/people directory + rotas/availability + choir songs/song selections + team chat). The temporary demo bridge is gone. Next, in order of value:

1. ✅ **Done (2026-07-09):** migrations `003`–`006` applied remotely with aligned history; the events grants migration `20260709093129_grant_authenticated_events_api_privileges.sql` is pushed and verified.
2. ✅ **Done (2026-07-09):** **step 5 — events**, including live `linked_event_id` on announcements.
3. ✅ **Done (2026-07-09):** **step 6 — teams & memberships** (fetch-only), retiring the email/name id bridges in auth, announcements, and events.
4. ✅ **Done (2026-07-09):** **step 7 — rotas & availability**, including the pushed and verified `20260709154733_grant_authenticated_rota_api_privileges.sql` migration. The teams-SELECT relaxation (Risks: team-name visibility, option b) was deliberately **not** bundled in — rota entries are only visible to team members, so their team names always resolve; it remains a candidate for a later migration pass.
5. ✅ **Done (2026-07-09):** **step 8 — songs & song selection**, including the pushed and verified `20260709171613_grant_authenticated_songs_api_privileges.sql` migration; choir songs passed manual QA.
6. ✅ **Done in app code (2026-07-09):** **step 9 — chat** (text-only, no realtime), retiring `demoBridge.ts`. **Blocked on approval:** push `20260709205903_grant_authenticated_chat_api_privileges.sql` (`supabase db push` after normal preflight) — until then live chat screens show the friendly error state.
7. ✅ **Done (2026-07-09):** **step 11, first half — notification preferences** persist to `notification_preferences`, including the pushed and verified `20260709220528_grant_authenticated_notification_prefs_api_privileges.sql` migration. Push token registration/delivery stays deferred (needs a development build with `expo-notifications` + an EAS project id).
8. Next slice candidates: the `handle_new_user` trigger migration if signup is next, **Realtime on `chat_messages`** to remove the manual-refresh limitation, or **Storage** (step 10) to unlock avatars/images/attachments.

Production-hardening follow-ups flagged by Supabase advisors (not blocking, do before launch): several SECURITY DEFINER helper functions are executable by `anon`/`authenticated` and should have EXECUTE revoked where not needed; `set_updated_at` and `validate_cross_table_consistency` need a pinned `search_path`; `announcements.created_by` and `announcements.linked_event_id` foreign keys are unindexed.
