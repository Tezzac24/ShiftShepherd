# Supabase Backend Foundation

This folder holds the database foundation for Shift Shepherd's intended production backend. Existing auth/live data, membership governance, shared freshness, server-authoritative unread, and private chat Broadcast slices are deployed and QA-complete. Chat now receives freshness through exact private Broadcast topics; the 13 non-chat shared tables remain on Postgres Changes. Push Token Registration and chat push delivery are live foundations, with physical-iPhone delivery QA pending.

> **Current dev-project state:** remote migration history is aligned through deployed `20260712001940_add_invite_onboarding_identity_foundation.sql`. `20260712103321_add_organisation_membership_role_management.sql` is the only local-only migration. `manage-organisation-invitations` v1 and active-profile-compatible `send-chat-message-push` v5 are deployed and ACTIVE; invitation runtime secrets and allowed redirects are configured, and non-mutating function smoke tests passed. The new membership SQL was not runtime-executed because Docker was unavailable; its deployment/manual QA, genuine no-organisation device QA, first real invitation delivery/acceptance, disposable-account invitation/multi-org QA, and physical-iPhone push QA remain pending. **Do not rename or edit applied migrations.**

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
│   ├── 20260709233705_link_auth_users_to_existing_profiles.sql # link new Auth users to matching existing profiles
│   ├── 20260710020944_enable_realtime_for_chat_messages.sql # add chat_messages to the supabase_realtime publication (live chat realtime)
│   ├── 20260710031212_add_chat_read_states.sql # private per-user chat read states for unread badges (cursor added by 20260711173139)
│   ├── 20260710105140_add_profile_avatar_storage.sql # pushed: private profile-avatars bucket, policies, avatar RPC
│   ├── 20260710114621_add_announcement_image_storage.sql # pushed: private announcement-images bucket + policies
│   ├── 20260710124206_add_chat_image_attachments.sql # pushed: private chat images + attachment grants/RPCs
│   ├── 20260710162415_fix_chat_image_attachment_permissions.sql # pushed: qualify the chat upload policy's object path
│   ├── 20260710171200_add_push_token_registration.sql # pushed: register_push_token RPC (no table grants)
│   ├── 20260710234443_add_push_delivery_foundation.sql # pushed: push_notification_deliveries ledger + service_role grants
│   ├── 20260711024931_harden_security_definer_functions.sql # pushed: revoke anon/PUBLIC helper execution, pin search paths
│   ├── 20260711041539_add_profile_editing_and_team_avatars.sql # pushed: narrow RPCs + private team-avatar bucket
│   ├── 20260711050344_restrict_profile_editing_to_name.sql # pushed: drop two-arg update_own_profile, add name-only RPC
│   ├── 20260711063412_add_team_membership_management.sql # pushed: narrow add/remove membership RPCs
│   ├── 20260711154126_refine_team_membership_governance.sql # pushed: governed removal + Leave Team
│   ├── 20260711154134_enable_shared_live_data_realtime.sql # pushed: shared-domain publication tables
│   ├── 20260711173139_add_team_chat_read_cursor.sql # pushed: server-authoritative chat read cursor + unread summary
│   ├── 20260711195143_migrate_chat_realtime_to_private_broadcast.sql # deployed: secure private chat Broadcast transport
│   ├── 20260712001940_add_invite_onboarding_identity_foundation.sql # deployed: identity/invitation foundation
│   └── 20260712103321_add_organisation_membership_role_management.sql # local-only: safe org access/role lifecycle
├── functions/
│   ├── send-chat-message-push/  # deployed v5 with active-profile-compatible sender resolution
│   └── manage-organisation-invitations/ # deployed v1 trusted invitation/email gateway
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

The deployed identity foundation distinguishes Supabase `auth.users`, one account-global `user_accounts` row, and stable organisation-scoped `profiles` rows. One Auth user may own one profile per organisation; `user_accounts.active_profile_id` is ownership-validated and `current_profile_id()` scopes normal RLS queries to that single organisation. The local membership migration adds `profiles.access_status`: removed profiles keep their IDs and historical attribution but grant no access. Effective display name is `profiles.display_name_override ?? user_accounts.global_display_name`, while synchronized `profiles.full_name` preserves existing readers. Demo/mock data remains separate.

## Getting started (when you're ready)

### Completed chat Broadcast migration

`20260711063412_add_team_membership_management.sql` is already pushed, verified, and manually QA-complete. It remains unchanged.

`20260711154126_refine_team_membership_governance.sql` replaces `remove_team_member(p_team_id uuid, p_profile_id uuid)` and adds `leave_team(p_team_id uuid)`. Both return `(membership_id, team_id, profile_id, role, created_at)`, derive identity/organisation/roles server-side, use `SECURITY DEFINER` with `search_path=''`, and expose authenticated EXECUTE only. Organisation role never protects an ordinary target team membership. Team admins cannot remove peer admins; church admins may remove a non-self team admin only when another remains. Both leader-removal paths lock the same team row before membership/count/delete, preventing concurrent final-admin loss. The migration explicitly leaves authenticated with SELECT-only `team_memberships` access and no anon table access. It changes no profile, Auth user, organisation role, other team membership, data row, invite, or role assignment.

`20260711154134_enable_shared_live_data_realtime.sql` adds exactly the 13 existing tables used by the shared announcements/events/rotas/songs/directory loaders to `supabase_realtime`. It does not republish chat tables, set `REPLICA IDENTITY FULL`, alter RLS/grants, create a webhook/Edge Function, or add data. Events are invalidation signals; AppData re-runs RLS-scoped loaders. AppState foreground catch-up is mandatory because a removed member may not receive the membership DELETE after RLS access is lost.

`20260711173139_add_team_chat_read_cursor.sql` is applied and immutable. It owns the server-authoritative cursor, rollout backfill, narrow mark/summary RPCs, and write restrictions. Those contracts are unchanged.

`20260711195143_migrate_chat_realtime_to_private_broadcast.sql` is deployed and manually QA-complete. It adds receive-only private Broadcast authorization on `realtime.messages`, then uses database triggers to emit minimal v1 invalidations:

- `team-chat:<teamId>` / `chat_message_inserted`: `version`, `message_id`, `team_id`, `sender_id`, and `created_at` only. The client fetches that exact `(team_id, id)` row through normal RLS, including its bounded attachment join.
- `profile-chat-read:<profileId>` / `chat_read_state_changed`: `version` and `team_id` only. The client reconciles the authoritative summary.

The policies are SELECT-only and use `realtime.topic()` plus canonical UUID parsing; there is no client Broadcast INSERT policy or client send path. Team topics authorize normal members and same-organisation church admins through `can_access_team`; profile topics authorize only the current profile. Trigger functions are `SECURITY DEFINER`, pin `search_path=''`, derive topics from `NEW`, and are not executable by app roles. The migration removes only `chat_messages` and `chat_read_states` from the `supabase_realtime` publication after the triggers/policies exist. The 13 non-chat shared-data tables remain on Postgres Changes.

Deployment verification confirmed the migration version, both private-topic policies, trigger definitions/privileges, minimal payloads, no Broadcast INSERT policy, and removal of only the two chat tables from the publication. Two-user/multi-device, church-admin, membership removal/re-add, token refresh, reconnect/foreground, image, account-switch, and demo QA passed. The 13 unrelated shared-data tables remain on Postgres Changes.

### Local organisation membership and role management

`20260712103321_add_organisation_membership_role_management.sql` is local-only. It adds explicit `active`/`removed` organisation access with removal audit fields and replaces active-profile/account helpers so removed profiles cannot be current, listed as account access, switched to, or added to a team. Profiles, global accounts, Auth users, other organisations, messages, authored content, rota assignments, availability, read cursors, preferences, invitation history, and delivery history are retained.

The authenticated app surface is four narrow RPCs:

- `list_organisation_members(p_search, p_limit)` — church-admin-only bounded read model; no Auth IDs, invitation hashes, or push tokens.
- `set_organisation_member_role(p_profile_id, p_role)` — replaces the target's one schema-supported role.
- `remove_organisation_member(p_profile_id)` — admin-owned removal of another active linked member.
- `leave_organisation()` — caller-owned departure with no caller/profile/organisation argument.

Role change, admin removal, and self-leave lock the same organisation row before counting effective linked active `church_admin` profiles, so concurrent operations cannot leave zero admins. Remove/leave deletes current organisation roles, team memberships, and profile-owned push tokens, then marks the stable profile removed; active profile is selected automatically for one remaining organisation, cleared for the selector when several remain, or cleared for no-organisation state. Every removal touches the target account's owner-RLS `user_accounts` row, including non-active-organisation removal, so shared Postgres Changes invalidation clears and remounts its old AppData/channels promptly; the remote baseline remains 13 shared tables until this migration is deployed.

Removed profiles can be invited again through the existing Edge Function. Acceptance requires the same matching verified Auth account, reactivates the same profile ID, clears removal audit fields, defensively removes stale roles/teams/tokens, and inserts `general_member` only. Active unlinked directory profiles retain the existing first-invitation behavior.

Direct authenticated profile/role writes remain revoked and the old permissive role-write policy is dropped. Every new definer function has `search_path = ''`, fully qualified relations, server-derived caller/tenant authority, and explicit ACLs. The local deterministic suite passes 358 tests across 48 suites. SQL runtime execution and advisors remain unverified because Docker was not running; do not claim the migration has passed database execution.

### Deployed invite and multi-organisation foundation

`20260712001940_add_invite_onboarding_identity_foundation.sql` is deployed and verified. It removes the historical email auto-link trigger, replaces global profile/Auth uniqueness with one profile per Auth user per organisation, adds `user_accounts`, a validated active profile, organisation display-name overrides, deterministic existing-user/name backfill, active-aware identity helpers, and narrow account/name/switch/create-organisation RPCs. Existing profile IDs and their team, rota, chat, unread, notification, push, directory, and role relationships are untouched.

`organisation_invitations` stores normalized target email, optional existing unlinked profile, audit/status timestamps, and only a unique 32-byte SHA-256 token hash. Pending rows are unique per organisation/email and per target profile. Resend supersedes the previous row/token, revoke is immediate, expiration is seven days, and row-locked acceptance is idempotent for the same account. Acceptance checks `auth.users.email` plus `email_confirmed_at`, reuses or creates exactly one organisation profile, preserves existing relationships/roles, adds only `general_member` when no role exists, and makes the accepted profile active. Phone-only or mismatching/unverified identities cannot claim an invitation.

`manage-organisation-invitations` v1 is deployed and ACTIVE. Public preview is protected by the high-entropy app token and reveals only bounded invitation context; send/resend/revoke/accept manually validate the user JWT, and the service-only database operations repeat tenant/admin/identity checks. Raw tokens exist only in request memory and the email link. The isolated Resend adapter uses runtime-only `RESEND_API_KEY`, `INVITATION_FROM_EMAIL`, and `INVITATION_APP_BASE_URL`; the allowed `/invite/accept` redirect and sender are configured. No secrets belong in Expo.

Deployment completed in that controlled order: the migration was applied and verified, invitation URL/sender/secrets were configured, `manage-organisation-invitations` v1 and active-profile-compatible `send-chat-message-push` v5 were deployed, and non-mutating function smoke tests passed. Disposable-account open-signup, no-org/create-org, first real delivery/acceptance, new/existing invite, wrong-account, OAuth, phone-only, lifecycle, name, multi-org, and regression QA remain deferred. Do not invite real users until this passes.

The pre-membership deterministic regression suite passed 296 tests across 43 suites; the current local implementation passes 358 tests across 48 suites (the deployed Broadcast baseline was 211/31). Edge/Deno runtime and provider delivery are outside Jest; non-mutating identity-function smoke tests passed, while membership SQL runtime execution, member/role manual QA, and first real email delivery/acceptance remain manual gates.

1. Install the [Supabase CLI](https://supabase.com/docs/guides/cli) and run `supabase init` in the repo root (keeps this folder; generates `config.toml`).
2. `supabase start` for a local stack, or `supabase link --project-ref <ref>` for a hosted dev project.
3. Apply migrations:
   - **Hosted dev:** remote history is aligned through `20260712001940_add_invite_onboarding_identity_foundation.sql`; `20260712103321_add_organisation_membership_role_management.sql` should appear local-only. New changes go through `supabase migration new <name>` (leave the generated filename unchanged) followed by an explicitly approved `supabase db push`. **Do not rename `001`–`006` or timestamped migrations.** `npm run check:migrations` is an offline filename guard; local/remote alignment still requires `npx supabase migration list`.
   - **A fresh project from scratch:** `supabase db push` applies `001`–`006` and the timestamped migrations in order (numeric prefixes are accepted by the CLI); or paste each migration in version order in the dashboard SQL editor. `supabase db reset` (local stack) requires Docker.
4. Existing dev users remain linked through the deterministic backfill. After `20260712001940` is deployed, new Auth users receive only a global account shell; organisation access must come from invitation acceptance or the no-org create-organisation RPC. Do not manually restore email auto-linking.
5. Copy `.env.example` to `.env` and fill in your project URL and anon key (the anon key is safe to ship in the app; RLS is the security boundary).

## Chat message push delivery (deployed; backend skip path verified)

Chat Message Push Delivery V1 is server-side only — the app never talks to Expo's push API itself. After a live chat send succeeds, the app makes one best-effort, fire-and-forget call to the `send-chat-message-push` Edge Function with just the `messageId` (see `src/lib/supabase/services/pushDelivery.ts`); chat send UX is never blocked by delivery. The function re-validates everything against the database using the service role (which exists only in the Edge Function runtime):

- caller holds a valid user JWT (`verify_jwt` is on in `config.toml`) and maps to a linked profile;
- the message exists, the caller **is its sender**, it is at most 5 minutes old (anti-replay), and the caller can access the team (membership or `church_admin`);
- recipients are the team's other members with `notification_preferences.chat_notifications` enabled (a missing row means the app's all-on defaults) and at least one registered push token; the sender is never notified.

Idempotency comes from the `push_notification_deliveries` ledger (migration `20260710234443`): each (event, recipient, token) attempt is claimed with `ON CONFLICT DO NOTHING` on a `NULLS NOT DISTINCT` unique index, so duplicate calls can never double-send. Outcomes (sent + Expo ticket id, failed + safe error code, skipped + reason) are recorded per row; app roles have **no** access to the ledger, and push tokens are never logged or returned. The notification itself is deliberately generic — title "New team message", body "You have a new message in <Team Name>.", `data: { type: 'chat_message', teamId, messageId }` — no message text or image details. There are no triggers, cron, receipts polling, or other event types.

The migration and function are already live. Backend QA confirmed authenticated invocation and expected `no_push_token` skips, with no raw tokens or message content in logs/ledger. Real Expo delivery is still unverified: physical iPhone development-build QA must confirm recipient registration, Expo ticket creation, banner display, no self-notification, and preference-off suppression. Do not add announcement, event, rota, or availability delivery until that chat QA passes.

The hosted Edge runtime injects `SUPABASE_URL` and the service role key (`SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEYS`) automatically — no manual secret is required. Only if the Expo project has "Enhanced Security for Push Notifications" enabled: `npx supabase secrets set EXPO_ACCESS_TOKEN=<token>`.

## Auth user to profile linking

`20260709233705_link_auth_users_to_existing_profiles.sql` introduced the historical email auto-link behavior. The deployed forward migration deliberately drops that trigger and global uniqueness without editing history. It backfills every existing linked Auth user into `user_accounts`, preserves every profile ID and visible name, chooses the oldest `(created_at,id)` profile as the deterministic active profile, and allows at most one profile per Auth user per organisation.

After the new migration is deployed, Auth signup creates only a `user_accounts` shell. Email match alone never grants organisation access. New links occur only inside row-locked invitation acceptance after a matching verified Auth email, or the no-org user creates their own organisation transactionally. Never reintroduce direct authenticated `profiles.auth_user_id` writes or the old trigger.

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
