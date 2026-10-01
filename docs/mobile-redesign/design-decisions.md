# Experience decisions and evidence

This comparison records the reason for each major change. Accepted means the
director inspected the implementation at phone dimensions; it does not mean
native or live-service QA passed. Detailed evidence and outstanding gates remain
in [progress](progress.md) and the [verification plan](verification-plan.md).

| Area | Baseline problem | Design decision | Intended improvement and acceptance |
| --- | --- | --- | --- |
| Shared language | Low-contrast secondary text, inconsistent controls and cramped long confirmations. | Semantic teal/neutral tokens, native wrapping controls, explicit headings, scrollable shared sheets and reachable errors. | Readable, predictable interaction; foundation accepted, final large-text/cross-app pass pending. |
| Home | Competing summaries and a repeated team directory obscure the immediate task. | One personal serving/event focus, actual unread cue, editorial notices and nonduplicated events. | The next useful action is clear; accepted. |
| Schedule | Personal serving dates require finding their individual teams. | Church events and My serving share one stable primary destination while retaining distinct data. | Other personal duties take two transitions from Home instead of four via Teams; accepted. |
| Teams | Admin visibility is labelled as membership; daily tools compete with administration and an inert Resources row. | My teams/All teams distinction, direct Chat/Rota/Members/Songs, contextual Manage. | Participation is clearer and capabilities remain close; accepted. |
| Team members | Ordinary members lack a full roster; adding a person takes four transitions from Teams. | Direct full-name Members list with separately gated management and Add member. | Roster takes two transitions and adding takes three; core screens/forms accepted, live role-dialog visual review pending. |
| Team lifecycle | An optional initial admin occupies a long directory, and retry/photo outcomes are easy to confuse. | Searchable optional chooser, explicit no-admin default, retained create outcome and separate photo recovery. | Shorter creation with truthful recovery and unchanged lifecycle rules; accepted. |
| Profile/preferences | Identity, membership, administration and account actions form an undifferentiated long page. | Compact identity, early full-row preferences, contextual church management and separate account/demo actions. | Routine personal actions are recognisable; accepted. |
| Conversations | Dense previews, weak empty-state guidance and inconsistent message/composer treatment. | Full-name conversation rows, truthful read-state feedback, readable messages and a growing composer. | Conversation selection and sending are clearer; accepted. Cached-history retry remains visible, and reading older messages preserves position. |
| Announcements | Notices repeat generic card treatment and team notices have no dedicated filtered destination. | Editorial notices, explicit audience, team filtering, full detail images and focused authoring with saved-image recovery. | Reading and publishing have distinct, understandable states; accepted. |
| Events | Detail repeats titles and administration; cold edits and recurring occurrence context need deliberate handling. | Date-leading detail, contextual management and a grouped form with explicit series consequences and retained saved values. | People can find when/where quickly and managers understand what a save affects; accepted. |
| Rota/music | Assignment response competes with management; long planning and selection forms demand too much memory. | Personal response first, contextual Manage, grouped planning, clear Praise/Worship choices and readable lyrics. | Serving tasks become easier without changing assignment or selection rules; implementation/review pending. |
| Organisation/auth/invitations | Technical copy, disconnected membership/invitation actions and long forms obscure identity and outcomes. | Resolved church context, connected contextual actions, focused forms and explicit invitation/account states. | People understand which church/account is involved and what happened; implementation/review pending. |

Navigation counts and deliberate exceptions are tracked separately in
[flow-review.md](flow-review.md); menus and confirmations are not treated as
effortless simply because they do not add routes.
