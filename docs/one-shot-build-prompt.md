You are Fable 5. Build a mobile-first functional app scaffold for a church coordination app called Shift Shepherd.

The goal is to create as much of the app as possible in one implementation pass, with realistic mocked data, working navigation, local-state interactions, role-aware UI, and a clean architecture that can later be connected to Supabase.

Do not create only a static visual prototype. Build a functional app scaffold that behaves like an early MVP.

The app does not need to connect to a real backend yet, but it should feel functional using mocked data and local state.

Prioritise making the core user flows work end-to-end over adding production integrations.

Use high effort by default. Only use maximum effort for genuinely difficult architectural, permission, data modelling, or debugging problems. Prioritise completing the scaffold efficiently and avoid unnecessary rewrites. If cost, usage limits, or implementation complexity become a concern, pause and explain the trade-off before continuing.

# 1. Product Summary

Shift Shepherd is a mobile-first church coordination app designed to reduce a church’s reliance on WhatsApp.

The app helps church members:

- See upcoming church events
- Read important announcements
- View their team spaces
- See team rotas
- Confirm availability for assigned duties
- Communicate in team chats
- Access a choir song database
- Select songs for choir rota dates when assigned as song leader

The app is initially for one church, but it should be structured in a way that can later support multiple churches.

The app must require login. No church content should be visible without authentication.

# 2. Build Type

Build a functional app scaffold with:

- Mobile-first design
- Working screen navigation
- Realistic mocked data
- Local state for creating/editing sample records where reasonable
- Role-based UI behaviour
- Simulated authentication
- Simulated notification settings
- Simulated team chat
- Simulated rota management
- Simulated choir song database
- Simulated song selection flow

The goal is to produce the most complete working dummy-data version possible in a single implementation pass.

Do not spend time wiring real Supabase, real OAuth, real SMS login, real push notifications, or real file uploads unless they can be implemented cleanly without blocking the scaffold.

If a production feature is too large for the one-shot build, create a clear placeholder and note what would be needed to make it production-ready later.

# 3. Preferred Technical Stack

Use:

- React Native
- Expo
- TypeScript
- React Navigation or Expo Router
- A clean component structure
- A simple design system or reusable UI components
- Local mock data/state for the scaffold

Design the architecture so it can later connect to:

- Supabase Auth
- Supabase Postgres
- Supabase Row Level Security
- Supabase Storage
- Supabase Realtime
- Supabase Edge Functions
- Expo Notifications

Use Supabase Auth as the intended production auth provider, not Clerk.

However, keep auth logic abstracted so another auth provider could be swapped in later if needed.

# 4. Important Technical Architecture Requirements

Structure the app cleanly by feature.

Suggested structure:

/src
  /app or /navigation
  /components
  /features
    /auth
    /home
    /announcements
    /calendar
    /teams
    /rota
    /choir
    /chat
    /profile
    /notifications
  /lib
    /auth
    /mockData
    /permissions
    /supabase
    /notifications
  /types
  /utils

Create reusable components for:

- App layout
- Cards
- Buttons
- Forms
- Inputs
- Empty states
- Section headers
- List rows
- User avatar
- Role badges
- Event cards
- Announcement cards
- Team cards
- Rota cards
- Song cards
- Chat message bubbles
- Confirmation dialogs
- Notification badges

Create typed models/interfaces for:

- Organisation
- UserProfile
- Team
- TeamMembership
- OrganisationRole
- Announcement
- Event
- EventCategory
- RotaEntry
- RotaAssignment
- AvailabilityResponse
- Song
- SongLink
- ChoirSongSelection
- ChatMessage
- ChatAttachment
- NotificationPreferences
- PushToken

# 5. Intended Production Backend

The production backend should eventually be Supabase.

Even if the scaffold uses mocked data, design the data models around this future Supabase structure.

Important tables/entities:

organisations:
- id
- name
- logo_url
- primary_colour
- created_at

profiles:
- id
- auth_user_id
- organisation_id
- full_name
- email
- phone
- avatar_url
- created_at

teams:
- id
- organisation_id
- name
- description
- type
- created_at

team_memberships:
- id
- team_id
- user_id
- role
- created_at

organisation_roles:
- id
- organisation_id
- user_id
- role

announcements:
- id
- organisation_id
- team_id nullable
- title
- body
- audience
- pinned
- image_url nullable
- linked_event_id nullable
- created_by
- created_at
- updated_at

event_categories:
- id
- organisation_id
- name
- colour

events:
- id
- organisation_id
- title
- description
- category_id
- start_time
- end_time
- location
- created_by
- created_at
- updated_at

rota_entries:
- id
- organisation_id
- team_id
- title
- date
- time
- notes
- created_by
- created_at
- updated_at

rota_assignments:
- id
- rota_entry_id
- user_id
- role_name
- created_at

availability_responses:
- id
- rota_assignment_id
- user_id
- status
- note
- updated_at

songs:
- id
- organisation_id
- team_id
- title
- artist
- lyrics
- notes
- added_by
- created_at
- updated_at

song_links:
- id
- song_id
- platform
- url

choir_rota_song_selections:
- id
- rota_entry_id
- song_id
- selected_by
- order_index
- notes

chat_messages:
- id
- organisation_id
- team_id
- sender_id
- body
- created_at

chat_attachments:
- id
- message_id
- file_url
- file_type
- file_name
- created_at

notification_preferences:
- id
- user_id
- announcement_notifications
- team_announcement_notifications
- chat_notifications
- rota_notifications
- event_reminders
- availability_reminders

push_tokens:
- id
- user_id
- token
- platform
- created_at
- updated_at

# 6. Authentication Requirements

The app should require login before accessing the main app.

Design the login UI to support:

- Email and password
- Google sign-in
- Facebook sign-in
- Phone number sign-in

For this scaffold, the login can be mocked.

Create a login screen where users can choose from test accounts to simulate different roles.

Example test accounts:

1. Church Admin
2. Announcement Manager
3. Event Manager
4. Choir Team Leader
5. Choir Member
6. Assigned Choir Song Leader
7. Media Team Leader
8. General Church Member

After selecting a test account, the app should navigate to the main authenticated app.

Include a logout option in Profile/Settings.

# 7. Roles and Permissions

The UI should change based on the selected user role.

Organisation-level roles:

- Church Admin
- Announcement Manager
- Event Manager
- General Member

Team-level roles:

- Team Leader
- Team Member
- Assigned Choir Song Leader for a rota date

Permission rules:

Church Admin can:
- View all church content
- Create/edit/delete church-wide announcements
- Create/edit/delete church-wide events
- Manage teams conceptually through the mobile app
- Access admin-style actions inside the mobile app
- Assign team leaders conceptually through the UI, if included

Announcement Manager can:
- Create church-wide announcements
- Edit/delete church-wide announcements they manage
- View all normal member content

Event Manager can:
- Create church-wide calendar events
- Edit/delete church-wide calendar events they manage
- Assign event categories
- View all normal member content

Team Leader can:
- Manage their own team rota
- Create/edit team announcements
- View team availability responses
- Add/edit rota entries
- Assign members to rota roles

Team Member can:
- View their own team spaces
- Use team chat
- View their team rota
- Confirm availability for assigned duties
- Add an optional note when confirming availability

Choir Member can:
- View choir rota
- View selected songs
- Add songs to the song database
- Edit any song in the song database
- Delete any song in the song database after confirmation
- Use choir chat

Assigned Choir Song Leader can:
- Select songs for the rota date they are leading
- Reorder selected songs for their assigned rota date if feasible
- Add optional notes to selected songs if feasible

Choir Team Leader can:
- Override song selections if needed
- Manage choir rota entries

General Member can:
- View home
- View church-wide announcements
- View church-wide calendar events
- View teams they belong to
- Manage their notification preferences

# 8. Visual Design Direction

The app should feel:

- Calm
- Clean
- Friendly
- Welcoming
- Trustworthy
- Modern
- Easy on the eyes
- Clear for older users
- Simple enough for less technical users

Use blue, purple, and red as the general brand colour direction.

Suggested use:

- Blue as the primary action/trust colour
- Purple as a secondary accent
- Red only for alerts, destructive actions, or important warnings

Avoid making the UI too bright, busy, corporate, or complicated.

Use:

- Rounded cards
- Spacious layouts
- Large readable typography
- Clear section headings
- Text labels under icons
- High contrast
- Large tap targets
- Simple forms
- Helpful empty states

The app should not rely on icon-only navigation. Every important icon should have a text label.

# 9. Accessibility and UX Requirements

Prioritise older and less technical users.

Requirements:

- Large readable text
- Clear buttons
- Obvious navigation
- Minimal hidden gestures
- No dense screens
- No confusing technical language
- Plain English error messages
- Clear empty states
- Clear save/cancel actions
- Confirmation before destructive actions
- Bottom navigation with labels
- Simple, familiar chat layout
- Important information visible without searching

The home screen should answer:

1. What is happening next?
2. What do I need to know?
3. What am I responsible for?

# 10. Main Navigation

Use bottom tab navigation with five tabs:

1. Home
2. Calendar
3. Teams
4. Messages
5. Profile

Every tab should have an icon and visible text label.

# 11. Required Screens

Build the following screens.

## 11.1 Login Screen

Purpose:
Allow users to log in or select a mocked test account.

Include:
- App name: Shift Shepherd
- Email/password fields
- Continue button
- Google sign-in button
- Facebook sign-in button
- Phone sign-in button
- Test account selector for scaffold/demo mode
- Friendly helper text explaining this is a church coordination app

Mock login should work by selecting a test user.

## 11.2 Home Screen

Purpose:
Show the most important information first.

Priority order:
1. Next upcoming event
2. Latest announcement
3. User’s next team responsibility

Include:
- Greeting with user name
- Next event card
- Latest announcement card
- Next responsibility card
- My Teams preview
- Coming up this week section
- Notification badges where useful

Interactions:
- Tap event card to open event detail
- Tap announcement card to open announcement detail
- Tap responsibility card to open rota detail
- Tap team card to open team space

## 11.3 Announcements List Screen

This can be accessed from Home or integrated into Home if needed.

Include:
- Church-wide announcements
- Team-specific announcements where relevant
- Pinned announcements at the top
- Create announcement button only for authorised users

Announcement fields:
- Title
- Body
- Posted by
- Date/time
- Audience
- Optional image placeholder
- Optional linked event
- Pinned status

Interactions:
- Open announcement detail
- Create announcement if authorised
- Edit/delete announcement if authorised
- Delete requires confirmation

## 11.4 Announcement Detail Screen

Include:
- Title
- Body
- Author
- Date
- Audience
- Image placeholder if present
- Linked event if present
- Edit/delete actions if authorised

## 11.5 Create/Edit Announcement Screen

Only visible to:
- Church Admin
- Announcement Manager
- Relevant Team Leader for team announcements

Fields:
- Title
- Body
- Audience: Church-wide or team-specific
- Optional image placeholder/upload UI
- Optional linked event
- Pinned toggle

Use local state to save the announcement in the scaffold.

## 11.6 Calendar Screen

Purpose:
Show church-wide events.

Default view:
- Upcoming list view

Optional secondary view:
- Month view toggle or simple calendar section

Include event categories:
- Service
- Rehearsal
- Prayer Meeting
- Bible Study
- Team Meeting
- Youth Event
- Children’s Ministry
- Outreach
- Special Event
- Conference
- Social Event
- Other

Interactions:
- Open event detail
- Create event if authorised
- Edit/delete event if authorised
- Filter by category if easy to include

## 11.7 Event Detail Screen

Include:
- Event title
- Date
- Start/end time
- Location
- Category
- Description
- Related team if applicable
- Edit/delete actions if authorised

Do not include general RSVP for V1.

## 11.8 Create/Edit Event Screen

Only visible to:
- Church Admin
- Event Manager

Fields:
- Title
- Description
- Category
- Date
- Start time
- End time
- Location
- Related team optional

Use local state to save the event in the scaffold.

## 11.9 Teams Screen

Purpose:
Show teams the logged-in user belongs to.

Include:
- Team cards
- Team name
- Team type
- Short description
- Next rota item
- Latest message preview
- Notification badge if unread messages exist

Example teams:
- Choir
- Media
- Ushers
- Youth Team

Users should only see teams they belong to unless they are Church Admin.

## 11.10 Generic Team Space Screen

Purpose:
Central hub for a team.

Include:
- Team name
- Team description
- Next on rota
- Team announcements
- Rota calendar shortcut
- Team chat shortcut
- Team resources placeholder

If user is team leader, show:
- Add rota entry
- Create team announcement
- Manage team actions

## 11.11 Team Rota Screen

Purpose:
Show team-specific rota entries.

Important:
Team rotas are independent from the main church calendar.

Include:
- List of rota entries
- Date
- Time optional
- Service/title
- Roles
- Assigned people
- Availability status
- Notes

Interactions:
- Tap rota entry to open detail
- Add rota entry if team leader
- Edit rota entry if team leader
- Assigned member can confirm availability

## 11.12 Rota Detail Screen

Include:
- Rota title
- Date/time
- Team
- Assigned roles and people
- Notes
- Availability responses

Availability options:
- Available
- Unavailable
- Maybe

Users should be able to add an optional note regardless of selected option.

Example note:
- “I may be 10 minutes late.”
- “I can serve but need to leave early.”
- “I’m away that weekend.”

The note must never be mandatory.

## 11.13 Create/Edit Rota Entry Screen

Only visible to team leaders for their own team.

Fields:
- Rota title/service name
- Date
- Time optional
- Notes optional
- Assign members to roles

The form should support assigning multiple people to one rota entry.

Examples:
For Choir:
- Song Leader
- Backup Vocal
- Choir Member

For Media:
- Sound
- Camera
- Slides
- Livestream

Use local state to save rota changes.

## 11.14 Choir Team Space

The Choir team should build on the generic team space but include extra choir features.

Include:
- Choir announcements
- Choir rota
- Song database
- Choir chat
- Upcoming selected songs

## 11.15 Choir Rota Screen

Include:
- Choir rota entries
- Song leader for each rota date
- Selected songs if available
- Availability status

If the logged-in user is assigned as song leader for a rota date, show a clear “Select Songs” action for that date.

If the logged-in user is not the assigned song leader, they can view selected songs but cannot edit them.

Choir team leaders can override song selections.

## 11.16 Song Database Screen

Purpose:
Allow choir members to manage songs.

Include:
- Search bar
- Song list
- Add song button
- Song title
- Artist/source
- Tags if included
- External music link indicator

Permissions:
All choir members can:
- Add songs
- Edit any song
- Delete any song

Delete must show confirmation.

Fields:
- Song title
- Artist/source optional
- Lyrics
- Notes optional
- External links
- Tags optional

External link platforms:
- YouTube
- Spotify
- Apple Music
- Other

## 11.17 Song Detail Screen

Include:
- Song title
- Artist/source
- Lyrics
- Notes
- External music links
- Added by
- Edit button
- Delete button with confirmation

If opened from song selection flow, include “Add to Rota” or “Select Song” action where authorised.

## 11.18 Add/Edit Song Screen

Fields:
- Song title
- Artist/source
- Lyrics
- Notes optional
- External links
- Tags optional

Use local state to save songs in the scaffold.

## 11.19 Select Songs for Choir Rota Screen

Only accessible if:
- User is assigned as song leader for that rota date
- Or user is choir team leader

Include:
- Rota date/title
- Search song database
- Select multiple songs
- Reorder selected songs if feasible
- Add optional note per selected song if feasible
- Save selection

After saving, selected songs should appear on the choir rota detail.

## 11.20 Messages Screen

Purpose:
Show team chats.

Include:
- List of team chats the user belongs to
- Team name
- Latest message preview
- Timestamp
- Unread badge if applicable

Users should only see chats for teams they belong to unless they are Church Admin.

## 11.21 Team Chat Screen

Purpose:
Simple WhatsApp-like team chat.

V1 features:
- Team-based group chat
- Text messages
- Sender name
- Timestamp
- Message input
- Send button
- Mock unread state
- Image/file attachment UI if feasible

If file/image attachment functionality is too complex, show an attachment icon but keep it non-functional or as a placeholder.

Use local state so messages sent by the current user appear in the conversation.

Future features should not be built now:
- Voice notes
- Reactions
- Reply-to-message
- Polls
- Read receipts
- Message search

## 11.22 Profile/Settings Screen

Include:
- User profile card
- Name
- Email or phone
- Teams
- Role badges
- Notification settings
- Help/support placeholder
- Logout button

Notification settings:
- Church-wide announcements
- Team announcements
- Chat messages
- Rota updates
- Event reminders
- Availability reminders

Use toggles and local state.

# 12. Mock Data Requirements

Create realistic mock data for one organisation/church.

Organisation:
- Name: Grace Community Church
- App name: Shift Shepherd

Users:
- Church Admin: Daniel Okafor
- Announcement Manager: Miriam Blake
- Event Manager: Joseph Carter
- Choir Team Leader: Sarah Williams
- Choir Member: Hannah Adeyemi
- Assigned Choir Song Leader: Michael Thompson
- Media Team Leader: David Chen
- General Member: Ruth Johnson

Teams:
- Choir
- Media
- Ushers
- Youth Team

Events:
- Sunday Morning Service
- Midweek Bible Study
- Friday Prayer Meeting
- Choir Rehearsal
- Youth Fellowship
- Special Thanksgiving Service

Announcements:
- Welcome announcement
- Sunday service reminder
- Choir rehearsal update
- Media team rota reminder
- Special event announcement

Choir songs:
- 8 to 12 sample songs
- Include lyrics snippets or realistic placeholder lyrics
- Include YouTube/Spotify-style external links
- Include tags such as Worship, Praise, Slow, Fast, Communion, Thanksgiving

Choir rota entries:
- At least 4 upcoming entries
- Include song leader assignments
- Include selected songs for some entries
- Leave one entry without selected songs so the song selection flow can be tested

Media rota entries:
- At least 4 upcoming entries
- Include roles such as Sound, Camera, Slides, Livestream

Chat messages:
- Sample messages for Choir
- Sample messages for Media
- Sample messages for Ushers

Availability:
- Include mixed availability states:
  - Available
  - Unavailable
  - Maybe
  - Not responded
- Include optional notes for some responses

# 13. Key User Flows to Implement

Implement these flows with working navigation and local state where possible.

## Flow 1: Login as a test user

1. Open app
2. Select test account
3. Enter main app
4. UI changes based on user role

## Flow 2: Member checks what is happening next

1. User opens Home
2. User sees next event
3. User taps event
4. User views event detail

## Flow 3: Member reads announcement

1. User sees latest announcement on Home
2. User taps announcement
3. Full announcement opens

## Flow 4: Team member confirms availability

1. User opens Home or Teams
2. User opens next rota responsibility
3. User selects Available, Unavailable, or Maybe
4. User optionally adds note
5. User saves response
6. UI updates to show response

## Flow 5: Team leader creates rota entry

1. Team leader opens team space
2. Opens rota
3. Taps Add Rota Entry
4. Adds date, title, role assignments, and notes
5. Saves
6. New rota entry appears

## Flow 6: Choir member adds song

1. Choir member opens Choir team
2. Opens Song Database
3. Taps Add Song
4. Adds title, lyrics, and external links
5. Saves
6. New song appears in song database

## Flow 7: Choir member edits/deletes song

1. Choir member opens song detail
2. Taps Edit
3. Saves changes
4. Updates appear
5. Taps Delete
6. Confirmation appears
7. Song is deleted if confirmed

## Flow 8: Assigned choir song leader selects songs

1. User logs in as assigned song leader
2. Opens Choir rota
3. Finds rota date they are leading
4. Taps Select Songs
5. Searches song database
6. Selects songs
7. Saves
8. Selected songs appear on rota

## Flow 9: User sends chat message

1. User opens Messages
2. Opens team chat
3. Types message
4. Sends message
5. Message appears in chat

## Flow 10: User changes notification preferences

1. User opens Profile
2. Opens notification settings
3. Toggles notification categories
4. Settings persist in local state

# 14. Home Screen Priority

The Home screen must clearly show, in this order:

1. Next upcoming event
2. Latest announcement
3. User’s next team responsibility

Do not bury these behind menus.

# 15. Event Categories

Support event categories.

Categories:
- Service
- Rehearsal
- Prayer Meeting
- Bible Study
- Team Meeting
- Youth Event
- Children’s Ministry
- Outreach
- Special Event
- Conference
- Social Event
- Other

Display the category clearly on event cards and event detail screens.

# 16. Availability Confirmation

For rota assignments, users can respond with:

- Available
- Unavailable
- Maybe

They can add an optional note.

The note is always optional.

Make the availability UI simple and clear.

# 17. Song Database Rules

All choir members can:
- Add songs
- Edit any song
- Delete any song

Only assigned choir song leaders can:
- Select songs for the rota date they are leading

Choir team leaders can:
- Override song selections

All choir members can:
- View selected songs

# 18. Team Chat Rules

Each team has its own chat.

Users can only see chats for teams they belong to unless they are Church Admin.

V1 chat should be simple.

Include:
- Message list
- Sender names
- Timestamps
- Input field
- Send button
- Attachment icon placeholder

# 19. Notifications

Implement notification settings UI and simulated notification badges.

Do not build full native push notifications unless the environment supports it.

Notification types:
- Church-wide announcements
- Team announcements
- Chat messages
- Rota updates
- Event reminders
- Availability reminders

# 20. Empty States

Include friendly empty states.

Examples:

No announcements:
“There are no announcements yet. Important updates will appear here.”

No events:
“There are no upcoming events right now.”

No team responsibilities:
“You do not have any upcoming team responsibilities.”

No songs:
“No songs have been added yet. Add the first song to the database.”

No chat messages:
“No messages yet. Start the conversation with your team.”

No rota entries:
“No rota entries have been added for this team yet.”

# 21. Error States and Confirmation States

Use plain English.

Examples:

Failed login:
“We couldn’t log you in. Please check your details and try again.”

Failed save:
“Your changes could not be saved. Please try again.”

No permission:
“You do not have permission to do that.”

Delete song confirmation:
“Are you sure you want to delete this song? This action cannot be undone.”

Delete announcement confirmation:
“Are you sure you want to delete this announcement?”

Delete rota entry confirmation:
“Are you sure you want to delete this rota entry?”

# 22. Non-Goals for V1

Do not build these now:

- Donations
- Payments
- Livestreaming
- Sermon archive
- Public website pages
- Separate admin web dashboard
- Multi-church self-service onboarding
- Full production backend if not supported
- Full native push notification delivery if not supported
- Advanced chat features
- Voice notes
- Message reactions
- Message replies
- Polls
- Read receipts
- Automatic rota generation
- Complex rota swaps
- General event RSVP
- Attendance tracking
- Advanced analytics
- Uploaded audio hosting
- Full embedded music streaming

# 23. One-Shot Build Expectation

The goal is to produce the most complete working dummy-data version possible in a single implementation pass.

The app does not need to connect to a real backend yet, but it should feel functional using mocked data and local state.

Prioritise making the core user flows work end-to-end over adding production integrations.

Core flows that must work with dummy data:

- Mock login using test users
- Role-based navigation and UI actions
- Home screen showing next event, latest announcement, and next responsibility
- Calendar browsing and mock event creation/editing
- Announcement browsing and mock announcement creation/editing
- Team spaces and team rotas
- Rota availability confirmation with optional notes
- Choir song database add/edit/delete
- Assigned choir song leader selecting songs for a rota date
- Basic team chat with locally added messages
- Notification settings toggles

Use local state, mocked services, and realistic sample data to make the app testable immediately.

Do not spend time wiring real Supabase, real OAuth, real SMS login, real push notifications, or real file uploads unless they can be implemented cleanly without blocking the scaffold.

If a production feature is too large for the one-shot build, create a clear placeholder and note what would be needed to make it production-ready later.

# 24. Implementation Flexibility

You may deviate from the requested implementation details if you identify a better, cleaner, more scalable, or more maintainable way to build the app.

This flexibility applies to:

- Folder structure
- Component architecture
- State management
- Navigation implementation
- UI component choices
- Form handling
- Data modelling details
- Mock service structure
- Supabase integration approach
- Performance improvements
- Accessibility improvements

However, do not change the core product requirements without clearly explaining the reason.

Do not remove or significantly alter these core requirements:

- The app must remain mobile-first
- The app must require login
- The app must support future Supabase integration
- The app must support future multi-church expansion
- The app must include home, calendar, teams, messages, and profile areas
- The home screen must prioritise next event, latest announcement, and next team responsibility
- The app must support generic teams
- The choir must have a song database
- Choir members must be able to add, edit, and delete songs
- Assigned choir song leaders must be able to select songs for their rota date
- Team leaders must be able to manage team rotas
- Team members must be able to confirm availability with an optional note
- The UX must remain simple and accessible for older or less technical users

If you make a deviation, include a short “Implementation Notes” section explaining:

1. What you changed
2. Why you changed it
3. How it improves the app
4. Any trade-offs or future work created by the change

# 25. Design Quality Bar

The app should feel polished enough to demo to church leaders and test with church members.

It should feel more like an early working MVP than a wireframe.

Prioritise:
- Clear UX
- Functional flows
- Good spacing
- Readability
- Realistic data
- Consistent components
- Role-aware behaviour
- Smooth navigation
- Accessibility
- Simplicity for older users

# 26. Acceptance Criteria

The scaffold is successful if:

- A user can log in with a mocked test account
- The app shows different UI/actions based on the user’s role
- The home screen clearly shows next event, latest announcement, and next responsibility
- Users can browse church-wide calendar events
- Authorised users can create/edit events in local state
- Users can read announcements
- Authorised users can create/edit announcements in local state
- Users can see only their relevant teams
- Users can open a team space
- Team leaders can create rota entries
- Assigned users can confirm availability with optional notes
- Choir members can browse, add, edit, and delete songs
- Assigned choir song leaders can select songs for their rota date
- Users can send basic team chat messages
- Users can change notification preferences
- The app is easy to navigate on mobile
- The design is accessible and friendly for less technical users
- The code is structured so Supabase can be added later
- Any implementation deviations are documented in Implementation Notes

# 27. Final Instruction

Build the app now as a complete functional scaffold.

Do not stop at a static prototype.

Do not ask follow-up questions.

Where production services are not available, use mocked data and local state, but make the architecture ready for Supabase integration later.

You may make implementation-level improvements or optimisations where appropriate, as long as the core product requirements remain intact. If you deviate from the requested approach, clearly explain the deviation in an “Implementation Notes” section.

Prioritise a working dummy-data app over incomplete production integration.