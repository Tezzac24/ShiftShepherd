# Baseline mobile experience audit

Status: complete before UI implementation. Source baseline: `ecde433` on
`feat/mobile-ui-ux-reimagination`. The design director personally operated and
inspected the application. Source inventories supplement this report; they do
not substitute for the rendered observations below.

## Environment and evidence

- Windows; Expo SDK 54 from current main. The unrelated SDK 57 upgrade remains
  in PR #19 and is not part of this branch.
- The available Android emulator was attempted. Acceleration inspection reported
  GVM unavailable; launch failed to initialise its data path. Its process was
  stopped. No native result is claimed. iOS Simulator is unavailable on Windows.
- Expo web is a **mobile inspection proxy**, using the normal repository script
  with `--host localhost --port 8089 --max-workers 1`. Dotenv loading and Supabase
  environment values were disabled for the preview. No live data or API was used.
- Temporary Playwright tooling outside the repository drove a separate headless
  Chrome context. No browser testing dependency was added to the app.
- Viewports: **390 × 844**, **375 × 812**, **430 × 932**, **393 × 852**.
- Screenshots live outside version control at
  `%TEMP%/shift-shepherd-ui-audit/before/`. Each accepted file was opened and
  visually inspected. Screenshot 14 was initially captured during an unsettled
  navigation transition; it was rejected and replaced with the correct screen.
- Demo users: Hannah (member), Daniel (church admin), Ruth (no teams), Michael
  (assigned praise leader). Dates advanced during the audit; relative dates in
  the images reflect the capture time, not a fixed visual-test clock.
- Demo-only changes: one chat message; creation, archive and restoration of a
  long-name team with no initial admin; selection of two praise songs for an
  assigned date. No real users, invitations, emails, push tokens or remote rows
  were created or changed.

## Accepted screenshots and observations

| Evidence | Observed screen/state | Finding |
| --- | --- | --- |
| 01-sign-in | Sign in at 390 | Readable fields and clear main button. Three unavailable providers look equally actionable. Technical demo explanation and account picker dominate the lower screen. |
| 02-home-member | Hannah's Home | Serving is the third large block. Announcement and event cards have similar visual weight. Team shortcuts require scrolling; unread exists only on the small bottom badge. |
| 03-teams-member | Two joined teams | Descriptions, type badges, next dates and chat snippets compete inside every card. The directory is navigable but does not distinguish opening the team from opening its chat. |
| 04-team-member | Choir hub | Useful content, but large identity/member badges precede the tools. Rota access is repeated. The unavailable Resources row occupies the same space as Chat and Songs. |
| 05-serving-detail | Assigned date with songs | Personal response is discoverable. Full title repeats in the native header and content. Large cards separate a single coherent date into several blocks. |
| 06-availability-form | Inline response editor | Plain available/maybe/unavailable choices and optional note are strengths. Selected state needs explicit accessibility semantics, and the form must continue to work with the keyboard. |
| 07-chat | Populated choir chat | Familiar own/other bubbles and bottom composer. Small timestamps, no day separation, an icon-only send control, and loud own-message fills merit refinement. |
| 08-songs | Populated library | Search and Add are obvious. Each song consumes a large card with repeated icons and tags; scanning a long library is slower than a consistent list. |
| 09-song-form | Add song | Required and optional fields are clear, but all optional content is expanded before save. Tags have smaller targets than primary controls. |
| 10-profile-member | Hannah's Profile | The large centred identity card and duplicate teams list push ordinary settings down. Active church identity is missing from the main profile presentation. |
| 11-notifications | Six preferences | Labels are understandable. Only the small switch is tappable. Reminder settings imply delivery that does not exist; other copy describes supported delivery as future work. |
| 12-calendar | Populated event list | Chronological order is useful. Repeated category/date/time/location/repeat cards make a three-month list visually repetitive. |
| 13-event-detail | Recurring event | Necessary information is readable. Recurrence editing instructions are shown to an ordinary member and incorrectly say “in this demo”. |
| 14-announcement-detail | Church announcement | Paragraphs and linked event are clear. Notice content still looks like the same generic card used for schedules and settings. |
| 15-confirm-dialog | Sign-out confirmation | Consequence and explicit cancellation are clear. The dialog uses destructive styling for a routine action; background controls remain in the browser accessibility snapshot. Native focus requires separate QA. |
| 16-teams-admin | Admin directory | “Your Teams” actually includes every active team. New team and Archived teams occupy the first part of the screen ahead of participation. |
| 17-create-team-375 | New team at 375 | Optional initial admin is explicit and defaults to none, which must remain. The complete member picker expands before the submit button. |
| 18-create-team-validation | Empty submission | The name error appears near the first field, but focus/scroll remains at the bottom beside Create. The visible result looks like an unresponsive submission. |
| 19-long-team-empty | Long-name, zero-admin team | Name and description wrap, but together with the empty rota consume nearly the entire first screen. Basic team tools start below the fold. The creator was not added as a member. |
| 20-team-settings-demo | Team settings | Another identity block repeats the same long text before one useful action. Demo membership controls are unavailable; this is a contract limitation, not a missing permission grant. |
| 21-archive-confirm-long | Archive confirmation | Retained history and reversibility are explained correctly. Preserve that meaning. The affected team should be identifiable without relying on the dimmed background. |
| 22-archived-team | Archive list | Restoration is obvious and returns the same team. After restore the list is empty, without a direct return to the restored team. Back history can lead to old settings. |
| 23-plan-month | Monthly choir planner | Existing-date exclusions and decide-later defaults are valuable. Pattern, default leaders and per-date changes need clearer grouping and a persistent review/save area. |
| 24-picker-sheet | Month selector | Large rows and visible close control are useful. Selected state is visual only; safe area, modal focus and reduced motion require shared treatment. |
| 25-rota-form | Create rota date | Date and time fields are clear. “Assignment 1” is structural language, and the small remove icon sits beside a long form. |
| 26-announcement-form | Team announcement draft | The real audience is present and editable by authority. Make that context clear before composition; optional linking/pinning should not compete with message writing. |
| 27-event-form | Create event | All fields are exposed in one wall. Required date/time/location can form one readable group; recurrence can remain progressively disclosed. |
| 28-date-picker | Expanded date control | Named dates and unavailable past days are useful. Month/year wrap at 375; nested margins constrain a seven-column control. |
| 29-home-no-teams-430 | Ruth's Home | Empty serving and empty teams each occupy a large section, pushing actual church information down. An absence of assignments should be reassuring and compact. |
| 30-empty-teams | No membership | Explains why no teams appear, but gives no practical next step. Do not imply self-join or public discovery exists. |
| 31-empty-messages | No conversations | Correctly ties chat to teams. Add useful guidance without inventing direct messages or self-join. |
| 32-permission-direct-route | Ruth opens inaccessible choir | Access is denied correctly. There is no in-app exit when the route is opened directly. Recovery must provide a safe destination. |
| 33-invitation-unavailable | Incomplete invitation | Plain explanation and a working Continue action are strengths. Preserve the signed-in routing escape. |
| 34-announcement-list | Multiple notices, pinned first | Important notices are distinguishable by pin label. No church/team filter exists, and every notice repeats the same card structure. |
| 35-messages-populated-393 | Two conversations, unread badge | Opening the list does not clear unread. Preview text is small/truncated; signed team images should use the existing resolver. |
| 36-rota-list | Active and cancelled dates | Cancelled history remains visible, correctly. Dates compete with status badges, wrapping the time onto another line. Pending response should be a clear action cue. |
| 37-select-songs | Empty praise selection | Section ownership is explained and only the assigned section is editable. Save appears before the library and can be far away after scrolling. |
| 38-selected-song-controls | Two selected songs | Reordering is explicit, not gesture-only. Three small icon controls crowd the title. Preserve ordering while giving the controls comfortable targets and clearer labels. |
| 39-song-detail | Lyrics and external link | Lyrics are readable and music links are actionable. Raw URL text, repeated title and a prominent Delete action compete with reading. |

## Flows exercised personally

1. Sign in as a member; Home → Teams → Choir → serving date → availability
   editor; inspect existing response/note and leave without changing it.
2. Choir → Chat; fill and send one demo message; return to the team and observe
   unread clearing for the opened conversation. Open the conversation list as
   another demo member and verify that the list itself leaves unread intact.
3. Choir → song library → Add song; inspect the form and return. Later open an
   assigned praise date, select two songs, save and verify the resulting section;
   the separately owned worship section remains unavailable for editing.
4. Profile → notifications; inspect all six preferences; return and sign out
   through confirmation. Repeat role changes through the real demo login UI.
5. Church admin → Teams → New team; submit empty and observe off-screen error;
   fill a realistic long name/description; leave initial admin as none; create.
   Open Settings → Edit → Archive; confirm; inspect archive list; restore.
6. Open church event list/detail and event form/date picker; inspect recurrence
   and related-team semantics. Open announcement detail, linked-event affordance,
   full list and a team announcement draft.
7. No-team member → Home → Teams → Messages; inspect empty states. Open a
   restricted team URL and verify denied access. Open an incomplete invitation,
   then use Continue to return safely to the signed-in Home.

Source-backed counts for every common goal are in
[identity/team inventory](inventory-identity-teams.md) and
[daily-feature inventory](inventory-daily-features.md). Count from the stated
primary context; do not hide extra navigation by changing the starting point.

## Cross-app conclusions

The app already has readable 17-point body text, labelled primary navigation,
many 52-point buttons, familiar chat, confirmation for consequential actions,
and explicit permission gates. Retain those strengths.

The principal problems are information architecture and hierarchy: repeated
identity/cards, serving buried on Home, deeply nested member management, and
no personal serving overview. Admin participation is conflated with authority.
Empty states take too much Home space, while restricted direct routes can trap
the reader. Forms need visible validation recovery and less optional content
before the main action.

Source-measured accessibility risks supplement the screenshots: muted text
`#7A8294` is approximately 3.85:1 on white and 3.57:1 on the old background;
song-order buttons are 40 points, chat send is 46, and several controls rely on
small icons/hit slop. Screen-reader focus, large text, safe areas and keyboard
behavior cannot be certified from web screenshots.

## Explicit inspection limits

Live-only signup/confirmation/bootstrap/no-organisation, organisation switching,
member/role/removal/invitation administration, device registration and private
image upload states were inspected in source and existing behavior tests, not
by connecting this demo to a live account. No live failure was deliberately
provoked. Transient startup was observed; real offline/reconnect and native
keyboard, VoiceOver/TalkBack, large-text, image-picker and push behavior remain
unverified. These areas require mocked interaction tests during implementation
and a clearly separated native/hosted QA handoff.

No new backend capability is necessary for the redesign direction. The
[product contract](product-contract.md) records the frozen boundaries.
