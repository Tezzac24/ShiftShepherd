import { Announcement, Event, RotaAssignment, RotaEntry, SessionUser, Team, UserProfile } from '../../../types';

export const profile: UserProfile = {
  id: 'person-a', auth_user_id: 'account-a', organisation_id: 'church-a', full_name: 'Alex Morgan',
  email: 'alex@example.test', phone: null, avatar_url: null, access_status: 'active',
  access_removed_at: null, access_removed_by: null, access_removal_reason: null, created_at: '',
};

export function makeUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    profile, orgRole: 'general_member',
    memberships: [{ id: 'membership-a', team_id: 'team-a', user_id: profile.id, role: 'member', created_at: '' }],
    ...overrides,
  };
}

export function makeTeam(overrides: Partial<Team> = {}): Team {
  return { id: 'team-a', organisation_id: profile.organisation_id, name: 'Choir', description: '',
    type: 'choir', avatar_url: null, archived_at: null, archived_by: null, created_at: '', ...overrides };
}

export function makeEntry(overrides: Partial<RotaEntry> = {}): RotaEntry {
  return { id: 'date-a', organisation_id: profile.organisation_id, team_id: 'team-a', title: 'Sunday serving',
    date: '2026-09-27', time: '10:00', notes: null, status: 'active', cancelled_at: null,
    cancelled_by: null, cancellation_reason: null, created_by: profile.id, created_at: '', updated_at: '', ...overrides };
}

export function makeAssignment(overrides: Partial<RotaAssignment> = {}): RotaAssignment {
  return { id: 'assignment-a', rota_entry_id: 'date-a', user_id: profile.id, role_name: 'Praise Leader', created_at: '', ...overrides };
}

export function makeEvent(overrides: Partial<Event> = {}): Event {
  return { id: 'event-a', organisation_id: profile.organisation_id, title: 'Church gathering', description: '',
    category_id: 'category-a', start_time: new Date(2026, 8, 23, 10).toISOString(),
    end_time: new Date(2026, 8, 23, 12).toISOString(), location: 'Main hall', team_id: null,
    is_recurring: false, recurrence_rule: null, recurrence_label: null, recurrence_end_date: null,
    created_by: profile.id, created_at: '', updated_at: '', ...overrides };
}

export function makeAnnouncement(overrides: Partial<Announcement> = {}): Announcement {
  return { id: 'notice-a', organisation_id: profile.organisation_id, team_id: null,
    title: 'Our community meal', body: 'Join us after the service this Sunday.', audience: 'church', pinned: false,
    image_url: null, linked_event_id: null, created_by: profile.id, created_at: '2026-09-20T10:00:00.000Z',
    updated_at: '2026-09-20T10:00:00.000Z', ...overrides };
}
