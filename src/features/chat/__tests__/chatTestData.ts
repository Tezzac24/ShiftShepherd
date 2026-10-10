import { ChatMessage, SessionUser, Team, UserProfile } from '../../../types';

export const PROFILE: UserProfile = {
  id: 'profile-a', auth_user_id: 'auth-a', organisation_id: 'church-a', full_name: 'Alex Morgan',
  email: 'alex@example.test', phone: null, avatar_url: null, access_status: 'active',
  access_removed_at: null, access_removed_by: null, access_removal_reason: null, created_at: '',
};
export const TEAM: Team = {
  id: 'choir', organisation_id: PROFILE.organisation_id, name: 'Community Choir', type: 'choir',
  description: 'Singing together', avatar_url: null, archived_at: null, archived_by: null, created_at: '',
};
export const USER: SessionUser = { profile: PROFILE, orgRole: 'church_admin', memberships: [] };
export function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return { id: 'message-a', organisation_id: PROFILE.organisation_id, team_id: TEAM.id,
    sender_id: 'profile-b', body: 'Rehearsal starts at seven.', created_at: new Date(2026, 8, 22, 9).toISOString(), ...overrides };
}
export function makeData() {
  return {
    organisation: { id: PROFILE.organisation_id, name: 'Community Church' },
    teams: [TEAM], archivedTeams: [] as Team[], teamsLoading: false, teamsError: null as string | null,
    refreshTeams: jest.fn(), users: [PROFILE, { ...PROFILE, id: 'profile-b', full_name: 'Sam Williams' }],
    chatMessages: [message()], chatLive: true, chatLoading: false, chatError: null as string | null,
    chatRealtimeStatus: 'connected', unreadByTeam: { choir: 3 } as Record<string, number>,
    refreshChat: jest.fn().mockResolvedValue(undefined), refreshUnreadSummary: jest.fn(),
    markTeamChatRead: jest.fn(), registerActiveTeamChat: jest.fn(), unregisterActiveTeamChat: jest.fn(),
    getTeamAvatarUri: jest.fn(), getChatAttachmentUri: jest.fn(), sendChatMessage: jest.fn().mockResolvedValue(message()),
  };
}
export function makeAuth() {
  return { user: { ...USER }, authMode: 'supabase', accountStatus: 'ready', isLoading: false,
    accountContext: { account: { active_profile_id: PROFILE.id }, organisations: [
      { profile: PROFILE, organisation: { id: PROFILE.organisation_id, name: 'Community Church' } },
    ] } };
}
