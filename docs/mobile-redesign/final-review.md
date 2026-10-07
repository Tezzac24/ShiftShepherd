# Mobile experience: final review and release handoff

Local acceptance completed 8 October 2026 on
`feat/mobile-ui-ux-reimagination`. This record describes the implemented product;
the single PR's live checks and discussion are the delivery authority. Do not
merge automatically. Screenshots and inspection helpers remain ignored local
artifacts, not application assets or release tests.

## 1. Executive summary

The app now uses one mobile design system across daily participation,
administration, identity and recovery. Home prioritises a personal next action;
Schedule exposes personal serving; team tools and members are directly reachable;
administration is labelled and contextual. All major screen families received
deliberate source, behavior and phone-size visual review. Existing capabilities
and server authority are preserved. Native and live release QA remain separate.

## 2. Current-state audit

The director completed the original first-hand audit before implementation.
Repeated generic cards, competing Home summaries, team settings drilling, dense
forms, small/weak secondary text and mixed personal/admin controls increased
effort. Some important personal serving and roster views lacked useful entry
points. The [baseline audit](baseline-visual-audit.md) and two inventories retain
the evidence; [design decisions](design-decisions.md) records each problem,
decision and intended improvement.

## 3. Design principles

Obvious choices; one primary task; recognition over memory; plain language;
comfortable touch; personal relevance; progressive disclosure; consistent
meaning; truthful outcomes and safety; accessibility in shared components.
The [design brief](design-brief.md) remains the presentation authority.

## 4. Information architecture

Daily church life lives in the five stable primary destinations. Teams own
their participation tools; authorised management stays close to the thing being
managed. Profile separates identity/preferences, church membership and account
actions. Shared church identity/switching is available on primary screens.
Existing detail, calendar and invitation paths remain compatible; unknown pages
continue safely through the established routing hub.

## 5. Primary navigation

| Destination | Main purpose |
| --- | --- |
| Home | Next duty/event, real unread chat cue, notices and next events. |
| Schedule | Church events and My serving, with distinct underlying data. |
| Teams | My teams; separate authorised All teams; nearby team tools. |
| Messages | Accessible conversations and authoritative unread counts. |
| Profile | Identity, preferences, church actions and account actions. |

Schedule retains the `calendar` route. Church switching and invitation precedence
retain existing Auth actions, guards and profile-keyed data teardown.

## 6. Three-screen flow analysis

The [complete before/after table](flow-review.md) records every common flow.
Counts are transitions after the named primary context, including tab changes.
Sheets, modes, forms and confirmations remain real additional effort.

| Task / context | Before | After |
| --- | --- | --- |
| Immediate overview / Home | 0 | 0 |
| Next serving duty / Home | 1 | 1 |
| Another personal duty / Home via Teams | 4 | 2 |
| Joined team / Home | 1 shortcut or 2 via Teams | 2 |
| Team chat / Teams | 2 | 2 |
| Unread conversations / Home | 1 | 1 |
| Announcement / Home | 1–2 | 1–2 |
| Event / Schedule | 1 | 1 |
| Availability / Schedule | Not exposed | 1 plus response sheet |
| Full member roster / Teams | 3 for managers; no dedicated member view | 2 |
| Add team member / Teams | 4 | 3 |
| Team role/removal / Teams | 3 | 2 plus confirmation |
| Edit/archive team / Teams | 3 | 2 plus Manage/confirmation |
| Create/restore team / Teams | 1 | 1 plus chooser/confirmation |
| Church members/invitations / Profile | 1 | 1; inviting adds a focused form view |
| Church role / Profile | 2 | 2 plus member sheet/confirmation |
| Notification preferences / Profile | 1 | 1 |
| Church switch choice / Home | 2 via Profile | 1; Home is the completion destination |
| Profile/account actions / Profile | 0–1 | 0–1; editing is a replacement form view |

Reading/adding a library song takes three transitions from Teams. Editing a
library song or choosing songs for an arbitrary non-serving date can take four;
each takes three from the choir hub. These specialist exceptions preserve useful
reading/date context. The independent UX review accepted them. Home's removed
full team directory adds one transition to its former shortcut, while the stable
Teams tab preserves a short recognisable path.

## 7. Design system

Semantic teal/neutral tokens, readable typography and shared controls replace
screen-specific styling. Primary `#155C52`, background `#F7F8F5`, ink `#182F2A`
and white surfaces are defined in `constants/theme.ts`. Body text is 17/26;
titles 28/35, headings 22/29, labels 16/22, secondary 14/21 and navigation 13/18.
Spacing follows 4/8/12/16/20/24/32/40 with 20-point gutters and 10/14/20 radii.
Default controls are 52 points; icons 48–52; calendar cells have a documented 44
point exception. Text scales and wraps. Shared fields, rows, groups, headings,
segments, sheets, confirmations, states, avatars and error summaries carry
consistent semantics and recovery. No new UI framework or state library.

## 8. Screen-family review

| Family | Deliberate change and retained capability |
| --- | --- |
| Auth/confirmation/bootstrap/no church | Focused entry, readable confirmation/recovery, short setup and account-owned church-request presentation through existing remounts. |
| Home | Personal duty/event focus, actual unread cue, editorial notice, nonduplicated events and current-day updates. Archived notices use the existing accessible filter. |
| Schedule/events | Church events/My serving; date-leading lists; readable when/where; contextual management; grouped authoring and explicit whole-series consequences. |
| Teams/hub/settings | Actual membership distinguished from admin visibility; direct Chat/Rota/Members/Songs; contextual Manage; compatible old settings routes. |
| Team creation/edit/archive/restore | Short forms, optional searchable initial admin, explicit no-admin default, request-key retries and separate created/photo-failed recovery; same identity restored. |
| Team members | Full names for permitted viewers; separately gated Add, role and removal actions; exact-person confirmations; final-admin distinctions and honest uncertain-write refresh. |
| Chat | Readable own/other messages, day separators, truthful list/history/reconnect states, growing composer, labelled Send and retained failed draft/single image. |
| Announcements | Editorial audience/title/body, team filter, whole image/fallback and focused authoring with text-saved/image-failed recovery. |
| Rota/availability | Personal response first, optional note, multiple roles, contextual management, compact assignment editors, visible edit mode and persistent month partial results. |
| Choir/music | Grouped searchable library, readable lyrics, links above lyrics, focused song forms, sticky Choose songs/Song order and reachable Save. Ordinary choir CRUD and section-specific authority remain. |
| Church switching/creation | Resolved identity, clear current/mandatory selection, short setup and truthful uncertain-result checks; no invented membership. |
| Church members/roles | Existing server search, exact-person context, four exclusive role descriptions, final-admin recovery and confirmed-save access-refresh errors. |
| Invitations/admin/acceptance | Compact current/history, contextual Manage, short invite form, exact pending-target recovery, saved-unsent versus unknown outcomes, account/verification context and clear terminal exits. |
| Profile/preferences/account | Compact identity/editor, full-row preference switches, contextual church management and separated account/demo/danger actions. |
| System states | Shared loading/empty/error/denied/archived/unavailable recovery; one content h1; supported native/ARIA states, hidden decorative children and actual disabled controls. |

The original inventories retain route/state coverage. Unused generic notice,
event, rota-card and empty-state presentation was removed after reachability
checks. No established capability was replaced with an inert placeholder.

## 9. Older-user accessibility

Larger readable body text, full names, generous labelled targets, obvious Back,
visible choices and short plain-language confirmations reduce memory and dexterity
demands. Errors reveal the offending field and keep drafts; consequences name
the person/team/church. Headings, control state, polite errors and modal focus
are shared responsibilities. Synthetic 1.6/1.8 text was inspected at phone sizes.
Native maximum text, VoiceOver, keyboard and safe areas still require native QA.

## 10. Participation versus administration

Members see daily tools and their own membership. Church/team administration
appears only through existing permission helpers in labelled contextual surfaces.
All teams means administrative visibility, not participation. Destructive actions
are separate and confirmed; role changes never imply membership creation.

## 11. Backend/API status

**No backend changes required. No DESIGN BLOCKER remains.** Supabase files,
migrations, functions, policies, Auth runtime/configuration, permissions,
notifications, dependencies and app configuration remain unchanged. AppData
runtime is unchanged; new summaries are client-derived.

The narrow approved invitation service extension applies validated exact-target
pending filters to the existing RPC; default request/mapping/error/security
behavior remains intact. The presentation-only church-entry provider retains
account-owned request status and stale-completion fences above the existing
profile-keyed boundary; it stores no session/data/persistence and changes no
Auth action or root guard.

Read-only hosted checks on 8 October confirmed `kqhhslsowhnaktygrcjc`,
`public.teams`, `public.profiles` and migration history present; exact 38/38 local
and remote filenames through `20260917223118`; ACTIVE push v7/JWT on and
invitations v3/JWT off with unchanged fingerprints. No hosted write, repair,
invitation/email/push or real-user inspection data was created/committed.

## 12. Visual inspection

Windows Expo web, controlled through Playwright, was a mobile inspection proxy.
Viewports 375×812, 390×844, 393×852 and 430×932 covered real demo member/admin
navigation and guarded offline live-style states. Every substantial sequential
worker was followed by the director's rendered acceptance. Before screenshots,
populated/empty/loading/error/denied states, long names/content/lists, forms,
sheets and confirmations were reviewed where safely available.

Independent UX review added 44 fresh captures. The director's final integrated
pass covered Home, Schedule, Teams, hub/members, Messages/chat, rota, music,
notices/detail, event detail, Profile and preferences; corrected church-role
refresh failure/loading/retry was separately rendered. Actual date rollover
retained unread 2. All inspection fixtures are inactive and exactly restored;
exported files contain no fixture markers.

One extra unnamed web accessibility image appears only after screenshot capture;
a guarded app-DOM probe found no corresponding unnamed app image. One cumulative
browser error was the resolved transient creation-order Metro error. No later
page error was observed. Neither artifact is claimed as native evidence.

## 13. Automated tests

Final 1536 tests/100 suites pass, versus baseline 856/76. Coverage includes
navigation, role-gated actions, important forms/dialogs, archive/restore,
switching, invitation/deep-link/account races, retained drafts/partial results,
control semantics, scope fences, time rollover and errors. Existing backend,
Auth, chat, unread, notification and lifecycle suites remain offline.

## 14. Final validation and independent reviews

| Check | Result on final implementation source |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass |
| `npm run test:ci` | 1536/100 pass |
| `npm run check:migrations` | 38 pass |
| `git diff --check` | Pass |
| `npx expo export` | Android/iOS/web, 43 static routes pass |
| Protected diff / secret-pattern / fixture scan | Pass |
| Hosted migration/function read-only recheck | Pass |

Local Node 24.19, SDK 54; existing CI uses Node 20. Export used dotenv-disabled,
offline demo mode with blank public Supabase variables. The sandbox initially
blocked Metro worker spawn; the same guarded export passed with approved process
access. The existing web-notification warning does not certify native push.

Independent technical review found no blocker/high; one medium role-refresh
recovery defect and one low archived-Home-notice defect were fixed and independently
closed with 48 targeted tests/3 suites. The actual AppData resolved-error contract
is exercised by an offline integration harness. UX review found no blocker/high/
medium; its low invitation wording inconsistency was corrected. No actionable
independent finding remains.

## 15. PR delivery

One feature branch, logical commits, one final
[PR #20](https://github.com/Tezzac24/ShiftShepherd/pull/20) titled
`feat: reimagine mobile user experience`, open and unmerged. The current head,
CI results and discussion are published on that PR. Require green CI and no
unresolved actionable review threads; all independent findings are closed.
The unrelated SDK upgrade PR remains separate.
**Do not merge this PR automatically.**

## 16. Native QA

The [native checklist](verification-plan.md#native-qa-checklist-for-the-final-handoff)
remains unchecked: iPhone navigation/Back, keyboard, safe areas/status bar,
sheets/focus/dismissal, scrolling, image picker, invitation/deep links, touch
targets, maximum text/VoiceOver, reduced motion, organisation replacement,
foreground day changes and supported push taps. No native pass is claimed.

## 17. Known limitations

Web cannot establish native ergonomics, private-storage/device permission behavior,
real email acceptance or physical push delivery. Existing disposable-account
membership/role/leave/remove/lifecycle/invitation QA and rollout gates remain.
Event/availability reminders are stored preferences without delivered reminders.
The baseline has no explicit push-response navigation handler. Specialist song
flows have the documented four-transition exceptions. Smallest-phone synthetic
large text can wrap Schedule/Messages mid-word; native maximum-text review remains.

## 18. Recommended release hardening

User review of the single PR; native builds on the selected branch's SDK;
small/large iPhone and older-user accessibility QA; authorised disposable-account
Auth/multi-church/membership/lifecycle/invitation checks; physical push/token/
unread checks; owner-controlled production email/domain/SMTP/redirect readiness;
then release-candidate checks and a limited trial including older volunteers.
The [verification plan](verification-plan.md#post-redesign-release-hardening)
retains the concrete sequence. This handoff does not authorise deployment or merge.
