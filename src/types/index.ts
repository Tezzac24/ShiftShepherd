/**
 * Core entity types for Shift Shepherd.
 *
 * Field names intentionally mirror the intended Supabase schema
 * (docs/one-shot-build-prompt.md, section 5) so mocked data can later be
 * swapped for real Supabase rows with minimal churn.
 */

export type ID = string;

// ---------------------------------------------------------------------------
// Organisation & people
// ---------------------------------------------------------------------------

export interface Organisation {
  id: ID;
  name: string;
  logo_url: string | null;
  primary_colour: string;
  created_at: string;
}

export interface UserProfile {
  id: ID;
  auth_user_id: ID;
  organisation_id: ID;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
}

export type TeamType = 'generic' | 'choir' | 'media';

export interface Team {
  id: ID;
  organisation_id: ID;
  name: string;
  description: string;
  type: TeamType;
  created_at: string;
}

export type TeamRole = 'member' | 'team_leader';

export interface TeamMembership {
  id: ID;
  team_id: ID;
  user_id: ID;
  role: TeamRole;
  created_at: string;
}

export type OrganisationRoleName =
  | 'church_admin'
  | 'announcement_manager'
  | 'event_manager'
  | 'general_member';

export interface OrganisationRole {
  id: ID;
  organisation_id: ID;
  user_id: ID;
  role: OrganisationRoleName;
}

// ---------------------------------------------------------------------------
// Announcements & events
// ---------------------------------------------------------------------------

export type AnnouncementAudience = 'church' | 'team';

export interface Announcement {
  id: ID;
  organisation_id: ID;
  /** null = church-wide announcement */
  team_id: ID | null;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  pinned: boolean;
  image_url: string | null;
  linked_event_id: ID | null;
  created_by: ID;
  created_at: string;
  updated_at: string;
}

export type EventCategoryName =
  | 'Service'
  | 'Rehearsal'
  | 'Prayer Meeting'
  | 'Bible Study'
  | 'Team Meeting'
  | 'Youth Event'
  | "Children's Ministry"
  | 'Outreach'
  | 'Special Event'
  | 'Conference'
  | 'Social Event'
  | 'Other';

export interface EventCategory {
  id: ID;
  organisation_id: ID;
  name: EventCategoryName;
  colour: string;
}

export interface Event {
  id: ID;
  organisation_id: ID;
  title: string;
  description: string;
  category_id: ID;
  /** ISO datetime */
  start_time: string;
  /** ISO datetime */
  end_time: string;
  location: string;
  /** Optional related team */
  team_id: ID | null;
  created_by: ID;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------------

export interface RotaEntry {
  id: ID;
  organisation_id: ID;
  team_id: ID;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  /** e.g. "10:00" — optional */
  time: string | null;
  notes: string | null;
  created_by: ID;
  created_at: string;
  updated_at: string;
}

export interface RotaAssignment {
  id: ID;
  rota_entry_id: ID;
  user_id: ID;
  role_name: string;
  created_at: string;
}

export type AvailabilityStatus = 'available' | 'unavailable' | 'maybe' | 'not_responded';

export interface AvailabilityResponse {
  id: ID;
  rota_assignment_id: ID;
  user_id: ID;
  status: AvailabilityStatus;
  /** Always optional */
  note: string | null;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Choir songs
// ---------------------------------------------------------------------------

export type SongPlatform = 'YouTube' | 'Spotify' | 'Apple Music' | 'Other';

export interface SongLink {
  id: ID;
  song_id: ID;
  platform: SongPlatform;
  url: string;
}

export interface Song {
  id: ID;
  organisation_id: ID;
  team_id: ID;
  title: string;
  artist: string | null;
  lyrics: string;
  notes: string | null;
  tags: string[];
  /**
   * Links kept nested for scaffold convenience; stored as a separate
   * `song_links` table in Supabase later.
   */
  links: SongLink[];
  added_by: ID;
  created_at: string;
  updated_at: string;
}

export interface ChoirSongSelection {
  id: ID;
  rota_entry_id: ID;
  song_id: ID;
  selected_by: ID;
  order_index: number;
  notes: string | null;
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export interface ChatMessage {
  id: ID;
  organisation_id: ID;
  team_id: ID;
  sender_id: ID;
  body: string;
  created_at: string;
}

export interface ChatAttachment {
  id: ID;
  message_id: ID;
  file_url: string;
  file_type: string;
  file_name: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export interface NotificationPreferences {
  id: ID;
  user_id: ID;
  announcement_notifications: boolean;
  team_announcement_notifications: boolean;
  chat_notifications: boolean;
  rota_notifications: boolean;
  event_reminders: boolean;
  availability_reminders: boolean;
}

export interface PushToken {
  id: ID;
  user_id: ID;
  token: string;
  platform: 'ios' | 'android' | 'web';
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Session (client-side convenience, not a Supabase table)
// ---------------------------------------------------------------------------

/** The logged-in user plus everything permission checks need. */
export interface SessionUser {
  profile: UserProfile;
  orgRole: OrganisationRoleName;
  memberships: TeamMembership[];
}
