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
- No UI implementation has begun at this checkpoint.

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
| Shared design foundation | Next | Tokens/primitives, behavioral checks, parent visual acceptance |
| Representative slice | Pending | Home, Teams, team hub, Profile/Settings, Schedule or Chat rendered and accepted |
| Navigation/Home/Schedule | Pending | Personal-serving and scope-safe paths; deep-link/back tests |
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

## Current local inspection session

Temporary browser controller: `%TEMP%/shift-shepherd-ui-audit/browser.cjs`, with
Playwright in its `tools/` directory; API on loopback port 8090. Preview on port
8089. Probe the existing handles/endpoints before assuming they stopped. Current
demo browser data includes the explicitly documented audit-only changes.

The controller accepts POST JSON actions `snapshot`, `goto` (`url`), `click`
(`role`, `name`, `exact`, or `text`), `fill` (`name`, `value`, `exact`), `back`,
`scroll` (`y`), `viewport` (`width`, `height`), `screenshot` (`name`, `fullPage`),
and `stop`. Capture paths are relative to the temporary audit folder. Confirm
the settled DOM/URL before accepting a screenshot, particularly after a full
navigation. The Windows HTTP text decoder can display icon/Unicode mojibake;
the actual app/screenshots are UTF-8 and were visually checked.
