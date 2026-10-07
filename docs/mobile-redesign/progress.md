# Mobile redesign continuity checkpoint

Updated 7 October 2026. Read this, repository instructions and next-slice files
after compaction. Continue the existing redesign; the director's original audit,
inventory, flow map and representative slice are complete. Do not repeat them
or reconsider accepted decisions without new rendered evidence.

## Goal and branch

- Complete one coherent mobile redesign, one final PR, required CI green and
  all actionable review findings resolved. **Do not merge.**
- Branch: `feat/mobile-ui-ux-reimagination`.
- HEAD: `e2f3d58e7b3699fe02e3f46a26f8e0e49dc59375`, 13 commits ahead.
- Base/last fetched main: `ecde4334b0fc9d27752f162603d7920ac0225e49`,
  unchanged on 7 October. Repository Tezzac24/ShiftShepherd.
- No redesign push/PR yet. Only open PR last checked: #19, unrelated SDK57
  upgrade, excluded. This branch SDK54; CI Node20, local Node24.19.
- Member/invitation family and parent documents committed as e2f3d58. Only
  this post-commit progress update is uncommitted; preserve it.
  Repository is the source of implementation detail.
- Use fresh bounded **sequential** workers. Parent owns global direction,
  integration, phone-size visual acceptance and documents. Compact handoffs
  only; no full logs/diffs/source/transcripts.

## Accepted checkpoints

| Area | Commit | Tests / suites |
| --- | --- | --- |
| First-hand audit and direction | b77be62 | Baseline856/76 |
| Design foundations | 441f5fd | 881/80 |
| Home/navigation/Schedule | 771fea0 | 922/83 |
| Teams representative slice | 73b2b2e | 965/83 |
| Repository guidance | 5e040eb | Documentation |
| Profile/preferences | 3f04df9 | 1017/84 |
| Team forms/lifecycle | 7a53707 | 1062/84 |
| Chat | d724d40 | 1118/87 |
| Announcements/events | 4cb68f0 | 1206/91 |
| Rota/availability | 3965a43 | 1302/93 |
| Music | 1512a2a | 1387/96 |
| Auth/church entry | 4433fff | 1430/97 |
| Members/roles/invitation admin/acceptance | e2f3d58 | 1507/97 |

Each accepted phase passed typecheck, lint, migration check, diff check and
demo Android/iOS/web export43 routes, with parent phone-size visual acceptance.
These are phase checks, not final validation. Web is a proxy; no native pass.
Original evidence/rationale remains in baseline-visual-audit.md, inventories,
design-decisions.md and flow-review.md. Do not copy it here.

## Shared design authority

Read design-brief.md for presentation/IA and product-contract.md for behavior.
Tokens/components in constants/theme.ts and src/components are implementation
authority; workers may propose, not independently redefine, global design.

- Calm, obvious, readable and labelled; one clear primary task. Older members,
  reduced vision/dexterity, brief visits and one-handed phones are primary.
- Tabs **Home / Schedule / Teams / Messages / Profile**. Schedule retains the
  calendar route with Church events/My serving. Preserve detail/invitation links.
- OrganisationHeader resolves current church without live mock flashes.
  Home prioritizes serving/event focus, authoritative unread, editorial notices
  and nonduplicated events. Do not repeat the whole team directory.
- Team hub: Chat/Rota/Members/choir Songs nearby. My teams means membership;
  admin All teams is separate. Contextual labelled Manage progressively
  discloses administration; destructive actions have clear confirmations.
- Profile separates identity/preferences, church administration and account/demo.
- Common flows normally <=3 meaningful route transitions from named primary
  context. Sheets/segments/forms/confirmations remain extra effort; accepted
  exceptions and actual counts belong in flow-review.md.
- Primary#155C52, bg#F7F8F5, white, ink#182F2A; semantic tokens, no new palette.
  Type title28/35, heading22/29, body17/26, label16/22, secondary14/21,
  display32/39, nav13/18. Text scales/wraps; explicit heading levels.
- Rhythm4/8/12/16/20/24/32/40, gutter20, radii10/14/20. Controls52pt,
  icons48–52pt; calendar grid44pt documented exception.
- Reuse Screen/footer, headings, fields, rows/groups, segments, sheets,
  confirmations, FormErrorSummary and StatePanel. Full content titles with
  quiet management in smaller context. Native and ARIA states must agree.
- Retain drafts/known outcomes through same-account refresh; fence actual
  scope/authority loss. Unknown failures never claim nothing saved. Reveal
  recovery/errors; RNWeb layout observers must be installed from mount.
- Retain unusual saved times/filtered choices. Null time is No set time.
  Images show the whole image with failure fallback.
- Music links before lyrics; sticky Choose songs/Song order plus fixed Save.
  Ordinary choir CRUD/generic-team deep-link authority retained. Uncertain
  creation checks the submitted title in the library; no ID inference.

## Product/backend freeze and approved client exceptions

No backend addition required/approved; **no DESIGN BLOCKER outstanding**.
No schema/migration/RPC/RLS/Edge/Auth configuration/storage/Realtime/push contract
or dependency/config changes. Existing Auth/AppData/permissions/server authority
remain. No real-user mutation, invitation/email/push for inspection.

Retain active-profile isolation/removed history/verified-email invitations,
four exclusive organisation roles and last-admin protections. Teams allow
zero/one/multiple admins; never auto-add creator. Optional initial admin and
request-key retries remain. Church admins own lifecycle and role changes.
Final team-admin demotion is allowed; remove/leave protections differ and stay.
Archive is soft, restore preserves identity/history, archived access excluded.
Unread is authoritative, six preference keys retained, only chat/announcement/
rota push delivered. No invented notice unread, RSVP, reactions/presence,
self-join, general availability, reminder delivery or new push-tap handler.
Rota response/assignment IDs/cancellation/history/partial month outcomes and
narrow praise/worship selection authority remain.

Approved UI architecture: ChurchEntryPresentationProvider under AuthProvider,
above profile-keyed AppData, retains only account-owned create/switch presentation
through existing setUser(null) remount. Read-only account/link generation tickets
guard invitation exits against old accounts/newer links, including terminal links
adopted/cleared in one batch. No provider navigation, new storage/session/AppData,
Root guard/key/startup change or Auth-runtime rewrite. Existing '/' hub retains
invitation precedence. AGENTS/CLAUDE record this extension.

Approved CLIENT-service exception: optional validated/normalized exact-target
pending filters on existing list_organisation_invitations RPC. Default request,
token-free mapping/errors and server authority unchanged. Only invitations.ts
and its test change; recover absent initial metadata without substituting identity.
Exact person selection uses ID+email/name/church hints, existing member search200,
fresh returned ID/current church. Old ID-only/capped absence remains honest.
Invitation200 wording removed: deployed RPC has no SQL LIMIT; API may cap results.

Read-only hosted recheck6October: teams/profiles/migration schema recovered after
pause/resume; exact38/38 through20260917223118. ACTIVE functions:
send-chat-message-pushv7/JWTtrue, manage-organisation-invitationsv3/JWTfalse.
No repair/mutation. Repeat at final gate.
User reauthenticated7October; tools returned and fresh read-only check succeeds:
correct kqhhslsowhnaktygrcjc project, teams/profiles/history present, exact38/38,
ACTIVE pushv7/JWTtrue and invitationsv3/JWTfalse, unchanged bundle fingerprints.
No remote mutation or DESIGN BLOCKER. Repeat only if final review changes the
protected scope or connection state; these reads establish the current baseline.

Protected baseline objects:
- supabase/:6245e24c42b336c2210db22ed9eec96b67d3dab3
- src/lib/supabase/:8ff684495135ac9874ae137c1537363e1b182537
- src/lib/auth/:fe517839f764a72daaa58efaf6f53a23f2043429
- app.json:3150afc0603d0ade0c5ee712e5c26f6c6c18e19f

Compare Auth runtime separately from allowed routing tests. Explicitly allow
invitation client service+test; do not claim its whole tree identical.

## Current bounded operation and exact next action

- Prior church_visual_refinement completed compact handoff: role clarity,
  compact Manage invitation rows, short consequence dialogs, Already listed
  chooser and direct pending recovery. Worker checks **1498/97**, typecheck/
  lint/migration/diff green. Parent export artifacts complete iOS+Android/web43;
  no fixture markers. Not final source after the next refinement.
- Parent personally reviewed all26 scenarios and recovery flows at375/390/430,
  58 numbered captures plus settled/error-recovery extras. Directory/server
  search, exact targets, four roles, final-admin Open Members, long dialogs,
  pending outside initial history, retained drafts, saved-unsent/unknown,
  loading/errors and acceptance variants inspected. **Family accepted.**
- Two MEDIUM acceptance findings resolved and personally re-rendered: unverified
  email leads with Check invitation; validation waits for layout and reveals the
  absolute measured field. Summary/repeated-submit recovery passes. Cancelled
  copy, single terminal exit and present-tense replay inspected at375/430.
- Worker **/root/invitation_acceptance_refinement is completed**. Final source
  passed1507/97,57 focused tests, typecheck/lint/diff and guarded fixture checks.
  No active implementation worker. No export/browser/fixture activation/commit
  by workers; parent owns final acceptance.
  Earlier church_members_invitations pending_init is obsolete; do not trigger it.
- Parent completed directory no-match, actual demo denied routes, member removal
  dialog, own Leave from Profile, final/accepted exits with controls visible.
  Screens personally inspected through58 numbered captures plus corrected-state
  extras; all patched sources restored exactly, shim absent, Hannah/Home.
- Parent final phase checks pass:1507/97, typecheck/lint/migration38/diff;
  demo iOS+Android/web export43, fixture-marker scan and protected allowlist.
  No backend/runtime/config/dependency/permission change outside the recorded
  invitation client filter and allowed Auth routing tests.
- Worker **/root/shared_accessibility_states completed** initial source. Scope:
  shared control semantics/forms/states, current-day freshness and safe live-style
  TeamMembers inspection pack. Parent owns browser/documents/commit acceptance.
- Approved7October: role-appropriate aliases/decorative hiding/real disabled
  behavior; a local next-hour+foreground clock hook without background polling
  or selected-date/data reset; native context-title renderer retaining18pt bold
  title/Back but no headingLevel (PageHeading owns1); short TeamMembers dialogs
  with full context in body and unchanged demotion/remove/leave distinction.
  Explicit StatePanel heading levels take precedence over alert-title semantics;
  visible error content retains polite alerts without duplicate hidden copies.
  Main preparation/denied/missing states retain a content heading where needed.
- Initial worker validation1520/98, typecheck/lint/migration38/diff green;
  protected runtime/services/AppData/permissions/config have no working diff.
  Parent inspected clean tabs/single h1, long team dialogs, final-admin demotion,
  peer-admin gates and visible failure states at375/393/430 (13 captures).
  Not accepted: TeamMembers generic Change not saved falsely implies a known
  outcome; needs Couldn’t confirm change + guarded Refresh members. Promotion
  permission jargon also needs plain wording. Own-demotion→hub must use internal
  navigation: full page reload resets the fixture's in-memory memberships.
  Metadata, large text, church/fallback headings and retained date review remain.
- Bounded shared follow-up completed1526/98 and other checks green. Parent
  inspected lost-response/current-role recovery at375 and confirmed own-final
  demotion→internal Back enables Leave while keeping membership (capture16).
  All member7 scenarios inspected, no product bug from full reload fixture reset.
- Current fresh worker **/root/mobile_inspection_helpers is running** on ignored
  follow-up activation-policy/safety checks only; no shipped-source edits.
  Its3 scenarios/4 prepared hashes/37 guards/21 CLI refusals validated, but
  activation refused an existing env-file despite dotenv disabled/publicvarsblank.
  No file/value was read or changed. Parent approved helper-only conditional
  allowance when EXPO_NO_DOTENV=1, retaining null-client/demo/allLive/owner guards.
  Follow-up now completed:6 env allows/33 CLI refusals/37 runtime guards/
  exact mock restores, no env reads or actions. All workers completed/idle.
  Parent text1.6 captures19–23 cover375 Home/Schedule/My serving/availability;
  text wraps, tabs expand with mid-word Schedule/Messages wrapping, sheet footer
  reachable and note can scroll. Native maximum-text QA remains. Fixture restored
  exactly/no shim, actualHannah/Home. Text1.8 at430 event fields/footer/date sheet/
  unavailable route pass. Clock captures25–28 cover actual hook midnight and
  foreground, chosen14October date and November month retained. No save or data
  reset. Single church-role/members heading and missing-team level1 inspected.
  33 numbered shared captures;32/33 actual430 despite names (sidecars authoritative).
  Capture-only unnamed AX image reproduced before=false/after=true while guarded
  DOM probe reports only labelled avatars, no unlabelled img/svg. Documented
  inspection artifact; native VoiceOver pending. Shared visual slice accepted.
  Shared metadata pack restored exactly, no shim; actual Hannah/Home.
  Home metadata count0. Rota metadata identifies decorative native Back img
  with empty alt plus hidden0×0svg and named avatars. Modal provenance still
  unconfirmed: long probe output obstructed the click (scaffolding only).
  Probe's ignored report is now bounded/split and safety checks pass; reactivation
  after workers are stable will inspect the modal without obstructing controls.
  Bounded Rota availability and Profile sign-out modal probes show only named
  avatars/no extra image. Team mutation-confirmation extra image remains to
  identify (possibly history/busy context; do not attribute without evidence).
- Worker **/root/unavailable_route completed**,1529/99 plus typecheck/lint/
  migration38/diff; parent phone acceptance pending. Thin route/feature/tests only.
  It worked on
  thin +not-found route, feature screen and offline tests only. Parent capture17
  exposed generated black Unmatched Route/raw URL/Sitemap at375. Approved calm
  shared screen, no raw path, one Continue through '/' auth/invitation hub;
  keep native Back/context and all guards. No backend capability is needed.
  Parent accepted375 capture18 and Continue→Home through hub. Browser cumulative
  error count1 is a transient Metro missing-module while new route was written
  before its target file; source now resolves and no subsequent errors observed.
  All fixtures currently inactive/restored; do not activate during app edits/checks.
- **Exact next action:** bounded follow-up shared worker fixes member recovery/
  copy and unavailable route are complete; parent final phase checks/export,
  protected allowlist/fixture-marker scan, docs/rationale update and logical
  commit. Then fresh independent sequential UX/accessibility and technical reviews.
  Parent final phase validation now green1529/99, typecheck/lint/migration38/diff,
  demo iOS+Android/web export43 with no fixture markers. Protected working paths
  unchanged; no active shim. Ready to commit shared pass and unavailable route.
  Then independent sequential UX and technical reviews. Never merge.

## Runtime and safe inspection

Preview localhost8089/session67318; controller127.0.0.1:8090/session85470.
Recovered only after old handles/listeners were actually absent. Keep running;
timeouts alone never justify restart. Demo env: dotenv disabled, Supabase public
variables blank, EXPO_OFFLINE1. Windows has no usable native simulator.
Chrome profile browser-profile-recovery-20261007 preserves old profile/artifacts.
Actual demo Hannah/Home, zero page errors; no active fixture/shim.

Helpers .cache/ui-audit/exec-browser-helpers.js and exec-church-fixture.js.
Pack .cache/ui-audit/church-members-invitations/fixture,26scenarios/9anchors,
parser-valid43-character synthetic token, strict original hydrated-demo/null-client
guards, in-memory services/Auth/storage and owner-fenced refresh, zero real actions.
Exact byte/hash restore refuses edits. **Never edit/run checks while active**;
restore between scenarios. Do not activate while worker is editing sources.
Hide controls for screenshots; show them for intercepted navigation notices.
Fixture does not certify actual Root remounts/token persistence/native/backend;
actual-router Jest covers established routing races.

Auth phase accepted37captures/all16 scenarios; do not repeat it. Earlier demo
music residue/selection restored. Artifacts/tools ignored under.cache/ui-audit.
Screenshot names end.png; inspect saved image, settle loading before accepting.
Header Back may be button Back or link Go back; wheel scroll uses pointer.

## Remaining work and completion gates

1. Shared states/forms/accessibility/dead code: guarded live-style TeamMembers
   role/removal (final-admin demote allowed vs remove/leave protection), state
   aliases, tab glyph accessibility, unnamed image-role provenance, large text/
   long lists/focus, duplicate native/content h1. Controller literal img query
   empty despite unnamed role: inspect guarded DOM metadata, do not assume source
   or restart working browser. Date/foreground rollover: long-lived Home showed
   6October on7October until reload; update current-time views without resetting
   chosen dates. Parent visual acceptance after fresh bounded sequential worker.
2. Independent sequential UX/accessibility + technical/regression reviews.
   Resolve all blocker/high/medium; fix/document low, reinspect affected areas.
3. Final parent all-major visual pass and exact-final-head typecheck/lint/test:ci/
   check:migrations/diff/export; protected diff, no secrets/real data/new migration,
   fresh origin/main/open PR and hosted38/functions. Follow verification-plan.md.
4. Reconcile README/AGENTS/CLAUDE final counts/status, preserving historical
   deployed facts and pending native/live QA.
5. Push same branch, ONE PR feat: reimagine mobile user experience,14-topic body,
   no model/coauthor attribution. CI green finalHEAD; actionable comments/threads
   resolved. **Do not merge.**
6. Requested18-topic report, actual before/after flows, native checklist and
   release-hardening sequence. Only then mark goal complete.

Native iPhone nav/keyboard/safe areas/sheets/scrolling/picker/status bar/deep links/
targets/large text/VoiceOver/push taps remain handoff. No native, live membership/
invitation/private-storage/physical push-delivery pass claimed. Documented rollout
blockers persist.
