# Navigation flow review

Status: in progress after member/invitation visual acceptance on 7 October.
The complete redesign, final visual review and PR gates are still outstanding.

## Counting and evidence

Start from the named primary context. The baseline inventories count navigation
transitions after that context, including tab changes. Retain that convention
for comparison; report menus, segments, field choosers, inline editors and
confirmations separately. These interactions still matter to usability. A
replacement profile editor is a meaningful form view even though its route does
not change. Completion destinations after an action are described separately.

Before counts come from the [daily-feature inventory](inventory-daily-features.md)
and [identity/team inventory](inventory-identity-teams.md), checked against the
original [rendered audit](baseline-visual-audit.md). Current evidence is phone-size
web inspection, deterministic behavior tests and explicitly labelled offline
fixtures. None establishes native or live-service QA.

## Accepted navigation paths

| Task and starting context | Before | Current | Path and interaction notes |
| --- | ---: | ---: | --- |
| Understand the immediate overview / Home | 0 | 0 | Personal serving/event focus, actual unread cue and recent notices are visible on Home. |
| Open the next duty / Home | 1 | 1 | Personal focus opens its date; Change availability opens a response sheet within that route. Multi-role response and recovery are personally inspected. |
| Choose another personal duty / Home | 3 via a team shortcut; 4 via Teams | 2 | My serving opens Schedule's serving view, then the date. The Schedule segment is an in-place choice. |
| Open a joined team / Home | 1 via a shortcut; 2 via Teams | 2 | Teams tab, then team. Removing Home's full team directory is an intentional clarity trade-off. |
| Open a team / Teams | 1 | 1 | Membership and church-admin All teams remain distinct. |
| Read full team member names / Teams | 3 for managers; no dedicated member view | 2 | Team, then Members. The old member route remains compatible. |
| Add a team member / Teams | 4 | 3 | Team, Members, Add member. Live-only mutation gates remain; the form was visually inspected through a safe fixture. |
| Change/remove a team role / Teams | 3 | 2 | Team, Members, then contextual actions and confirmation. Live role/removal dialog visuals remain for the shared-state review. |
| Edit or archive a team / Teams | 3 | 2 | Team, Manage action sheet, Edit. Archive needs confirmation; completion opens Archived teams. |
| Create a team / Teams | 1 | 1 | Manage teams menu opens New team. Choosing an optional initial admin adds a searchable field sheet; no admin remains the default. |
| Restore a team / Teams | 1 | 1 | Manage teams menu opens Archived teams. Restore is confirmed; the persistent result offers Open team or continued list work. |
| Notification preferences / Profile | 1 | 1 | Direct preference row; full-row switches, with no additional settings hierarchy. |
| Edit name/photo / Profile | 0 routes; inline editor | 0 routes; one replacement editor view | Edit opens a focused form with Save/Cancel. Photo changes retain their separately saved behavior. |
| Sign out / Profile | 0 | 0 | Clearly labelled account action and a routine confirmation; Auth owns the completion destination. |
| Check unread conversations / Home | 1 | 1 | Home's unread cue or Messages tab. List inspection preserves unread state. |
| Open chat / Messages | 1 | 1 | Conversation row opens chat; only that focused chat advances its existing read cursor. |
| Open chat / Teams | 2 | 2 | Team, Chat. Back retains the original entry point. |
| See members / Chat | Back through original entry point | 2 | View team, Members. The labelled shortcut works regardless of the conversation entry point. |
| Read announcement / Home | 1–2 | 1–2 | Recent notice, or All announcements then detail. Editorial content and audience remain clear. |
| All notices for a team / Teams | No dedicated filtered view | 2 | Team, All team announcements. A notice is one further transition; clearing the filter retains Back to the team. |
| Read event / Schedule | 1 | 1 | Event row opens detail with the selected recurring day preserved. |
| Create announcement / Home | 2 | 2 | All announcements, New announcement. Audience/event choices are sheets; optional image/pin/link controls expand in place. |
| Create event / Home | 2 | 2 | Schedule, New event. Date/time/repeat choices are in-place sheets; save retains the existing completion route. |
| Edit event / Schedule | 2 | 2 | Event, Manage sheet, Edit event/series. Whole-series consequences are explicit; management stays near the heading on long content. |
| View/update availability / Schedule | Not exposed | 1 | My serving segment, then date. The labelled response sheet keeps the saved response and optional note; multi-role partial failure and retry were inspected. |
| Edit a later rota date / Teams | 4 | 3 | Team, Rota, edit form. Manage → Edit dates adds two initial interactions; the mode persists for further edits. Native Edit dates header and fixed Done remain visible while scrolling; Back retains the mode and Done restores reading. |
| Read a library song / Teams | 3 | 3 | Team, Songs, song. Grouped search results open readable lyrics and the Music links disclosure. |
| Add a song / Teams | 3 | 3 | Team, Songs, Add song. Ordinary members retain editing; optional fields expand in place. |
| Choose own service songs / Schedule | Not exposed | 2 | My serving segment, date, section choices. Choose songs/Song order are segments on the same route; saved order and Back were checked in demo. |
| Switch church / Home | 2 to the choice via Profile | 1 to the choice | Shared church control opens the selector. Selection completes through the existing routing hub to Home, one further destination transition. Long names, current identity, mandatory selection, uncertain outcomes and account replacement were inspected with guarded offline fixtures; no live switch QA is claimed. |
| Set up a church / no-church account | 1 | 1 | Existing creation route, one short name field and a fixed submit footer. Invitation-based joining remains the alternative. Required-name and uncertain-create recovery are visible; no hosted church was created. |
| Find/manage a church member / Profile | 1 | 1 | Church members, existing server search, then the person's contextual access sheet. Search handles names/email beyond the initial200; actions keep the exact returned person and church. |
| Invite a new person / Profile | 1 to invitation page | 1 to invitation page; one further form view | Invitations, Invite, short email form. The form replaces the list in the same route, but is meaningful additional effort. Already listed opens a searchable chooser; a known pending person goes to their exact current invitation. |
| Resend/cancel an invitation / Profile | 1 | 1 | Invitations, labelled Manage row, confirmation. Compact history and current views retain UTC expiry; resending replaces the link. Saved-unsent/unknown outcomes and a pending item outside initial results were inspected offline. |
| Change a church role / Profile | 2 | 2 | Church members, contextual member sheet, Church role. Four exclusive choices, short promotion confirmation and visible recovery; the sheet is an additional interaction. Final-admin protection offers Open Members to appoint another admin. |
| Remove church access / Profile | 1 | 1 | Church members, member sheet, Remove access confirmation with full person/church and retained-history consequences. Own membership offers Leave from Profile, keeping the established separate leave flow. |
| Accept an invitation / opened link | 0 after sign-in/name prerequisites | 0 after sign-in/name prerequisites | The invitation page shows church/account context, required name if needed, and Accept. Unverified email leads with Check invitation; another account remains a secondary choice. Blank-name validation reveals the actual field. Terminal links have a single exit; replay opens the existing church. |

The new zero-admin team stayed at zero members after edit/archive/restore.
Another create added only the explicitly selected Sarah as team admin; the
creator's My teams remained unchanged. These are actual local demo flows,
not hosted membership tests. Same-ID restoration and archived deep-link
exclusion were checked directly.

## Remaining flow verification

The screen families above have been personally inspected. Guarded church fixtures
do not certify live email, Auth persistence, Root remounts or server mutations;
actual-router tests cover account replacement, expected refresh remounts and
newer/terminal invitation precedence. Native/live QA remains separate. The final
independent review and shared-state pass still need the team role/removal dialogs,
cross-app control semantics and final integrated common-flow check.

## Exceptions and trade-offs

- Home no longer repeats the complete team directory. The team route from Home
  gains one transition compared with its former shortcut, while the stable
  Teams tab keeps the path short and recognisable.
- Reading a song through the general library takes three transitions from Teams
  and four from Home. Service-song links on a personal duty provide a shorter
  contextual path, verified during the music phase.
- Editing a library song can take four transitions from Teams. Selecting songs
  for an arbitrary date one is not serving can also take four from Teams. From
  the already-open choir hub each takes three. These retain useful reading/date
  context and avoid filling Home with specialist shortcuts.
- Menus and confirmations are not claimed as zero effort. The final independent
  UX review must check their discoverability and whether they create excessive
  drilling despite an acceptable route count.

Final reporting must use these completed paths with their stated evidence limits.
