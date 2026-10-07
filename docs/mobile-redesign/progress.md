# Mobile redesign continuity checkpoint

Updated 8 October 2026. Continue the existing redesign; original audit,
inventory, flow map, design direction and all implementation families are
complete. Do not repeat the audit or reopen accepted decisions without new
rendered evidence. Read this, repository instructions and next-slice files only.

## Goal and delivery

- One coherent mobile redesign, one feature branch, one final PR; required CI
  green and actionable findings resolved. **DO NOT MERGE.**
- Branch `feat/mobile-ui-ux-reimagination`; checkpoint implementation HEAD
  `078ca2681bb3cd30c273f559ebdbd2eddb34595e`, 15 commits ahead. The documentation
  receipt follows this source commit; use actual Git HEAD for delivery.
- Base/origin main `ecde4334b0fc9d27752f162603d7920ac0225e49`, fetched unchanged
  8 October. Repository Tezzac24/ShiftShepherd.
- No redesign push/PR yet. Only open PR last checked: #19, unrelated SDK57/Node24
  upgrade, excluded. This branch SDK54, CI Node20, local Node24.19.
- Parent owns design, integration, final visual acceptance and progress; fresh
  bounded sequential workers for any substantial follow-up. Compact handoffs only.

## Accepted checkpoints

| Area | Commit | Tests / suites |
| --- | --- | --- |
| First-hand audit/direction | b77be62 | Baseline856/76 |
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
| Members/roles/invitations/acceptance | e2f3d58 | 1507/97 |
| Shared states/accessibility/current day/unknown route | b4a6f89 | 1529/99 |
| Final independent review fixes | 078ca26 | 1536/100 |

Each phase had parent phone-size rendered acceptance and automated checks.
All significant screen families are implemented and accepted; none remains.
Detailed implementation is in the repository, not this checkpoint. Evidence and
rationale: baseline-visual-audit.md, inventories, design-decisions.md,
flow-review.md, verification-plan.md and final-review.md.

## Global authority and decisions

- design-brief.md governs presentation/IA; product-contract.md governs behavior.
  constants/theme.ts and src/components implement one design language.
- Calm, obvious, readable, labelled, one clear primary task. Older members,
  reduced vision/dexterity, brief visits and one-handed use are primary.
- Tabs **Home / Schedule / Teams / Messages / Profile**; Schedule retains
  calendar with Church events/My serving. Preserve old detail/invitation links.
- OrganisationHeader resolves church identity/switching without live mock flashes.
  Home: personal duty/event focus, real unread cue, editorial notices and
  nonduplicated events. No repeated complete team directory.
- Team hub: Chat/Rota/Members/choir Songs nearby. My teams means membership;
  admin All teams is separate. Labelled contextual Manage; clear confirmations.
- Profile groups identity/preferences, church administration and account/demo.
- Common paths normally <=3 transitions after named primary context. Menus,
  segments, forms and confirmations are real additional effort. Library-song
  edit/arbitrary-date selection4 from Teams,3 from choir hub accepted exceptions;
  Home team shortcut trades one transition for a calmer overview. See flow table.
- Primary#155C52/background#F7F8F5/ink#182F2A/white; existing semantic palette.
  Type title28/35, heading22/29, body17/26, label16/22, secondary14/21,
  display32/39, nav13/18. Spacing4/8/12/16/20/24/32/40, gutter20, radii10/14/20.
  Controls52pt/icons48-52pt; calendar44pt exception. Text scales/wraps.
- One content h1; native18pt bold context is not a heading. Native/ARIA states
  agree; disabled blocks press; decorative icons/spinners hidden in both.
  Explicit StatePanel heading level retained; visible message carries polite error.
- Same-account refresh retains drafts/confirmed outcomes; real scope/authority
  loss fences stale work. Unknown failures never claim nothing saved. RNWeb error
  reveal observers installed from mount; preserve unusual saved times/choices.
- Music links above lyrics, sticky Choose songs/Song order, fixed Save; retain
  ordinary choir CRUD/legacy helper-authorised links. Uncertain creation checks
  submitted title without inferring saved identity.
- Current-time hook refreshes hour/day/foreground without background polling,
  new global state, reseeding or resetting chosen form dates/months.

## Frozen contracts and approved client exceptions

No backend addition required/approved; **no DESIGN BLOCKER remains**.
No schema/migration/RPC/RLS/Edge/Auth configuration/storage/Realtime/push,
dependency or app-config changes. Auth/AppData runtime and permissions unchanged.
No live mutation, email, invitation or push for inspection; no real user data.

Active-profile isolation/removed history/verified-email invitations; four
exclusive church roles/last-admin protection. Teams zero/one/multiple admins;
creator never auto-added; optional initial admin and retry request key. Church
admin lifecycle/role authority. Final team-admin demotion permitted; removal/leave
protections differ. Soft archive/same identity-history restore/active exclusion.
Unread authoritative; six preferences; only existing chat/notice/rota push.
No new notice unread, RSVP, reactions/presence, self-join, general availability,
reminder delivery or push-tap handler. Rota IDs/responses/cancellation/history,
partial month results and section-specific music authority remain.

Approved presentation-only ChurchEntryPresentationProvider under AuthProvider,
above profile-keyed AppData: transient account-owned request/continuation fences
through expected setUser(null) remount and newer/terminal invitation precedence.
No session/data/persistence/provider navigation or Root guard/key/startup changes.
Approved client invitation-service/test extension: validated exact-target pending
filters on existing RPC. Default mapping/errors/token-free behavior and authority
unchanged. Exact-person church/ID/email/name checks; existing member search200;
no false invitation200 claim. All other services remain unchanged.

Protected baseline objects: supabase6245e24c42b336c2210db22ed9eec96b67d3dab3;
Authfe517839f764a72daaa58efaf6f53a23f2043429; permissions27db91c5752d4a5ef64d4a9450a6e1f1bb4af73f;
app.json3150afc0603d0ade0c5ee712e5c26f6c6c18e19f.
Auth routing tests may change; compare runtime separately. Invitation service/test
is explicit exception; do not claim entire service tree identical.

## Final acceptance, reviews and validation

- Independent UX review completed7October:44 fresh captures at375/390/393/430;
  no blocker/high/medium. LOW revoke->cancel subtitle fixed. Flows/coherence,
  older-member clarity and substantial redesign accepted.
- Independent technical review: no blocker/high; MEDIUM confirmed role save
  used quiet refresh that swallowed read errors, LOW cached archived notice on
  Home. Fresh final_review_fixes worker completed compact handoff; director
  accepted role error/loading/recovered retry at375. Existing accessible-notice
  selector used on Home. Actual AppData resolved-error contract regression added.
  Independent closure48/3+diff passes; both closed. No actionable finding remains.
- Source committed078ca26; no active implementation/review worker. Obsolete
  church_members_invitations pending_init is inert; never reuse it.
- Parent final checks8October: typecheck/lint/test:ci1536/100/migrations38/diff
  and guarded Android+iOS+web export43 pass. Secret-pattern/protected diff/fixture
  scans pass. Initial sandbox Metro spawn EPERM was resolved by approved guarded
  export access; no application source workaround.
- Parent integrated final16 captures: Home/Schedule/Teams/Messages/Choir hub,
  Members/Rota/Music/notices/Profile/preferences/event+notice+song detail/chat.
  All phase families and live-style states previously personally accepted.
  Home naturally rolled toThursday8October/morning, Choir unread2 preserved.
- Shared33 captures, synthetic1.6/1.8 text, controlled midnight/foreground and
  chosen14October date/November month retention accepted. Native maximum text,
  VoiceOver, safe areas, keyboard, images, deep links and physical push remain QA.
- Capture-only unnamed web AX image has no corresponding unnamed app DOM image;
  documented artifact, not native defect certification. Cumulative browser error1
  is resolved creation-order Metro missing-file error; no subsequent error.
- All audit fixtures inactive/shims absent/exact restore; actual Hannah/Home390.
  Existing real env-file was never read/modified; preview/export dotenv disabled,
  public Supabase blank/null client, EXPO_OFFLINE1.
- User reauthenticated; fresh8October read-only hosted checks pass: correct
  kqhhslsowhnaktygrcjc, teams/profiles/history present, exact38/38 through
  20260917223118, ACTIVE pushv7/JWTtrue and invitationsv3/JWTfalse, both bundle
  fingerprints unchanged from6/7October. No repair/mutation/connection blocker.

## Runtime and exact next action

Preview localhost8089/session67318; controller127.0.0.1:8090/session85470.
Chrome browser-profile-recovery-20261007. Never restart solely for timeout.
Helpers .cache/ui-audit/exec-browser-helpers.js; fixture packs church-members-
invitations/fixture, shared-states and large-text-clock. Read relevant README
before use, never validate/export/commit active fixtures. Screenshots end.png;
sidecars give actual viewport/time. Temporary evidence stays ignored.

**Next:** commit final review/docs/count sync after diff check; push this branch;
open ONE PR feat: reimagine mobile user experience; verify required CI on final
head, inspect discussion/review threads and address actionable findings. No merge.
Then deliver18-topic report/native checklist/release-hardening handoff and mark
actual goal complete. Do not rerun whole audit or repeat passing source checks
unless new changes/failures justify it. Existing native/live rollout gates persist.
