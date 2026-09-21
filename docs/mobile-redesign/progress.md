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
- Navigation, Home and Schedule are implemented and personally accepted; Teams
  and Profile are still required before the representative-slice gate is complete.

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
| Representative slice | Pending | Home, Teams, team hub, Profile/Settings, Schedule or Chat rendered and accepted |
| Navigation/Home/Schedule | Accepted | 922 tests/83 suites; export; parent member/admin/empty/direct-link checks |
| Teams/lifecycle/members | Pending | Every lifecycle/role/member capability; demo/live gates; parent review |
| Chat | Pending | Composer/history/draft/image/unread behavior; parent review |
| Announcements/events | Pending | Forms, recurrence, audience, images, details and state review |
| Rota/availability/music | Pending | Multi-role response, cancellation, monthly partial saves, section selection |
| Organisation/invitation/profile/auth/settings | Pending | Full existing state matrix and permission contracts; parent review |
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
