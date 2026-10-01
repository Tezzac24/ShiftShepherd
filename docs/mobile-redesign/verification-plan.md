# Mobile redesign verification and handoff plan

This plan preserves the full requested end state. A successful representative
slice is a gate for propagation, not a substitute for reviewing the whole app.

## Parent acceptance after each sequential worker

1. Inspect current Git state and changed-file scope; check for unexpected backend,
   auth, service, dependency, configuration or data changes.
2. Inspect the actual implementation of globally meaningful decisions and risk
   boundaries. Do not rely on a worker's “done” statement or test count alone.
3. Render the changed area in the existing mobile preview. Use 390×844 normally,
   then 375×812 for constrained text/forms and 430×932 for larger phones;
   include 393×852 in representative coverage.
4. Open and accept screenshots only after confirming the settled screen/state.
   Compare with the corresponding accepted baseline and the central brief.
5. Exercise common navigation, Back/Cancel, the primary action and relevant
   member/admin states. Check the path from the documented primary context.
6. Review long names/titles, empty/error/loading variants where safely possible,
   readable contrast, comfortable targets and any keyboard/safe-area limitation.
7. Verify relevant automated checks and address defects before accepting the area.
8. Record a compact progress entry and a logical commit; only then start a fresh
   bounded implementation worker for the next area.

## Representative-slice gate

Home, Teams, team hub, Profile/Settings, and a data-heavy Schedule or Chat must
demonstrate the actual information hierarchy and interaction language. Token-only
restyling does not pass. The director must verify:

- Home has a clear personal focus, actual church identity and useful next actions.
- Team participation and administration are distinguishable without hiding power.
- Members and the main team tools are easy to find; no inert feature competes.
- Profile/preferences are shorter and intentionally grouped.
- Data-heavy lists remain readable, long content wraps and no control overflows.
- The chosen common primitives work with real screen content, not placeholders.

## Behavioral and state matrix

| Family | Required verification |
| --- | --- |
| Navigation and scope | Every old route/capability remains reachable; invitation deep links and occurrence parameters survive; direct routes have safe exits; pending invitation outranks Home; no old organisation content survives a switch. |
| Home/Schedule | Source-derived personal duties only, all roles retained, cancelled/inaccessible teams excluded, no invented notice unread state, no duplicate next event; no-duty and partial-domain failure states. |
| Teams | My teams differs from admin access; church-admin-only lifecycle; optional initial admin and zero-admin team; same-draft retry key; separate post-create photo failure; archive retains identity and old deep links deny active content; restore returns useful navigation. |
| Team members | All permitted viewers can read names; live-only mutations; manager versus role-admin authority; peer/final-leader removal protections; final-leader demotion permitted; own leave; no unauthorized calls from directly opened routes. |
| Chat | Conversation list does not clear unread; focused chat retains established cursor behavior; blur cleanup; one image only; failed send keeps draft/photo; loading/retry/history/reconnect presentation; readable composer. |
| Announcements | Audience permissions; church/team filtering over existing accessible data; pin means pin; required fields; linked events; one image; text-saved/image-failed distinction; proper loading/missing/error distinction. |
| Events | Existing recurrence rules and whole-series semantics; occurrence date retained; time validation; archived related-team restrictions; cold edit hydration; no RSVP/audience invention. |
| Rota/availability | Assigned person only; multiple roles with one visible response and optional note; cancelled date response disabled; correct role pairing; month inclusion/override/partial-success semantics; separate cancellation notice offer. |
| Choir/music | Ordinary choir members keep song CRUD; correct team/child matching; section-specific leader gates; no unsaved choice overwritten by refresh; reordered selection persists; external link errors recover clearly. |
| Identity/auth | Email/signup/error/confirmation; safe bootstrap/no-org routing; no screen-owned login redirect race; global/organisation names only; read-only contacts; current organisation selection and switch failure recovery. |
| Organisation/invitations | Four exclusive roles; last effective church admin; removed/unlinked distinction; truthful removal/leave consequences; existing server-search bounds; saved-but-unsent invitation; resend/revoke; pending/wrong-account/expired/revoked/accepted/Not now/token lifecycle. |
| Notifications | Six preference keys and optimistic rollback unchanged; explicit device opt-in and existing lifecycle; correct current-church ownership; supported delivery versus undelivered reminders stated truthfully; no new response handler or push kind. |
| Shared controls | Label/role/selected/disabled/busy states; meaningful empty/error/loading states; visible form errors and first-error recovery; long modal content; cancellation on dismissal; reduced motion; safe-area/footer behavior. |

During representative integration, the installed React Native Web adapter was
found to use direct ARIA state props rather than the native `accessibilityState`
object. Check rendered selected/checked/expanded/busy states as well as RNTL
props. Prefer React Native's supported ARIA aliases alongside equivalent native
state; use the state appropriate to the control's role. Schedule segments,
preference switches, shared buttons and loading panels have been corrected and
rendered. Remaining selectors, date controls, sheets and feature-owned radios
still need the cross-app alias review. These checks are not native screen-reader
certification.

Check decorative icons and spinners too: native `accessible={false}` alone may
leave unnamed children in the web accessibility tree. StatePanel now hides its
decorative spinner explicitly; review the remaining controls for the same issue.

The announcement image-post fixture exposed one extra unnamed `img` in the web
accessibility snapshot alongside the correctly labelled selected image. The
visible full-image/fallback/recovery states pass; the cause of the extra node is
unconfirmed. Recheck during the shared accessibility review, distinguishing
retained or inspection-only web DOM from native output before changing controls.
If the running controller cannot inspect DOM metadata directly, use an ignored,
demo-guarded inspection fixture to report only image alt/role/hidden state and
parent tags (never source URLs/base64). Restore it exactly afterward; do not
restart the working controller to obtain another inspection API.

Use deterministic offline Jest/RNTL tests for changed interaction behavior.
Retain the strong existing service, lifecycle, permission and routing suites.
Do not replace meaningful assertions with snapshots of implementation details.
Live-only visual states may require safe mocked component fixtures; never enable
real backend access merely to obtain a screenshot.

Still outstanding from the Teams representative review: synthetic visual
inspection of live member role/removal dialogs (including final-team-admin
demotion versus protected removal). Normal/read-only rosters and their large-
list states are accepted; their behavioral permission coverage does not replace
this remaining presentation check.

## Final acceptance gates

- Every inventory row is reviewed deliberately and its final capability/path is
  recorded. Obsolete presentation components are removed only after reachability
  and import checks.
- Final common-flow table records actual before/after counts from the same
  context, plus sheet/confirmation interactions and any justified exception.
- Independent technical review covers navigation/state/permissions/performance,
  tests and backend preservation. Independent UX review covers discoverability,
  older users, coherence, target sizes, cognitive load and substantial redesign.
- Address all blocker/high/medium findings. Fix low findings or document a
  specific reason to defer them. Reinspect affected screens after fixes.
- Run `npm run typecheck`, `npm run lint`, `npm run test:ci`,
  `npm run check:migrations`, `git diff --check`, and `npx expo export` on the
  final branch. Export in demo mode without reading or creating credentials.
- Compare protected files and migration history to the initial baseline. No new
  migration, unexpected Edge Function/Auth/config/API change, secret or real-user
  data may enter the diff. Hosted history comparison is read-only.
- Render and personally inspect all major final areas; compilation is not visual
  acceptance. Record environment, viewports, variants, findings and limitations.
- Push the single feature branch and open one final PR. Describe principles,
  navigation, system, screen families, accessibility, three-screen results,
  backend status, tests, actual visual work, limitations and native QA.
- Verify required CI green for the final head, inspect reviews/comments/threads,
  address all actionable findings and rerun affected local checks. Do not merge.

## Native QA checklist for the final handoff

These items remain unchecked until actually exercised on a native build:

- [ ] iPhone tab/stack navigation, visible Back and direct-link fallback.
- [ ] Safe areas, status bar and bottom indicator on small and large iPhones.
- [ ] Keyboard on sign-in, chat and long forms; submit/cancel remain reachable.
- [ ] Sheets/dialogs: scroll long content, accessible focus, dismiss and return.
- [ ] Long lists and content scrolling; no nested-scroll traps or clipped controls.
- [ ] Profile/team/announcement/chat image picker, cancel, failure and preview.
- [ ] Invitation deep links: signed out, wrong account, accepted and terminal states.
- [ ] Touch targets with one hand, VoiceOver labels/state/order and maximum text.
- [ ] Reduced motion and OS appearance/contrast expectations.
- [ ] Organisation switch/access loss removes the previous church's content.
- [ ] Push tap behavior on the existing supported payloads. The baseline has no
  explicit notification-response navigation handler; do not claim a new route
  behavior or successful native delivery from this redesign's web checks.

Physical delivery, invitation email, disposable membership/role/remove/leave,
and other documented backend release QA remain separate gates.

## Post-redesign release hardening

This is a handoff sequence, not authorization to merge, deploy or mutate hosted
data during the redesign.

1. Complete final user review of the single redesign PR and its final hosted
   verification. Keep the unrelated Expo upgrade PR separate;
   use the SDK matching the branch actually selected for the native build.
2. Run the native checklist above on small and large iPhones, including maximum
   text, VoiceOver, keyboard and image-picker paths. Fix and recheck any findings.
3. Exercise existing account/bootstrap, multi-organisation, invitation and
   membership/role/lifecycle contracts with explicitly authorised disposable
   accounts. Include no-organisation, removed access, zero team admins, last-admin
   protections, archive/restore and create retry.
4. Verify physical-device push registration, account/profile token ownership,
   supported delivery types, unread behavior and current push-tap limitations.
5. Finish owner-controlled production email/domain/SMTP/redirect/link-host work
   under its separate approval process, then verify real invitation delivery
   and native acceptance. Preserve the documented production-readiness gates.
6. Re-run automated checks on the release candidate and use a limited volunteer
   trial that includes older and less technical people before broader rollout.
   Record observed task completion, confusion and accessibility problems.

## Completion report requirements

The final report must cover all 18 requested subjects: executive summary;
current-state audit; principles; information architecture; primary navigation;
before/after flow counts; design system; screen-family changes; older-user
accessibility; admin/member simplification; explicit backend/API status;
environment/viewports/screens and before/after findings; automated tests;
validation results; PR URL/branch/commits/CI/reviews; native checklist; known
limitations; and recommended release-hardening sequence.

Completion requires that evidence to describe the actual final branch and PR,
not the planned direction or an earlier checkpoint.
