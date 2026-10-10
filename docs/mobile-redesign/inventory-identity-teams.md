# Baseline inventory: identity, organisations, teams and personal settings

This is the source audit for the mobile redesign, based on `ecde433` before UI
implementation. It inventories existing capabilities, routes, transitions and
regression boundaries. It does not describe the proposed design.

No rendered inspection was performed for this report. Statements about layout
refer to the component structure and styles; long-text, large-text, keyboard,
screen-reader and native interaction concerns still require visual or device
verification. The separate baseline visual audit supplies screenshot evidence.

## Scope and counting method

The inventory covers authentication, account bootstrap, no-organisation state,
invitation acceptance and administration, organisation membership and roles,
team directory and lifecycle, team members, Profile, and notification settings.
Chat, rota, announcement, event and music routes are included here only as team
entry points; their complete inventories belong to the corresponding feature
audit.

Flow counts mean **route transitions from the relevant primary tab**, excluding
the starting tab, in-place form changes, and confirmation dialogs. Moving from
Home to a different starting tab adds one transition. Completion destinations
are recorded separately when they follow the action.

The primary tabs are currently Home, Calendar, Teams, Messages and Profile, in
that order. Their routes are registered in `app/(tabs)/_layout.tsx`; unread chat
count contributes to the Messages tab badge without marking any chat read.

## Route and state inventory

All listed route files delegate to their feature implementation. Normal content
requires an active organisation profile through the root route guards.

| Area | Route and implementation | Existing capabilities and states |
| --- | --- | --- |
| Routing and bootstrap | `/` → `src/features/auth/AuthGateScreen.tsx` | Startup; pending invitation precedence; signed-out redirect; active-profile Home; unresolved-account loading; account error, retry and sign-out; genuine no-organisation state; organisation selection. |
| Login and signup | `/login` → `src/features/auth/LoginScreen.tsx` | Email/password; inline signup mode when configured; name/email/password validation through AuthContext; confirmation email; submitting and error states; eight demo accounts; Google, Facebook and phone informational placeholders. Successful authentication dispatches no navigation from this screen. |
| No organisation | `/no-organisations` → `src/features/organisations/NoOrganisationsScreen.tsx` | Confirm a global name before organisation actions; create organisation; harmless Request to join explanation; sign-out; name-save and refresh errors with retry. |
| Organisation creation | `/organisations/create` → `src/features/organisations/CreateOrganisationScreen.tsx` | Name only, maximum 120 characters; transactional create; creator becomes church admin; no automatic teams or sample members; submitting/error; replace to Home after refreshed account context. The existing server contract allows creation only before joining an organisation. |
| Organisation switch | `/organisations/select` → `src/features/organisations/OrganisationSelectorScreen.tsx` | Account-linked organisations with organisation-specific identity; explicit switch; busy/error; empty state; sign-out. The root hides the native header. |
| Invitation acceptance | `/invite/accept` → `src/features/invitations/InvitationAcceptScreen.tsx` | Public preview; signed-out continuation; pending-link persistence; demo and wrong-account switch; verified-email requirement; optional name confirmation; accept and accepted replay; invalid, expired, revoked and superseded; acceptance failure; signed-in Not now escape. |
| Invitation administration | `/organisations/invitations` → `src/features/invitations/InvitationAdminScreen.tsx` | Live church-admin gate; email-only Add & invite; invite an existing unlinked or removed profile; history; pending/sent/unsent status; explicit UTC expiry; resend/revoke confirmations; load/action failures; saved-but-unsent recovery. |
| Organisation members | `/organisations/members` → `src/features/organisations/OrganisationMembersScreen.tsx` | Live admin-only directory; search; active/unlinked/removed status; role, team and pending-invitation badges; current user and final-admin states; manage role; remove access; own leave shortcut to Profile; loading, empty, no-match, error, retry and refresh. |
| Organisation role | `/organisations/members/[profileId]` → `src/features/organisations/OrganisationMemberRoleScreen.tsx` | Four exclusive choices; capability descriptions; high-privilege warning; church-admin promotion/demotion confirmation; protected final-admin demotion; removed/unlinked/not-found/direct-route rejection; save/error/cancel. |
| Teams directory | `/(tabs)/teams` → `src/features/teams/TeamsScreen.tsx` | Accessible active teams; church admin sees all active teams; descriptions, type/leadership badges, next rota, latest message and unread; create/archive actions after authority resolves; loading/error/retry/empty. |
| Team hub | `/teams/[teamId]` → `src/features/teams/TeamSpaceScreen.tsx` | Identity/photo; first-name member badges; next active rota with personal assignment response; full rota/chat/music shortcuts; first two team announcements; leader rota, monthly planning and announcement actions; own membership and Leave team; archived, missing, denied, loading and partial-domain states. |
| Team settings | `/teams/[teamId]/settings` → `src/features/teams/TeamSettingsScreen.tsx` | Live team-photo add/change/remove; member-management link for a manager; lifecycle edit link for a church admin; loading, missing and denied. |
| Team creation | `/teams/new` → `src/features/teams/TeamCreateScreen.tsx` | Name and optional description; explicit no-admin default; searchable optional initial admin; optional live photo; draft validation; authority/loading/error states; idempotent create retries; separate post-create photo failure with retry or continue. |
| Team edit and archive | `/teams/[teamId]/edit` → `src/features/teams/TeamEditScreen.tsx` | Church-admin-only name/description save; independent live photo controls; archive consequence confirmation; typed values retained on failure; archived guard; archive success routes to archived list. |
| Archived teams | `/teams/archived` → `src/features/teams/ArchivedTeamsScreen.tsx` | Church-admin metadata list; archive date; restore confirmation; same-ID restore; duplicate-submit guards; empty/loading/error/retry. Does not expose archived team content. |
| Team member management | `/teams/[teamId]/settings/members` → `src/features/teams/TeamMembersScreen.tsx` | Live manager-only member list; Add member route; protected-removal explanations; removal confirmation; church-admin-only promotion/demotion including self and final-leader demotion; per-action loading/error; demo, missing and denied states. |
| Add team member | `/teams/[teamId]/settings/members/add` → `src/features/teams/TeamAddMemberScreen.tsx` | Live manager-only searchable existing active linked same-organisation candidates; Add; no-match and everyone-added states; load/action errors; immediate canonical candidate/list update. |
| Profile and settings | `/(tabs)/profile` → `src/features/profile/ProfileScreen.tsx` | Identity/photo; inline default and optional organisation-name edit; contacts read-only; role badges; actual team memberships; organisation switch; live admin organisation controls; notification preferences; demo reset; support placeholder; leave organisation; sign-out. |
| Notifications | `/settings/notifications` → `src/features/notifications/NotificationSettingsScreen.tsx` | Six existing preference keys; immediate demo save; optimistic live switch with rollback/error; load/error/retry; explicit device registration; hydrating, registered, permission-denied, unsupported-device, development-build-required, missing-project, failure and working states. |

## Root routing and identity boundaries

`app/_layout.tsx` protects normal content with an active `user`. Organisation
creation and selection require an authenticated account; no-organisation
requires an authenticated account without an active profile. Invitation
acceptance remains outside these guards.

`AuthGateScreen` resolves destinations in this order:

1. Wait for authentication bootstrap.
2. Resume any pending invitation.
3. Send a signed-out person to Login.
4. Send a resolved active profile, including demo, to Home.
5. Wait or offer retry for an unresolved or failed live account lookup.
6. Show the no-organisation state only after a resolved empty result.
7. Otherwise show the organisation selector.

`AuthContext` and the account-keyed AppData provider are the implementation
boundaries. Switching or losing organisation access must discard old scoped
rows and channels before new content renders. A failed/unresolved lookup is not
evidence of zero organisations. Login must not add imperative success navigation
that races the guards or provider remount.

## Current common flows

| Goal | Existing path | Transitions |
| --- | --- | ---: |
| Open a team | Teams → Team | 1 |
| Open team chat from Teams | Teams → Team → Chat | 2 |
| Open team chat from Messages | Messages → Chat | 1 |
| Inspect full team rota | Teams → Team → Rota | 2 |
| Inspect or update the next duty | Teams → Team → next rota detail | 2 |
| Inspect another rota date | Teams → Team → Rota → detail | 3 |
| Create a rota entry or team announcement | Teams → Team → form | 2 |
| Plan the choir month | Teams → Team → Plan the Month | 2 |
| Browse choir songs | Teams → Team → Song Database | 2 |
| See member names as an ordinary member | Teams → Team's first-name badges | 1; no full member-list experience |
| Manage, remove or change a team member's role | Teams → Team → Settings → Manage Members | 3 |
| Add a team member | Teams → Team → Settings → Manage Members → Add Member | **4** |
| Change team photo | Teams → Team → Settings | 2, then system picker |
| Edit or archive team | Teams → Team → Settings → Edit Team | 3, then confirmation for archive |
| Create team | Teams → New Team | 1 to form; success replaces it with Team |
| Restore team | Teams → Archived Teams | 1, then confirmation |
| Inspect profile or edit name | Profile → inline edit state | 0 app routes |
| Change own photo | Profile → inline edit → system picker | 0 app routes |
| Change notification preferences | Profile → Notifications | 1 |
| Invite, resend or revoke | Profile → Organisation Invitations | 1 |
| Inspect or remove an organisation member | Profile → Organisation Members | 1 |
| Change organisation role | Profile → Organisation Members → Role | 2 |
| Switch organisation | Profile → Selector → new Home | 1 to choice; 2 through completion |
| Leave organisation | Profile → confirmation → refreshed account destination | 0 to action; destination depends on remaining organisations |
| Create organisation | No organisations → Create → Home | 1 to form; 2 through completion |
| Accept invitation while signed out | Invitation → Login → Invitation → Home | 3, excluding external email confirmation |
| Correct wrong invitation account | Invitation → Login → Invitation → Home | 3 |

Home's direct next-responsibility and team previews can shorten some paths; the
Home audit owns those entry points. Changing a tab from Home adds one transition
to the table above, so team member management currently takes four from Home and
Add member takes five.

## Source-evidenced UX findings

### Teams and management

- **Participation and administration are conflated.** `TeamsScreen` is titled
  Your Teams even when church admins see every active team. `ProfileScreen`
  separately calculates actual memberships correctly.
- **Adding a member is too deep.** It requires four transitions from Teams.
  Ordinary members receive a wrap of first-name badges on the hub rather than
  a full-name member list. Existing `teamMembers` data supports a read-only team
  list without a new API, subject to the existing team-access gate.
- **The hub is long and repetitive.** Next on the Rota/Full rota is followed by
  Team Rota; member badges precede useful actions; unavailable Team Resources
  takes a full row; only two announcements appear and there is no team View all
  action. Leader actions and Leave team follow several sections.
- **Team settings copy is misleading.** It says roles are managed separately
  from these settings, although the Manage members route contains role actions.
- **Demo team leaders encounter a dead end.** The hub exposes settings using
  permission helpers, but Settings uses the live-only avatar-management gate.
  A demo team leader who is not a church admin receives No permission there.
- **Optional initial admin dominates creation.** Up to 50 candidate rows render
  before the photo and Create button even when No initial team admin is selected.
- **Initial-admin search has a large-list defect.**
  `eligibleInitialTeamAdmins` defaults to 50 results. `TeamCreateScreen` validates
  a selected ID against another unfiltered first-50 result. A valid person found
  by searching beyond those first 50 can be selected but cannot be submitted.
  Eligibility validation should be independent of the display limit.
- **Some load failures become misleading empty states.** Team hub can present a
  failed announcement load as No team announcements. Team settings presents a
  team-load failure as Team not found.

### Organisation and invitation administration

- **Directory search only searches the first 200 returned people.**
  `listOrganisationMembers(search)` already supports server search; the screen
  calls it without a search value and filters that bounded result locally. Role
  detail also finds its target in an unfiltered first-200 result. Any search
  improvement must preserve exact target lookup beyond the initial result.
- **Directory and invitation flows are disconnected.** Unlinked and removed
  cards tell admins to use Organisation invitations but offer no contextual
  link. The admin must return to Profile and choose another row.
- **Invitation administration is a single long scroll.** The email form, every
  eligible profile, invitation history and eventual error appear in sequence.
  An action error can be far below the action that caused it.
- **Organisation selection has no current marker or visible back action.** The
  root hides its native header. The screen offers Open organisation and Sign out,
  with copy about only one organisation being active at a time.
- **Invitation preview failure needs deliberate presentation.** The screen
  preserves its token and acceptance escape routes, but a failed preview can
  leave generic organisation/email copy. Preserve server acceptance authority
  while making retry and the unresolved preview clear.

### Personal and authentication flows

- **Profile does not clearly identify the current organisation.** The card
  shows person and roles; the active church name is principally used in leave
  confirmation. Teams, preferences, organisation administration, demo reset,
  support, leave and logout share one page.
- **Reset Demo Data appears in live Profile.** It only changes demo data, but
  this separation is not obvious in the live presentation.
- **Login gives unavailable providers prominent actions.** Google, Facebook and
  phone are placeholders. On web, successful signup confirmation uses the shared
  error value under Password rather than a distinct confirmation state.
- **Notification copy contradicts deployed capabilities.** Registered, setup
  and footer copy say push delivery arrives later. Chat, announcement and rota
  delivery already exist. Event and availability reminder preference values
  must remain preserved while their undelivered status is made clear.

### Accessibility and mobile verification

The existing 17px/24px body typography, 52-point shared touch target, labelled
fields, checked/disabled radio state and many polite error announcements are
strengths to retain.

- `textMuted` (`#7A8294`) computes 3.85:1 contrast on white and 3.57:1 on the
  current background (`#F5F6FA`), while used for 14px explanatory text.
- Notification preference rows are not tappable; only the Switch is interactive.
- `ConfirmDialog` is a non-scrolling centered Modal without explicit modal
  accessibility or focus management. Long consequence text and large system
  text require rendered and native checks.
- `Screen` uses a fixed iOS keyboard offset of 88. Native keyboard and safe-area
  checks are necessary when layouts change; source inspection alone cannot
  establish a runtime failure.
- Most member/candidate collections map all rows into a ScrollView. Large lists,
  long names and large text need deliberate verification.
- Team-role promotions and invitation resends inherit destructive confirmation
  styling because `ConfirmDialog` defaults to destructive. Presentation should
  be chosen explicitly while preserving confirmation behavior.

## Frozen service and permission boundaries

| Capability | Existing boundary |
| --- | --- |
| Auth, session and bootstrap | `src/lib/auth/AuthContext.tsx`; root guards own post-login routing |
| Account identity, names, switch and create | `src/lib/supabase/services/accounts.ts`; existing narrow RPCs; Profile uses transactional `set_profile_display_names` |
| Organisation access and roles | `src/lib/supabase/services/organisationMemberships.ts`; list, role, removal and zero-argument caller-owned leave |
| Team directory and lifecycle | `src/lib/supabase/services/teams.ts`; request ID and explicit initial-admin argument are contract-critical |
| Team membership and roles | `src/lib/supabase/services/teamMemberships.ts`; team/profile IDs and supported role, never caller authority |
| Invitations | `src/lib/supabase/services/invitations.ts`; existing list RPC and `manage-organisation-invitations` actions |
| Photos | Existing profile/team avatar hooks and private-storage services |
| Notification preferences | `src/lib/supabase/services/notifications.ts`; six keys and profile ownership remain unchanged |
| Device registration | Existing `useDevicePushRegistration` lifecycle; prompt only after explicit opt-in; no raw token display |

The redesign must preserve these invariants:

1. Team lifecycle and role authority belong to church admins. Team-admin
   membership, photo, rota and announcement authority remain separate.
2. Zero, one or multiple team admins are valid. Final-team-admin **demotion is
   allowed**; final-team-admin **remove and leave remain blocked**.
3. Creation never adds the creator automatically. The initial team admin is
   optional and explicit, including when the creator is selected.
4. An unchanged create draft reuses its request ID after ambiguous failure.
   Photo failure after successful creation must never create a second team.
5. Archive preserves identity and history. Archived metadata grants no active
   team content access; restoration uses the same team ID.
6. Organisation roles remain four exclusive values. The final effective church
   admin cannot be demoted, removed or leave.
7. Removed profiles keep history and global identity without current authority.
   Re-invitation restores baseline membership only.
8. Profile editing changes names, not email, phone, roles or membership.
9. Organisation switching/access loss clears old scoped data and channels before
   new organisation content is shown.
10. Pending invitation adoption, route-token removal, wrong-account preservation,
    terminal clearing and Not now escape must survive navigation changes.
11. Saved-but-unsent invitation failures remain distinguishable from nothing
    saved. Resend invalidates the previous link.
12. Demo restrictions remain. Visual inspection must not introduce live service
    calls for demo rendering.
13. Notification settings retain their current keys and ownership; no new push
    type, prompt-on-mount, multi-profile token fan-out or delivery behavior is
    introduced.

No backend addition is needed for the client issues identified in this report.
This is not a backend audit or authorization to change a remote service.

## Behavioral coverage reviewed

The focused screen tests below were read completely. They cover permission
gates, auth-owned routing, invitation router lifecycle, mutation arguments,
final-admin protections, demo isolation, submission guards, retained errors and
drafts, create idempotency, photo recovery and safe archive/leave destinations.
Existing presentation-specific assertions may change; their behavioral
invariants must remain covered.

- `src/features/auth/__tests__/LoginScreen.test.tsx`
- `src/features/teams/__tests__/ArchivedTeamsScreen.test.tsx`
- `src/features/teams/__tests__/TeamAddMemberScreen.test.tsx`
- `src/features/teams/__tests__/TeamCreateScreen.test.tsx`
- `src/features/teams/__tests__/TeamEditScreen.test.tsx`
- `src/features/teams/__tests__/TeamIdentityHeader.test.tsx`
- `src/features/teams/__tests__/TeamMembersScreen.test.tsx`
- `src/features/teams/__tests__/TeamSettingsScreen.test.tsx`
- `src/features/teams/__tests__/TeamSpaceLeaveTeam.test.tsx`
- `src/features/teams/__tests__/TeamsScreen.test.tsx`
- `src/features/organisations/__tests__/CreateOrganisationScreen.test.tsx`
- `src/features/organisations/__tests__/NoOrganisationsScreen.test.tsx`
- `src/features/organisations/__tests__/OrganisationMemberRoleScreen.test.tsx`
- `src/features/organisations/__tests__/OrganisationMembersScreen.test.tsx`
- `src/features/organisations/__tests__/organisationMembers.test.ts`
- `src/features/invitations/__tests__/InvitationAcceptScreen.test.tsx`
- `src/features/invitations/__tests__/InvitationAdminScreen.test.tsx`
- `src/features/invitations/__tests__/invitationLinkFlow.test.tsx`
- `src/features/profile/__tests__/ProfileScreen.test.tsx`

The auth, notification lifecycle, permission and service test matrices were
indexed, including account bootstrap, sign-out, cross-account isolation,
same-account token rebinding, persistence failure and removal/role service
contracts. Their full regressions remain necessary. This documentation task did
not execute tests or independently validate the reported baseline run.

## Reading coverage

Read completely for this report:

- `AGENTS.md`, `CLAUDE.md`, `README.md`, and the original pasted brief.
- `docs/shift_shepherd_design_doc.md`, `docs/one-shot-build-prompt.md`,
  `docs/organisation-membership-role-management-v1.md`, and
  `docs/production-email-readiness.md`.
- Every screen implementation in the inventory table; `teamForm.ts`,
  `organisationMembers.ts`, `useProfileAvatar.ts`, and `useTeamAvatar.ts`.
- `app/_layout.tsx`, `app/(tabs)/_layout.tsx`, and `app/index.tsx`; the assigned
  route re-exports were verified through source search.
- `src/lib/auth/AuthContext.tsx` and `src/lib/permissions/index.ts`.
- Services `accounts.ts`, `organisationMemberships.ts`, `invitations.ts`, and
  `notifications.ts`.
- `constants/theme.ts` and shared `Screen`, `AppText`, `TextField`, and
  `ConfirmDialog` components.
- All focused tests listed above.
- The repository Supabase skill for the read-only contract inspection; no
  Supabase feature was implemented or remote operation performed.

Partially inspected:

- Team helpers in `src/lib/appData/selectors.ts`.
- Directory and lifecycle implementation in `services/teams.ts`.
- Service export/RPC declarations and auth, notification, permission and service
  test matrices.

Not read completely in this delegated inventory:

- `supabase/README.md`, `docs/supabase-integration-plan.md`,
  `docs/supabase-migration-alignment-checkpoint.md`, migration SQL and seed
  instructions.
- The full AppData implementation, full device-registration hook, and full auth,
  notification, permission and service-test bodies.

Those remain part of the broader discovery and backend-contract review. Historical
documents contain superseded single-organisation and push-delivery language;
the current implementation and deployed-contract documentation take precedence.
