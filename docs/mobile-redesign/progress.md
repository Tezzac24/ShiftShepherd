# Mobile redesign continuity checkpoint

Updated 6 October 2026; continuing from the user's context-preservation checkpoint.
This is the entry point after compaction. Continue the existing redesign; do not
repeat the completed audit or reopen accepted design decisions without new
rendered evidence. Implementation detail remains in the repository.

## Goal and repository state

- Goal remains active: complete mobile redesign, one branch, one final reviewed
  PR with green required CI. Do not merge. No redesign PR has been opened yet.
- Branch: `feat/mobile-ui-ux-reimagination`.
- HEAD: `3965a43978f16eeb1894d8fd6402a87ae54b50f0` (10 commits ahead).
- Base and last fetched `origin/main`: `ecde433` (rechecked 6 October).
- Unrelated open PR #19 (Expo SDK57) is excluded. This branch uses main's SDK54;
  repository CI uses Node20. Local Node is 24.19.
- Initial clean-tree/fetch/open-PR/migration checks, required reading, complete
  route inventory, flow map and the director's first-hand audit are complete.
  The representative-slice gate is accepted. Do not restart them.
- Music is personally accepted and fully validated; its logical phase commit is
  next. Uncommitted files are confined to Choir/music helpers/tests and the
  director's mobile-redesign documents.
- All implementation workers are complete. Do not reuse the original audit.
  Auth/bootstrap/no-church/create/switch is the next fresh sequential worker.
- Main and open PRs were rechecked on 6 October: main is unchanged and the only
  open PR is unrelated SDK-upgrade #19. Use the dedicated GitHub PR search.

## Accepted areas and commits

| Area | Commit | Known accepted validation |
| --- | --- | --- |
| Audit, inventory and direction | b77be62 | Parent first-hand audit; baseline 856 tests/76 suites |
| Shared design foundations | 441f5fd | 881 tests/80 suites; personal visual acceptance |
| Navigation, Home, Schedule | 771fea0 | 922 tests/83 suites; member/admin/empty/deep-link review |
| Teams directory, hub, members | 73b2b2e | 965 tests/83 suites; long virtualized roster review |
| Repository presentation guidance | 5e040eb | README/AGENTS/CLAUDE synchronized |
| Profile and notification preferences | 3f04df9 | 1,017 tests/84 suites; normal and offline state review |
| Team create/edit/archive/restore/Add member | 7a53707 | 1,062 tests/84 suites; creation/retry/scope/lifecycle review |
| Messages and chat | d724d40 | 1,118 tests/87 suites; 56 focused; history/composer/recovery review |
| Announcements and events | 4cb68f0 | 1,206 tests/91 suites; 113 focused; 56 parent captures |
| Rota, availability and monthly planning | 3965a43 | 1,302 tests/93 suites; 118 focused; 59 parent captures |
| Choir/music | Pending phase commit | 1,387 tests/96 suites; 51 affected tests after final refinement; 52 parent captures |

Each accepted implementation phase also passed typecheck, lint, migration
filename check, diff check and demo-only Android/iOS/web export (43 routes).
The final notice/event copy correction passed 55 affected tests/2 suites.
These are phase checkpoints, not final validation of the whole redesign.

Accepted UI was personally rendered at representative 375×812, 390×844,
393×852 and/or 430×932 phone sizes. Web remains an inspection proxy, not native
QA. Original audit and accepted rationale are retained in
`baseline-visual-audit.md`, both inventory documents, `design-decisions.md`
and `flow-review.md`. Do not reproduce their full history here.

## Approved global direction

`design-brief.md` is the sole presentation/IA authority; `product-contract.md`
is the frozen behavior authority. `constants/theme.ts` and shared components
are the implementation source for tokens and interaction conventions.

- Calm, obvious, readable, labelled, one primary action; recognition over memory.
  Design for older people, reduced vision/dexterity and one-handed phone use.
- Primary tabs: **Home / Schedule / Teams / Messages / Profile**.
  Schedule retains the calendar route and Church events/My serving segments.
  Preserve existing detail paths, invitation routing and predictable Back.
- Reuse OrganisationHeader for resolved church identity and switching. Never
  flash mock identity in live mode. Home prioritizes the next personal duty,
  actual unread messages, editorial notices and nonduplicated events.
- Team hub puts Chat/Rota/Members/choir Songs nearby. My teams means actual
  membership; church-admin All teams is separate. Administration belongs in
  contextual labelled Manage actions, with distinct confirmations.
- Common actions normally take at most three route transitions from their
  primary context. Sheets/confirmations are additional interactions, not hidden
  costs. Counts, accepted exceptions and rationale belong in flow-review.
- Deep teal primary #155C52, warm #F7F8F5 background, white surfaces, #182F2A
  ink; semantic success/warning/danger and the established soft surfaces.
  No feature-specific palette, new framework, font, router or global state.
- Native system typography: 28/35 title, 22/29 heading, 17/26 body, 16/22 labels,
  14/21 secondary; 32/39 display and 13/18 navigation where established.
  Text grows/wraps; explicit heading levels, no headings inferred from bold.
- Spacing 4/8/12/16/20/24/32/40, 20-point gutter, radii 10/14/20.
  Default controls 52pt, icon controls 48–52pt, calendar-grid exception 44pt.
- Reuse Screen/footer, PageHeading, ListGroup/ListRow, SectionHeader, Button,
  TextField, SwitchRow, SelectField, Date/TimeField, DateMarker, ModalSurface,
  ActionSheet, FormErrorSummary and StatePanel.
- Full-width content titles; quiet Manage sits beside smaller context above.
  Editorial notices, date rows and conversations have distinct structures.
- Forms keep drafts and known saved outcomes through same-profile refresh.
  Actual scope/role loss fences stale work; Close after a save prevents later
  follow-on navigation. Unknown failures must not claim nothing was saved.
- Errors stay beside the relevant action, with visible recovery. Sheets have
  labelled Close and correct focus transfer. Native states and ARIA agree.
  RNWeb layout observers needed for error reveal must exist from mount.
- Keep valid saved nonstandard times and unavailable filtered choices.
  Optional null time is No set time. Notice detail images show the whole image
  and a load-failure fallback. No new gallery/viewer or decorative motion.

## Frozen backend and product contract

No backend changes are required or approved. No outstanding DESIGN BLOCKER.
Use existing services/Auth/AppData/permission helpers and server authority.
Do not change schema, migrations, RPCs, RLS, functions, Auth, storage, Realtime,
notification types/token ownership, packages or app configuration for styling.

Retain active-profile/church isolation, removed-profile history, verified-email
invitation rules, organisation roles/last-admin protection, and route fencing.
Teams may have zero/one/multiple admins; creation never auto-adds the caller;
initial admin is optional and retry keys remain idempotent. Church admins own
team lifecycle/role changes. Final team-admin demotion to zero is allowed;
remove/leave protections differ and remain intact. Archive is soft, restore
retains identity/history, archived teams grant no active access.

Keep authoritative chat unread/focused-read behavior and existing attachment
and push contracts. All six preference keys remain; only existing chat,
announcement and rota delivery is supported. Event/availability reminders
remain stored but undelivered. No new push-tap handler, announcement unread,
RSVP, reactions, presence, self-join or general availability calendar.

Rota response applies only to one's assignments, including all own roles.
Unchanged person+role assignment pairs retain IDs/responses on edit; only changed
pairs are replaced/reset. Choir library editing remains available to ordinary
choir members; praise/worship selection has narrower section authority.
Cancellation/history/restore, separate optional announcement draft and
authoritative monthly batch/partial results remain unchanged.

Read-only hosted recheck **1 October**: public.teams, public.profiles and migration
history are present; local/remote migration filenames match **38/38** exactly
through `20260917223118`. Functions remain ACTIVE: send-chat-message-push v7
(verify_jwt true), manage-organisation-invitations v3 (false). The earlier
missing metadata followed project pause/resume and resolved without repair.
No remote mutation, email, invitation or push was sent. Repeat at final gate.

Protected baseline Git objects for final comparison:

| Path | Object |
| --- | --- |
| supabase/ | 6245e24c42b336c2210db22ed9eec96b67d3dab3 |
| src/lib/supabase/ | 8ff684495135ac9874ae137c1537363e1b182537 |
| src/lib/auth/ | fe517839f764a72daaa58efaf6f53a23f2043429 |
| app.json | 3150afc0603d0ade0c5ee712e5c26f6c6c18e19f |

## Latest accepted slice: Choir/music

Accepted 6 October: grouped virtualized library, readable lyrics with Music links
disclosure above, ordinary-member CRUD, focused form with optional fields, and
sticky Choose songs/Song order segments with fixed save. Existing generic-team
deep links retain helper authority; the choir-only hub shortcut does not create
a new team-type permission gate. Local scope/child/org guards preserve drafts
through same-profile refresh and reject stale work after real access changes.

Existing song/link and section writes can fail after partial completion. The UI
keeps drafts/order and acknowledges uncertainty. New-song recovery prioritizes
Check song library with the failed attempt's submitted title, keeps Back to the
draft, and leaves retry explicit/secondary. It never infers a saved ID from titles.
This uses existing APIs; no backend addition or DESIGN BLOCKER is needed.

Final phase checks passed: **1,387 tests/96 suites**, typecheck, clean lint,
38-migration filename check, diff check and demo-only Android/iOS/web export
(43 routes). The last recovery refinement passed 51 affected tests. Protected
backend/services/Auth/permissions/AppData/types/config/dependencies are unchanged.
The export used approved Hermes process permissions and did not deploy anything.

Parent inspected 375×812, 390×844 and 430×932. Normal demo CRUD, optional fields,
selection/reorder/save/clear, permission differences and Back passed. Disposable
song-mupy3ina-2 was deleted and Hannah's rota-choir-2 worship section restored
empty. All 13 offline scenarios covered 60-song scrolling/search, long titles/
artists/lyrics, cold/loading/error/retry, external-link failure, uncertain and
partial saves, submitted-title recovery, retained drafts, readiness/role loss,
archive/cancellation and late completion. Fifty-two captures are in ignored
.cache/ui-audit/choir-music; final 51–52 supersede the earlier creation recovery.
All fixtures are inactive/restored exactly, no shim/markers remain, and normal
demo has zero browser page errors. Native/live-service QA is not claimed.

## Exact next action after compaction

1. Read this checkpoint, repository instructions and only next-slice files.
   Do not re-audit accepted families or reopen their design without new evidence.
2. Commit the accepted Music phase on the same feature branch, then start a
   **fresh sequential Auth/identity-presentation worker** for login/signup/
   confirmation, account bootstrap, no-church, church creation and switching.
   Organisation members/roles and invitations follow as the next bounded family.
3. The worker reads the shared brief/contract and actual code, keeps Auth logic
   behind existing abstractions, uses existing actions and returns <=400 words.
   Parent owns global decisions, documentation and final personal visual review.
4. Coordinate the existing browser. Fixtures must be inactive before source
   edits/checks; inspect status, never assume it. Current demo user is Hannah;
   the music library is clean and rota-choir-2 worship choices are empty.
5. Inspect the changed area, common paths, role/state variants and appropriate
   checks before accepting/committing and starting the next worker.
   One branch, one final PR, no merge.

## Runtime and inspection recovery

Preview: http://localhost:8089, exec session 89908. Controller:
http://127.0.0.1:8090, session 80068. Both were recovered only after their former
handles/endpoints were actually gone. An observation timeout alone is not a
reason to restart. Probe before recovering; keep ongoing communication.

Preview is demo-only (dotenv disabled, public Supabase variables blank,
EXPO_OFFLINE=1). Persistent demo profile is .cache/ui-audit/browser-profile.
Playwright1.63.0 and browser tools are isolated in ignored .cache/ui-audit/tools;
app dependencies are unchanged. Windows has no usable native simulator here.

Durable helpers: .cache/ui-audit/exec-browser-helpers.js restores browserActSource
and captureSource in functions storage; browser-client.cjs accepts encoded JSON.
exec-rota-fixture.js restores rotaFixtureSource. The Rota fixture README/CLI is
under .cache/ui-audit/rota-availability/fixture/. It documents all 13 scenarios,
exact restoration and safe in-memory controls. Scenarios use team-choir and
offline-rota; actual Auth must remain demo. Artifacts stay ignored, not committed.
exec-choir-fixture.js similarly restores choirFixtureSource. The music fixture
uses team-choir, offline-song and offline-rota; activation and restoration must
be sequential, with a full goto and visible OFFLINE CHOIR INSPECTION banner.
The audit skill guidance was read and its context preflight found no saved
context; the user-authorized existing Chrome/Playwright workflow continues.
Browser scroll is wheel-at-pointer; move into scroll content before interpreting
a no-scroll result. Native header Back can be link Go back; fallback is button Back.

## Remaining sequence and final gates

1. Commit accepted Music; prior families stay accepted.
2. Auth/bootstrap/no-church/create/switch presentation.
3. Organisation members/roles and invitation admin/acceptance states. Preserve
   bounded server search, exact selected target, four roles, last-admin rules,
   removed/unlinked identity, wrong-account/token/expiry/saved-unsent behavior.
4. Shared accessibility/forms/states/dead-code pass. Outstanding evidence:
   live-style TeamMembers role/removal dialogs (offline), selected/expanded/busy
   state consistency, decorative tab glyphs in accessible names, unidentified
   unnamed image role seen on Login/Home/Rota, large-text/long-list review.
   Investigate actual DOM/native evidence; do not assume the image source.
5. Independent sequential UX/accessibility and technical/regression reviews.
   Resolve every blocker/high/medium; fix or explain remaining low findings.
6. Final personal visual pass and exact-final-head validation: typecheck, lint,
   test:ci, check:migrations, git diff --check, npx expo export; protected diff,
   no secrets/real data/new migration/config/Edge changes; fresh read-only hosted
   alignment. Follow verification-plan.md for the state matrix.
7. Reconcile final README/AGENTS/CLAUDE counts and presentation status without
   rewriting historical deployed-contract facts or native QA caveats.
8. Push this branch; open one PR titled feat: reimagine mobile user experience.
   Use the requested 14-topic body, logical commits and no attribution trailers.
   All required CI must be green on final HEAD; resolve actionable comments and
   threads. **Do not merge.**
9. Provide the requested 18-topic completion report, before/after flow counts,
   native QA checklist and release-hardening sequence. Only then complete goal.

Native iPhone navigation, keyboard, safe areas, modals, scrolling, picker, status
bar, deep links, touch/large-text/screen-reader behavior and push taps remain QA
handoff items. No native, live membership/invitation, private-storage or physical
push-delivery pass is claimed. The current absence of push-tap navigation is a
known contract limitation, not a hidden redesign addition.
