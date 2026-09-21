# Daily feature inventory and current flows

Source baseline: `ecde433`, inspected on 19 September 2026 before presentation changes. This report covers Home, primary navigation, announcements, events, chat, rota, availability, and choir music. It records source behavior; it does not claim rendered, simulator, physical-device, or screen-reader verification. The baseline visual audit is recorded separately.

The product contract is frozen. Roles, active-profile identity, organisation isolation, lifecycle protections, unread behavior, notifications, and existing backend interfaces must remain intact. This inventory identifies existing capabilities and client presentation risks, not approval for backend changes.

## Navigation and screen inventory

`app/_layout.tsx` declares authenticated stack routes around five labelled tabs: Home, Calendar, Teams, Messages, and Profile. Detail and form routes are outside the tab navigator. Invitation acceptance remains a separate root route, and the account-scoped AppData provider remounts on active-profile changes to discard the previous organisation's data, signed URLs, unread state, timers, and subscriptions.

Route files below are thin re-exports of feature screens. A query argument ending in `?` is optional.

| Route | Screen and existing capabilities | Authority and special states |
| --- | --- | --- |
| `/(tabs)/home` | `HomeScreen`: greeting and organisation; newest visible announcement; next event; next personal rota responsibility; all joined teams; events in the next seven days. Direct links to details and team hubs. | Independent announcement, event, and rota loading/failure/empty states; team loading and empty state. The Home announcement is newest by creation date, irrespective of pinning. |
| `/(tabs)/calendar` | `CalendarScreen`: chronological upcoming occurrences with category, date, time, location, and recurrence; collapsed past-event section; New Event action. | Church admin/event manager create gate. First-load spinner, retryable load error, and empty upcoming list. Past section contains finished base events, not the past occurrences of open recurring series. |
| `/events/[id]?occurrenceStart?` | `EventDetailScreen`: title, category, occurrence date/time, location, description, creator, optional related team, recurrence summary, edit, and confirmed delete. | Loading/missing state and delete failure. The occurrence parameter identifies the opened day; updated source data determines its current time. Editing and deleting affect the whole series. No RSVP. |
| `/events/edit?id?` | `EventFormScreen`: title, category, date, start/end time, location, description, optional team, and recurrence. Weekly, fortnightly, monthly date, or ordinal weekday patterns. | Church admin/event manager only. Required fields; end after start; new or moved start cannot be in the past; unchanged past start permitted when editing. Save/retry state. Existing recurrence end date is preserved, with no end-date editing control. |
| `/announcements` | `AnnouncementsListScreen`: accessible church/team updates, pinned first and then newest; author, date, optional image; New Announcement. | Church admin, announcement manager, or team leader can create for their permitted audiences. Loading, retryable error, and empty state. No audience filter or search. |
| `/announcements/[id]` | `AnnouncementDetailScreen`: full title/body/image, author/date, audience, pin, linked event, edit, and confirmed delete. | Management follows audience authority, not authorship alone. Delete failure/retry. Missing row immediately renders not found, without distinguishing initial loading or a failed load. |
| `/announcements/edit?id?&teamId?&presetTitle?&presetBody?` | `AnnouncementFormScreen`: title, message, audience, optional event link, pin, and one live image. Cancellation notices may prefill a draft. | Permitted audiences only. Required title/body/audience; save/retry. Existing past linked event remains choosable. Text saves before image change; an image failure explicitly says the text was saved. A prefilled notice is never posted automatically. |
| `/(tabs)/messages` | `MessagesScreen`: accessible team conversations, latest sender and text/photo preview, relative timestamp, unread count. | Members see joined teams; church admins see all active organisation teams. Directory loading/error/retry/empty states. Focus and foreground refresh messages/unread without marking anything read. |
| `/teams/[teamId]/chat` | `TeamChatScreen`: virtualised messages, sender names, own/other bubbles, timestamps, text composer, one optional live image and caption. | Team access required. Message loading/error/retry/empty states; delayed connecting notice; reconnect/disconnected manual refresh. Failed send retains draft/image. Focus marks only this team read; blur unregisters it. Arrivals scroll only near the bottom; own sends scroll to newest. |
| `/teams/[teamId]/rota` | `RotaListScreen`: upcoming team dates including cancellations; own role/status or assignment count; choir song count; create date and choir monthly-plan actions. | Team visibility; leader/admin management. Directory/rota loading, retryable rota error, empty dates. No personal filter or past-date UI. |
| `/teams/[teamId]/rota/[entryId]` | `RotaDetailScreen`: date/time/notes, own roles, availability response with optional note, grouped people and response counts, choir Praise/Worship song sections, links to selected songs. | Own response only, applied to every role held on that date. Separate section-leader authority for song choices. Loading, load failure/retry, missing date, response failure, and action failure. Cancellation suppresses response/song-edit controls. |
| Same rota detail: management | Edit; cancel and retain date; restore; confirmed delete. Successful cancellation offers a separately confirmed announcement draft. | Leader/admin only. Cancel/restore/delete confirmations remain separate. Cancelled dates disappear from personal responsibilities but remain visible on the future team rota. |
| `/teams/[teamId]/rota/edit?entryId?` | `RotaFormScreen`: title, date, optional time/notes, multiple person/role assignments, add/remove assignment, and choir Add All Choir Members. | Leader/admin only. Paired person/role required; duplicate person-role rejected; at most one Praise Leader and one Worship Leader, with one person allowed to hold both. Save/retry. Role choices are currently fixed by team type despite the source comment about custom roles. |
| `/teams/[teamId]/rota/plan-month` | `PlanMonthScreen`: current month plus next three, defaulting to next month; Sunday services; optional weekly rehearsal; times; default leaders; include/exclude dates; per-date overrides; existing-date warnings. | Choir leader/admin only. Today/future dates. Existing dates excluded by default but may deliberately be included. Explicit create confirmation. One ordered batch action; partial failure says how many dates were already created. Rehearsals assign all current choir members. |
| `/teams/[teamId]/songs` | `SongDatabaseScreen`: alphabetical library; title/artist/tag search; tags and link indicator; Add Song. | Membership/admin gate; team hub exposes the feature for choir. Directory/song loading, retryable song failure, empty library, and no search matches. |
| `/teams/[teamId]/songs/[songId]` | `SongDetailScreen`: title, artist, tags, attribution, labelled external links, lyrics, notes, edit, and confirmed delete. | Existing team/song required; management checks membership/admin. Loading, missing song, retry on load failure, delete failure. Links open externally. No embedded music, uploads, chord charts, or Add to Rota action. |
| `/teams/[teamId]/songs/edit?songId?` | `SongFormScreen`: title, optional artist, required lyrics, optional notes/tags, multiple labelled music links. | Member/admin management. Loading and missing edit-target states; required title/lyrics; empty links discarded; save/retry. No URL validation in this form. |
| `/teams/[teamId]/rota/[entryId]/select-songs?section=` | `SelectSongsScreen`: one Praise/Worship section, searchable library, ordered selection, up/down/remove controls, save. | Assigned section leader, legacy Song Leader, choir leader, or church admin; cancelled dates rejected. Songs in the other section cannot also be added here. Loading, permission, song load/retry, no matches, and save failure. |

Chat deliberately has no reactions, replies, presence, typing indicators, read receipts, message edit/delete, camera capture, arbitrary files, gallery, or full-screen photo viewer. Music management by ordinary choir members is a required capability, distinct from the tighter permission to select songs for a service.

## Current common flows

Counts are meaningful transitions **after Home**, including a tab change. Scrolling, inline responses, selection sheets, and confirmations are not counted as new screens. This avoids making a short but undiscoverable shortcut look equivalent to the primary navigation path.

Home already includes every joined team's shortcut below its three summary sections. Where relevant, both existing paths are shown. Choosing a consistent counting convention is necessary for the before/after report.

| Task | Current path | Transitions |
| --- | --- | ---: |
| See current overview | Home | 0 |
| Read newest announcement | Home → announcement | 1 |
| Read another announcement | Home → Announcements → announcement | 2 |
| Create announcement | Home → Announcements → New Announcement | 2 |
| Edit newest / another announcement | Corresponding detail → Edit | 2 / 3 |
| View next event | Home → event | 1 |
| View another event | Home → Calendar → event | 2 |
| Create event | Home → Calendar → New Event | 2 |
| Edit another event | Home → Calendar → event → Edit | 3 |
| Open joined team | Home shortcut → team, or Home → Teams → team | 1 / 2 |
| Check unread conversations | Home → Messages | 1 |
| Open chat and compose | Home → Messages → chat | 2 |
| Open chat through Teams | Home → Teams → team → chat | 3 |
| See next duty and respond | Home → next responsibility; response inline | 1 |
| View another rota date and respond | Home → Teams → team → rota → date | 4 |
| Same using Home team shortcut | Home → team → rota → date | 3 |
| Create date / plan month | Home → Teams → team → direct leader action | 3 |
| Read song | Home → Teams → choir → songs → song | 4 |
| Add song | Home → Teams → choir → songs → Add | 4 |
| Edit song | Home → Teams → choir → songs → song → Edit | 5 |
| Choose songs for next personal duty | Home → responsibility → Choose section songs | 2 |
| Choose songs for arbitrary rota date | Home → Teams → choir → rota → date → Choose section songs | 5 |

Home team shortcuts shorten the final four choir paths by one transition. From an open team, chat, rota, and library are one transition away; adding a song and opening a rota date take two; choosing that date's songs takes three. The whole personal upcoming-serving list is not exposed even though `upcomingResponsibilities()` supplies the existing data.

## Source-evidenced experience concerns

These are issues to verify in the rendered audit, not claims about observed screenshots.

| Current source behavior | User-experience implication to inspect |
| --- | --- |
| Home has five stacked sections, repeats the next event in the weekly list, shows all own teams, and places responsibility third. No Home unread summary. | Important personal actions may fall well below the first viewport; duplicated events compete with useful summaries. |
| Announcement, event, rota, and song lists use the same general card shape and badge/title/metadata structure. | Information to read, an event to attend, and an action to answer may be difficult to distinguish quickly. |
| Team hub renders every member as a first-name badge above its functional areas. | A large team can push chat and rota down; first names alone may be ambiguous. Ordinary members have no dedicated full-name members view here. |
| Hub duplicates rota access as Full rota and Team Rota; only two team announcements are shown with no team-list action; admin actions follow them. | Repetition uses space while older team announcements require searching the mixed announcement list. |
| Team Resources is an inert Coming soon row. | The hub advertises a capability that is unavailable. It must not be mistaken for a working feature. |
| Announcements are mainly reached through Home's See all action. | Important organisation information lacks an obvious primary-navigation destination. |
| Frequent labels include Rota Entry, Song Database, Leader Actions, and Assignment. | Terminology needs deliberate review for mixed technical confidence. |
| Event detail and form say whole-series changes occur in this demo in both data modes. | Live users receive misleading scope copy about a consequential edit/delete. |
| Most lists use ScrollView plus map; chat and picker options use FlatList. | Large content sets need performance and scrolling inspection. No paginated chat-history UI currently exists. |
| Form errors generally appear at the bottom without invalid-field focus or scrolling. | A user may not know which field to fix. The existing TextField supports inline errors, but these forms generally do not use it. |
| SelectField lacks selected state on options, explicit modal focus restoration, modal accessibility treatment, safe-area insets, and reduced-motion handling. | Picker ergonomics and assistive-technology behavior need refinement and native checks. |
| Selected-song controls are three icon-only 40px buttons beside the song name; tags are 40px high; chat send is 46px; image actions 44px. Shared target is 52px. | Tight multi-control rows need particular attention for dexterity and long names. |
| SectionHeader actions use text plus hit slop, and generic labels such as See all have no section context. | Discoverability and screen-reader naming are weaker than the underlying navigation capability. |
| Several card/header rows put variable-length title and date/status side by side without explicit shrink/wrap rules. | Long names and large text may crowd or overflow; visual verification is required. |
| Chat lacks day separators and an unread boundary. Current focus behavior marks the newest loaded message read even when scrolled up. | Time context can be unclear. Any new unread-boundary presentation must preserve the established server cursor behavior. |
| Messages uses team initials and does not explicitly surface chat-fetch failure once teams are loaded. | Existing team identity and refresh state are underused. |
| Failed announcement images disappear while text remains; chat images show Photo unavailable. | Error treatment differs and needs deliberate review without obscuring successfully saved text. |

Searches across `src/` and `app/` found no standard Expo notification-response handler (`addNotificationResponseReceivedListener`, `useLastNotificationResponse`, or `getLastNotificationResponse`). Existing push payloads have routing IDs; push-tap navigation must not be reported as implemented or verified on this evidence alone.

## Client regression risks

1. **Child ID and team route matching.** Rota detail/form, song detail/form, and selection look up children by ID without consistently requiring the child's team to match `teamId`. Song detail lacks a read-permission branch once a team/song is found. Server RLS remains authoritative, but a mismatched route can display the wrong team context; demo data makes the weakness more visible. Preserve permission boundaries and add client route consistency checks when changing navigation.
2. **Cold edit routes.** Form state initializes from the first-render row. A row loaded later does not automatically populate event, announcement, rota, or song drafts. Some missing edit targets become create forms. Separate loading, missing target, and initialized edit states.
3. **Selection drafts and freshness.** SelectSongsScreen resets local selection when the entry, section, or shared song selections change. An incoming refresh can overwrite an unsaved choice.
4. **Partial saves.** Live rota assignment replacement is a diffed delete/insert, and a month saves serially. Retain honest partial-success messaging. A redesign cannot imply transactionality that does not exist.
5. **Availability.** One person may hold multiple roles; one visible answer writes every assignment. The note is always optional. Only the assigned person answers; cancelled dates require no answer.
6. **Music authority.** Choir members may add/edit/delete songs. Selecting service songs is separately authorised by section; do not move all music actions behind an admin gate.
7. **Unread and notifications.** Messages-list visits clear nothing; focused team chat clears only that team. Preserve focus/blur lifecycle. Existing push is requested only after successful live saves and must not be duplicated by new presentation components.
8. **Recurrence.** Preserve occurrenceStart semantics, whole-series updates, client expansion, and date/time validation. Do not turn generated occurrences into independent records.
9. **Images.** Retain live-only single-image constraints and the saved-text/image-failed distinction. Demo mode must never call Storage.
10. **Archived content and scope.** Normal `data.teams` is active-only. Derived summaries must preserve that source discipline, organisation context, and provider remount boundary. Retained historical membership is not active archived-team access.

Relevant evidence: `src/features/rota/RotaDetailScreen.tsx`, `RotaFormScreen.tsx`, `src/features/choir/SongDetailScreen.tsx`, `SongFormScreen.tsx`, `SelectSongsScreen.tsx`, `src/features/calendar/EventFormScreen.tsx`, `src/features/announcements/AnnouncementFormScreen.tsx`, `src/lib/appData/AppDataContext.tsx`, and `app/_layout.tsx`.

## Existing data and interface boundaries

`src/lib/appData/selectors.ts` already supplies visible teams/announcements, newest announcement, expanded upcoming events, finished base events, all personal responsibilities, next responsibility, future team dates, grouped people/availability counts, searchable songs, section selections, message ordering, and photo-aware previews. An all-my-serving presentation can use existing data.

There is no announcement read marker: recency and unread are different facts. Availability belongs to assigned duties, not a general future availability calendar. No event RSVP exists.

Screens use AppData actions. Live queries and writes stay behind the existing `announcements`, `events`, `rotas`, `songs`, `chat`, image, read-state, and push service files. A Plan the Month submission calls `addRotaEntries` once; it saves in order and sends the existing rota-push request for successful entries. A failed batch reports its successful prefix.

`markTeamChatRead` clears one team's visible badge, advances the server cursor using the latest message ID, reconciles after success, and permits a later focus retry after failure. Session private Broadcast, active-chat registration, server unread truth, and push alerts remain separate responsibilities.

No missing backend capability was identified merely by inventorying the existing daily-use capabilities. No backend changes were made or proposed by this discovery.

## Existing behavioral coverage

Fully inspected tests:

- `src/features/rota/__tests__/PlanMonthScreen.test.tsx`: one whole-plan batch, rehearsal member inclusion, exact partial-success reporting, zero-success failure, and declined confirmation.
- `src/lib/appData/__tests__/selectors.test.ts`: text/caption/photo preview and stable same-timestamp message ordering.
- `src/lib/appData/__tests__/chatUnread.test.ts`: own-organisation and archived-team scoping, sparse counts, own-message exclusion, duplicates, active chat, independent teams, and pruning.
- `src/lib/appData/__tests__/rotaEntryBatch.test.ts`: ordered serial saves, stop at first failure, partial outcomes, demo mode, and empty batches.

Test names/contracts were also inspected for exact chat fetches, read cursor, session messaging lifecycle, push registration, delivery call sites, and dispatch rules. Their detailed source is not claimed as fully read here.

The existing test-file inventory has no dedicated Home, Calendar, Event form/detail, Announcement screen, TeamChat screen, Rota form/detail, or Choir screen suite. Changed interaction behavior warrants meaningful coverage for navigation, cold edit routes, section permissions, form recovery, and inaccessible states rather than layout snapshots.

The project baseline separately passed 856 tests across 76 suites, typecheck, and lint before redesign work. No independent test run was needed for this read-only source inventory or its documentation.

## Reading coverage

Fully read product and repository guidance:

- `AGENTS.md`, including the continuation beyond the pasted instruction cutoff.
- `CLAUDE.md`.
- `README.md`.
- `docs/shift_shepherd_design_doc.md`.
- `docs/one-shot-build-prompt.md`.

Fully read implementation files:

- `app/_layout.tsx`, `app/(tabs)/_layout.tsx`, and thin route re-exports for every route in this inventory.
- `src/features/home/HomeScreen.tsx`.
- All three screens in `src/features/announcements/`.
- All three screens in `src/features/calendar/`.
- `src/features/chat/MessagesScreen.tsx`, `TeamChatScreen.tsx`, `useChatImageDraft.ts`, and `useTeamChatRealtime.ts`.
- All four screens in `src/features/rota/`.
- All four screens in `src/features/choir/`.
- `src/lib/appData/selectors.ts`, `src/lib/appData/rotaEntryBatch.ts`, and `src/lib/permissions/index.ts`.
- `constants/theme.ts`.
- `src/components/Screen.tsx`, `SelectField.tsx`, `DateTimeFields.tsx`, `AppText.tsx`, `TextField.tsx`, `SectionHeader.tsx`, `AnnouncementCard.tsx`, `AnnouncementImage.tsx`, `EventCard.tsx`, `RotaEntryCard.tsx`, `MessageBubble.tsx`, and `ChatAttachmentImage.tsx`.
- The four fully inspected test files listed above.

Partially read or searched:

- `src/features/teams/TeamSpaceScreen.tsx`: team shortcuts, member presentation, next rota, announcements, and leader actions.
- `src/lib/appData/AppDataContext.tsx`: relevant interfaces, CRUD, unread, and push sections.
- `src/utils/recurrence.ts`: supported choices and rule conversion.
- `src/lib/supabase/services/announcements.ts`, `events.ts`, `rotas.ts`, `songs.ts`, and `chat.ts`: service entry points and relevant contracts.
- `src/lib/supabase/services/__tests__/chat.test.ts`, `chatReadState.test.ts`, `pushDelivery.test.ts`, and `pushDispatch.test.ts`; `src/lib/appData/__tests__/useSessionChatMessaging.test.tsx`; `src/lib/notifications/__tests__/index.test.ts`.

Not read in this bounded frontend inventory: `supabase/README.md`, `docs/supabase-integration-plan.md`, `docs/supabase-migration-alignment-checkpoint.md`, `docs/production-email-readiness.md`, `docs/organisation-membership-role-management-v1.md`, migrations, and seed documentation. Their required reading is tracked by the overall discovery process; this file does not claim to replace that work.
