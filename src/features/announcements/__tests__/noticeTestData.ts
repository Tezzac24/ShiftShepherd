import { Announcement, Event, SessionUser, Team, UserProfile } from '../../../types';

export const PROFILE: UserProfile = { id: 'profile-1', auth_user_id: 'auth-1', organisation_id: 'church-1', full_name: 'Test Admin',
  email: 'test@example.church', phone: null, avatar_url: null, access_status: 'active', access_removed_at: null,
  access_removed_by: null, access_removal_reason: null, created_at: '2026-09-01T10:00:00Z' };
export const TEAM: Team = { id: 'team-1', organisation_id: PROFILE.organisation_id, name: 'Welcome team', description: '', type: 'generic',
  avatar_url: null, archived_at: null, archived_by: null, created_at: PROFILE.created_at };
export const NOTICE: Announcement = { id: 'notice-1', organisation_id: PROFILE.organisation_id, team_id: null,
  title: 'A church notice', body: 'A useful update for this church.', audience: 'church', pinned: false,
  image_url: null, linked_event_id: null, created_by: PROFILE.id, created_at: PROFILE.created_at, updated_at: PROFILE.created_at };
export const EVENT: Event = { id: 'event-1', organisation_id: PROFILE.organisation_id, title: 'Sunday gathering', description: 'Come together.',
  category_id: 'cat-service', start_time: new Date(2026, 9, 4, 10).toISOString(), end_time: new Date(2026, 9, 4, 12).toISOString(),
  location: 'Main hall', team_id: null, is_recurring: false, recurrence_rule: null, recurrence_label: null, recurrence_end_date: null,
  created_by: PROFILE.id, created_at: PROFILE.created_at, updated_at: PROFILE.created_at };
export function makeAuth() {
  return { user: { profile: PROFILE, orgRole: 'church_admin', memberships: [] } as SessionUser,
    authMode: 'supabase', accountStatus: 'ready', isLoading: false };
}
export function makeData() {
  return { announcements: [NOTICE] as Announcement[], announcementsLive: false, announcementsLoading: false, announcementsError: null as string | null,
    teams: [TEAM] as Team[], archivedTeams: [] as Team[], teamsLoading: false, teamsError: null as string | null,
    events: [EVENT] as Event[], eventsLoading: false, eventsError: null as string | null,
    categories: [{ id: 'cat-service', name: 'Service' }], users: [PROFILE],
    refreshAnnouncements: jest.fn(), refreshEvents: jest.fn(), refreshTeams: jest.fn(), getAnnouncementImageUri: jest.fn(), getAvatarUri: jest.fn(),
    addAnnouncement: jest.fn(async (input: Partial<Announcement>) => ({ ...NOTICE, ...input, id: 'created-notice' })),
    updateAnnouncement: jest.fn().mockResolvedValue(undefined), deleteAnnouncement: jest.fn().mockResolvedValue(undefined),
    setAnnouncementImage: jest.fn().mockResolvedValue(undefined), removeAnnouncementImage: jest.fn().mockResolvedValue(undefined),
    addEvent: jest.fn(async (input: Partial<Event>) => ({ ...EVENT, ...input, id: 'created-event' })),
    updateEvent: jest.fn().mockResolvedValue(undefined), deleteEvent: jest.fn().mockResolvedValue(undefined) };
}
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
