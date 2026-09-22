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

“Songs” replaces “Song Database” in presentation. A scannable library leads to
readable lyrics and labelled external links without displaying a raw URL as the
main content. All choir members retain song editing. Date-specific praise and
worship choices remain separately authorised. Selection/reorder controls have
comfortable targets and save remains reachable after scrolling.

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

## Visual system

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
  Chevrons mean navigation; switches mean a saved preference; do not mix meanings.
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
- Confirmations: name the action/context and real consequence; clear Cancel;
  use destructive colour only when warranted. Long content scrolls. Dismissal
  resolves as cancellation, including back and unmount.
- Forms: grouped required fields first; optional detail disclosed when useful;
  inline field errors plus visible summary/first-error focus and scroll. Retain
  drafts on failure. Save/Cancel remain reachable above safe area/keyboard.
- Shared states: loading with a clear label; compact empties within summaries;
  full empty states explain next steps; errors say whether anything was saved
  and offer Retry; inaccessible/missing direct routes offer a safe exit.
  A loading indicator has one meaningful accessible status; decorative children
  do not add duplicate unnamed progress indicators.
- Motion: subtle press feedback only by default. Any modal/state animation must
  respect reduced motion. No decorative or slow transitions.

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
