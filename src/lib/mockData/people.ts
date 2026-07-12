/**
 * Mock organisation, users, teams, memberships, and organisation roles.
 * TODO: wire to Supabase — these become `organisations`, `profiles`,
 * `teams`, `team_memberships`, and `organisation_roles` tables.
 */
import {
  Organisation,
  OrganisationRole,
  Team,
  TeamMembership,
  UserProfile,
} from '../../types';
import { daysAgo, iso } from '../../utils/dates';

export const ORG_ID = 'org-grace';

export const mockOrganisation: Organisation = {
  id: ORG_ID,
  name: 'Grace Community Church',
  logo_url: null,
  primary_colour: '#2F5FC4',
  created_at: iso(daysAgo(120)),
};

const profile = (
  id: string,
  full_name: string,
  email: string,
  phone: string | null = null,
): UserProfile => ({
  id,
  auth_user_id: `auth-${id}`,
  organisation_id: ORG_ID,
  full_name,
  display_name_override: null,
  email,
  phone,
  avatar_url: null,
  created_at: iso(daysAgo(90)),
});

export const mockUsers: UserProfile[] = [
  profile('user-daniel', 'Daniel Okafor', 'daniel@gracecommunity.church', '+44 7700 900101'),
  profile('user-miriam', 'Miriam Blake', 'miriam@gracecommunity.church', '+44 7700 900102'),
  profile('user-joseph', 'Joseph Carter', 'joseph@gracecommunity.church', '+44 7700 900103'),
  profile('user-sarah', 'Sarah Williams', 'sarah@gracecommunity.church', '+44 7700 900104'),
  profile('user-hannah', 'Hannah Adeyemi', 'hannah@gracecommunity.church', '+44 7700 900105'),
  profile('user-michael', 'Michael Thompson', 'michael@gracecommunity.church', '+44 7700 900106'),
  profile('user-david', 'David Chen', 'david@gracecommunity.church', '+44 7700 900107'),
  profile('user-ruth', 'Ruth Johnson', 'ruth@gracecommunity.church', '+44 7700 900108'),
];

export const mockOrganisationRoles: OrganisationRole[] = [
  { id: 'orgrole-1', organisation_id: ORG_ID, user_id: 'user-daniel', role: 'church_admin' },
  { id: 'orgrole-2', organisation_id: ORG_ID, user_id: 'user-miriam', role: 'announcement_manager' },
  { id: 'orgrole-3', organisation_id: ORG_ID, user_id: 'user-joseph', role: 'event_manager' },
  { id: 'orgrole-4', organisation_id: ORG_ID, user_id: 'user-sarah', role: 'general_member' },
  { id: 'orgrole-5', organisation_id: ORG_ID, user_id: 'user-hannah', role: 'general_member' },
  { id: 'orgrole-6', organisation_id: ORG_ID, user_id: 'user-michael', role: 'general_member' },
  { id: 'orgrole-7', organisation_id: ORG_ID, user_id: 'user-david', role: 'general_member' },
  { id: 'orgrole-8', organisation_id: ORG_ID, user_id: 'user-ruth', role: 'general_member' },
];

export const mockTeams: Team[] = [
  {
    id: 'team-choir',
    organisation_id: ORG_ID,
    name: 'Choir',
    description: 'Leading the congregation in worship every Sunday.',
    type: 'choir',
    avatar_url: null,
    created_at: iso(daysAgo(110)),
  },
  {
    id: 'team-media',
    organisation_id: ORG_ID,
    name: 'Media',
    description: 'Sound, cameras, slides and livestream for services.',
    type: 'media',
    avatar_url: null,
    created_at: iso(daysAgo(110)),
  },
  {
    id: 'team-ushers',
    organisation_id: ORG_ID,
    name: 'Ushers',
    description: 'Welcoming people and helping services run smoothly.',
    type: 'generic',
    avatar_url: null,
    created_at: iso(daysAgo(110)),
  },
  {
    id: 'team-youth',
    organisation_id: ORG_ID,
    name: 'Youth Team',
    description: 'Serving our young people on Friday evenings and Sundays.',
    type: 'generic',
    avatar_url: null,
    created_at: iso(daysAgo(110)),
  },
];

const membership = (
  id: string,
  team_id: string,
  user_id: string,
  role: TeamMembership['role'],
): TeamMembership => ({ id, team_id, user_id, role, created_at: iso(daysAgo(80)) });

export const mockMemberships: TeamMembership[] = [
  // Choir — Sarah leads; Hannah and Michael sing.
  membership('tm-1', 'team-choir', 'user-sarah', 'team_leader'),
  membership('tm-2', 'team-choir', 'user-hannah', 'member'),
  membership('tm-3', 'team-choir', 'user-michael', 'member'),
  // Media — David leads; Joseph and Michael help.
  membership('tm-4', 'team-media', 'user-david', 'team_leader'),
  membership('tm-5', 'team-media', 'user-joseph', 'member'),
  membership('tm-6', 'team-media', 'user-michael', 'member'),
  // Ushers — Miriam leads; Daniel and Joseph serve.
  membership('tm-7', 'team-ushers', 'user-miriam', 'team_leader'),
  membership('tm-8', 'team-ushers', 'user-daniel', 'member'),
  membership('tm-9', 'team-ushers', 'user-joseph', 'member'),
  // Youth Team — Joseph leads; Hannah and David help.
  membership('tm-10', 'team-youth', 'user-joseph', 'team_leader'),
  membership('tm-11', 'team-youth', 'user-hannah', 'member'),
  membership('tm-12', 'team-youth', 'user-david', 'member'),
  // Ruth Johnson intentionally has no teams — she is the "general member"
  // test account and exercises the empty states.
];

/** Test accounts shown on the login screen (demo mode). */
export const testAccounts: { userId: string; roleLabel: string; description: string }[] = [
  { userId: 'user-daniel', roleLabel: 'Church Admin', description: 'Sees and manages everything' },
  { userId: 'user-miriam', roleLabel: 'Announcement Manager', description: 'Creates church-wide announcements, leads Ushers' },
  { userId: 'user-joseph', roleLabel: 'Event Manager', description: 'Creates church events, leads Youth Team' },
  { userId: 'user-sarah', roleLabel: 'Choir Team Leader', description: 'Manages the choir rota and songs' },
  { userId: 'user-hannah', roleLabel: 'Choir Member', description: 'Sings in the choir, helps with youth' },
  { userId: 'user-michael', roleLabel: 'Assigned Choir Song Leader', description: 'Leading songs at an upcoming service' },
  { userId: 'user-david', roleLabel: 'Media Team Leader', description: 'Manages the media rota' },
  { userId: 'user-ruth', roleLabel: 'General Church Member', description: 'Not on any team yet' },
];
