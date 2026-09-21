# Mobile redesign: product contract and existing capabilities

This is the frozen product and backend boundary for the mobile redesign. Layouts, navigation, labels, and client-derived presentation may change. Identity, authority, lifecycle, persistence, notification behavior, and existing service contracts must remain intact. Current implementation takes precedence over historical product sketches.

## Baseline

Discovery date: 19 September 2026.

- Feature branch: `feat/mobile-ui-ux-reimagination`, created from current `main` at `ecde433`.
- The starting working tree was clean. The main-branch dependency baseline passed typecheck, lint, and all **856 tests across 76 suites**.
- Read-only migration discovery confirmed **38 aligned migrations**, ending with `20260917223118_fix_chat_read_cursor_conflict_target.sql`.
- The documented deployed functions are `manage-organisation-invitations` **v3** and `send-chat-message-push` **v7**.
- The redesign needs **no new backend capability so far**. No backend changes are planned or authorised by this redesign.
- No migration, SQL function, RPC, RLS policy, trigger, grant, Edge Function, Auth configuration, Realtime publication, storage configuration, notification contract, or remote application data was changed during this discovery.
- Existing native, invitation delivery, membership, team lifecycle, and push QA gaps remain separate release gates. The redesign does not certify those deployed flows as manually verified.

The baseline test result is an implementation starting point, not evidence that the redesigned screens are complete or visually sound. The redesign still requires its own final validation and visual review.

## Existing capability map

| Area | Existing data and actions available to the redesigned UI | Boundary |
| --- | --- | --- |
| Home | Visible announcements, upcoming event occurrences, current-profile rota assignments, available teams, unread chat counts, and message previews | Summaries must be derived from the active organisation's existing data. No invented urgency, announcement read status, attendance, or delivery status. |
| Teams | Organisation, visible profiles, visible teams, memberships, current organisation role, signed team photos | Members see their active teams. Church admins see all active teams and a separate archived metadata collection. There is no ordinary-member discovery of other church teams. |
| Team members | Existing membership/profile joins, names, avatars, team roles and stable alphabetical sorting | Viewing a team does not grant member-management or role-management authority. A read-only member list needs no new API. |
| Team lifecycle | Create, edit identity, optional initial admin, photo management, archive, list archived metadata, restore | Lifecycle authority is church-admin-only. Creation produces a generic team; it does not add the creator automatically. |
| Team membership | Add an existing eligible linked profile, remove an eligible membership, leave own team, change an existing member's team role | Use the existing AppData actions and permission helpers. Role changes are church-admin-only; member and role writes remain live-only. |
| My serving | Existing rota entries, assignments, responses and active accessible teams can produce one list across the active organisation's teams | Match the current profile. Preserve access rules, cancelled-date handling, per-assignment response semantics and multi-role assignments. No cross-organisation aggregate. |
| Team rota | List/detail, single-date create/edit/delete, cancel/restore, own availability, choir monthly planning | Rotas remain separate from church events. Availability notes remain optional. No swap, attendance or automatic scheduling feature. |
| Announcements | List/detail, pinned state, church/team audience, create/edit/delete, one image, optional linked event | Posting creates the published row. There is no backend draft or read/unread state. |
| Events | Organisation-wide events, category, optional related team, recurring base rows expanded on-device, create/edit/delete | A related team is context, not an audience restriction. No RSVP. Categories remain the existing app values mapped to live categories by name. |
| Choir/music | Searchable songs, lyrics, tags, external links, collaborative song CRUD, independently ordered praise/worship selections | Songs belong to choir teams. Song-library editing and service-specific song selection have different permissions. |
| Chat | Accessible conversations, immutable text messages, one optional image, latest previews, authoritative unread counts and forward-only read marking | No reactions, message editing/deletion, replies, receipts, typing, presence or arbitrary attachments. |
| Organisations | Account context, active linked organisation choices, organisation switching, no-organisation creation | Only one profile/organisation is active. Organisation creation is restricted to eligible no-organisation accounts. |
| Organisation members | Searchable bounded admin directory, exclusive role replacement, confirmed removal and self-leave | The list is capped at 200 results and exposes server-calculated last-admin/current-user state. It is not a total-count API. |
| Invitations | Existing-person or email invitation, history, resend, revoke, bounded preview, acceptance and replay | Email-targeted, church-admin-issued invitations only. No bulk invite, public search, self-join, approval queue or team/role choice during acceptance. |
| Profile | Account-global name, optional organisation name override, own photo, existing contact details | Email and phone are read-only. Profile editing must not become an account-contact or identity-link editor. |
| Notifications | Six stored preferences and existing device-registration lifecycle | Only chat, church/team announcements and rota updates deliver. Event and availability reminders have no delivery implementation. |

Primary source locations:

- [AppData collections and actions](../../src/lib/appData/AppDataContext.tsx), [derived selectors](../../src/lib/appData/selectors.ts), [central permissions](../../src/lib/permissions/index.ts).
- [Team directory/lifecycle services](../../src/lib/supabase/services/teams.ts), [team membership services](../../src/lib/supabase/services/teamMemberships.ts).
- [Account services](../../src/lib/supabase/services/accounts.ts), [organisation membership services](../../src/lib/supabase/services/organisationMemberships.ts), [invitation services](../../src/lib/supabase/services/invitations.ts).
- [Types](../../src/types/index.ts), [migration checkpoint](../supabase-migration-alignment-checkpoint.md), [integration plan](../supabase-integration-plan.md).

## Identity and organisation boundaries

The existing identity layers must remain distinct:

1. Supabase Auth is the sign-in identity.
2. `user_accounts` owns the account-global name and selected active profile.
3. `profiles` is a stable organisation identity, with at most one profile per Auth user in one organisation.
4. `profiles.access_status` controls active versus removed organisation access.
5. `organisation_roles` holds one exclusive organisation role.
6. `team_memberships` grants team membership and the existing `team_leader` role.

Open signup creates no organisation access and does not link a directory person by email. Active unlinked directory profiles are different from removed profiles: the former may retain pre-provisioned relationships when first invited; the latter must regain baseline access through the established re-invitation path.

Organisation switching must call `useAuth().switchOrganisation(profileId)`. The server validates ownership and the active profile, while the root's profile-keyed AppData provider discards old rows, signed URLs, unread state, timers and subscriptions. Changing a screen parameter or local selected organisation is not an equivalent switch.

The routing hub distinguishes unresolved account context from a genuinely empty account. Preserve this order: auth bootstrap, pending invitation, signed-out state, resolved active profile, account loading/error, no organisations, organisation selection. An account error must not sign the person out or imply that their organisation disappeared.

The effective display name remains organisation override, otherwise global name. Existing compatible `profiles.full_name` readers remain valid. Email and phone are not editable through these name APIs.

Sources: [AuthContext](../../src/lib/auth/AuthContext.tsx), [AuthGateScreen](../../src/features/auth/AuthGateScreen.tsx), [root provider/route guards](../../app/_layout.tsx), [account services](../../src/lib/supabase/services/accounts.ts).

## Authority and lifecycle invariants

| Action | Authority and invariant |
| --- | --- |
| Create/edit/archive/restore a team | Active organisation church admin. New teams may have zero admins. An explicitly selected eligible initial admin receives exactly one `team_leader` membership. |
| Create-team retry | Reuse the client-generated request key for retries of the same logical draft. Rotate after draft changes or the established conflict outcome. A photo failure after creation must not create another team. |
| Add team member | Team admin or church admin; existing active linked same-organisation profile; fixed ordinary-member role. |
| Remove team member | Team admin can remove ordinary non-self members but not peer team admins. Church admin can remove a non-self team admin only when another remains. Target organisation role does not protect an ordinary team membership. |
| Leave team | Own current membership only, with the existing final-team-admin protection. A church admin may retain organisation-level access after leaving. |
| Promote/demote team admin | Church admin only, including changing their own membership role. Existing row only; no new or deleted membership. Final-leader demotion to zero is valid and any warning is informational, never blocking. |
| Archive team | Soft archive preserves identity, memberships, avatar, chat/read state, rota/availability, songs, and historical relationships. Archived content cannot be opened as active chat/rota/music. |
| Restore team | Restore the same retained row and history. Restore before any team-role or active-content operation. |
| Change organisation role | Active linked church admin; exactly one of `general_member`, `announcement_manager`, `event_manager`, `church_admin`. Self-demotion uses the same last-admin rule. |
| Remove/leave organisation | Preserve global identity, stable profile/history and other organisations. Revoke current organisation roles, team memberships and profile push tokens; repair active profile atomically. |
| Re-invite removed profile | Matching verified Auth account reactivates the same profile with `general_member` only. Removed teams, elevated roles and push tokens do not return. |

Organisation role change, removal and leave share the server's last-effective-admin protection. Pending invitations, unlinked people and removed profiles do not count as effective admins. Do not copy this last-admin block into team-role demotion, whose zero-admin outcome is explicitly supported.

Removing organisation access retains future rota assignments as history. It does not silently reassign duties. Confirmation copy must not promise deletion of the person, all their data, or membership in other organisations.

Organisation member summaries expose active/unlinked/removed state, role, team count, invitation state, current-user status and last-admin status. `team_count` counts retained memberships, including archived-team memberships; do not relabel it as an active-team count. Search is server-backed and bounded at 200 results, with no cursor or total count in the current service.

Sources: [permission helpers](../../src/lib/permissions/index.ts), [membership specification](../organisation-membership-role-management-v1.md), [team creation/archive migration](../../supabase/migrations/20260715004513_add_team_creation_editing_and_archive.sql), [team role migration](../../supabase/migrations/20260719110500_add_team_role_management.sql), [request-id migration](../../supabase/migrations/20260917093926_add_team_creation_idempotency.sql).

## Serving, availability and music

`upcomingResponsibilities()` already derives current-profile assignments across accessible team data, excludes cancelled dates, and deduplicates a date when one person holds multiple roles. The new serving view can extend presentation without a new RPC. Use active, accessible teams and the existing assignment identity; do not impose a new membership-only authority rule. A church admin who left a team can still have admin access to a retained assignment, and the deployed `is_my_assignment` checks the current profile and an active team rather than requiring a membership row.

Keep assignment data intact when grouping for display. `peopleForEntry()` combines a person's role names and uses their first responded assignment for the existing per-person summary. This is presentation, not a new shared response record. Only the assigned person can save a response; a note is always optional. The existing role-change save path removes/inserts assignments and resets their associated responses. Do not change that behavior to simplify the redesigned form.

Cancellation retains the date and its explanation. Cancelled dates are not upcoming responsibilities; a cancellation may offer a separately chosen announcement, but must not imply that no push is sent. Monthly planning continues through the existing batch action, including honest reporting of partial creation.

Ordinary choir members can add, edit and delete library songs. Selecting songs for a date is narrower: Praise Leader edits praise, Worship Leader edits worship, legacy Song Leader edits both, and choir team admins/church admins override both. Preserve these meaningful role strings and section boundaries even when UI labels become friendlier.

Sources: [selectors](../../src/lib/appData/selectors.ts), [permissions](../../src/lib/permissions/index.ts), [rota service](../../src/lib/supabase/services/rotas.ts), [song service](../../src/lib/supabase/services/songs.ts), [active assignment SQL helper](../../supabase/migrations/20260715004513_add_team_creation_editing_and_archive.sql).

## Announcements, events, chat and media

- An announcement has a church or team audience, optional pinned state, optional linked event and at most one image. “Recently posted” is supportable; “Unread” is not. There is no backend announcement draft, acknowledgement or per-person read record.
- Events are visible to the active organisation. A team link is descriptive context, not an RSVP or restricted audience. The linked team name may be unavailable to non-members because RLS hides that team; omitting unavailable context is the current safe fallback.
- Recurring events remain one base record expanded client-side. Editing a displayed occurrence must preserve the existing series behavior.
- Chat messages are immutable, sorted by `(created_at, id)`, with one optional image and an optional caption. Image-only message previews use “Photo”. Failed sends retain the draft and pending photo.
- Live unread truth comes from the existing server summary/cursor path. Opening Messages or showing a Home preview does not mark a team read. Opening a chat clears only that chat through its established active-chat lifecycle. Push is not unread truth.
- Profile/team avatars, announcement images and chat images remain private storage paths displayed through AppData's signed-URI resolvers. Do not render stored paths directly, make a bucket public, or persist signed URLs in demo state. Preserve fallback initials and unavailable-image behavior.
- Existing media boundaries remain JPEG/PNG/WebP, under 5 MB, with permission-on-tap picker flows. No new camera, cropping, arbitrary-file, gallery or upload behavior is introduced.

Sources: [announcement service](../../src/lib/supabase/services/announcements.ts), [event service](../../src/lib/supabase/services/events.ts), [chat service](../../src/lib/supabase/services/chat.ts), [read-state service](../../src/lib/supabase/services/chatReadState.ts), [chat Broadcast manager](../../src/lib/supabase/chatBroadcast.ts), [AppData media resolvers](../../src/lib/appData/AppDataContext.tsx).

## Invitation states and safe exits

The existing invitation state model includes signed-out, demo-account, account mismatch, missing verified email, name confirmation, pending, accepted/replay, invalid, expired, revoked and superseded states. Preserve the bounded server preview and masked email; the client must not decide acceptance from a typed email or metadata alone.

The invitation screen adopts a route token once, saves it through the existing pending-link abstraction and removes it from route params. Its retained shown-token state keeps a settled reason visible while the persisted token is cleared. Restyling must not re-save an accepted, dismissed or terminal token on remount.

Signed-in accounts always have “Not now”, which clears local pending state without revoking the server invitation. Changing accounts preserves the invitation through intentional sign-out. Normal exits use the routing hub `/`; `/login` is not registered for an authenticated account. Acceptance refreshes account context before opening the resulting organisation.

Email configuration failure means no invitation was issued or superseded. Provider delivery failure can mean an invitation was saved but not emailed. Keep `wasInvitationSaved()` behavior and the “Email not sent yet” recovery through Resend. Resend rotates the token; it is not a retry of the same URL. Expiry remains the stored seven-day instant, displayed by the existing UTC formatter.

Raw invitation tokens cannot be recovered from history. Do not add a share/copy-existing-link action that implies otherwise. Password reset remains deferred product work, and no working reset control should be invented.

Sources: [acceptance screen lifecycle](../../src/features/invitations/InvitationAcceptScreen.tsx), [pending-link storage](../../src/lib/invitations/pendingInvitation.ts), [invitation service](../../src/lib/supabase/services/invitations.ts), [expiry formatter](../../src/lib/invitations/expiry.ts), [email readiness runbook](../production-email-readiness.md).

## Notification truths

| Preference | Existing behavior |
| --- | --- |
| `announcement_notifications` | Church-wide announcement delivery preference. |
| `team_announcement_notifications` | Team announcement delivery preference. |
| `chat_notifications` | Team chat message delivery preference. |
| `rota_notifications` | Rota assignment and relevant date-change delivery preference. |
| `event_reminders` | Saved preference; no reminder delivery implementation. |
| `availability_reminders` | Saved preference; no reminder delivery implementation. |

Preferences belong to the active organisation profile, not one account-wide row. A missing row uses all-on defaults without writing merely because the screen was opened. Preserve save-in-flight/revert behavior and the exact keys. The redesigned screen may clarify that reminders are not sent yet while retaining the existing preference semantics.

Device permission is requested only following the explicit enable action. Use the existing registration hook/provider for hydration, identity-bound persistence, rebind and sign-out cleanup. The active profile remains the sole owner of this installation's token. Do not infer permission from a preference toggle or promise delivery merely because registration succeeded. Supported iOS simulators may attempt registration; web/unsupported builds retain friendly states. Tokens never appear in product UI or logs.

Push delivery is best-effort after successful existing mutations. Notification failure must not turn a successful chat send, announcement post or rota save into a failed save. Team role changes, availability responses, song selections, deleted entries and removed assignments do not gain notifications in the redesign.

**Push-tap routing is an existing absent capability.** No notification-response listener exists under `app/` or `src/`; the device notification module explicitly handles registration rather than response navigation. The redesign does not add notification behavior or claim that tapping a push opens a specific destination. Keep this in the native QA handoff and release-hardening limitations.

Current notification-settings copy incorrectly describes all push delivery as a future update and calls preferences account-wide. Presentation may correct those statements to match the existing deployed kinds and active-organisation ownership. It must still distinguish deployed functionality from the pending physical-device delivery QA.

Sources: [notification settings](../../src/features/notifications/NotificationSettingsScreen.tsx), [device registration provider](../../src/features/notifications/useDevicePushRegistration.ts), [device notification module](../../src/lib/notifications/index.ts), [preference service](../../src/lib/supabase/services/notifications.ts), [push delivery service](../../src/lib/supabase/services/pushDelivery.ts).

## Frontend safeguards during implementation

- Preserve the profile-keyed AppData provider, auth routing hub, scope-generation guards, canonical membership updates and existing coalesced refresh paths. Reposition controls by calling those actions, not by bypassing them with duplicate service calls.
- A prominent organisation header must use the resolved active account organisation or an intentional loading state. AppData temporarily falls back to demo organisation metadata while a live directory loads; that fallback must not flash as the person's church.
- Permission helpers determine presentation; RLS and RPCs remain authoritative. Direct links still need friendly unavailable/denied states while data or authority resolves.
- Separate loading, empty and error states. An empty initial live collection does not prove that the church has no data. Refresh failure does not prove a previous successful mutation failed.
- Preserve demo/live separation. Demo data and permitted demo lifecycle changes remain local. Team-member/role writes, live organisation membership, invitations and storage are not silently simulated as successful live actions.
- Test long names, large result sets and bounded search without presenting truncated results as a complete directory. Keep names/emails available where disambiguation is necessary.
- Keep narrow service payloads and existing sanitised errors. Do not expose SQL/RLS errors, Auth IDs, invitation hashes, push tokens or delivery-ledger data as product details.

## Historical documentation conflicts

| Historical statement | Current truth for this redesign |
| --- | --- |
| Multi-organisation onboarding is future work in the original design/build documents | Open signup, no-organisation creation, invitations and active-organisation switching exist. Preserve their current implementation. |
| Seed README recommends renaming legacy migration files and linking signup by matching email | Migration filenames are immutable, and the email auto-link trigger was removed. Never follow those obsolete setup steps. |
| Earlier integration sections describe screen-scoped chat Postgres Changes and client-computed unread | Chat uses session-scoped private Broadcast with the server-authoritative cursor and summary. |
| Some sections describe 13 shared tables, older migration counts or older function versions | Current baseline is 14 shared publication tables, 38 migrations, invitation v3 and push v7. Historical checkpoints are not current-state claims. |
| Notification registration is session-only or all delivery is a later update | Registration state now hydrates from identity-bound persistence; chat, announcement and rota delivery are deployed, with physical-device QA pending. |
| Original sketches propose notification presets, per-team mute or an all-notifications switch | Only the six existing boolean keys are implemented. Do not invent additional preference semantics. |
| Original documents mention organisation settings and category management | No shipped organisation editing or category-editing UI/service exists; preserve actual reachable capabilities rather than inventing those features. |
| The build prompt gives conflicting Home content order | The redesign brief authorises a relevance-led hierarchy while preserving the available capabilities. |

## Backend blocker boundary

No backend change is required for the current proposed presentation scope. There are no active backend blocker requests at this checkpoint.

If a later design genuinely requires cross-organisation serving, ordinary-member team discovery, announcement read tracking, a notification inbox, request-to-join, reminder scheduling or recovered invitation links, record a DESIGN BLOCKER with desired UX, missing data/action, existing limitation, why current APIs cannot satisfy it, smallest proposed addition, security implications, client-only fallback and affected screens. Continue unaffected work. Do not implement an addition without explicit approval.

## Reading and evidence coverage

Read completely for this discovery:

- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `docs/shift_shepherd_design_doc.md`
- `docs/one-shot-build-prompt.md`
- `supabase/README.md`
- `docs/supabase-integration-plan.md`
- `docs/supabase-migration-alignment-checkpoint.md`
- `docs/production-email-readiness.md`
- `docs/organisation-membership-role-management-v1.md`
- `supabase/migrations/001_initial_schema.sql`
- `supabase/migrations/002_rls_policies.sql`
- `supabase/seed/README.md`

Additional source inspection covered current selectors/permissions, account and organisation-member services, invitation service/screen/token lifecycle, root guards and account routing, notification screen/device module, team directory service, AppData collection and mutation boundaries, and relevant later migration definitions. The selector and membership-governance regression suites were read to confirm the established behavioral distinctions.

This document records contract discovery, not a complete runtime security audit. Every later migration and every regression test was not independently re-read in full. No live membership, invitation, push or native action was exercised for this document. The separate current-state visual audit, flow map, implementation tests, final validation and native handoff remain necessary.
