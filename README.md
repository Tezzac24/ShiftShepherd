# ShiftShepherd – Product & Technical Spec (v0.1)

## 1. Product Overview

A simple mobile app that helps churches and other volunteer-based teams:

- Create and manage rotas/schedules.
- Assign people to roles for events (e.g. Sunday services).
- Let volunteers easily say “I can’t make it” or request a swap.
- (For choir/worship teams) manage a **song library** and setlists.

The app must be usable by **less tech-savvy adults** as well as teenagers.  
Primary devices: **iOS and Android**, built with **React Native + Expo**.

---

## 2. Goals & Success Criteria

### 2.1 Primary Goals

- Reduce manual effort of creating and updating rotas.
- Reduce confusion caused by spreadsheets + WhatsApp combinations.
- Make it **very easy** for volunteers to:
  - Check when they are scheduled.
  - Notify admins when they cannot attend.
  - (Optionally) request a swap with someone else.

### 2.2 Success Criteria

- Older, less tech-savvy users can:
  - Open the app and see when they are on in ≤ 2 taps.
  - Indicate “I can’t make it” in ≤ 3 taps.
- Noticeable drop in:
  - Last-minute rota confusion.
  - Uncommunicated no-shows.
- Admins report:
  - Less time spent chasing people.
  - Clear visibility of who is on when.

### 2.3 Non-Goals (for MVP)

- Full church management system (donations, small groups, pastoral care).
- Complex analytics or reporting dashboards.
- Full-featured in-app chat (see section 7).
- Auto-scheduling / optimisation algorithms (future).

---

## 3. Target Users & Personas

### 3.1 Admin / Rota Owner

- Examples: team leader, worship leader, media lead, pastor.
- Responsibilities:
  - Create teams and roles.
  - Set up events and assign people.
  - Handle “I can’t make it” and swap requests.
- Needs:
  - See upcoming events and who is scheduled.
  - Quickly fill gaps and approve swaps.

### 3.2 Volunteer / Team Member

- Range: teenager on media team → older usher.
- Responsibilities:
  - Turn up when scheduled.
  - Communicate when they cannot attend.
- Needs:
  - See “when am I on?” very quickly.
  - Mark “I can’t make it” with minimal friction.
  - Optionally request a swap.

### 3.3 Choir / Worship Leader (special persona)

- Has extra needs in addition to Admin:
  - Maintain a song library (title, key, category, notes).
  - Build setlists for services.
  - Link setlists to dates and rotas.

---

## 4. Core Use Cases

### 4.1 Admin Use Cases

1. Create an organisation (e.g. church).
2. Create teams (Choir, Media, Ushering, Kids, etc.).
3. Define roles for each team (Lead Vocal, BV, Keys, Camera, Usher, etc.).
4. Create events (e.g. “Sunday 10:00”, “Midweek 19:00”).
5. Assign teams and roles to events.
6. Assign specific people to roles for each event.
7. View all upcoming events and see who is scheduled.
8. View and manage:
   - “I can’t make it” notifications.
   - Swap requests.
9. For choir:
   - Manage song library.
   - Create setlists and attach to events.

### 4.2 Volunteer Use Cases

1. Sign up / log in and join the correct organisation/team.
2. See a list of upcoming assignments.
3. Tap into an assignment to see:
   - Date, time, team, role.
   - (Optional) who else is on.
   - (Choir) the songs for that day.
4. Mark “I can’t make this date”.
5. Optionally request a swap:
   - Choose 1–3 people of the same team/role to ask.
   - See when a swap is accepted or declined.
6. Receive reminders before they are scheduled to serve.

### 4.3 Choir Use Cases

1. Add songs to a central library (title, key, tags, notes/links).
2. Build setlists for specific events.
3. Choir members on that date can see the setlist with their rota.

---

## 5. Feature Breakdown

### 5.1 MVP Features (v1.0)

**Accounts & Teams**
- Email/password login (or simple email + magic link, depending on implementation).
- Create/join organisation.
- Create teams within an organisation.
- Add users to teams; mark some users as team admins.

**Events & Rotas**
- Create events with:
  - Name
  - Date & time
  - Optional location
- Link teams to events.
- Define roles per team (e.g. Lead Vocal, Camera).
- Assign team members to roles for specific events.

**Volunteer View**
- “My Schedule”:
  - List of upcoming assignments.
  - Each item shows date, time, team, role.
- Assignment detail screen:
  - Event info.
  - Buttons:
    - `I can't make it`
    - *(optional, depending on scope)* `Request a swap`

**“I can’t make it” Flow (MVP)**
- Volunteer taps `I can't make it` on an assignment.
- Confirmation dialog: “Are you sure you cannot make this date?”
- Creates a request visible to admins for that event/team.
- Admin can:
  - Mark as acknowledged.
  - Reassign to another team member manually.
- Notifications:
  - Admin notified that someone cannot attend.
  - Volunteer notified when rota has changed (optional for MVP).

**Choir Song Library (Basic)**
- Song list:
  - Title
  - Key
  - Category (e.g. praise, worship, thanksgiving)
  - Notes (lyrics link, YouTube link, etc.)
- For an event:
  - Admin/choir leader can select songs from library to form a setlist.
- Volunteers assigned to choir for that event can view the setlist.

**Notifications (Basic)**
- At minimum: in-app notifications / banners.
- Stretch (still under MVP if possible): push notifications for:
  - New assignment.
  - “You can’t make it” acknowledgement / rota change.
  - Reminder before serving (e.g. 24 hours before).

**Admin Overview**
- List of upcoming events with:
  - Date/time.
  - Teams involved.
  - Simple indicator of scheduling completeness (e.g. all roles filled / missing).
- View of open “I can’t make it” requests.

### 5.2 Near-Term Post-MVP Features (v1.1+)

- Swap requests:
  - Volunteer selects candidate(s) to cover.
  - Candidates can accept/decline.
  - Admin has final approval to confirm swap.
- Availability:
  - Volunteers can mark dates they are unavailable.
- Recurring templates:
  - Auto-generate events from a weekly template.
- Web admin panel for easier rota management.

### 5.3 Future / Stretch Features (v2+)

- Auto-scheduling based on availability and rotation rules.
- Attendance tracking.
- Advanced reporting.
- Deeper integrations (calendar sync, email/SMS, etc.).
- In-app chat (see section 7).

---

## 6. UX & Accessibility Requirements

- Target: less tech-savvy adults.
- Large, readable fonts and high contrast.
- Minimal steps per core action:
  - See next assignment in ≤ 2 taps.
  - “I can’t make it” in ≤ 3 taps.
- Avoid jargon; use plain language:
  - “I can’t make this date” instead of “decline assignment”.
  - “Ask someone to cover you” instead of “swap request”.
- Keep bottom navigation simple, e.g.:

1. **Home**
2. **My Schedule**
3. **Teams**
4. **More** (settings, help, sign out)

---

## 7. Communication & Chat Strategy (WhatsApp vs In-App)

### 7.1 Problem

Many users are already used to **WhatsApp** for team communication.  
Pure in-app chat may be ignored initially and adds complexity.

### 7.2 MVP Decision

- **No full in-app group chat in MVP.**
- Instead:
  - Keep communication about rota changes structured via:
    - “I can’t make it” requests.
    - (Later) swap requests.
  - For conversational chat, teams may continue to use WhatsApp.

### 7.3 Integration with WhatsApp (Design Idea)

To support existing behaviour without re-building WhatsApp:

- Allow optional configuration per team:
  - `whatsapp_group_link` (e.g. invite link).
- Add a simple button on team/event screens:
  - `Open WhatsApp Group`
  - When tapped, deep-link to the WhatsApp group link if present.
- Possible future enhancement:
  - Generate templated messages that can be copied into WhatsApp, e.g.  
    “Hi all, I’m scheduled for [Date/Time, Team, Role] but can’t make it. Can anyone cover?”

This approach:
- Respects users’ habit of using WhatsApp.
- Keeps the app focused on rotas and structured state.
- Leaves chat as a **future** in-app feature if there is demand.

---

## 8. Technical Stack

### 8.1 Frontend

- **Framework:** React Native with Expo  
- **Language:** TypeScript  
- **Navigation:** `@react-navigation` (stack navigator + bottom tab navigator)  
- **State Management:**
  - Server state: React Query / TanStack Query
  - Local UI state: React hooks (`useState`, `useReducer`, `useContext` where appropriate)
- **Styling:**
  - Either Styled Components **or**
  - A simple design system built with React Native’s `StyleSheet` and reusable components (e.g. `Card`, `Button`, `ListItem`)

The frontend consumes a REST API exposed by the backend service (see 8.2).

---

### 8.2 Backend

The backend is a standalone service responsible for authentication, business logic, and data persistence.

- **Runtime:** Node.js (LTS)  
- **Language:** TypeScript  
- **Framework:** NestJS (modular architecture with Controllers, Services, and Modules)  
- **Database:** PostgreSQL  
- **ORM / Data Layer:** Prisma (schema-driven modelling, migrations, and type-safe queries)  
- **API Style:** RESTful JSON APIs (with room to add GraphQL later if needed)  
- **Authentication & Authorisation:**
  - Email/password login
  - JWT-based authentication (access + refresh tokens)
  - Role/permission model (organisation admin, team admin, team member)
- **Testing:**
  - Jest for unit tests
  - Supertest (or similar) for HTTP integration tests
- **Deployment:**
  - Containerised with Docker
  - Deployed to a managed hosting platform (e.g. Railway, Render, Fly.io, or similar)
  - Database hosted on a managed PostgreSQL provider

The backend exposes endpoints for core features such as users, organisations, teams, events, assignments, “I can’t make it” requests, and the choir song library/setlists.

---

### 8.3 Notifications

- **Push Notifications:** Expo Notifications (via the React Native app)  
- **Triggering Notifications:**
  - The backend tracks events that should trigger notifications (e.g. new assignment, rota changes, “I can’t make it” requests, swap approvals).
  - The backend stores each user’s Expo push token and sends messages through the Expo push notifications API.
- **Data Model Considerations:**
  - Track notification targets (e.g. `user_id`, `team_id`)
  - Track triggers and metadata (e.g. assignment ID, event ID, request ID)
  - Optionally log notification deliveries for debugging/auditing

---

## 9. Data Model (Initial Draft)

Relational schema (Postgres-like).

### 9.1 Core Tables

**`users`**
- `id` (pk)
- `email` (unique)
- `password_hash` (if not using Supabase auth)
- `name`
- `phone` (optional)
- `created_at`
- `updated_at`

**`organisations`**
- `id` (pk)
- `name`
- `created_at`
- `updated_at`

**`organisation_members`**
- `id` (pk)
- `organisation_id` (fk → organisations.id)
- `user_id` (fk → users.id)
- `role` (e.g. "owner", "admin", "member")
- `created_at`

**`teams`**
- `id` (pk)
- `organisation_id` (fk → organisations.id)
- `name`
- `description` (optional)
- `whatsapp_group_link` (optional)  // for WhatsApp integration
- `created_at`

**`team_members`**
- `id` (pk)
- `team_id` (fk → teams.id)
- `user_id` (fk → users.id)
- `is_admin` (bool)
- `default_role` (optional)
- `created_at`

**`events`**
- `id` (pk)
- `organisation_id` (fk → organisations.id)
- `name`
- `start_datetime`
- `end_datetime` (optional)
- `location` (optional)
- `created_at`

**`event_teams`**
- `id` (pk)
- `event_id` (fk → events.id)
- `team_id` (fk → teams.id)

**`roles`**
- `id` (pk)
- `team_id` (fk → teams.id)
- `name` (e.g. "Lead Vocal", "Camera Operator")

**`assignments`**
- `id` (pk)
- `event_id` (fk → events.id)
- `team_id` (fk → teams.id)
- `role_id` (fk → roles.id)
- `user_id` (fk → users.id)
- `status` (enum: "assigned", "cancelled")
- `created_at`
- `updated_at`

### 9.2 Requests

**`cant_make_it_requests`**
- `id` (pk)
- `assignment_id` (fk → assignments.id)
- `user_id` (fk → users.id)  // usually same as assignment.user_id
- `reason` (optional text)
- `status` (enum: "open", "acknowledged", "resolved")
- `created_at`
- `updated_at`

(*Swap requests can be added later in a similar pattern.*)

### 9.3 Choir / Songs

**`songs`**
- `id` (pk)
- `organisation_id` (fk → organisations.id)
- `title`
- `key` (e.g. "G", "Bb")
- `category` (e.g. "praise", "worship")
- `notes` (text, optional)
- `external_link` (optional URL, e.g. YouTube/lyrics)

**`event_songs`**
- `id` (pk)
- `event_id` (fk → events.id)
- `song_id` (fk → songs.id)
- `order_index` (int)

---

## 10. Screen Map (High-Level)

### 10.1 Auth & Onboarding

1. **Welcome / Login**
   - Email + password (or magic link).
2. **Create / Join Organisation**
   - If admin: create organisation.
   - If member: join via invite link or code.
3. **Join Teams**
   - See teams in organisation and request to join (or be pre-added by admin).

### 10.2 Volunteer-Facing Screens

- **Home Screen**
  - Card: “Your next assignment”.
  - Button: “View all upcoming assignments”.
- **My Schedule**
  - List of assignments (date, time, team, role).
  - Optional calendar toggle.
- **Assignment Detail**
  - Event details.
  - Other people on duty (optional).
  - Buttons:
    - `I can't make it`
    - *(later)* `Request a swap`
- **Team Detail**
  - Team name.
  - Optional: button to open WhatsApp group (if link exists).
- **Choir: Event Setlist**
  - List of songs for that event with key and notes.

### 10.3 Admin-Facing Screens

- **Events List**
  - Upcoming events with dates and basic status.
- **Event Detail / Rota Builder**
  - Teams involved.
  - Roles and assigned users.
  - Ability to add/change assignments.
- **Requests / Inbox**
  - List of “I can’t make it” requests.
  - Tap into a request to reassign or mark resolved.
- **Song Library (Choir Admin)**
  - List, add, edit, delete songs.
- **Event Setlist Editor**
  - Attach songs to events in a specific order.

---

## 11. Monetisation (Future Consideration)

For now (portfolio / church use):

- Free for small usage (e.g. single church).

Future options:

- Free tier:
  - 1 organisation, up to X volunteers, limited number of events.
- Paid tier:
  - Larger churches/organisations.
  - Additional features (web admin, advanced analytics, integrations).

---

## 12. Coding Brief for AI (e.g. GPT Codex)

When given this spec, start by:

1. **Project Setup**
   - Create a new React Native + Expo project with TypeScript.
   - Configure basic navigation:
     - Auth stack.
     - Main app tabs (Home, My Schedule, Teams, More).

2. **Data Layer**
   - Assume Supabase/Postgres backend with tables as described.
   - Write a small API layer (e.g. `api.ts`) to:
     - Fetch current user’s assignments.
     - Fetch events and teams.
     - Post “I can’t make it” requests.

3. **Initial Screens to Implement**
   - `LoginScreen` (placeholder auth logic is fine initially).
   - `HomeScreen`:
     - Shows next assignment from a mocked or fetched list.
   - `MyScheduleScreen`:
     - List of assignments, grouped by date.
   - `AssignmentDetailScreen`:
     - Basic event + assignment info.
     - `I can't make it` button with simple confirmation alert.

4. **Design Requirements**
   - Use simple, large, readable components suitable for older adults.
   - Keep logic modular for later extension (swap requests, song library, etc.).

5. **Next Steps**
   - After base skeleton works with mocked data, integrate Supabase:
     - Auth.
     - Real data fetching for `MySchedule`.
     - POST endpoint for creating “I can’t make it” requests.
