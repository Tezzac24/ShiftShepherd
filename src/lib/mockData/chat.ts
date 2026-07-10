/**
 * Mock team chat messages and simulated unread counts — demo mode only (live
 * Supabase sessions read/write the real chat tables). Demo chat stays
 * text-only and never calls Supabase Storage. The unread counts are a
 * demo-only simulation; live sessions use private chat_read_states rows.
 */
import { ChatMessage } from '../../types';
import { ORG_ID } from './people';

const hoursAgo = (h: number): string => new Date(Date.now() - h * 3600 * 1000).toISOString();

let n = 0;
const msg = (team_id: string, sender_id: string, body: string, hours: number): ChatMessage => ({
  id: `msg-${++n}`,
  organisation_id: ORG_ID,
  team_id,
  sender_id,
  body,
  created_at: hoursAgo(hours),
});

export const mockChatMessages: ChatMessage[] = [
  // Choir
  msg('team-choir', 'user-sarah', 'Hi everyone! Rehearsal this Saturday starts at 5pm, not 5:30 — see the announcement for details.', 30),
  msg('team-choir', 'user-hannah', 'Thanks Sarah, see you there!', 29),
  msg('team-choir', 'user-michael', 'I have picked most of the songs for the Sunday I am leading — will finish the list tonight.', 26),
  msg('team-choir', 'user-sarah', 'Wonderful. Remember you can attach them straight to the rota in the app.', 25),
  msg('team-choir', 'user-hannah', 'Could we run Total Praise one more time on Saturday? The harmonies in the bridge are still tricky.', 8),
  msg('team-choir', 'user-sarah', 'Good idea Hannah, we will make time for it.', 6),

  // Media
  msg('team-media', 'user-david', 'Rota for the next month is up — please confirm your availability when you get a chance.', 50),
  msg('team-media', 'user-joseph', 'Done. I might need to leave early this Sunday, added a note.', 48),
  msg('team-media', 'user-michael', 'New slides template is ready for Sunday. Looks much cleaner!', 20),
  msg('team-media', 'user-david', 'Great work Michael. Sound check at 9:00 sharp please, everyone.', 18),

  // Ushers
  msg('team-ushers', 'user-miriam', 'Reminder: doors open at 9:30 this Sunday. Please be at the front door by 9:15.', 40),
  msg('team-ushers', 'user-daniel', 'I will bring the new welcome leaflets.', 38),
  msg('team-ushers', 'user-joseph', 'Perfect, thank you both!', 36),

  // Youth Team
  msg('team-youth', 'user-joseph', 'Youth Fellowship next Friday — who can help with setup from 5:30?', 44),
  msg('team-youth', 'user-hannah', 'I can be there from 5:30. 👍', 42),
];

/** Simulated unread message counts per team (cleared when a chat is opened). */
export const mockUnreadByTeam: Record<string, number> = {
  'team-choir': 2,
  'team-media': 1,
  'team-ushers': 0,
  'team-youth': 0,
};
