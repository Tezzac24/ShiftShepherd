# Experience decisions and evidence

This comparison records the reason for each major change. Accepted means the
director inspected the implementation at phone dimensions; it does not mean
native or live-service QA passed. Detailed evidence and outstanding gates remain
in [progress](progress.md) and the [verification plan](verification-plan.md).

| Area | Baseline problem | Design decision | Intended improvement and acceptance |
| --- | --- | --- | --- |
| Shared language | Low-contrast secondary text, inconsistent controls and cramped long confirmations. | Semantic teal/neutral tokens, wrapping controls, role-appropriate states, one content h1, scrollable sheets and reachable errors. | Foundation and shared pass accepted after synthetic1.6/1.8 phone review. Native maximum text/VoiceOver remain QA. |
| Home | Competing summaries and a repeated team directory obscure the immediate task. | One personal serving/event focus, actual unread cue, editorial notices and nonduplicated events. | The next useful action is clear; accepted. |
| Schedule | Personal serving dates require finding their individual teams. | Church events and My serving share one stable primary destination while retaining distinct data. | Other personal duties take two transitions from Home instead of four via Teams; accepted. |
| Teams | Admin visibility is labelled as membership; daily tools compete with administration and an inert Resources row. | My teams/All teams distinction, direct Chat/Rota/Members/Songs, contextual Manage. | Participation is clearer and capabilities remain close; accepted. |
| Team members | Ordinary members lack a full roster; adding takes four transitions and uncertain failures claim nothing saved. | Full-name roster, separately gated Add/role/removal, short identity-rich dialogs and honest Refresh members recovery. | Roster takes two transitions, adding three. Guarded dialogs/final-admin distinctions/recovery personally inspected; no hosted/native pass. |
| Team lifecycle | An optional initial admin occupies a long directory, and retry/photo outcomes are easy to confuse. | Searchable optional chooser, explicit no-admin default, retained create outcome and separate photo recovery. | Shorter creation with truthful recovery and unchanged lifecycle rules; accepted. |
| Profile/preferences | Identity, membership, administration and account actions form an undifferentiated long page. | Compact identity, early full-row preferences, contextual church management and separate account/demo actions. | Routine personal actions are recognisable; accepted. |
| Conversations | Dense previews, weak empty-state guidance and inconsistent message/composer treatment. | Full-name conversation rows, truthful read-state feedback, readable messages and a growing composer. | Conversation selection and sending are clearer; accepted. Cached-history retry remains visible, and reading older messages preserves position. |
| Announcements | Notices repeat generic card treatment and team notices have no dedicated filtered destination. | Editorial notices, explicit audience, team filtering, full detail images and focused authoring with saved-image recovery. | Reading and publishing have distinct, understandable states; accepted. |
| Events | Detail repeats titles and administration; cold edits and recurring occurrence context need deliberate handling. | Date-leading detail, contextual management and a grouped form with explicit series consequences and retained saved values. | People can find when/where quickly and managers understand what a save affects; accepted. |
| Rota | Assignment response competes with management; open assignment choosers create a long form. | Personal response first, contextual Manage/Edit dates, compact assignment editors and grouped monthly planning with persistent partial outcomes. | Accepted after long-list/form and recovery review. Edit mode keeps its header and Done visible while scrolling; later-date editing needs three routes instead of four. |
| Music | Separate song panels and growing selected lists obscure browsing; long lyrics hide music links. | Grouped virtualized library, links above lyrics, focused forms, and sticky Choose songs/Song order segments with fixed Save. | Accepted after member CRUD, ordering, long-content and recovery review. Uncertain creation prioritizes checking the submitted title in the library while retaining the draft. |
| Auth and church entry | Demo entry is buried below credentials; technical account copy and unclear failures obscure the next action. | Demo-first sample choices in unconfigured builds, email-first configured entry, explicit confirmation/account states, short church setup and resolved church choices. | Accepted after all16 guarded scenarios, real demo sign-in/out and final recovery refinement review. Name errors reveal their recovery; account-owned request presentation survives expected remounts and rejects stale completions. No Auth behavior changed. |
| Church members/roles | Large directories and equally weighted actions obscure the selected identity; long role titles push choices away. | Existing server search, exact-person context, compact Church role identity, plain four-role descriptions and short consequence dialogs. | Personally inspected at375/390/430. Final-admin protection offers Open Members; uncertain saves keep the choice, confirmed saves survive refresh errors. |
| Invitation administration | Tall cards repeat full-width resend/revoke buttons; an already-pending person leaves disabled Send above hidden recovery. | Compact current/history rows with labelled Manage, focused short form, Already listed chooser and exact-target pending recovery through the existing filtered RPC. | Personally inspected all recovery states. The form draft survives view changes; saved-unsent and unknown outcomes remain distinct. Default RPC behavior/security are preserved; no backend addition. |
| Invitation acceptance | Account/verification states compete with acceptance, and a blank-name error initially leaves the field below the viewport. | Clear church/account context, Check invitation for unverified email, a measured field reveal after validation layout, and one terminal continuation. | All26 guarded family scenarios and actual demo denied routes inspected; cancelled wording and accepted replay are clear. Actual-router tests cover stale accounts/newer links. Web proxy only; live/native acceptance still pending. |

Navigation counts and deliberate exceptions are tracked separately in
[flow-review.md](flow-review.md); menus and confirmations are not treated as
effortless simply because they do not add routes.

Current-day presentation previously stayed on yesterday in a long-lived Home.
The local hour/foreground hook refreshes dates/greeting without background polling,
replacing selected form dates or changing data; controlled scheduling and picker
retention were personally inspected. Unknown routes previously displayed the
generated black developer page, raw URL and Sitemap. A shared unavailable screen
now provides one safe Continue through the established auth/invitation hub.
