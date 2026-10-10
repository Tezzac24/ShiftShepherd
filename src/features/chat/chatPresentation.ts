import { chatMessagePreview, messagesForTeam, userName, visibleTeams } from '../../lib/appData/selectors';
import { ChatMessage, SessionUser, Team, UserProfile } from '../../types';
import { formatTime, toDateKey } from '../../utils/dates';

/** Presentation only: active, accessible conversations in this church. */
export function chatConversations(user: SessionUser, teams: Team[], messages: ChatMessage[]) {
  const latest = new Map<string, ChatMessage>();
  for (const message of messages) {
    if (message.organisation_id !== user.profile.organisation_id) continue;
    const previous = latest.get(message.team_id);
    if (!previous || message.created_at > previous.created_at
      || (message.created_at === previous.created_at && message.id > previous.id)) {
      latest.set(message.team_id, message);
    }
  }
  return visibleTeams(user, teams.filter((team) => team.organisation_id === user.profile.organisation_id))
    .map((team) => ({ team, lastMessage: latest.get(team.id) }))
    .sort((a, b) => {
      if (a.lastMessage && !b.lastMessage) return -1;
      if (!a.lastMessage && b.lastMessage) return 1;
      const byDate = (b.lastMessage?.created_at ?? '').localeCompare(a.lastMessage?.created_at ?? '');
      return byDate || a.team.name.localeCompare(b.team.name, undefined, { sensitivity: 'base' })
        || a.team.id.localeCompare(b.team.id);
    });
}

export function conversationPreview(message: ChatMessage, profiles: UserProfile[], profileId: string) {
  const sender = message.sender_id === profileId ? 'You' : userName(profiles, message.sender_id);
  return `${sender}: ${chatMessagePreview(message).replace(/\s+/g, ' ')}`;
}

export function chatDayLabel(timestamp: string, now = new Date()) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  if (toDateKey(date) === toDateKey(now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (toDateKey(date) === toDateKey(yesterday)) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short',
    ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' as const } : {}),
  });
}

export function conversationTimestamp(timestamp: string, now = new Date()) {
  return toDateKey(new Date(timestamp)) === toDateKey(now) ? formatTime(timestamp) : chatDayLabel(timestamp, now);
}

/** Local calendar days add context without implying an unread-message boundary. */
export function chatTimeline(teamId: string, organisationId: string, messages: ChatMessage[], now = new Date()) {
  let previousDay: string | undefined;
  return messagesForTeam(teamId, messages.filter((message) => message.organisation_id === organisationId))
    .map((message) => {
      const day = toDateKey(new Date(message.created_at));
      const dayLabel = day !== previousDay ? chatDayLabel(message.created_at, now) : null;
      previousDay = day;
      return { message, dayLabel };
    });
}
