# Organisation Membership & Role Management V1

## Status

Implemented locally only. The database change is
`20260712103321_add_organisation_membership_role_management.sql`; it must not be
deployed as part of the implementation task. Manual membership/role QA is pending.

## Identity and membership model

Shift Shepherd has distinct layers that must not be collapsed:

1. `auth.users` is the global sign-in identity.
2. `user_accounts` owns the account-global name and active profile.
3. `profiles` is the stable organisation identity and historical attribution key.
4. `profiles.access_status` says whether that profile currently grants organisation access.
5. `organisation_roles` is the profile's one organisation role.
6. `team_memberships` grants current team access and team leadership.
7. Invitations grant or restore organisation access after verified-email acceptance.

An unlinked active profile is a pre-provisioned directory person: it has no app
access yet, but its deliberate directory/team/role setup may be retained when it is
first invited. A removed profile is different. It remains linked to its global Auth
account for identity continuity, but it grants no organisation access and has no
organisation role, team membership, or push token.

## Lifecycle decision

V1 uses explicit soft access removal on the stable `profiles` row:

- `active` means the profile is an organisation member. App access additionally
  requires a linked Auth account and, for normal queries, selection as the active
  profile.
- `removed` means organisation access was revoked by an admin or surrendered by
  the member. `access_removed_at`, `access_removed_by`, and
  `access_removal_reason` retain the audit context.

Removing or leaving an organisation atomically:

- preserves `auth.users`, `user_accounts`, the profile row, and profiles in every
  other organisation;
- deletes the profile's organisation role and all current team memberships;
- deletes that profile's push-token rows (the delivery ledger retains historical
  attempts with a null token reference);
- preserves notification preferences and chat read cursors because neither grants
  access;
- preserves authored announcements/events/rotas/songs/chat messages, rota
  assignments, availability responses, song selections, cancellation attribution,
  invitation audit rows, and push-delivery history;
- repairs `user_accounts.active_profile_id` before the profile becomes inactive.

Future rota assignments are retained so schedule history is not silently rewritten.
The removed person cannot view or respond to them, and the existing consistency
trigger prevents new assignments without a current team membership. Team leaders
must explicitly reassign future duties where needed.

### Active-profile outcomes

When the removed profile was active:

- one remaining active linked profile is selected automatically;
- several remaining active linked profiles clear the selection so the existing
  organisation selector decides the next organisation;
- no remaining profile clears the selection and reaches **No organisations yet**.

Removing a non-active profile preserves the valid current selection. The account
row is locked during the transition. `current_profile_id()`, account context,
active-profile validation, and switching all exclude removed profiles.

### Re-invitation

A church admin may invite a removed directory profile again. The invitation remains
email-targeted and must be accepted by the same matching verified Auth account. The
same profile ID is reactivated, removal audit fields are cleared, and only the
baseline `general_member` role is inserted. Deleted elevated roles, team memberships,
and push tokens do not return. Invitation hashes, expiry, resend/revoke behavior,
wrong-account protection, and replay safety are unchanged.

## Alternatives rejected

- **Unlinking `auth_user_id`:** rejected because unlinked profiles already represent
  legitimate pre-provisioned directory people. It would make removed people
  indistinguishable and could restore stale roles/teams on invitation acceptance.
- **Hard-deleting profiles:** rejected because many historical rows reference the
  profile with `RESTRICT`, and deletion would destroy attribution or cascade current
  state unexpectedly.
- **A separate membership table:** deferred because the organisation profile already
  is the established membership and attribution boundary. An explicit status adds
  the missing lifecycle without duplicating tenant identity or rewriting every FK.

## Profile foreign-key classification

| Reference | Removal behavior |
| --- | --- |
| `organisation_roles.user_id` | Delete; current authority only |
| `team_memberships.user_id` | Delete; current access only |
| `push_tokens.user_id` | Delete; current delivery endpoint only |
| `notification_preferences.user_id` | Retain; preference only, grants no access |
| `chat_read_states.user_id` | Retain; private cursor only, grants no access |
| `rota_assignments.user_id` | Retain; schedule/history attribution |
| `availability_responses.user_id` | Retain; historical response |
| `events.created_by`, `announcements.created_by`, `rota_entries.created_by`, `songs.added_by`, `choir_rota_song_selections.selected_by`, `chat_messages.sender_id` | Retain; authored history |
| `rota_entries.cancelled_by` | Retain; cancellation audit |
| `organisation_invitations.target_profile_id` / `invited_by_profile_id` | Retain; invitation audit and rejoin target |
| `push_notification_deliveries.recipient_user_id` | Retain; delivery audit |
| `user_accounts.active_profile_id` | Repair atomically before removal |
| `profiles.access_removed_by` | Retain when possible; `SET NULL` if a historical actor is ever deleted outside this feature |

## Role catalog and authority

The existing schema supports exactly one role row per organisation profile:

| Role | Meaning | Removal semantics |
| --- | --- | --- |
| `general_member` | Baseline church access | Cannot be removed while access is active |
| `announcement_manager` | Baseline access plus church-wide announcement management | Reset to `general_member` |
| `event_manager` | Baseline access plus event/category management | Reset to `general_member` |
| `church_admin` | High privilege: organisation, invitation, membership, and role administration | Reset only when another effective church admin remains |

Role changes replace the single complete role value. Only a current active linked
church admin in the active organisation may change it. Targets must be current active
linked members. The server accepts only the four catalog values. Self-demotion is
allowed under the same last-admin rule.

An effective church admin is a linked `active` profile with a `church_admin` role.
Pending invitations, active-but-unlinked directory profiles, and removed profiles do
not count. Role changes, admin removal, and admin self-leave all lock the same
organisation row before counting, so concurrent operations cannot reduce an
organisation to zero effective church admins.

## Security boundary

The client receives bounded member summaries through an admin-only RPC and performs
mutations only through narrow authenticated RPCs. Every function derives the caller
from `auth.uid()`/`current_profile_id()`, scopes targets to the caller's active
organisation, uses `SECURITY DEFINER` with `search_path = ''`, and has explicit
PUBLIC/anon/authenticated ACLs. Direct authenticated role and profile writes remain
revoked; the permissive historical role-management policy is removed as defense in
depth. Normal organisation reads continue through existing RLS and cannot cross the
active organisation boundary.

