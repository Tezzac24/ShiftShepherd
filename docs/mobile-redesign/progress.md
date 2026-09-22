# Mobile redesign progress

The full user goal remains a complete app redesign, one feature branch and one
review-ready, green-CI PR. Discovery or the representative slice is not completion.

## Fixed state

- Branch: `feat/mobile-ui-ux-reimagination`; base `ecde433` (`origin/main` at start).
- Separate open PR #19 upgrades Expo; it has not been included or merged.
- Initial tree clean; fetch and open-PR inspection complete.
- Backend baseline: 38 migrations through `20260917223118`; no backend changes.
- Main baseline: typecheck, lint, migration filename check and 856/76 Jest pass.
- Source inventory, flow map and contract discovery complete; required docs read.
- Design director's first-hand baseline audit complete: 39 accepted captures at
  375×812, 390×844, 393×852 and 430×932; see `baseline-visual-audit.md`.
- One central design authority: `design-brief.md`.
- Audit and design direction committed as `b77be62` before UI implementation.
- Shared foundation committed as `441f5fd`, personally accepted after two refinements.
- Representative-slice gate is complete: Home, Schedule, Teams, team hub and
  Profile/notification settings are implemented and personally accepted.
- Home/Schedule checkpoint: `771fea0`; Teams checkpoint: `73b2b2e`.
- Profile/preferences checkpoint: `3f04df9`; representative gate is accepted.
  Team create/edit/archive/restore and Add member forms are now personally
  accepted. All inspection fixtures remain inactive.
- Shared navigation/design guidance is recorded in `5e040eb` (README, AGENTS
  and CLAUDE; instruction guidance is synchronized).

Baseline Git objects for final freeze comparison:

| Path | Object |
| --- | --- |
| `supabase/` | `6245e24c42b336c2210db22ed9eec96b67d3dab3` |
| `src/lib/supabase/` | `8ff684495135ac9874ae137c1537363e1b182537` |
| `src/lib/auth/` | `fe517839f764a72daaa58efaf6f53a23f2043429` |
| `app.json` | `3150afc0603d0ade0c5ee712e5c26f6c6c18e19f` |

## Acceptance ledger

| Area/gate | State | Required evidence |
| --- | --- | --- |
| Discovery/audit/flow map | Complete | Inventories, contract, visual audit, baseline commands |
| Shared design foundation | Accepted | Exact tokens; native wrapping controls; accessible modal/date sheets; 881 tests/80 suites; export; parent screenshots/interactions |
| Representative slice | Accepted | Home, Teams, team hub, Schedule and Profile/preferences rendered and accepted; 1,017 tests/84 suites |
| Navigation/Home/Schedule | Accepted | 922 tests/83 suites; export; parent member/admin/empty/direct-link checks |
| Teams/lifecycle/members | Core screens and forms accepted | 1,062 tests/84 suites; lifecycle/Add visual review accepted; live member role/removal dialog visual pass remains for shared-state review |
| Chat | Pending | Composer/history/draft/image/unread behavior; parent review |
| Announcements/events | Pending | Forms, recurrence, audience, images, details and state review |
| Rota/availability/music | Pending | Multi-role response, cancellation, monthly partial saves, section selection |
| Organisation/invitation/profile/auth/settings | Profile/preferences accepted; other identity screens pending | Full existing state matrix and permission contracts; remaining identity screens follow the representative gate |
| Cross-app accessibility/forms/states | Pending | Long text/lists, large-text proxy, targets, contrast, focus/recovery |
| Independent UX + technical reviews | Pending | No outstanding blocker/high/medium findings |
| Final local checks/backend freeze | Pending | typecheck, lint, test:ci, check:migrations, diff check, Expo export; protected diff |
| Final visual pass | Pending | Every major family and representative variants personally inspected |
| One PR + CI + threads | Pending | Pushed branch, PR URL/commits, green required checks, no actionable threads |
| Native handoff + completion report | Pending | All 18 requested report items; honest native limitations and release sequence |

Native hardware/simulator QA has not passed. Web is only a visual/interaction
proxy. No live membership, invitation, push or private-image QA is claimed.

## Compact phase record

**Foundation — accepted 21 September.** Generic components and tokens only;
feature composition remains to be redesigned. Typecheck, lint, 881 tests/80
suites (25 focused control tests), 38-migration filename check, diff checks and
Android/iOS/web export (43 routes) passed. Hermes export needed sandbox
escalation; an approval-timeout retry succeeded. Protected paths are unchanged.

Parent inspected Home primitives, profile confirmation, sign-in inputs/buttons,
event date/time sheets and an empty archive at 375×812 and 393×852. Exercised
demo email sign-in, confirmation cancel/confirm, date selection, time selection
and form cancellation. The transient React Refresh function/ref overlay cleared
on full reload. Two requested fixes were implemented and reinspected: disabled
dates no longer look like filled actions; headings are explicit (`headingLevel`)
rather than inferred from font style. Seven review captures are preserved in
ignored `.cache/ui-audit/foundation/`; capture 06 is the accepted date-sheet
revision. New opt-in composition primitives have behavior coverage and still
need adoption/visual evaluation in the representative slice. No screen family
is counted complete merely because it inherits the new tokens.

**Navigation, Home and Schedule — accepted 21 September.** Existing five routes
remain; Calendar is labelled Schedule with Church events/My serving segments.
Home now has one personal focus, an existing-unread cue, an editorial notice and
non-duplicated events. New `OrganisationHeader` resolves live church identity
from account context; new pure `presentation.ts` groups existing accessible
serving data and retains all roles. Native Back is retained; directly opened
stack screens have an explicit fallback through `/`. No backend/auth/permission,
type, package or app configuration change.

Typecheck, lint, **922 tests/83 suites**, migration validation, diff check and
demo-only Android/iOS/web export (43 routes) passed. Parent reviewed at 375×812
and 390×844: admin serving Home, events list, My serving, no-duty member Home,
empty serving and a restricted direct link. Verified repeated Home→My serving
after switching segments; date→Back preserves serving; recurring event links
retain occurrenceStart; Back restores events; direct denied-team Back reaches
Ruth's Home; empty View church events switches to the existing events segment.

Three refinements were accepted: normal-size Messages no longer wraps mid-word;
Home is compact enough for actual notice content in the first 375px viewport;
empty serving gives an appropriate next action rather than instructions for
nonexistent dates. Segment selected state and Past events expansion now have
explicit ARIA aliases. Eight images are preserved under
`.cache/ui-audit/home-schedule/` (03 and 08 supersede the early iterations).
Remaining shared checked/expanded/busy alias review is tracked in the verification
plan. Live switching/error cases have mocked behavior coverage, not hosted UI QA.

**Teams representative surfaces — accepted 22 September.** My teams is actual
membership; church admins have a separate All teams view and contextual Manage.
The hub has immediately visible Chat/Rota/Members/choir Songs, a next date and
notices. Members is a direct, virtualized full-name view at the retained route;
live mutation authority remains separately gated. Settings remains a valid deep
link with useful demo-leader tools. Existing lifecycle/form routes remain working
but their composition is not yet redesigned. Team access states share a scoped
boundary; archived and cross-church content stays unavailable.

Typecheck, clean lint, **965 tests/83 suites**, 38-migration check, diff check and
demo-only Android/iOS/web export (43 routes) passed. Parent inspected at 375×812,
390×844 and 430×932: no-team member, member directory/hub/read-only roster,
admin My/All, long zero-member generic team, generic/choir Manage choices and
Sarah's direct Settings link. Monthly planning navigation works. The normal
Members route is now two transitions from Teams; the existing live Add member
destination is one further transition (mocked interaction verification).

Accepted refinements: concise admin header/participation copy; consistent first/
last member-row corners; short Manage heading with full team-name context;
photo-only settings shortcut where the existing live capability permits it;
no redundant settings choice. Shared sheet focus now transfers to selected
destinations and only returns on cancellation; stale reopen/dismiss callbacks
are fenced, with 17 modal tests. Native screen-reader QA remains pending.

Parent also activated an explicitly labelled, offline synthetic roster of 39
people (36 temporary names) at 375/430: long-name wrapping, searches for
Oluwatobiloba and Zachariah, no matches, clearing and scrolling all passed. The
fixture changed presentation only, never storage/backend data. Exact original
source bytes were restored and SHA-256 verified; `active:false` and
`restoredExactly:true`, followed by a fresh three-person UI check. No fixture
code is in the source diff. Nineteen captures are preserved in
`.cache/ui-audit/teams/`; 10–14/19 are accepted normal-state revisions and 15–18
are explicitly synthetic layout evidence. Temporary module-resolution errors
from sequential file replacement are historical controller log entries; settled
reloads rendered correctly without additional page errors.

**Profile and notification preferences — accepted 22 September.** Compact
identity, early preferences, one Teams destination, contextual church management
and separate account/demo/help replace the old expanded profile. Existing atomic
name saves, optional church override, read-only contacts, photo actions, leave
protections and Auth-owned transitions remain. All six notification keys,
profile ownership, optimistic rollback and explicit device registration remain;
saved-but-undelivered reminders are explained truthfully.

Parent reviewed 375×812, 393×852 and 430×932: normal Profile/settings, toggles and
persisted return state, Back/Teams, sign-out/reset cancellation; explicit offline
fixtures covered long identity/contact wrapping, name validation, retained failed
drafts/Cancel reset, admin/leave consequences, read/loading/retry and device
opt-in/registered/denied presentation. Two measured defects were corrected and
reinspected: named failure feedback now remains beside its switch and reveals
fully without animation; loading has one named accessible progressbar. The web
renderer required the row layout listener to be registered from mount.

Final typecheck, lint, **1,017 tests/84 suites**, migration check, diff check and
demo-only all-platform export (43 routes) passed. Protected paths are unchanged.
Twenty-three captures are preserved in `.cache/ui-audit/profile-settings/`;
20, 21, 22 and 23 are accepted final refinements/restored views. Every fixture
was restored byte-for-byte; final `active:false`/`restoredExactly:true`, no
synthetic marker in `src`, six normal preference switches and no new page errors.
No native/live account, image or notification-delivery QA is claimed.

**Team setup/lifecycle and Add member — accepted 22 September.** New team has
resolved church context, a searchable optional-admin sheet, visible validation
and fixed Create/Cancel actions. Selected-person eligibility uses the full
existing directory independently of the displayed first 50. Edit retains drafts
through data refresh, with separately saved photo controls and archive. Archive
is a virtualized metadata list with a contextual Open team result and a fixed
Back to teams action. Add member is searchable/virtualized, with named error and
adjacent guarded Retry add. No global component or backend changes were needed.

Parent tested at 375×812, 390×844 and 430×932: validation, chooser search/select/
reset, actual demo zero-admin create/edit/archive/restore, cancellation and
archived deep links; a second create explicitly added Sarah only. The creator's
My teams remained one. `team-muby6sin-1` is restored with edited description and
zero members; `team-mubyu0nc-1` has Sarah as its one team admin. Seven explicit
offline fixture scenarios exercised 132 chooser candidates, 129 Add candidates,
long names/emails, retained selection, no-match, created-but-photo-failed retry,
Add success/failure/loading/read retry and separate photo controls. These do not
establish live membership or storage QA.

Important refinements: same-profile readiness changes preserve drafts, request
keys and successful-create/photo state; actual scope/role loss tears down and
stale completion cannot navigate. Follow-on photo work and navigation resume
only after authority resolves. Success toasts are concise, chooser accessible names include email,
and persisted photo removal/copy matches Profile. Final **1,062 tests/84 suites**
(72 focused), typecheck, lint, migration/diff checks and demo-only all-platform
export (43 routes) passed. Parent inspected the request/result/scope boundaries.

Twenty-eight captures are in `.cache/ui-audit/team-forms/`; 10–14, 27 and 28
supersede early revisions. All fixtures were restored exactly, the temporary
shim was removed, no inspection markers remain in source, and normal New team
rendered with no new page errors. Protected paths remain unchanged. Native
keyboard, picker, screen-reader and live lifecycle QA remain pending.

## Cross-area handoffs

- Teams representative slice will use the honest **All announcements** label
  while the destination is unfiltered. The announcements worker must add an
  optional `teamId` filter over existing accessible same-organisation notices,
  with a clear way to return to all notices, then connect **All team announcements**
  from the hub. This is client-only work, not a backend blocker.
- Final documentation must reconcile README and both instruction files with
  the accepted navigation/presentation authority without rewriting deployed
  backend history or claiming pending native/hosted QA has passed.
- Chat's bounded design handoff is now in the shared brief. Two interim captures
  under `.cache/ui-audit/chat/` show the existing composition after foundation
  tokens, before chat-specific implementation; they do not replace the original
  baseline audit. The browser is now signed into Daniel's demo account, on Teams
  at 375×812, ready for the lifecycle review. Actual sign-out/sign-in passed;
  example data was retained and Daniel's own team/unread state resolved correctly.
- Hosted connection restored by the user on 21 September. Read-only verification
  repeated successfully on 22 September: local and remote migration filenames
  match exactly
  **38/38**, with no local-only or remote-only entry. Functions remain ACTIVE:
  `send-chat-message-push` v7 (`verify_jwt` true) and
  `manage-organisation-invitations` v3 (`verify_jwt` false), matching the baseline.
  No remote mutation was performed; local protected-file checks remain clear.

## Current local inspection session

The existing browser controller is live on loopback port 8090; preview is on
port 8089. Its original temporary script was removed along with older captures.
A recovery runner is saved at ignored `.cache/ui-audit/browser.cjs`; its
Playwright tooling belongs in `.cache/ui-audit/tools/` (the older temporary
package files were also removed). Do not
launch the recovery runner while the existing controller is live. Probe the
existing handles/endpoints before assuming they stopped. Current demo browser
data includes the explicitly documented audit-only changes.

Recovery-tool reinstall on 21 September failed with a network ECONNRESET; the
existing in-memory controller remains usable. Recheck/install recovery tooling
only if the existing controller actually stops. Do not restart a live handle
because an observation or package install timed out.

On 21 September, a retention check found only captures 33–39 still in the
temporary folder; 01–32 had already been inspected/displayed but their files
were gone. The exact cleanup cause is unknown. Remaining images are preserved
under ignored `.cache/ui-audit/before/`. Copy every subsequent accepted capture
into `.cache/ui-audit/` immediately. Do not restart or substitute the audit.

The controller accepts POST JSON actions `snapshot`, `goto` (`url`), `click`
(`role`, `name`, `exact`, or `text`), `fill` (`name`, `value`, `exact`), `back`,
`scroll` (`y`), `viewport` (`width`, `height`), `screenshot` (`name`, `fullPage`),
and `stop`. Capture paths are relative to the temporary audit folder. Confirm
the settled DOM/URL before accepting a screenshot, particularly after a full
navigation. The Windows HTTP text decoder can display icon/Unicode mojibake;
the actual app/screenshots are UTF-8 and were visually checked.
