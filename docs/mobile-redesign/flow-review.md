# Navigation flow review

Status: in progress after the accepted Chat review on 30 September.
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
| Open the next duty / Home | 1 | 1 | Personal focus opens its date; availability is edited within the date. The rota composition still awaits its own redesign. |
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

The new zero-admin team stayed at zero members after edit/archive/restore.
Another create added only the explicitly selected Sarah as team admin; the
creator's My teams remained unchanged. These are actual local demo flows,
not hosted membership tests. Same-ID restoration and archived deep-link
exclusion were checked directly.

## Paths to finish reviewing

These counts are retained routes or planned paths, not completed screen-family
acceptance. Update their evidence after their owning worker and director review.

| Task and starting context | Before | Expected final path/count | Outstanding review |
| --- | ---: | --- | --- |
| Read announcement / Home | 1–2 | Recent notice or all notices then detail: 1–2 | List/detail/form and team filter. |
| Read event / Schedule | 1 | Event detail: 1 | Detail, occurrence context and form. |
| Create announcement / Home | 2 | All announcements, create: 2 | Audience authority and image recovery. |
| Create event / Home | 2 | Schedule, create: 2 | Recurrence, validation and hydration. |
| View/update availability / Schedule | Not exposed | My serving, date: 1 | Inline response composition and multi-role behavior. |
| Read a library song / Teams | 3 | Team, Songs, song: 3 | Library/detail and scoped deep links. |
| Add a song / Teams | 3 | Team, Songs, Add: 3 | Ordinary choir-member authority and form. |
| Choose own service songs / Schedule | Not exposed | My serving, date, section choice: 2 | Section-specific permissions and saved selection. |
| Invite/manage church members / Profile | 1 | Contextual church-management row: 1 | Organisation/invitation screen families. |
| Change church role / Profile | 2 | Church members, role: 2 | Four exclusive roles and final-admin presentation. |
| Switch church / Home | 2 to the choice via Profile | Shared church control, selector: 1 | Multi-organisation selector/state presentation. Header routing has behavior coverage; no live switch QA is claimed. |

## Exceptions and trade-offs

- Home no longer repeats the complete team directory. The team route from Home
  gains one transition compared with its former shortcut, while the stable
  Teams tab keeps the path short and recognisable.
- Reading a song through the general library takes three transitions from Teams
  and four from Home. Service-song links on a personal duty provide a shorter
  contextual path; verify those during the music phase.
- Editing a library song can take four transitions from Teams. Selecting songs
  for an arbitrary date one is not serving can also take four from Teams. From
  the already-open choir hub each takes three. These retain useful reading/date
  context and avoid filling Home with specialist shortcuts.
- Menus and confirmations are not claimed as zero effort. The final independent
  UX review must check their discoverability and whether they create excessive
  drilling despite an acceptable route count.

Final reporting must use completed paths and evidence rather than this file's
remaining expectations.
