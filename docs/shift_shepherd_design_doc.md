# Shift Shepherd - V1 Design Doc

**Working app name:** Shift Shepherd  
**Document purpose:** Product, UX, technical, and implementation guidance for a mobile-first church coordination app.  
**Version:** V1 functional scaffold / MVP direction  
**Primary platform:** Mobile app  
**Intended backend:** Supabase  

---

## 1. Product Overview

Shift Shepherd is a mobile-first church coordination app designed to help church members stay informed, view upcoming events, manage team rotas, communicate with their teams, and access team-specific resources.

The app is being created initially for one church, but the structure should allow future expansion into a multi-church platform where different churches can create and manage their own organisations, teams, members, events, announcements, rotas, and team resources.

The main motivation for the app is to reduce reliance on WhatsApp. Currently, WhatsApp is used for announcements, planning, reminders, team communication, rotas, and general updates. While WhatsApp works, it can become cluttered, hard to organise, and difficult for members to find important information later.

Shift Shepherd should provide a clearer, more structured experience while remaining familiar and easy to use, especially for older or less technically confident users.

---

## 2. Product Vision

Shift Shepherd should become the central place where church members can answer three simple questions:

1. What is happening next?
2. What do I need to know?
3. What am I responsible for?

The app should feel calm, simple, welcoming, and inclusive. Users should not feel overwhelmed by too many features, hidden menus, or complex workflows.

The first version should focus on clarity, communication, scheduling, team coordination, and choir-specific planning.

---

## 3. Target Platform

V1 should focus on the main mobile app.

The app should be designed mobile-first, with the assumption that most church members will use it on their phones. Content management should also happen inside the mobile app for V1.

A separate admin web dashboard is not required for V1, but the product should be structured so one can be added later if needed.

---

## 4. Target Users

### 4.1 General Church Members

General church members need to:

- Log in securely.
- View upcoming church events.
- Read church-wide announcements.
- See what is happening next.
- Access their assigned teams, if applicable.
- Receive important notifications.

They may not need advanced team management features.

### 4.2 Team Members

Team members belong to one or more church teams.

Examples include:

- Choir
- Media team
- Ushers
- Youth team
- Children's ministry
- Hospitality team
- Cleaning team

Team members need to:

- View their team space.
- See team-specific announcements.
- View their team rota.
- Communicate in team chat.
- See upcoming responsibilities.
- Confirm availability for assigned roles, if required.

### 4.3 Choir Members

Choir members are a key focus for V1.

Choir members need to:

- View the choir rota.
- See who is leading songs.
- View selected songs for upcoming services.
- Access the song database.
- Add songs to the song database.
- Edit any song in the song database.
- Delete any song in the song database, after confirmation.
- Open song details, including lyrics and external music links.
- Communicate in the choir team chat.

### 4.4 Assigned Choir Song Leaders (Praise Leader and Worship Leader)

A choir service normally has two song leaders, each responsible for one section of the set list:

- **Praise Leader** — manages the Praise Songs (upbeat, opening) for that date.
- **Worship Leader** — manages the Worship Songs (slower, reflective) for that date.

Sometimes one person leads both sections; they can be assigned both roles (or the legacy single "Song Leader" role, which covers both).

The leader assigned to a section for a specific rota date needs to:

- View the rota date they are leading.
- Select the songs for their section on that date.
- Reorder their section's songs with simple controls.
- Update their section's songs before the service or rehearsal.

Only the assigned leader for a section can change that section's songs — the Praise Leader cannot change Worship Songs and vice versa — unless a choir team leader or church admin overrides.

#### Choir rota workflow notes (implemented)

- **Monthly planning**: choir team leaders/admins use "Plan the Month" to generate all Sunday services (with default Praise/Worship leaders, overridable per date) and an optional weekly rehearsal in one confirmed step. Single-entry creation remains available.
- **Rehearsal availability**: rehearsal rota entries include every choir member (as "Choir Member" assignments) so each person confirms Available / Maybe / Unavailable; the rota detail shows response counts and who has not responded.
- **Cancelled rehearsals**: a leader cancels (with confirmation) rather than deletes. The date stays visible marked "Cancelled" until it passes, stops counting as a responsibility, and the leader is offered — never auto-sent — a prefilled team announcement.

### 4.5 Team Leaders

Team leaders manage the activity of their own team.

Team leaders need to:

- Create and edit team rotas.
- Assign team members to roles.
- Create team-specific announcements.
- View team member availability confirmations.
- Communicate with their team.
- Manage team-specific content.

Team leaders should not automatically have full church-wide admin privileges.

### 4.6 Church Admins

Church admins manage the wider church app experience.

Admins need to:

- Create and edit church-wide announcements.
- Create and edit church-wide calendar events.
- Manage users.
- Manage teams.
- Assign team leaders.
- Assign special roles, such as announcement manager or event manager.
- Access organisation-level management features.

### 4.7 Announcement and Event Managers

Some users may not be full admins but should be allowed to create announcements and/or calendar events.

These users need to:

- Create church-wide announcements.
- Create church-wide events.
- Edit content they are permitted to manage.

This role allows delegation without giving full admin access.

### 4.8 Older or Less Technical Users

The app must support users with varying levels of technical confidence.

These users need:

- Large, readable text.
- Clear labels.
- Simple navigation.
- Familiar interaction patterns.
- Minimal steps to complete tasks.
- Obvious buttons.
- Helpful empty states.
- No reliance on hidden gestures.
- A clear home screen that immediately shows what matters.

The app should avoid feeling like a complex productivity tool.

---

## 5. Core Problem

The church currently uses WhatsApp for many different communication and coordination needs.

This creates several problems:

- Important announcements get buried in chat messages.
- Calendar events and rotas are not always easy to find.
- Different teams need different information.
- Members may miss updates if they are posted among casual conversations.
- Team responsibilities are not always clearly visible.
- There is no structured song database for the choir.
- Users have to rely on scrolling or searching through chat history.
- Leaders may need to repeat information multiple times.
- WhatsApp does not provide a dedicated structure for church operations.

Shift Shepherd should solve this by separating information into clear areas: home, calendar, announcements, teams, rotas, song database, and chat.

---

## 6. V1 Product Goals

The V1 product should:

- Provide a simple home page showing the latest announcement, next upcoming event, and user's next team responsibility.
- Allow members to view a church-wide calendar.
- Allow authorised users to create announcements.
- Allow authorised users to create church-wide events.
- Allow users to belong to teams.
- Provide generic team spaces that can support different ministries.
- Provide team-specific rota calendars.
- Allow team leaders to manage their team rotas.
- Allow assigned team members to confirm availability with an optional note.
- Provide a choir-specific song database.
- Allow regular choir members to add, edit, and delete songs.
- Allow selected songs to be attached to choir rota entries.
- Allow only the assigned choir song leader for a rota date to select songs for that date, with choir team leader override.
- Provide simple team chat for V1.
- Support push notification settings and simulated notifications in the scaffold.
- Require login for all users.
- Be easy enough for less technical users to understand and use.

---

## 7. V1 Non-Goals

The following should not be included in V1:

- Public pages visible without login.
- Separate admin web dashboard.
- Multi-church self-service onboarding.
- Donations or payments.
- Livestreaming.
- Sermon archive.
- Complex chat features.
- Voice notes.
- Advanced message reactions.
- Message threads.
- Polls.
- Full rota auto-generation.
- Complex rota swaps.
- Advanced analytics.
- Full attendance tracking.
- Public church website functionality.
- Complex event RSVP system.
- Built-in audio upload and hosting for song snippets.
- Full embedded music streaming functionality.

Some of these may be considered for later versions.

---

## 8. Future Expansion Considerations

Although V1 is for a single church, the app should be structured in a way that can support multiple churches later.

Future multi-church support may require:

- Organisation-level separation.
- Each church having its own users, teams, events, announcements, and settings.
- Users potentially belonging to more than one church.
- Church-specific branding.
- Organisation-level admin roles.
- Invite codes or church-specific invite links.
- Subscription or account management, if commercialised later.

For V1, the app should behave as though there is only one organisation, but the underlying data model should still include an organisation entity.

---

## 9. Information Architecture

The app should be organised around five main areas.

### 9.1 Home

The home page should show the most important information first.

Priority order:

1. Latest announcement.
2. Next upcoming event.
3. User's next team responsibility.

The home page should help users quickly understand what is happening and what matters to them.

### 9.2 Calendar

The calendar should show church-wide events.

Users should be able to view:

- Upcoming events.
- Event details.
- Dates and times.
- Locations.
- Descriptions.
- Categories.
- Related team, if relevant.

The default view should be a simple list of upcoming events, because this is easier for less technical users than a dense calendar grid.

A monthly calendar view can be included as a secondary view if needed.

### 9.3 Teams

The teams area should show the teams that the logged-in user belongs to.

Each team should have its own team space containing:

- Team announcements.
- Team rota calendar.
- Team chat.
- Team-specific resources or tools.

The choir team should have additional song database functionality.

### 9.4 Messages

The messages area should show team chats.

Users should only see chats for teams they belong to, unless they are a Church Admin.

V1 chat should be simple and familiar, similar to basic WhatsApp-style group messaging.

### 9.5 Profile and Settings

The profile/settings area should allow users to:

- View their profile.
- Manage notification preferences.
- See their teams.
- Access help/support information.
- Log out.

---

## 10. Recommended Bottom Navigation

The app should use a simple bottom navigation pattern.

Recommended tabs:

1. Home
2. Calendar
3. Teams
4. Messages
5. Profile

Each tab should have a clear icon and text label.

Text labels should always be visible. The app should not rely on icons alone.

---

## 11. Core Screens

### 11.1 Login Screen

Purpose: Allow users to securely access the app.

Requirements:

- Login is required for all users.
- Users should not be able to access church content without logging in.
- Login should be simple and clear.
- Error messages should be written in plain language.
- Scaffold should support mock test account selection.

Supported login methods in the intended product:

- Email and password.
- Google sign-in.
- Facebook sign-in.
- Phone number sign-in.

For the functional scaffold, these can be represented in the UI even if real authentication is mocked.

### 11.2 Home Screen

Purpose: Give users a clear overview of what matters now.

Content priority:

1. Latest announcement.
2. Next upcoming event.
3. Next team responsibility.

Suggested sections:

- Greeting.
- Latest announcement card.
- Next event card.
- My next responsibility card.
- My teams shortcut.
- Upcoming events preview.

UX requirements:

- The latest announcement and next upcoming event should both be immediately visible.
- Cards should be large and easy to tap.
- Avoid too much information on one screen.
- Use plain language.
- Important details should not be hidden behind tiny icons.

### 11.3 Announcements Screen

Purpose: Allow users to read important church-wide or team-specific updates.

Announcement fields:

- Title.
- Body.
- Posted by.
- Date/time posted.
- Audience.
- Optional image.
- Optional linked event.
- Optional priority or pinned status.

Announcement types:

- Church-wide announcement.
- Team-specific announcement.

Permissions:

- Church admins can create church-wide announcements.
- Users with announcement permissions can create church-wide announcements.
- Team leaders can create announcements for their own team.

V1 functionality:

- View announcements.
- Open announcement detail.
- Create announcement if authorised.
- Edit/delete announcement if authorised.
- Pin important announcements, if desired.

### 11.4 Calendar Screen

Purpose: Show church-wide events.

Default view:

- Upcoming event list.

Optional secondary view:

- Month calendar.

Event fields:

- Event title.
- Date.
- Start time.
- End time.
- Location.
- Description.
- Category.
- Created by.
- Visibility/audience.
- Related team, optional.
- Recurrence pattern, optional.

Permissions:

- Church admins can create events.
- Users with event management permissions can create events.

V1 functionality:

- View event list.
- Open event detail.
- Create event if authorised.
- Edit/delete event if authorised.
- Create simple recurring events from weekly, biweekly, monthly, and monthly weekday patterns.
- Receive event notifications, depending on user settings.

Non-goal:

- General event RSVP is not required for V1.

### 11.5 Event Categories

Events should support categories.

Categories:

- Service
- Rehearsal
- Prayer Meeting
- Bible Study
- Team Meeting
- Youth Event
- Children's Ministry
- Outreach
- Special Event
- Conference
- Social Event
- Other

Each event should have one category. Categories can be used to help users quickly understand what type of event they are looking at.

In V1, categories should be simple labels. Advanced filtering can be added later if needed.

### 11.6 Teams Screen

Purpose: Show the user's teams and provide access to each team space.

Team card fields:

- Team name.
- Team icon or image.
- Team type.
- Next rota item.
- Latest message preview.
- Shortcut to team space.

Example teams:

- Choir.
- Media.
- Ushers.
- Youth Team.

UX requirements:

- Users should only see teams they belong to, unless they are Church Admin.
- Cards should be clear and easy to tap.
- The team's next responsibility should be visible where relevant.

### 11.7 Generic Team Space Screen

Purpose: Provide a dedicated area for each team.

Each team space should include:

- Team name.
- Team announcements.
- Team rota.
- Team chat shortcut.
- Team resources/tools.

For generic teams, the rota should be the main structured feature.

Example sections:

- Next on rota.
- Team announcements.
- Rota calendar.
- Team chat.

Permissions:

- Team leaders can manage their own team space.
- Team members can view team content and participate in chat.
- Admins may have override access.

### 11.8 Team Rota Calendar Screen

Purpose: Allow team members to see team-specific schedules and responsibilities.

Important decision:

Team rotas are independent from the main church calendar. Each team has its own rota calendar.

Rota entry fields:

- Date.
- Time, optional.
- Related service/event name, optional.
- Role.
- Assigned person.
- Notes.
- Availability status.

Availability status options:

- Not responded.
- Available.
- Unavailable.
- Maybe.

V1 functionality:

- Team members can view rota entries.
- Team leaders can create and edit rota entries.
- Assigned users can confirm availability for assigned roles.
- Users can add an optional note when confirming availability.
- Users can see their next responsibility on the home screen.
- Users can receive notifications for rota updates.

Non-goals for V1:

- Automatic rota generation.
- Complex rota swaps.
- General attendance tracking.

### 11.9 Choir Team Space

Purpose: Provide choir-specific tools on top of the generic team space.

The choir team space should include:

- Choir announcements.
- Choir rota.
- Song database.
- Choir chat.
- Upcoming selected songs.

Additional choir-specific functionality:

- Members can browse songs.
- Members can add songs.
- Members can edit and delete any song.
- Assigned song leaders can select songs for upcoming rota dates.
- Choir team leaders can override song selections if needed.

### 11.10 Choir Rota Screen

Purpose: Show choir-specific rota information.

Rota entry fields:

- Date.
- Service/event name.
- Song leader.
- Selected songs.
- Notes.
- Optional rehearsal information.
- Availability confirmation.

Permissions:

- Choir team leaders can create and edit choir rota entries.
- Choir members can view rota entries.
- Assigned members can confirm availability.
- All choir members can add, edit, and delete songs in the database.
- Only the assigned song leader can select songs for their rota date.
- Choir team leaders can override song selections.

### 11.11 Song Database Screen

Purpose: Allow choir members to store, browse, and reuse songs.

Song fields:

- Song title.
- Artist/source, optional.
- Lyrics.
- External music link.
- Additional links, optional.
- Tags, optional.
- Notes, optional.
- Added by.
- Date added.

External music link examples:

- YouTube.
- Spotify.
- Apple Music.
- Website link.

V1 functionality:

- View all songs.
- Search songs.
- Open song detail.
- Add song.
- Edit any song.
- Delete any song with confirmation.
- Select songs for choir rota entries if authorised.

Future functionality:

- Embedded audio preview.
- Uploaded audio snippets.
- Chord charts.
- Song approval workflow.
- Song usage history.
- Key/tempo metadata.
- Advanced filters.

UX requirements:

- Search should be prominent.
- Song titles should be easy to scan.
- Lyrics should be readable.
- External links should be clearly labelled.

### 11.12 Song Detail Screen

Purpose: Show all information about a song.

Content:

- Song title.
- Artist/source.
- Lyrics.
- External music links.
- Tags.
- Notes.
- Added by.

Actions:

- Open external link.
- Add/select song for rota if authorised.
- Edit song.
- Delete song with confirmation.

### 11.13 Team Chat Screen

Purpose: Allow team members to communicate without needing WhatsApp.

V1 chat features:

- Team-based group chat.
- Text messages.
- Sender name.
- Message timestamp.
- Simple message input.
- Push notifications, depending on user settings.
- Image/file attachment UI if feasible.

Fallback V1 scope if attachments are too complex:

- Text-only team chat with attachment placeholder.

Future chat features:

- Voice notes.
- Message reactions.
- Reply-to-message.
- Message search.
- Polls.
- Read receipts.
- Mentions.
- Threaded conversations.

UX requirements:

- Chat should feel familiar to users coming from WhatsApp.
- The interface should remain simple.
- Message input should be obvious.
- Users should only see chats for teams they belong to, unless they are Church Admin.

### 11.14 Profile and Settings Screen

Purpose: Allow users to manage basic personal and app settings.

Settings should include:

- Profile information.
- Notification preferences.
- Team memberships.
- Help/support.
- Logout.

Notification preferences should allow users to configure:

- Church-wide announcements.
- Team announcements.
- Chat messages.
- Rota updates.
- Event reminders.
- Availability reminders.

Default notification behaviour:

- Important notifications should be enabled by default.
- Users should be able to reduce notifications if they feel overwhelmed.

---

## 12. Roles and Permissions

### 12.1 General Member

Can:

- View home.
- View announcements.
- View calendar.
- View event details.
- Receive notifications.
- Access teams they belong to.

Cannot:

- Create church-wide announcements.
- Create church-wide events.
- Manage teams.
- Manage rotas unless given a team leader role.

### 12.2 Team Member

Can:

- View assigned team spaces.
- Use team chat.
- View team rota.
- Confirm availability for assigned roles.
- Add an optional availability note.
- Add, edit, and delete songs if part of the choir.

Cannot:

- Manage team rota unless team leader.
- Create church-wide announcements unless given permission.
- Create church-wide events unless given permission.

### 12.3 Team Leader

Can:

- Manage their team rota.
- Create team announcements.
- View availability confirmations.
- Manage team-specific content.
- Select songs for choir rota if they are choir team leader or assigned song leader.

Cannot by default:

- Manage church-wide settings.
- Manage unrelated teams.
- Create church-wide events unless separately permitted.

### 12.4 Assigned Choir Song Leader

Can:

- Select songs for the rota date they are leading.
- Change selected songs for their assigned date.
- Add notes for selected songs, if supported.

### 12.5 Choir Team Leader

Can:

- Do everything a team leader can do.
- Override song selections if necessary.
- Manage choir rota entries.

### 12.6 Announcement Manager

Can:

- Create church-wide announcements.
- Edit/delete church-wide announcements they are authorised to manage.
- View all normal member content.

### 12.7 Event Manager

Can:

- Create church-wide calendar events.
- Edit/delete church-wide calendar events they are authorised to manage.
- Assign event categories.
- View all normal member content.

### 12.8 Church Admin

Can:

- Manage users.
- Manage teams.
- Assign roles.
- Create/edit/delete church-wide announcements.
- Create/edit/delete church-wide events.
- Access organisation-level settings.
- Manage team leaders.

---

## 13. Data Model

### 13.1 Organisation

Represents a church.

Fields:

- id
- name
- logo_url
- primary_colour
- created_at
- settings

For V1, there is only one organisation, but this model allows future multi-church expansion.

### 13.2 Profile

Represents an app user profile linked to authentication.

Fields:

- id
- auth_user_id
- organisation_id
- full_name
- email
- phone
- avatar_url
- created_at

### 13.3 Team

Represents a ministry/team within the church.

Fields:

- id
- organisation_id
- name
- description
- type
- created_at

Team type examples:

- generic
- choir
- media

### 13.4 Team Membership

Represents a user's membership in a team.

Fields:

- id
- team_id
- user_id
- role
- created_at

Role examples:

- member
- team_leader

### 13.5 Organisation Role

Represents organisation-level permissions.

Fields:

- id
- organisation_id
- user_id
- role

Role examples:

- church_admin
- announcement_manager
- event_manager
- general_member

### 13.6 Announcement

Represents a church-wide or team-specific announcement.

Fields:

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

If team_id is null, the announcement is church-wide.

### 13.7 Event Category

Represents an event category.

Fields:

- id
- organisation_id
- name
- colour

### 13.8 Event

Represents a church-wide calendar event.

Fields:

- id
- organisation_id
- title
- description
- category_id
- start_time
- end_time
- location
- is_recurring
- recurrence_rule
- recurrence_label
- recurrence_end_date
- created_by
- created_at
- updated_at

### 13.9 Rota Entry

Represents a team-specific rota item.

Fields:

- id
- organisation_id
- team_id
- title
- date
- time optional
- notes
- created_by
- created_at
- updated_at

### 13.10 Rota Assignment

Represents a person assigned to a role within a rota entry.

Fields:

- id
- rota_entry_id
- user_id
- role_name
- created_at

### 13.11 Availability Response

Represents a user's response to an assigned rota role.

Fields:

- id
- rota_assignment_id
- user_id
- status
- note
- updated_at

Status values:

- available
- unavailable
- maybe
- not_responded

The note is always optional.

### 13.12 Song

Represents a song in the choir song database.

Fields:

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

### 13.13 Song Link

Represents an external music/resource link for a song.

Fields:

- id
- song_id
- platform
- url

Supported platform labels:

- YouTube
- Spotify
- Apple Music
- Other

### 13.14 Choir Rota Song Selection

Represents selected songs for a choir rota entry.

Fields:

- id
- rota_entry_id
- song_id
- selected_by
- order_index
- notes

### 13.15 Chat Message

Represents a message in a team chat.

Fields:

- id
- organisation_id
- team_id
- sender_id
- body
- created_at

### 13.16 Chat Attachment

Represents an attachment to a chat message.

Fields:

- id
- message_id
- file_url
- file_type
- file_name
- created_at

### 13.17 Notification Preferences

Represents user notification settings.

Fields:

- id
- user_id
- announcement_notifications
- team_announcement_notifications
- chat_notifications
- rota_notifications
- event_reminders
- availability_reminders

### 13.18 Push Token

Represents a device push notification token.

Fields:

- id
- user_id
- token
- platform
- created_at
- updated_at

---

## 14. Technical Stack Decision

Shift Shepherd V1 should be built as a mobile-first functional app scaffold using:

- React Native
- Expo
- TypeScript
- Supabase Auth
- Supabase Postgres
- Supabase Row Level Security
- Supabase Storage
- Supabase Realtime
- Supabase Edge Functions where needed
- Expo Notifications for push notification support

The app should use Supabase Auth for V1 instead of Clerk.

### 14.1 Auth Decision

For V1, use Supabase Auth.

Supabase Auth is preferred because Shift Shepherd's most important technical challenge is not just user login. The app needs strong database-level permissions for churches, teams, rotas, announcements, songs, and chat messages.

Using Supabase Auth keeps the architecture simpler because the authentication system, database, permissions, realtime, and storage all live within the same backend platform.

Clerk may be considered later if the project needs more polished hosted auth screens, advanced user management, or a dedicated auth provider. However, for V1, Clerk would introduce extra integration complexity because users would need to be synced between Clerk and Supabase.

### 14.2 Required Authentication Methods

The app should support the following login methods:

- Email and password.
- Google sign-in.
- Facebook sign-in.
- Phone number sign-in.

For the functional scaffold, these can be represented in the UI even if only mocked or partially wired.

Recommended implementation priority:

1. Email/password.
2. Google sign-in.
3. Phone number sign-in.
4. Facebook sign-in.

### 14.3 Auth Architecture Requirement

The app should have an auth abstraction layer so that Clerk or another auth provider could be added later if necessary.

The code should avoid tightly coupling every screen directly to Supabase Auth. Instead, auth-related logic should be centralised in an auth service, auth provider, hook, or context.

### 14.4 Backend Architecture

The app should be structured as if Supabase is the production backend.

Supabase should eventually handle:

- User authentication.
- User profiles.
- Organisation/church data.
- Team memberships.
- Role-based access.
- Church announcements.
- Church calendar events.
- Team rotas.
- Choir song database.
- Choir song selections.
- Team chat.
- File and image storage.
- Push notification tokens.
- Notification preferences.

If the first generated version cannot fully connect to Supabase, it should still use mocked data and local state while keeping the data structure close to the intended Supabase schema.

---

## 15. Notification Requirements

The app should support push notifications in the intended production build.

Notification types:

- Church-wide announcements.
- Team announcements.
- Team chat messages.
- Rota updates.
- Event reminders.
- Availability reminders.

Users should be able to configure notifications in settings.

Suggested notification settings:

- All notifications.
- Important announcements only.
- Team chat messages.
- Rota updates.
- Event reminders.
- Mute specific team chats.

Default V1 behaviour:

- Announcements enabled.
- Rota updates enabled.
- Event reminders enabled.
- Team chat enabled.
- Users can adjust these later.

For the functional scaffold, notifications can be simulated through in-app notification badges, sample notification settings, and mock notification states.

---

## 16. UX Principles

The app should be designed around accessibility, clarity, and familiarity.

### 16.1 Simplicity First

Users should always know where they are and what to do next.

Avoid:

- Too many buttons.
- Complex menus.
- Hidden gestures.
- Dense screens.
- Unclear icons.
- Technical terminology.

### 16.2 Familiar Patterns

Since users are moving from WhatsApp, the chat experience should feel familiar.

Use familiar patterns such as:

- Bottom message input.
- Simple message bubbles.
- Team chat list.
- Clear timestamps.
- Obvious send button.

### 16.3 Clear Visual Hierarchy

Important information should be visually prioritised.

Home screen priority:

1. Latest announcement.
2. Next upcoming event.
3. Next responsibility.

### 16.4 Older User Inclusion

The interface should work well for users with low technical confidence.

Design requirements:

- Large tap targets.
- Readable font sizes.
- Strong contrast.
- Clear button labels.
- Plain English.
- Helpful empty states.
- Avoid relying on colour alone.
- Avoid cramped layouts.

### 16.5 Minimal Setup

Users should not need to configure much before using the app.

After login, they should immediately see:

- What is happening next.
- Any important announcements.
- Their teams.
- Their responsibilities.

---

## 17. Visual Design Direction

The exact visual style is not final, but the app should feel:

- Calm.
- Clean.
- Friendly.
- Trustworthy.
- Modern.
- Easy on the eyes.
- Organised.
- Welcoming.

The design should avoid feeling:

- Corporate.
- Overly playful.
- Too youthful.
- Too complex.
- Too app-heavy or cluttered.
- Like a generic productivity dashboard.

Colour direction:

- Blue as the primary action/trust colour.
- Purple as a secondary accent.
- Red sparingly for alerts, destructive actions, or important status.

Possible visual approach:

- Soft neutral background.
- Rounded cards.
- Large readable text.
- Clear section headings.
- Simple icons with labels.
- Spacious layouts.
- Gentle shadows or dividers.
- Accessible contrast.

The app should feel like a church community tool, not a business management app.

---

## 18. Accessibility Requirements

The app should support:

- Large readable font sizes.
- High contrast text.
- Clear touch targets.
- Simple navigation.
- Screen reader-friendly labels.
- Avoidance of icon-only actions.
- Clear error messages.
- Plain language throughout.

Minimum UX standard:

A less technical user should be able to open the app and understand the home screen within a few seconds.

---

## 19. Key User Flows

### 19.1 Member Checks What Is Happening Next

1. User opens the app.
2. User lands on the home screen.
3. User sees the latest announcement first and the next upcoming event immediately after it.
4. User taps the event card.
5. User views event details.

Success criteria:

- User can find the next event without searching.
- Event details are easy to read.

### 19.2 Member Reads an Announcement

1. User opens the app.
2. Latest announcement is visible on the home screen.
3. User taps the announcement.
4. User reads the full announcement.

Success criteria:

- Important announcements are not buried in chat.
- User understands who posted it and when.

### 19.3 Team Member Views Their Next Responsibility

1. User opens the app.
2. Home screen shows next team responsibility.
3. User taps the responsibility card.
4. User sees rota details.
5. User confirms availability if required.

Success criteria:

- User knows when they are scheduled.
- User can confirm availability easily.

### 19.4 Team Leader Creates a Rota Entry

1. Team leader opens their team space.
2. Team leader opens rota.
3. Team leader taps Add Rota Entry.
4. Team leader chooses date, role, assigned member, and notes.
5. Team leader saves entry.
6. Assigned member receives notification or simulated notification.

Success criteria:

- Team leader can create a rota without needing a spreadsheet.
- Assigned user is clearly notified.

### 19.5 Choir Member Adds a Song

1. Choir member opens Choir team space.
2. User opens Song Database.
3. User taps Add Song.
4. User enters song title, lyrics, and external music link.
5. User saves song.
6. Song appears in database.

Success criteria:

- Choir members can contribute songs easily.
- Song data remains organised and searchable.

### 19.6 Choir Song Leader Selects Songs for a Rota

1. Assigned song leader opens choir rota.
2. Song leader selects their assigned rota date.
3. Song leader taps Select Songs.
4. Song leader searches the song database.
5. Song leader selects songs.
6. Songs appear on the rota entry.

Success criteria:

- Choir members can see what songs will be sung.
- Song selection is connected to the rota.
- Only the assigned song leader or choir team leader can make changes.

### 19.7 Team Member Sends a Chat Message

1. User opens Messages.
2. User selects team chat.
3. User types a message.
4. User taps Send.
5. Message appears in chat.
6. Team members receive notification or simulated notification based on settings.

Success criteria:

- Team communication can happen inside the app.
- Chat feels simple and familiar.

### 19.8 User Updates Notification Preferences

1. User opens Profile.
2. User opens notification settings.
3. User toggles notification categories.
4. Settings update locally in the scaffold.

Success criteria:

- User can control notification volume.
- Settings are easy to understand.

---

## 20. Empty States

The app should include helpful empty states.

Examples:

### No Announcements

There are no announcements yet. Important updates will appear here.

### No Upcoming Events

There are no upcoming events right now.

### No Team Responsibilities

You do not have any upcoming team responsibilities.

### No Songs

No songs have been added yet. Add the first song to the database.

### No Chat Messages

No messages yet. Start the conversation with your team.

### No Rota Entries

No rota entries have been added for this team yet.

---

## 21. Error States and Confirmation States

Error messages should be plain and helpful.

Examples:

### Failed Login

We could not log you in. Please check your details and try again.

### Failed Save

Your changes could not be saved. Please try again.

### No Internet

You seem to be offline. Some information may not update until you reconnect.

### Permission Denied

You do not have permission to do that.

### Delete Song Confirmation

Are you sure you want to delete this song? This action cannot be undone.

### Delete Announcement Confirmation

Are you sure you want to delete this announcement?

### Delete Rota Entry Confirmation

Are you sure you want to delete this rota entry?

Avoid technical errors like:

- Request failed.
- Invalid payload.
- 403 forbidden.
- Network exception.

---

## 22. Content Tone

The app should use warm, simple, respectful language.

Use:

- Announcements.
- Upcoming Events.
- Your Teams.
- Your Next Responsibility.
- Confirm Availability.
- Team Chat.

Avoid overly technical wording like:

- Entity.
- Module.
- Permission object.
- Resource.
- Payload.
- Configuration.

---

## 23. Mock Data Requirements for Scaffold

Create realistic mock data for one organisation/church.

Organisation:

- Grace Community Church.
- App name: Shift Shepherd.

Users:

- Church Admin: Daniel Okafor.
- Announcement Manager: Miriam Blake.
- Event Manager: Joseph Carter.
- Choir Team Leader: Sarah Williams.
- Choir Member: Hannah Adeyemi.
- Assigned Choir Song Leader: Michael Thompson.
- Media Team Leader: David Chen.
- General Member: Ruth Johnson.

Teams:

- Choir.
- Media.
- Ushers.
- Youth Team.

Events:

- Sunday Morning Service.
- Midweek Bible Study.
- Friday Prayer Meeting.
- Choir Rehearsal.
- Youth Fellowship.
- Special Thanksgiving Service.

Announcements:

- Welcome announcement.
- Sunday service reminder.
- Choir rehearsal update.
- Media team rota reminder.
- Special event announcement.

Choir songs:

- 8 to 12 sample songs.
- Include lyrics snippets or realistic placeholder lyrics.
- Include YouTube/Spotify-style external links.
- Include tags such as Worship, Praise, Slow, Fast, Communion, Thanksgiving.

Rota entries:

- At least 4 upcoming choir rota entries.
- At least 4 upcoming media rota entries.
- Include mixed availability responses.

Chat messages:

- Sample messages for Choir.
- Sample messages for Media.
- Sample messages for Ushers.

---

## 24. One-Shot Build Expectation

The initial Fable 5 build should aim to produce the most complete working dummy-data version possible in a single implementation pass.

The app does not need to connect to a real backend yet, but it should feel functional using mocked data and local state.

Prioritise making the core user flows work end-to-end over adding production integrations.

Core flows that must work with dummy data:

- Mock login using test users.
- Role-based navigation and UI actions.
- Home screen showing latest announcement, next upcoming event, and next responsibility.
- Calendar browsing and mock event creation/editing.
- Announcement browsing and mock announcement creation/editing.
- Team spaces and team rotas.
- Rota availability confirmation with optional notes.
- Choir song database add/edit/delete.
- Assigned choir song leader selecting songs for a rota date.
- Basic team chat with locally added messages.
- Notification settings toggles.

Use local state, mocked services, and realistic sample data to make the app testable immediately.

Do not spend time wiring real Supabase, real OAuth, real SMS login, real push notifications, or real file uploads unless they can be implemented cleanly without blocking the scaffold.

If a production feature is too large for the one-shot build, create a clear placeholder and note what would be needed to make it production-ready later.

---

## 25. Implementation Flexibility

The implementation model may deviate from requested implementation details if it identifies a better, cleaner, more scalable, or more maintainable way to build the app.

This flexibility applies to:

- Folder structure.
- Component architecture.
- State management.
- Navigation implementation.
- UI component choices.
- Form handling.
- Data modelling details.
- Mock service structure.
- Supabase integration approach.
- Performance improvements.
- Accessibility improvements.

However, it should not change the core product requirements without clearly explaining the reason.

Do not remove or significantly alter these core requirements:

- The app must remain mobile-first.
- The app must require login.
- The app must support future Supabase integration.
- The app must support future multi-church expansion.
- The app must include home, calendar, teams, messages, and profile areas.
- The home screen must prioritise latest announcement, next upcoming event, and next team responsibility.
- The app must support generic teams.
- The choir must have a song database.
- Choir members must be able to add, edit, and delete songs.
- Assigned choir song leaders must be able to select songs for their rota date.
- Team leaders must be able to manage team rotas.
- Team members must be able to confirm availability with an optional note.
- The UX must remain simple and accessible for older or less technical users.

If a deviation is made, the implementation should include a short Implementation Notes section explaining:

1. What changed.
2. Why it changed.
3. How it improves the app.
4. Any trade-offs or future work created by the change.

---

## 26. V1 Success Criteria

V1 should be considered successful if:

- Members can log in and understand the home screen quickly.
- Users can find the next event without needing help.
- Announcements are easier to find than in WhatsApp.
- Team members can view their rota clearly.
- Assigned users can confirm availability with optional notes.
- Choir members can browse and add songs.
- Choir members can edit and delete songs.
- Assigned choir song leaders can select songs for rota dates.
- Team leaders can manage their team rotas.
- Team chat works well enough to reduce WhatsApp reliance.
- Notification settings give users control without being complicated.
- Older or less technical users can use the core features comfortably.
- The scope remains focused and testable.
- The code is structured so Supabase can be added later.

---

## 27. V1 Feature Summary

### Must Have

- App name: Shift Shepherd as placeholder branding.
- Login required.
- Email/password login UI.
- Google sign-in UI.
- Facebook sign-in UI.
- Phone number sign-in UI.
- Organisation structure for future multi-church support.
- Home page.
- Church-wide announcements.
- Church-wide calendar.
- Event categories.
- Generic team spaces.
- Team rota calendars.
- Team leader rota management.
- Availability confirmation with optional notes.
- Choir song database.
- Choir members can add songs.
- Choir members can edit/delete any song.
- External song links.
- Song selection by assigned choir song leader for that rota date.
- Basic team chat.
- Image/file attachment UI if feasible.
- Push notification settings.
- Simulated notification badges/states.
- Basic roles and permissions.

### Should Have

- Pinned announcements.
- Search songs.
- Latest message preview on team cards.
- Next responsibility card on home.
- Team-specific announcements.
- Simple profile/settings page.

### Could Have

- Image/file attachments in chat.
- Song tags.
- Calendar month view.
- Event reminder options.
- Team resource links.

### Not V1

- Donations.
- Livestreaming.
- Sermon archive.
- Separate web dashboard.
- Public pages without login.
- Multi-church onboarding.
- Full embedded song preview.
- Uploaded audio hosting.
- Voice notes.
- Polls.
- Advanced chat features.
- Automatic rota generation.
- Complex rota swaps.
- General event RSVP.
- Advanced analytics.
