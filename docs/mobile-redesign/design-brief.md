# Mobile redesign: shared design brief

This is the single design authority for all implementation workers. It follows
the completed [first-hand audit](baseline-visual-audit.md), both route/flow
inventories and the [frozen product contract](product-contract.md). The design
director owns changes to this document, navigation, tokens and conventions.
Workers implement this direction; they do not invent another visual system.

## Intended experience

A calm, contemporary place for church life: quickly understand the current
church, the next serving duty, recent notices, upcoming events and team messages.
Design for older people, reduced vision/dexterity, brief visits and one-handed
phone use. Use native React Native/Expo controls and the existing architecture.
Web is only a phone-size inspection proxy. Do not introduce a desktop layout,
another router, a global state library, or a large UI dependency.

## Principles

1. **Obvious over clever.** Visible labels and exits; no required hidden gesture.
2. **One primary action.** Each surface has one clear task; optional tools recede.
3. **Recognition over memory.** Expose the next useful choice in its context.
4. **Plain language.** “Serving”, “Members”, “Songs”, “Team admin”, “Add a date”.
   Backend role names and technical implementation terms stay out of normal copy.
5. **Comfortable touch.** Default targets are 52 points and expand with text.
6. **Relevant first.** Home prioritises the person; administration is contextual.
7. **Progressive disclosure.** Optional form details and management choices appear
   when needed, with visible labelled controls.
8. **Consistent meaning.** Dates, notices, conversations and actions have distinct,
   repeatable structures; do not turn every item into the same generic card.
9. **Honest and safe.** Explain consequential actions, saved-versus-unsaved
   failures, partial success and actual limits. Never invent backend facts.
10. **Accessible by construction.** Contrast, text scaling, control state, focus,
    error announcements and recovery are shared component responsibilities.

## Information architecture and navigation

Use five labelled primary tabs, in this order:

| Tab | Route retained | Purpose |
| --- | --- | --- |
| Home | `/(tabs)/home` | What matters now: next duty, unread conversation cue, recent announcements and next church events. |
| Schedule | `/(tabs)/calendar` | Two explicit segments: **Church events** and **My serving**. Default to church events; Home's serving link opens the serving segment. These remain different underlying data types. |
| Teams | `/(tabs)/teams` | Actual **My teams**, with a separate church-admin **All teams** view and contextual team lifecycle controls. No member discovery of inaccessible teams. |
| Messages | `/(tabs)/messages` | Familiar conversation list with existing authoritative unread counts. |
| Profile | `/(tabs)/profile` | Personal identity/preferences, current church, contextual church management and separate account actions. |

The five destinations remain useful and familiar; the weak paths are shortened
inside them rather than adding a crowded sixth tab. Schedule gives personal
serving a permanent home. Existing calendar, team, invitation and other deep
links continue to resolve. New thin routes may expose existing capabilities;
retain old paths as aliases or redirects where practical.

Established implementation: primary screens adopt `OrganisationHeader` inside
their own safe-top `Screen`, then `PageHeading`. Reuse its resolved-account logic;
do not create another church-name/switch implementation. Home/Schedule share
client-only destinations and serving summaries in `src/lib/appData/presentation.ts`.
`SectionHeader.actionAccessibilityLabel` supports concise visible actions with
specific accessible names (for example Announcements / View all).

Every primary screen shows the resolved active church name. A labelled switch
control is available when multiple linked organisations exist. Use the existing
Auth switch action and account context; never flash mock church metadata during
live loading. The provider remount and all route/session guards remain intact.

Normal detail screens use a predictable Back action and a concise context title.
The content owns the full item title. Direct links and denied/missing states
need an explicit safe fallback, not a blank header with no exit. Native back and
invitation precedence must remain unchanged. Forms retain clear Cancel/Back.
The native navigation title is a context label, without a content heading level;
the PageHeading owns level1. Preserve the existing18pt bold context treatment,
native Back/history and title text rather than adding two top-level headings.

### Home

Use a compact church identity/control, a personal greeting and date, then one
clear focal area: the next serving duty with role, team, date/time and response
state. If no duty exists, prioritise the next event and a compact reassuring
serving message. Do not render several oversized empty sections.

Follow with a concise unread-chat cue when there is something unread, a recent
announcement section with an obvious **All announcements** action, and a short
non-duplicated upcoming-event list. Do not reproduce the full team directory or
calendar. Never label announcements unread or imply that pinning is urgency.

### Teams and management

Team cards/rows prioritise identity and the next useful context. The hub puts
labelled **Chat**, **Rota**, **Members**, and choir-only **Songs** within easy
reach, followed by the next date and team announcements. Provide **All team
announcements** through an existing-data audience filter. Remove the inert
Resources placeholder; it is not an implemented capability.

Use a full-name member list for all people who can view the team. Management
controls remain separately permission-gated and live-only where currently
required. Link directly from the hub to Members; adding a person must not go
through Settings first. Keep old settings/member routes compatible.

Use a labelled **Manage** surface for authorised rota/announcement/member/team
identity operations. It may be a contextual action sheet, with the existing
settings route rendering equivalent choices for direct links. Do not expose
destructive controls among daily participation actions. Leave team remains
discoverable in the team's membership section and must retain its protections.

New team starts with name and description. “No initial team admin” remains the
default; choosing an initial admin opens a searchable chooser instead of an
always-expanded directory. Preserve request-key retries and the separate
already-created/photo-failed recovery. Archive and restore keep the same team.

### Messages and team chat

Messages uses the shared church header and readable conversation rows. Sort
accessible active-team conversations by latest message, with a stable name
order for empty conversations. Keep actual unread badges and full team names;
offer search when a long list needs it. Distinguish a failed message read from
an empty conversation. Opening this list never clears unread state.

Chat has a concise native header and full team context, readable chronological
messages and day separators derived from existing timestamps. A labelled
**View team** action in that context opens the existing hub, so members and team
tools stay nearby regardless of how the conversation was opened. Preserve Back
to the conversation's original entry point.
Use primary-soft
with dark text for one's own messages and a white bordered surface for others;
alignment, sender labels and readable timestamps carry meaning as well as colour.
Use a visible **Send** label and a labelled photo action where already supported.
Keep the existing single-image preview/removal, caption, retained failed draft
and adjacent send-error recovery. The composer remains reachable above the
keyboard; native keyboard behavior still needs native QA.

Preserve the existing focused-chat/read-cursor lifecycle, reconnect refresh and
near-bottom scrolling rules. Day grouping is presentation only. Never infer an
unread boundary from a count that cannot identify a message, and do not add
reactions, presence, typing, receipts, editing, galleries or an image viewer.

### Schedule, rota and music

Use date-leading lists instead of repetitive large event cards. My serving
groups all current-profile duties from existing active accessible teams, with
all roles on the date and a clear pending-response cue. Do not impose a new
membership-only rule on an admin's retained assignment.

Rota detail leads with when/where applicable, what the person is doing, and their
availability. Notes stay optional; one visible person can hold multiple roles.
Keep cancellation/history, restoration, partial monthly-save results and the
separate announcement offer. Monthly planning groups pattern, default people
and per-date overrides. No scheduling or notification rules change.

Use a concise Rota header and the full date title in the content, rather than
repeating long titles in both places. The person's response is the primary
participation action; named availability choices and an optional note belong in
a comfortable shared sheet. Show the current saved response before asking for a
change. Other people and their roles form a readable list, with response words
as well as colour. Keep edit/cancel/restore/delete in a labelled Manage surface,
with the existing separate confirmations and notice-draft offer. Cancelled dates
explain their status and keep permitted recovery available.

Cancellation uses one clear confirmation surface: **Cancel date** and **Keep
date**, with the existing optional reason field. Explain that the reason appears
on the team rota; an empty reason stays empty. Retain it on failure, preserve
scope/status guards, and offer an announcement draft only after cancellation
succeeds. Do not promise notification delivery.

Team rota lists use readable date rows and can disclose past dates from existing
loaded data. Virtualize the collection. Authorised managers may choose **Edit
dates** from Manage to enter a clearly labelled selection mode on the same list;
each row then opens its existing edit route. Keep **Edit dates** in the native
header and **Done** in the fixed footer so the mode and exit stay clear while
scrolling. Preserve the mode through a same-profile refresh, and fence actual
scope or authority loss. Ordinary members never see this mode.

Creation starts with the date details, then clearly paired person and role
choices. Completed assignment rows show compact name/role summaries, with one
inline editor open at a time. Open new/incomplete rows and reveal the offending
row during validation; retain stable draft identities and existing assignment
semantics. Monthly planning stays one understandable form: pattern and
times, default people, then dates and optional individual changes. Keep the
existing batch result authoritative, including partial success; never hide or
silently retry the already-created part. Keep team context on persistent result
pages. After cancellation, the optional **Write an announcement?** offer leads
to a draft that the user must **Post announcement** to publish; **Not now** skips
that optional next action without implying the cancellation is undone. Include a supplied
cancellation reason in factual draft copy; do not invent a future meeting or
imply that the existing rota push behavior has changed.

“Songs” replaces “Song Database” in presentation. A scannable library leads to
readable lyrics and labelled external links without displaying a raw URL as the
main content. All choir members retain song editing. Date-specific praise and
worship choices remain separately authorised. Selection/reorder controls have
comfortable targets and save remains reachable after scrolling.
The library uses grouped virtualized rows with dividers, full titles, artist and
tags; avoid separate panels and link counts for every song. Above the lyrics,
provide a compact **Music links** disclosure with the existing labelled links
and adjacent failure/retry when expanded. Keep it collapsed by default so long
lyrics remain the main reading content without hiding access to listening links.
Service selection uses the shared **Choose songs / Song order (N)** segments
on the existing route, defaulting to Choose songs. Keep the switch reachable
while scrolling and Save/Cancel fixed. Choose contains search and grouped
virtualized checkbox rows; Order contains the existing labelled Up/Down/Remove
controls and an empty-state path back to Choose. Keep draft order, notes and
query across segments; choosing a song must not grow another list above the
library or automatically switch views.
After an uncertain new-song save, **Check song library** becomes the primary
footer action; **Try saving again** remains explicit and secondary. Prefill
library search with the submitted title from the failed attempt, keep Back to
the retained draft, and never infer a saved song's identity from a title match.
The choir-only hub shortcut does not introduce a new team-type permission gate
on existing helper-authorized song deep links; preserve those routes.

Song detail prioritises title, artist and readable lyrics, with supporting notes
and clearly labelled links. Contextual editing remains available to every
permitted choir member. A service's Praise and Worship sections keep their own
authority and selection order; save explicitly and retain unsaved choices during
same-profile refresh. Every child route validates its owning team/date before
rendering or acting, including direct links.

### Announcements and events

Announcements are readable notices: clear audience, full title, author/date and
body, with restrained pinned treatment. Reuse Home's editorial notice language.
Pinning means top placement, never urgency or unread status. An optional,
validated `teamId` filters existing accessible notices; show the selected team
and a clear return to all notices. Connect **All team announcements** from the
team hub. Filtering must never widen the existing audience.

Events retain Schedule's date-leading language. Detail prioritises when, where
and description. A related team is context, not an audience restriction. Keep
management contextual and permission-aware; explain whole-series consequences
to the person editing. Do not add RSVP, reminders, maps or unsupported actions.

Keep notice/event titles full-width. Place quiet Manage beside the smaller
audience/category context above the title, so long content does not hide it or
squeeze the title. Detail and selected-image previews show the whole image;
list thumbnails may crop. A failed image load has a quiet visible fallback,
with text still readable. No new image viewer or download action is introduced.

Forms put essential fields first; disclose optional linking, pinning, recurrence
and image controls where useful. Preserve existing limits, date/time/recurrence
and end-date semantics, including saved links absent from a filtered chooser.
A cold edit distinguishes loading, failure and missing content from creation.
Hydrate for the actual account/organisation/item scope; preserve drafts and known
saved outcomes during same-profile refresh. In particular, an announcement whose
text saved but image failed must offer recovery without creating a duplicate.
Existing image hooks and notification calls remain unchanged.

A known successful save stays visibly successful through a temporary access
check. Explain any unfinished image step and use Close/Done, rather than Cancel,
once text is already saved. Recurrence end dates include the year, and retained
nonstandard times remain in chronological order without rounding them.

### Profile, identity and notifications

Use a compact identity block with the existing edit/photo affordance, then
notification preferences and current church context. Church-admin member and
invitation actions are a distinct contextual section. Account/sign-out/leave
actions are visually separated; demo reset belongs only in the demo section.
Retain membership navigation without making Profile a second team directory.

Use the full preference row as the switch target. Preserve all six preference
keys and profile ownership. Clearly state that event and availability reminders
are not sent yet. Supported chat, announcement and rota delivery is not future
work. Device permission is requested only after the existing explicit action.

Login prioritises usable email sign-in/signup. Unavailable providers may be
explained in a secondary disclosure rather than advertised as main actions.
Demo access remains available. Confirmation is a success/information state,
never a password error. Invitation identity/token/Not now behavior is preserved.

Church selection is a readable list with an explicit current-church marker,
understandable switching progress and a safe Back/Cancel when entered from an
active church. A failed account lookup is not a no-church state. The no-church
screen explains invitation-based joining and the existing create-church option,
without offering unsupported church discovery or automatic email matching.
Keep authentication/bootstrap routing inside its established abstraction.

Church create/switch presentation may use a feature-local transient provider
under AuthProvider and above the profile-keyed AppData boundary. Those existing
Auth actions intentionally clear the current user and remount screens. The
presentation provider retains only the account-owned request/draft/target and
status, keyed to auth mode and authIdentity.id; it stores no session or app data
and uses no persistence. Fence sign-out, account/mode changes, unrelated profile
changes and stale completions. Root guards, the startup gate, data keys and Auth
behavior remain unchanged. Only mounted screens continue through the existing
root routing hub so invitation precedence is preserved. A failed action may
have committed before account refresh failed: offer truthful account-refresh
recovery, without inferred identity, automatic creation retry or manual session
repair. A stale context ID is not a confirmed current church while user is null.

Church member administration starts with people and search, with role/access
details and consequential actions disclosed in context. Use the existing server
search and describe its bounded result honestly; do not imply that an absent
first-page result proves a person does not exist. Connect a person's applicable
invitation action directly to the existing invitation workflow. Distinguish
active access, an unlinked directory identity and removed access in plain
language without inventing account status elsewhere. Preserve all four exclusive
church roles, last-admin protections and the exact membership/history effects.

Role forms use a short page title and compact, fully readable person identity;
the name must not become an oversized multi-line form title. Explain the four
existing roles in plain church language rather than “baseline organisation
access” or “high privilege”; keep backend values and permission helpers intact.
When final-admin protection makes every change unavailable, the useful next
action is opening Members to appoint another admin, not a disabled Save form.
Consequential dialogs use short action titles with full name/email/church in
their body, so a long name cannot crowd the title and Close control.

Invitations prioritise a clear invite action and readable current/history
states. Keep the short creation form separate from the full candidate list;
choosing an existing directory person is a searchable field interaction.
Saved-but-unsent, resend/supersede and revoke outcomes need adjacent explicit
feedback. Acceptance screens lead with the church, bounded server-provided
identity context, current state and the next permitted action. Keep Not now and
wrong-account recovery discoverable, preserve pending tokens safely and never
claim delivery or acceptance from an unresolved client preview.

Invitation history uses compact readable rows and contextual management rather
than repeating two full-width buttons on every record. Cancelling an invitation
is visibly destructive and its confirmation explains that the old link stops
working. Use plain “Choose a listed person” copy for the existing directory mode.
A selected person with a known pending invitation leads directly to that current
invitation and its permitted actions; do not leave a disabled Send button as the
main action above an offscreen explanation. Missing bounded-history metadata
must remain honest and must never select a substitute record or invent an ID.

## Visual system

Invitation acceptance refinements from the director's 7 October phone inspection:
- An account with an unverified email leads with **Check invitation** after plain
  instructions to confirm that email. **Switch account** remains available as a
  secondary choice. An account without an email leads with Switch account; do
  not show phone-account terminology to someone who already has an email.
- A failed name submission reveals and focuses the actual name field after the
  validation content has laid out. Measure in the scroll content's coordinate
  system; a child offset inside the form is not an absolute scroll destination.
  The error-summary link uses the same recovery.
- Invitation status `revoked` is presented as **cancelled**, matching the admin
  action. Terminal links need one clear continuation; two exits invoking the
  same handler are unnecessary. Already-accepted copy uses the present tense.

Use **deep teal, warm neutral backgrounds, white surfaces and dark green ink**.
The feel is warm and composed, without decorative church imagery, gradients,
fake illustrations or ornamental motion. Use existing Ionicons and real avatar
resolvers; no new bitmap asset is required.

| Semantic role | Value / rule |
| --- | --- |
| Primary | `#155C52` |
| Primary pressed/dark | `#10483F` |
| Primary soft | `#E5F0EB` |
| Background | `#F7F8F5` |
| Surface/card | `#FFFFFF` |
| Raised/quiet surface | `#EDF2EE` |
| Main text | `#182F2A` |
| Secondary text | `#465D55` |
| Muted readable text | `#596B63` |
| Border | `#DCE4DD` |
| Strong/input border | `#789082` |
| Accent | `#825238` on `#F5EDE5` |
| Success | `#216347` on `#E7F3EB` |
| Warning | `#815510` on `#FFF3DA` |
| Destructive | `#AF2935` on `#FFF0F0` |
| Informational | Primary on primary-soft |
| Inverse | White on primary/dark surfaces |

Verify text contrast for every pair used. Existing token names can remain as
compatibility aliases; arbitrary feature-specific colours are not allowed.
Use semantic icon/badge treatments and words, not colour alone. Avatar fallback
colours should form a restrained, contrast-checked palette.

Initial calculated contrast: body/white 14.20:1; secondary/background 6.66:1;
muted/white 5.66:1; primary/white 7.82:1; accent/soft 5.64:1; success/soft 6.26:1;
warning/soft 5.89:1; destructive/soft 5.95:1. Input borders/white are 3.44:1.
These calculations verify the specified pairs, not every future composition.

Typography uses the native system font; no external font dependency. Type scale:
display 32/39 bold, screen title 28/35 bold, heading 22/29 bold, subheading 19/26
semibold, body 17/26, body emphasis 17/26 semibold, labels 16/22 semibold, secondary
and caption 14/21. Navigation labels may be 13/18 semibold. Allow text scaling;
do not shrink important text or use a fixed-height container to make it fit.

Spacing rhythm: 4, 8, 12, 16, 20, 24, 32, 40. Standard screen gutter 20; related
content 8–12; group separation 24–32. Retain existing spacing aliases where
needed. Corners: small 10, control 14, panel 20, pill only for short status labels.
Use borders/dividers and whitespace for structure. Avoid shadows on every row.

### Component conventions

- Buttons: primary, secondary, quiet/ghost, destructive; retain compatible old
  variants where used. Minimum 52 points, text wraps, visible busy/disabled state.
- Icon buttons: minimum 48 points, 52 preferred; accessible label always. Use a
  visible text label for ambiguous actions. Calendar grids may use a documented
  minimum 44-point exception because seven columns must fit a phone.
- Page heading: short context/eyebrow if helpful, full readable title, optional
  explanation and one adjacent/following action that can wrap.
- List groups: white surface with comfortable full-width rows and dividers.
  Chevrons mean navigation; switches change a labelled preference or form choice.
  Make immediate preference saving versus form submission clear in context.
  A failed automatic save restores the previous choice and explains the failure
  beside the affected preference. Keep both the feedback and retry control in
  view, including for choices near the bottom of a long screen.
- Date presentation: a clear day/month marker plus full date/time in the
  accessible label. Do not put long dates and status into competing rigid rows.
- Segments: at most two or three labelled choices with explicit selected state;
  horizontal scrolling is not required to find a main view.
- Sheets: clear title, labelled Close, scrollable content, safe-area padding,
  selected/disabled semantics, return focus and reduced-motion behavior.
  Cancellation returns focus to the opener; choosing a navigation/dialog action
  transfers focus to its destination. Stale dismissal callbacks after reopening
  must not pull focus behind the current surface.
- Control states follow their role: radios use checked, tabs selected, and
  selected button choices match native selected to supported aria-pressed.
  Decorative icons/spinners are hidden in both native and web semantics.
  A disabled state must actually block the control's press handler.
- Confirmations: name the action/context and real consequence; clear Cancel;
  use destructive colour only when warranted. Long content scrolls. Dismissal
  resolves as cancellation, including back and unmount.
  The default secondary label remains Cancel; an optional contextual label such
  as Not now may clarify a follow-up after an action has already succeeded.
- Forms: grouped required fields first; optional detail disclosed when useful;
  inline field errors plus visible summary/first-error focus and scroll. Retain
  drafts on failure. Save/Cancel remain reachable above safe area/keyboard.
- Shared states: loading with a clear label; compact empties within summaries;
  full empty states explain next steps; errors say whether anything was saved
  and offer Retry; inaccessible/missing direct routes offer a safe exit.
  A loading indicator has one meaningful accessible status; decorative children
  do not add duplicate unnamed progress indicators.
  Honor an explicit StatePanel heading level; an alert role must not discard it.
  Visible explanatory content can carry the polite error alert. Avoid duplicate
  hidden copies or native grouping that removes the heading from navigation.
- Motion: subtle press feedback only by default. Any modal/state animation must
  respect reduced motion. No decorative or slow transitions.
- Current-day views refresh their local clock on foreground entry and at the
  next local hour while active, covering greeting/day changes without background
  polling. Use a shared local hook, no new global store/provider. Never reset
  deliberately chosen calendar/form dates or regenerate persisted demo data.

Foundation decisions approved by the director on 21 September:

- Button and TextField may use native Pressable/TextInput internals, preserving
  their existing APIs, IDs and behavior. This enables wrapping/scaling and a
  standard input ref for visible error recovery without adding a dependency.
- Shared sheets may use no animation, which inherently respects reduced motion.
  Optional swipe dismissal is not required when Close, back and choice work.
- DateField opens its existing calendar in the shared full-width sheet. Nested
  form cards cannot fit seven comfortable targets at 375 points; this resolves
  that measured constraint while retaining all date/range/month semantics.
- Typography alone does not create a semantic heading. Use `AppText`'s explicit
  `headingLevel` (1 for the screen title, 2 for sections, 3 only for meaningful
  subsections). `PageHeading` and `SectionHeader` provide those defaults. Card
  text should not become a top-level heading merely because it is bold/large.

## Three-screen plan

Counts are route transitions after the named primary context. Sheets, inline
expansions and confirmations are recorded as additional interactions, not hidden
as if they cost nothing. These are **targets**, to be verified after implementation.

| Task / context | Before | Target | Planned path |
| --- | ---: | ---: | --- |
| Next duty / Home | 1 | 1 | Personal focus → date; response inline |
| Other personal duty / Home via primary tabs | 4 | 2 | Schedule/My serving → date |
| Team / Teams | 1 | 1 | Team row → hub |
| Chat / Messages | 1 | 1 | Conversation → chat |
| Chat / Teams | 2 | 2 | Hub → Chat |
| Full member names / Teams | No dedicated view | 2 | Hub → Members |
| Add team member / Teams | 4 | 3 | Hub → Members → Add |
| Change/remove team role / Teams | 3 | 2 | Hub → Members; row action/confirmation |
| Edit/archive team / Teams | 3 | 2 | Hub → Manage sheet → Edit; confirmation |
| Create/restore team / Teams | 1 | 1 | Manage teams disclosure → form/archive |
| Announcement / Home | 1–2 | 1–2 | Recent notice or All announcements → notice |
| Event / Schedule | 1 | 1 | Event row → detail |
| Availability / Schedule | Not exposed | 1 | My serving → date; inline response |
| Song reading / Teams | 3 | 3 | Choir → Songs → song |
| Add song / Teams | 3 | 3 | Choir → Songs → Add |
| Select own service songs / Schedule | Not exposed | 2 | My serving → date → section choices |
| Notifications / Profile | 1 | 1 | Notification preferences |
| Organisation members/invitations / Profile | 1 | 1 | Distinct church-management section |
| Organisation role / Profile | 2 | 2 | Members → role |
| Switch church / any primary screen | Usually Profile then selector | 1 to choice | Church control → selector; 1 further transition to Home |
| Profile/account actions / Profile | 0–1 | 0–1 | Inline edit or labelled preference/account action |

Reasonable exceptions: editing a song after navigating from Teams through the
library/detail can remain four transitions, with reading context preserved;
choosing songs for an arbitrary date one is not serving can take four from Teams.
From the already-open choir hub those are three. Do not add a dense shortcut
grid to every primary screen to disguise these uncommon paths. Record any
additional exception with a user-facing rationale and director approval.

## Frozen boundaries and implementation gates

Read `product-contract.md` before implementation. No migrations, RPC/schema/RLS,
Edge Function, Auth/storage/publication, push behavior or service-contract
changes. Use existing Auth/AppData actions; retain server authority, scope
teardown, idempotent create, separate photo recovery, final-admin distinctions,
archived exclusion, partial batch reporting, invitation token safety, section
permissions, private image resolution and authoritative unread behavior.

No new push-tap handler is part of this redesign; the current absence is a known
native handoff limitation. No announcement read state, public team discovery,
request-to-join, general availability calendar or scheduling reminder is added.

Before app-wide composition changes, implement and inspect a representative
slice: Home, Teams, team hub, Profile/Settings and a data-heavy Schedule or Chat.
Iterate until the director accepts it. Shared primitives can be established
first, but a token change alone is not the redesign.

After this brief, use fresh **sequential** bounded workers on the same branch.
Each reads this brief and current repository, returns a compact handoff, and
waits for director acceptance before the next area begins. Handoff: completed
area; essential UX decisions; substantial files/shared components; visual
checks/viewports; targeted tests/validation; remaining issue; director review
targets. No diffs, source dumps, transcripts or full test logs.

The director inspects each resulting diff/state, renders and personally reviews
the area, checks flow/accessibility/consistency and records a compact ledger.
Workers propose global changes rather than implementing them independently.
One feature branch, logical commits, one final PR, no attribution trailers and
no merge. Final acceptance requires all requested checks, protected-backend diff
review, complete visual pass, independent UX and technical reviews, addressed
findings/comments, green CI, native QA handoff and the completion report.
