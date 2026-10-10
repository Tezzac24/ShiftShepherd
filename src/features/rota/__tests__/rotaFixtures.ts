import type { useAppData } from '../../../lib/appData/AppDataContext';
import { RotaAssignment, RotaEntry, SessionUser, Team, TeamMembership, UserProfile } from '../../../types';

export const profile: UserProfile = {
  id: 'person-1', auth_user_id: 'account-1', organisation_id: 'church-1', full_name: 'Sarah Williams',
  email: 'sarah@example.test', phone: null, avatar_url: null, access_status: 'active', access_removed_at: null,
  access_removed_by: null, access_removal_reason: null, created_at: '',
};
export const singer: UserProfile = { ...profile, id: 'person-2', auth_user_id: 'account-2', full_name: 'Hannah Adeyemi', email: 'hannah@example.test' };
export const team: Team = { id: 'choir', organisation_id: 'church-1', name: 'Choir', description: '', type: 'choir', avatar_url: null, archived_at: null, archived_by: null, created_at: '' };
export const memberships: TeamMembership[] = [
  { id: 'member-1', team_id: team.id, user_id: profile.id, role: 'team_leader', created_at: '' },
  { id: 'member-2', team_id: team.id, user_id: singer.id, role: 'member', created_at: '' },
];
export const admin: SessionUser = { profile, orgRole: 'church_admin', memberships };
export const member: SessionUser = { profile, orgRole: 'general_member', memberships: [{ ...memberships[0], role: 'member' }] };
export const entry: RotaEntry = {
  id: 'date-1', team_id: team.id, organisation_id: 'church-1', title: 'Sunday morning service', date: '2026-11-01',
  time: '09:17', notes: 'Please arrive for warm-up.', status: 'active', cancelled_at: null, cancelled_by: null, cancellation_reason: null,
  created_by: singer.id, created_at: '', updated_at: '',
};
export const assignments: RotaAssignment[] = [
  { id: 'role-1', rota_entry_id: entry.id, user_id: profile.id, role_name: 'Praise Leader', created_at: '' },
  { id: 'role-2', rota_entry_id: entry.id, user_id: profile.id, role_name: 'Worship Leader', created_at: '' },
  { id: 'role-3', rota_entry_id: entry.id, user_id: singer.id, role_name: 'Choir Member', created_at: '' },
];

export function makeData(patch: Partial<ReturnType<typeof useAppData>> = {}): ReturnType<typeof useAppData> {
  return {
    teams: [team], archivedTeams: [], memberships, users: [profile, singer], rotaEntries: [entry], rotaAssignments: assignments,
    availabilityResponses: [], songs: [], songSelections: [], rotasLoading: false, rotasError: null, teamsLoading: false, teamsError: null,
    songsLoading: false, songsError: null, getAvatarUri: jest.fn(() => null), refreshRotas: jest.fn(), refreshTeams: jest.fn(), refreshSongs: jest.fn(),
    addRotaEntry: jest.fn(async () => entry), updateRotaEntry: jest.fn(async () => undefined), deleteRotaEntry: jest.fn(async () => undefined),
    cancelRotaEntry: jest.fn(async () => undefined), restoreRotaEntry: jest.fn(async () => undefined), setAvailability: jest.fn(async () => undefined),
    addRotaEntries: jest.fn(async () => ({ created: [], live: false, error: null })), ...patch,
  } as unknown as ReturnType<typeof useAppData>;
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
