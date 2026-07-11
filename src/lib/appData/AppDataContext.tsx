/**
 * App data store for the scaffold.
 *
 * Holds every mutable collection in React state, seeded from mock data and
 * persisted to AsyncStorage so demo changes survive an app restart. The mock
 * seed files remain the reset source of truth. The Profile reset clears
 * persisted state and restores them. Invalid or outdated persisted data is
 * discarded safely (see lib/storage/persistence.ts).
 *
 * Actions mirror the calls a Supabase service layer would expose, so wiring
 * the real backend later means swapping implementations, not screens.
 *
 * ★ Announcements, events, the people/teams directory (organisation,
 * profiles, teams, team memberships plus narrow manager add/remove), rotas (entries, assignments,
 * availability responses), choir songs/song selections, and team chat are the
 * live Supabase slices: when the user is
 * signed in through Supabase Auth with a linked profile, those collections
 * and their actions run against the live database (RLS enforces permissions)
 * via src/lib/supabase/services/. In demo mode — or whenever Supabase env
 * vars are missing — they stay local/mock exactly as before. Live data is
 * session state only: it is never written to the demo AsyncStorage snapshot
 * and Reset Demo Data does not touch it.
 *
 * Chat is realtime for the open conversation and supports one optional live
 * image attachment. The screen subscribes to new-message INSERTs while
 * focused (see features/chat/useTeamChatRealtime), then performs a coalesced
 * joined refetch because realtime payloads do not include attachment rows.
 * Every path (send, realtime, refetch) merges by message id, so nothing
 * duplicates. Demo chat remains local and text-only.
 *
 * Unread tracking: in live mode unreadByTeam is computed from live messages
 * vs the user's private chat_read_states rows (messages from other people
 * newer than last_read_at; a team with no row yet counts only messages newer
 * than the session's first read-state load, so historic seed chat never
 * floods in as unread). Opening a team chat upserts that team's read state
 * (see markTeamChatRead). If read states can't load — e.g. the
 * chat_read_states migration isn't applied yet — unread badges simply hide;
 * chat keeps working. Demo mode keeps its original simulated, persisted
 * unread counts.
 *
 * Notification preferences are live too (one row per profile, upserted on
 * first change; a user with no row gets the all-on defaults client-side).
 * Push token registration is deferred — no expo-notifications, no EAS
 * project id, and Expo Go cannot receive remote pushes — and no push is
 * actually delivered yet either way (see src/lib/notifications/).
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';

import {
  Announcement,
  AvailabilityResponse,
  AvailabilityStatus,
  ChatMessage,
  ChoirSongSelection,
  Event,
  EventCategory,
  NotificationPreferences,
  Organisation,
  RotaAssignment,
  RotaEntry,
  Song,
  SongSection,
  Team,
  TeamMembership,
  UserProfile,
} from '../../types';
import { makeId } from '../../utils/ids';
import { useAuth } from '../auth/AuthContext';
import {
  defaultNotificationPreferences,
  mockAnnouncements,
  mockAvailabilityResponses,
  mockCategories,
  mockChatMessages,
  mockEvents,
  mockMemberships,
  mockOrganisation,
  mockRotaAssignments,
  mockRotaEntries,
  mockSongs,
  mockSongSelections,
  mockTeams,
  mockUnreadByTeam,
  mockUsers,
  ORG_ID,
} from '../mockData';
import { isChurchAdmin } from '../permissions';
import { clearPersisted, loadPersisted, savePersisted, STORAGE_KEYS } from '../storage/persistence';
import { isSupabaseConfigured } from '../supabase/client';
import * as announcementImagesService from '../supabase/services/announcementImages';
import * as announcementsService from '../supabase/services/announcements';
import * as chatService from '../supabase/services/chat';
import type { ChatRealtimeStatus } from '../supabase/services/chat';
import * as chatAttachmentsService from '../supabase/services/chatAttachments';
import * as chatReadStateService from '../supabase/services/chatReadState';
import { requestChatMessagePushDelivery } from '../supabase/services/pushDelivery';
import * as eventsService from '../supabase/services/events';
import * as notificationsService from '../supabase/services/notifications';
import * as profileAvatarsService from '../supabase/services/profileAvatars';
import * as profilesService from '../supabase/services/profiles';
import * as rotasService from '../supabase/services/rotas';
import * as songsService from '../supabase/services/songs';
import * as teamAvatarsService from '../supabase/services/teamAvatars';
import * as teamMembershipsService from '../supabase/services/teamMemberships';
import * as teamsService from '../supabase/services/teams';
import {
  applyIncomingMessage,
  clearTeamUnread,
  pruneUnread,
  unreadFromSummary,
  type UnreadByTeam,
} from './chatUnread';
import { SharedRefreshDomain } from './liveInvalidation';
import {
  membershipsForProfile,
  upsertMembership,
  withoutMembership,
} from './membershipState';
import { useSessionChatMessaging } from './useSessionChatMessaging';
import { useSharedLiveDataFreshness } from './useSharedLiveDataFreshness';

interface RefreshOptions {
  /** Keep existing content and user-visible loading/error state stable. */
  quiet?: boolean;
}

export interface NewRotaAssignmentInput {
  user_id: string;
  role_name: string;
}

/** Fields callers provide when creating a rota entry; status starts 'active'. */
export type NewRotaEntryInput = Omit<
  RotaEntry,
  | 'id'
  | 'organisation_id'
  | 'status'
  | 'cancelled_at'
  | 'cancelled_by'
  | 'cancellation_reason'
  | 'created_at'
  | 'updated_at'
>;

/** Everything mutable that is persisted between app launches. */
interface PersistedAppData {
  announcements: Announcement[];
  events: Event[];
  rotaEntries: RotaEntry[];
  rotaAssignments: RotaAssignment[];
  availabilityResponses: AvailabilityResponse[];
  songs: Song[];
  songSelections: ChoirSongSelection[];
  chatMessages: ChatMessage[];
  unreadByTeam: Record<string, number>;
  notificationPrefs: Record<string, NotificationPreferences>;
}

/** Cheap structural check so corrupt/partial persisted data never loads. */
function isPersistedAppData(data: unknown): data is PersistedAppData {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  const arrayKeys: (keyof PersistedAppData)[] = [
    'announcements',
    'events',
    'rotaEntries',
    'rotaAssignments',
    'availabilityResponses',
    'songs',
    'songSelections',
    'chatMessages',
  ];
  return (
    arrayKeys.every((k) => Array.isArray(d[k])) &&
    typeof d.unreadByTeam === 'object' &&
    d.unreadByTeam !== null &&
    typeof d.notificationPrefs === 'object' &&
    d.notificationPrefs !== null
  );
}

interface AppDataContextValue {
  /** False until persisted demo state has been restored (or fallen back). */
  isHydrated: boolean;

  // People & teams directory — reads plus narrow live membership management.
  // Live rows (real UUIDs) for linked Supabase sessions; mock data otherwise.
  // Event categories stay mock-only for now.
  organisation: Organisation;
  users: UserProfile[];
  teams: Team[];
  memberships: TeamMembership[];
  categories: EventCategory[];
  /** True when people/teams come from live Supabase rather than mock data. */
  teamsLive: boolean;
  /** True while the live directory is being (re)loaded. Always false in demo mode. */
  teamsLoading: boolean;
  /** Friendly load-failure message, or null. Always null in demo mode. */
  teamsError: string | null;
  /** Reload the live people/teams directory (no-op in demo mode). */
  refreshTeams: (options?: RefreshOptions) => Promise<void>;
  /** Add one existing linked organisation profile as an ordinary team member. */
  addTeamMember: (teamId: string, profileId: string) => Promise<void>;
  /** Remove one ordinary team membership after the screen confirms intent. */
  removeTeamMember: (teamId: string, profileId: string) => Promise<void>;
  /** Remove only the signed-in profile's membership in one team. */
  leaveTeam: (teamId: string) => Promise<void>;

  // Profile avatars — the first Supabase Storage slice. avatar_url holds a
  // private-bucket storage path in live mode, so display goes through
  // short-lived signed URLs cached here for the session. Demo mode never
  // touches Storage (mock avatar_url is a plain URL or null).
  /**
   * Resolve a profile's avatar image for display: a signed URL in live mode
   * (undefined while unsigned/unavailable — show initials instead), the
   * mock avatar_url passthrough in demo mode.
   */
  getAvatarUri: (profile: UserProfile | undefined | null) => string | undefined;
  /**
   * Upload or replace the signed-in user's own profile photo (live Supabase
   * sessions only). Rejects with a friendly message on failure; on success
   * the session user, directory, and signed-URL cache all update in place.
   */
  setOwnAvatar: (file: profileAvatarsService.PickedAvatarFile) => Promise<void>;
  /** Remove the signed-in user's own profile photo (live sessions only). */
  removeOwnAvatar: () => Promise<void>;
  /** Save the signed-in live user's safe self-owned profile fields. */
  updateOwnProfile: (input: profilesService.ProfileEditInput) => Promise<void>;

  // Team avatars use a separate private bucket and the same session-only
  // signed-URL lifecycle as profile avatars.
  getTeamAvatarUri: (team: Team | undefined | null) => string | undefined;
  setTeamAvatar: (
    teamId: string,
    file: teamAvatarsService.PickedTeamAvatarFile,
  ) => Promise<void>;
  removeTeamAvatar: (teamId: string) => Promise<void>;

  // Mutable collections
  announcements: Announcement[];
  events: Event[];
  rotaEntries: RotaEntry[];
  rotaAssignments: RotaAssignment[];
  availabilityResponses: AvailabilityResponse[];
  songs: Song[];
  songSelections: ChoirSongSelection[];
  chatMessages: ChatMessage[];
  /**
   * Unread message counts per team (own messages never count). Live mode
   * computes this from chat_read_states; demo mode keeps its simulated,
   * persisted counts. Empty whenever live read states are unavailable.
   */
  unreadByTeam: Record<string, number>;

  // Announcements — the first live Supabase slice. In demo mode the actions
  // resolve immediately against local state; in live mode they call Supabase
  // and reject with a friendly message when something goes wrong (screens
  // show it — nothing is changed locally on failure).
  /** True when announcements come from live Supabase rather than local demo data. */
  announcementsLive: boolean;
  /** True while live announcements are being (re)loaded. Always false in demo mode. */
  announcementsLoading: boolean;
  /** Friendly load-failure message, or null. Always null in demo mode. */
  announcementsError: string | null;
  /** Reload live announcements (no-op in demo mode). */
  refreshAnnouncements: (options?: RefreshOptions) => Promise<void>;
  addAnnouncement: (
    input: Omit<Announcement, 'id' | 'organisation_id' | 'created_at' | 'updated_at'>,
  ) => Promise<Announcement>;
  updateAnnouncement: (id: string, patch: Partial<Announcement>) => Promise<void>;
  deleteAnnouncement: (id: string) => Promise<void>;

  // Announcement images — the second Supabase Storage slice. image_url holds
  // a private-bucket storage path in live mode, so display goes through
  // short-lived signed URLs cached here for the session. Demo mode has no
  // announcement images and never touches Storage (the legacy mock
  // 'placeholder' marker renders nothing).
  /**
   * Resolve an announcement's image for display: a signed URL in live mode
   * (undefined while unsigned/unavailable — show no image instead);
   * undefined in demo mode.
   */
  getAnnouncementImageUri: (
    announcement: Announcement | undefined | null,
  ) => string | undefined;
  /**
   * Upload or replace an announcement's image (live Supabase sessions only;
   * storage policies + announcements RLS enforce that only that
   * announcement's editors can). On success the announcement row points at
   * the new image and the live list updates in place; rejects with a
   * friendly message on failure and changes nothing locally.
   */
  setAnnouncementImage: (
    announcementId: string,
    file: announcementImagesService.PickedAnnouncementImage,
  ) => Promise<void>;
  /** Remove an announcement's image (live sessions only). */
  removeAnnouncementImage: (announcementId: string) => Promise<void>;

  // Events — the second live Supabase slice, switching exactly like
  // announcements: live Supabase for linked Supabase sessions, local demo
  // data otherwise. Actions are async in both modes and reject with a
  // friendly message on live failures (nothing changes locally on failure).
  /** True when events come from live Supabase rather than local demo data. */
  eventsLive: boolean;
  /** True while live events are being (re)loaded. Always false in demo mode. */
  eventsLoading: boolean;
  /** Friendly load-failure message, or null. Always null in demo mode. */
  eventsError: string | null;
  /** Reload live events (no-op in demo mode). */
  refreshEvents: (options?: RefreshOptions) => Promise<void>;
  addEvent: (
    input: Omit<Event, 'id' | 'organisation_id' | 'created_at' | 'updated_at'>,
  ) => Promise<Event>;
  updateEvent: (id: string, patch: Partial<Event>) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;

  // Rotas — the fourth live Supabase slice, switching exactly like
  // announcements/events: live Supabase for linked Supabase sessions, local
  // demo data otherwise. Actions are async in both modes and reject with a
  // friendly message on live failures (nothing changes locally on failure).
  /** True when rotas come from live Supabase rather than local demo data. */
  rotasLive: boolean;
  /** True while live rotas are being (re)loaded. Always false in demo mode. */
  rotasLoading: boolean;
  /** Friendly load-failure message, or null. Always null in demo mode. */
  rotasError: string | null;
  /** Reload live rotas (no-op in demo mode). */
  refreshRotas: (options?: RefreshOptions) => Promise<void>;
  addRotaEntry: (
    input: NewRotaEntryInput,
    assignments: NewRotaAssignmentInput[],
  ) => Promise<RotaEntry>;
  updateRotaEntry: (
    id: string,
    patch: Partial<RotaEntry>,
    assignments?: NewRotaAssignmentInput[],
  ) => Promise<void>;
  deleteRotaEntry: (id: string) => Promise<void>;
  /** Marks an entry as cancelled (kept visible) rather than deleting it. */
  cancelRotaEntry: (id: string, cancelledBy: string, reason: string | null) => Promise<void>;
  /** Undoes a cancellation (e.g. after a mis-tap). */
  restoreRotaEntry: (id: string) => Promise<void>;
  setAvailability: (
    assignmentId: string,
    userId: string,
    status: AvailabilityStatus,
    note: string | null,
  ) => Promise<void>;

  // Songs - the fifth live Supabase slice, switching exactly like the earlier
  // slices: live Supabase for linked Supabase sessions, local demo data
  // otherwise. Live songs/selections are session-only and never persisted.
  /** True when choir songs come from live Supabase rather than local demo data. */
  songsLive: boolean;
  /** True while live songs and song selections are being (re)loaded. */
  songsLoading: boolean;
  /** Friendly load-failure message, or null. Always null in demo mode. */
  songsError: string | null;
  /** Reload live songs and song selections (no-op in demo mode). */
  refreshSongs: (options?: RefreshOptions) => Promise<void>;
  addSong: (
    input: Omit<Song, 'id' | 'organisation_id' | 'created_at' | 'updated_at'>,
  ) => Promise<Song>;
  updateSong: (id: string, patch: Partial<Song>) => Promise<void>;
  deleteSong: (id: string) => Promise<void>;

  // Choir song selection (replaces one section's selection for a rota date;
  // the other section's songs are left untouched)
  setSongSelections: (
    rotaEntryId: string,
    section: SongSection,
    songIds: string[],
    selectedBy: string,
  ) => Promise<void>;

  // Chat — the sixth live Supabase slice, switching exactly like the earlier
  // slices: live Supabase for linked Supabase sessions, local demo data
  // otherwise. In live mode ONE session-scoped Realtime channel (see
  // useSessionChatMessaging) streams every accessible message INSERT and the
  // caller's own read-state changes into central state, so previews, per-team
  // badges, and the Messages-tab badge stay fresh from anywhere in the app —
  // not only on the Messages screen. Every write path merges by row id so send
  // responses, realtime events, and refetches never duplicate. Live messages
  // are session-only, never persisted.
  /** True when chat messages come from live Supabase rather than local demo data. */
  chatLive: boolean;
  /** True while live chat messages are being (re)loaded. Always false in demo mode. */
  chatLoading: boolean;
  /** Friendly load-failure message, or null. Always null in demo mode. */
  chatError: string | null;
  /** Health of the session chat Realtime channel ('idle' in demo/logged-out). */
  chatRealtimeStatus: 'idle' | ChatRealtimeStatus;
  /** Reload live chat messages (no-op in demo mode). */
  refreshChat: () => Promise<void>;
  /** Quietly re-fetch the authoritative unread summary (no-op in demo mode). */
  refreshUnreadSummary: () => void;
  /** Signed private image URL in live mode; undefined for text/demo messages. */
  getChatAttachmentUri: (message: ChatMessage | undefined | null) => string | undefined;
  /** Async in both modes; optional images are accepted only in live mode. */
  sendChatMessage: (
    teamId: string,
    senderId: string,
    body: string,
    image?: chatAttachmentsService.PickedChatImage,
  ) => Promise<void>;
  /**
   * The open team chat tells the session messaging layer which conversation is
   * actively being viewed, so an incoming message for that team is marked read
   * instead of counted as unread. Call on focus / blur.
   */
  registerActiveTeamChat: (teamId: string) => void;
  unregisterActiveTeamChat: (teamId: string) => void;
  /**
   * Mark a team's chat read for the current user, up to the newest loaded
   * message. Fire-and-forget: live mode clears the badge optimistically and
   * advances the server read cursor via mark_team_chat_read in the background
   * (a failure is logged, never shown — the chat itself is unaffected), then
   * reconciles; demo mode clears the simulated count.
   */
  markTeamChatRead: (teamId: string) => void;

  // Notification preferences — the seventh live Supabase slice, switching
  // exactly like the earlier slices: live Supabase for linked Supabase
  // sessions, local demo data otherwise. One row per profile; a user who has
  // never saved has no row and gets the all-on defaults client-side (the row
  // is only created — upserted — on their first change). Live preferences are
  // session-only, never persisted to AsyncStorage.
  /** True when notification preferences come from live Supabase rather than local demo data. */
  notificationPrefsLive: boolean;
  /** True while live notification preferences are being (re)loaded. Always false in demo mode. */
  notificationPrefsLoading: boolean;
  /** Friendly load-failure message, or null. Always null in demo mode. */
  notificationPrefsError: string | null;
  /** Reload live notification preferences (no-op in demo mode). */
  refreshNotificationPrefs: () => Promise<void>;
  getNotificationPreferences: (userId: string) => NotificationPreferences;
  /** Async in both modes; rejects with a friendly message on live failures. */
  updateNotificationPreferences: (
    userId: string,
    patch: Partial<NotificationPreferences>,
  ) => Promise<void>;

  /** Restores the original mock seed data and clears persisted demo changes. */
  resetDemoData: () => Promise<void>;
}

const AppDataContext = createContext<AppDataContextValue | undefined>(undefined);

/**
 * Dedupe-merge live chat messages by row id (incoming rows win) into
 * (created_at, id) order. Chat rows are immutable and never deleted in V1, so
 * refetches merge instead of replacing the list — a realtime insert that
 * lands while a refetch is in flight can never be dropped, and the same row
 * arriving via send response, realtime, and refetch appears exactly once.
 */
function mergeChatMessages(prev: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  if (incoming.length === 0) return prev;
  const byId = new Map<string, ChatMessage>();
  for (const message of prev) byId.set(message.id, message);
  for (const message of incoming) {
    const existing = byId.get(message.id);
    // Realtime carries only chat_messages columns. Preserve attachment
    // metadata already learned from send/refetch until a canonical joined
    // refetch replaces it; this also prevents the sender's own realtime event
    // from briefly removing the image they just sent.
    byId.set(message.id, {
      ...message,
      attachment: message.attachment ?? existing?.attachment ?? null,
    });
  }
  return [...byId.values()].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
}

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  // Live-vs-local mode for the wired slices:
  // Supabase session + configured client + linked profile ⇒ live; demo mode
  // or missing env vars ⇒ local/mock.
  const {
    user,
    authMode,
    applySessionAvatarUrl,
    applySessionProfile,
    applySessionDirectorySnapshot,
  } = useAuth();
  const supabaseProfileId =
    authMode === 'supabase' ? (user?.supabaseProfileId ?? null) : null;
  const liveDataEnabled = isSupabaseConfigured && supabaseProfileId !== null;
  const announcementsLive = liveDataEnabled;
  const eventsLive = liveDataEnabled;
  const teamsLive = liveDataEnabled;
  const rotasLive = liveDataEnabled;
  const songsLive = liveDataEnabled;
  const chatLive = liveDataEnabled;
  const notificationPrefsLive = liveDataEnabled;

  const [localAnnouncements, setLocalAnnouncements] =
    useState<Announcement[]>(mockAnnouncements);
  const [liveAnnouncements, setLiveAnnouncements] = useState<Announcement[]>([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(false);
  const [announcementsError, setAnnouncementsError] = useState<string | null>(null);
  // Ref so the image actions (stable callbacks) read the current live list.
  const liveAnnouncementsRef = useRef<Announcement[]>([]);
  liveAnnouncementsRef.current = liveAnnouncements;
  // Signed display URLs for live announcement image paths (private bucket).
  // Session-only: cleared when live announcements clear, refreshed on app
  // foreground — the same lifecycle as the avatar cache below.
  const [announcementImageSignedUrls, setAnnouncementImageSignedUrls] = useState<
    Record<string, string>
  >({});
  const announcementImageSignedUrlsRef = useRef<Record<string, string>>({});
  announcementImageSignedUrlsRef.current = announcementImageSignedUrls;
  const announcementImagesSignedAtRef = useRef(0);
  // Lets in-flight fetches notice the mode flipped (e.g. sign-out mid-load).
  const liveDataEnabledRef = useRef(false);
  liveDataEnabledRef.current = liveDataEnabled;
  const supabaseProfileIdRef = useRef<string | null>(null);
  supabaseProfileIdRef.current = supabaseProfileId;
  const queueSharedRefreshRef = useRef<
    (domains: Iterable<SharedRefreshDomain>) => void
  >(() => {});
  const [localEvents, setLocalEvents] = useState<Event[]>(mockEvents);
  const [liveEvents, setLiveEvents] = useState<Event[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [liveDirectory, setLiveDirectory] = useState<teamsService.TeamsDirectory | null>(null);
  const liveDirectoryRef = useRef<teamsService.TeamsDirectory | null>(null);
  liveDirectoryRef.current = liveDirectory;
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  // Signed display URLs for live avatar paths (private bucket). Session-only:
  // cleared with the directory on sign-out, refreshed on app foreground.
  const [avatarSignedUrls, setAvatarSignedUrls] = useState<Record<string, string>>({});
  const avatarSignedUrlsRef = useRef<Record<string, string>>({});
  avatarSignedUrlsRef.current = avatarSignedUrls;
  const avatarsSignedAtRef = useRef(0);
  const [teamAvatarSignedUrls, setTeamAvatarSignedUrls] = useState<Record<string, string>>({});
  const teamAvatarSignedUrlsRef = useRef<Record<string, string>>({});
  teamAvatarSignedUrlsRef.current = teamAvatarSignedUrls;
  const teamAvatarsSignedAtRef = useRef(0);
  const [localRotaEntries, setLocalRotaEntries] = useState<RotaEntry[]>(mockRotaEntries);
  const [localRotaAssignments, setLocalRotaAssignments] =
    useState<RotaAssignment[]>(mockRotaAssignments);
  const [localAvailabilityResponses, setLocalAvailabilityResponses] = useState<
    AvailabilityResponse[]
  >(mockAvailabilityResponses);
  const [liveRota, setLiveRota] = useState<rotasService.RotaData | null>(null);
  const [rotasLoading, setRotasLoading] = useState(false);
  const [rotasError, setRotasError] = useState<string | null>(null);
  const [localSongs, setLocalSongs] = useState<Song[]>(mockSongs);
  const [localSongSelections, setLocalSongSelections] =
    useState<ChoirSongSelection[]>(mockSongSelections);
  const [liveSongsData, setLiveSongsData] = useState<songsService.SongsData | null>(null);
  const [songsLoading, setSongsLoading] = useState(false);
  const [songsError, setSongsError] = useState<string | null>(null);
  const [localChatMessages, setLocalChatMessages] = useState<ChatMessage[]>(mockChatMessages);
  const [liveChatMessages, setLiveChatMessages] = useState<ChatMessage[]>([]);
  const [chatAttachmentSignedUrls, setChatAttachmentSignedUrls] = useState<
    Record<string, string>
  >({});
  const chatAttachmentSignedUrlsRef = useRef<Record<string, string>>({});
  chatAttachmentSignedUrlsRef.current = chatAttachmentSignedUrls;
  const chatAttachmentsSignedAtRef = useRef(0);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [unreadByTeam, setUnreadByTeam] = useState<Record<string, number>>(mockUnreadByTeam);
  // Canonical live per-team unread map: authoritative from the server unread
  // summary (get_team_chat_unread_summary), with bounded Realtime deltas
  // between reconciliations. Sparse — a team with zero unread has no key.
  const [liveUnreadByTeam, setLiveUnreadByTeam] = useState<UnreadByTeam>({});
  // Health of the one session chat Realtime channel; 'idle' when not live.
  const [chatRealtimeStatus, setChatRealtimeStatus] =
    useState<'idle' | ChatRealtimeStatus>('idle');
  // Refs so stable callbacks (mark-read, incoming-message handling) read
  // current chat state without re-subscribing.
  const liveChatMessagesRef = useRef<ChatMessage[]>([]);
  liveChatMessagesRef.current = liveChatMessages;
  const liveUnreadByTeamRef = useRef<UnreadByTeam>({});
  liveUnreadByTeamRef.current = liveUnreadByTeam;
  // The team chat currently open and focused (or null). An incoming message for
  // this team while the app is active is marked read, not counted as unread.
  const activeTeamChatRef = useRef<string | null>(null);
  // Newest message id already marked read per team, so repeated focus/latest
  // recomputation never fires a redundant mark-read RPC.
  const lastMarkedMessageByTeamRef = useRef<Record<string, string>>({});
  // Coalesces the attachment catch-up refetch for the active team.
  const activeTeamRefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [notificationPrefs, setNotificationPrefs] = useState<
    Record<string, NotificationPreferences>
  >({});
  // Null in live mode means "no saved row yet" — the getter falls back to the
  // all-on defaults without creating one.
  const [liveNotificationPrefs, setLiveNotificationPrefs] =
    useState<NotificationPreferences | null>(null);
  const [notificationPrefsLoading, setNotificationPrefsLoading] = useState(false);
  const [notificationPrefsError, setNotificationPrefsError] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  // Restore persisted demo changes once at startup. Anything invalid, stale,
  // or from an older persistence version simply leaves the mock seeds in place.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const persisted = await loadPersisted<PersistedAppData>(
        STORAGE_KEYS.appData,
        isPersistedAppData,
      );
      if (persisted && !cancelled) {
        setLocalAnnouncements(persisted.announcements);
        setLocalEvents(persisted.events);
        setLocalRotaEntries(persisted.rotaEntries);
        setLocalRotaAssignments(persisted.rotaAssignments);
        setLocalAvailabilityResponses(persisted.availabilityResponses);
        setLocalSongs(persisted.songs);
        setLocalSongSelections(persisted.songSelections);
        setLocalChatMessages(persisted.chatMessages);
        setUnreadByTeam(persisted.unreadByTeam);
        setNotificationPrefs(persisted.notificationPrefs);
      }
      if (!cancelled) setIsHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist demo changes (debounced) after hydration.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isHydrated) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const snapshot: PersistedAppData = {
      announcements: localAnnouncements,
      events: localEvents,
      rotaEntries: localRotaEntries,
      rotaAssignments: localRotaAssignments,
      availabilityResponses: localAvailabilityResponses,
      songs: localSongs,
      songSelections: localSongSelections,
      chatMessages: localChatMessages,
      unreadByTeam,
      notificationPrefs,
    };
    saveTimer.current = setTimeout(() => {
      savePersisted(STORAGE_KEYS.appData, snapshot);
    }, 400);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [
    isHydrated,
    localAnnouncements,
    localEvents,
    localRotaEntries,
    localRotaAssignments,
    localAvailabilityResponses,
    localSongs,
    localSongSelections,
    localChatMessages,
    unreadByTeam,
    notificationPrefs,
  ]);

  const resetDemoData = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await clearPersisted(STORAGE_KEYS.appData);
    setLocalAnnouncements(mockAnnouncements);
    setLocalEvents(mockEvents);
    setLocalRotaEntries(mockRotaEntries);
    setLocalRotaAssignments(mockRotaAssignments);
    setLocalAvailabilityResponses(mockAvailabilityResponses);
    setLocalSongs(mockSongs);
    setLocalSongSelections(mockSongSelections);
    setLocalChatMessages(mockChatMessages);
    setUnreadByTeam(mockUnreadByTeam);
    setNotificationPrefs({});
  }, []);

  const now = () => new Date().toISOString();

  // --- Announcements (live Supabase slice ★, with local demo fallback) --------

  const refreshAnnouncements: AppDataContextValue['refreshAnnouncements'] =
    useCallback(async (options) => {
      const requestProfileId = supabaseProfileIdRef.current;
      if (!liveDataEnabledRef.current || !requestProfileId) return;
      if (!options?.quiet) {
        setAnnouncementsLoading(true);
        setAnnouncementsError(null);
      }
      try {
        const list = await announcementsService.listAnnouncements();
        if (
          liveDataEnabledRef.current &&
          supabaseProfileIdRef.current === requestProfileId
        ) {
          setLiveAnnouncements(list);
        }
      } catch (error) {
        if (
          liveDataEnabledRef.current &&
          supabaseProfileIdRef.current === requestProfileId
        ) {
          if (!options?.quiet) setAnnouncementsError(
            error instanceof Error
              ? error.message
              : 'We couldn’t load announcements right now. Please try again.',
          );
        }
      } finally {
        if (
          liveDataEnabledRef.current &&
          supabaseProfileIdRef.current === requestProfileId
        ) {
          if (!options?.quiet) setAnnouncementsLoading(false);
        }
      }
    }, []);

  // Load live announcements when a Supabase session appears; clear them (and
  // any load error) when it goes away. Local demo data is untouched either way.
  useEffect(() => {
    if (announcementsLive) {
      void refreshAnnouncements();
    } else {
      setLiveAnnouncements([]);
      setAnnouncementsError(null);
      setAnnouncementsLoading(false);
    }
  }, [announcementsLive, refreshAnnouncements]);

  // After a live mutation succeeds, quietly re-sync the list in the background
  // (no loading flicker; a failed re-sync keeps the optimistically-applied
  // server row, so nothing is lost).
  const resyncLiveAnnouncements = useCallback(() => {
    queueSharedRefreshRef.current(['announcements']);
  }, []);

  const addAnnouncement: AppDataContextValue['addAnnouncement'] = useCallback(
    async (input) => {
      if (announcementsLive && supabaseProfileId) {
        const created = await announcementsService.createAnnouncement(
          input,
          supabaseProfileId,
        );
        setLiveAnnouncements((prev) => [created, ...prev]);
        resyncLiveAnnouncements();
        return created;
      }
      const record: Announcement = {
        ...input,
        id: makeId('ann'),
        organisation_id: ORG_ID,
        created_at: now(),
        updated_at: now(),
      };
      setLocalAnnouncements((prev) => [record, ...prev]);
      return record;
    },
    [announcementsLive, supabaseProfileId, resyncLiveAnnouncements],
  );

  const updateAnnouncement: AppDataContextValue['updateAnnouncement'] = useCallback(
    async (id, patch) => {
      if (announcementsLive) {
        const updated = await announcementsService.updateAnnouncement(id, patch);
        setLiveAnnouncements((prev) => prev.map((a) => (a.id === id ? updated : a)));
        resyncLiveAnnouncements();
        return;
      }
      setLocalAnnouncements((prev) =>
        prev.map((a) => (a.id === id ? { ...a, ...patch, updated_at: now() } : a)),
      );
    },
    [announcementsLive, resyncLiveAnnouncements],
  );

  const deleteAnnouncement: AppDataContextValue['deleteAnnouncement'] = useCallback(
    async (id) => {
      if (announcementsLive) {
        const imagePath = liveAnnouncementsRef.current.find((a) => a.id === id)?.image_url ?? null;
        await announcementsService.deleteAnnouncement(id);
        // Best-effort: the row is already gone, so a failed object delete
        // only leaves an invisible orphan (see the images service).
        if (announcementImagesService.isAnnouncementImagePath(imagePath)) {
          void announcementImagesService.deleteAnnouncementImageObject(imagePath);
        }
        setLiveAnnouncements((prev) => prev.filter((a) => a.id !== id));
        resyncLiveAnnouncements();
        return;
      }
      setLocalAnnouncements((prev) => prev.filter((a) => a.id !== id));
    },
    [announcementsLive, resyncLiveAnnouncements],
  );

  // --- Announcement images (second Supabase Storage slice ★) -------------------

  // Every announcement image path visible this session (live announcements
  // whose image_url is a real storage path — legacy values sign nothing).
  const liveAnnouncementImagePaths = useMemo<string[]>(() => {
    if (!announcementsLive) return [];
    const paths = new Set<string>();
    for (const announcement of liveAnnouncements) {
      if (announcementImagesService.isAnnouncementImagePath(announcement.image_url)) {
        paths.add(announcement.image_url);
      }
    }
    return [...paths].sort();
  }, [announcementsLive, liveAnnouncements]);
  const liveAnnouncementImagePathsRef = useRef<string[]>([]);
  liveAnnouncementImagePathsRef.current = liveAnnouncementImagePaths;

  // Sign whichever paths have no display URL yet. Failures just leave the
  // image hidden — signing is display-only and never an error.
  useEffect(() => {
    if (liveAnnouncementImagePaths.length === 0) {
      announcementImagesSignedAtRef.current = 0;
      setAnnouncementImageSignedUrls((prev) => (Object.keys(prev).length > 0 ? {} : prev));
      return;
    }
    const missing = liveAnnouncementImagePaths.filter(
      (path) => !announcementImageSignedUrlsRef.current[path],
    );
    if (missing.length === 0) return;
    let cancelled = false;
    void announcementImagesService
      .createAnnouncementImageSignedUrls(missing)
      .then((signed) => {
        if (cancelled || !signed || !liveDataEnabledRef.current) return;
        announcementImagesSignedAtRef.current = Date.now();
        setAnnouncementImageSignedUrls((prev) => ({ ...prev, ...signed }));
      });
    return () => {
      cancelled = true;
    };
  }, [liveAnnouncementImagePaths]);

  // Signed URLs expire (1 hour TTL): re-sign everything when the app returns
  // to the foreground past half that lifetime, so images survive long sessions.
  useEffect(() => {
    if (!liveDataEnabled) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const paths = liveAnnouncementImagePathsRef.current;
      const halfLifeMs =
        (announcementImagesService.ANNOUNCEMENT_IMAGE_SIGNED_URL_TTL_SECONDS * 1000) / 2;
      if (paths.length === 0 || Date.now() - announcementImagesSignedAtRef.current < halfLifeMs) {
        return;
      }
      void announcementImagesService.createAnnouncementImageSignedUrls(paths).then((signed) => {
        if (!signed || !liveDataEnabledRef.current) return;
        announcementImagesSignedAtRef.current = Date.now();
        setAnnouncementImageSignedUrls((prev) => ({ ...prev, ...signed }));
      });
    });
    return () => subscription.remove();
  }, [liveDataEnabled]);

  const getAnnouncementImageUri: AppDataContextValue['getAnnouncementImageUri'] = useCallback(
    (announcement) => {
      const path = announcement?.image_url;
      if (!path) return undefined;
      if (liveDataEnabled) {
        return announcementImagesService.isAnnouncementImagePath(path)
          ? announcementImageSignedUrls[path]
          : undefined;
      }
      // Demo/mock announcements have no real images; the legacy 'placeholder'
      // marker (and any other non-URL value) simply renders nothing.
      return /^https?:\/\//.test(path) ? path : undefined;
    },
    [liveDataEnabled, announcementImageSignedUrls],
  );

  const setAnnouncementImage: AppDataContextValue['setAnnouncementImage'] = useCallback(
    async (announcementId, file) => {
      if (!announcementsLive || !supabaseProfileId) {
        // The UI only offers image management in live mode; keep a calm
        // message anyway in case that ever regresses.
        throw new Error(
          'Announcement images are available when signed in with your church account.',
        );
      }
      const currentPath =
        liveAnnouncementsRef.current.find((a) => a.id === announcementId)?.image_url ?? null;
      const updated = await announcementImagesService.uploadAnnouncementImage(
        announcementId,
        file,
        announcementImagesService.isAnnouncementImagePath(currentPath) ? currentPath : null,
      );
      // The path-sign effect above signs the new path for display.
      setLiveAnnouncements((prev) => prev.map((a) => (a.id === announcementId ? updated : a)));
      resyncLiveAnnouncements();
    },
    [announcementsLive, supabaseProfileId, resyncLiveAnnouncements],
  );

  const removeAnnouncementImage: AppDataContextValue['removeAnnouncementImage'] = useCallback(
    async (announcementId) => {
      if (!announcementsLive || !supabaseProfileId) {
        throw new Error(
          'Announcement images are available when signed in with your church account.',
        );
      }
      const currentPath =
        liveAnnouncementsRef.current.find((a) => a.id === announcementId)?.image_url ?? null;
      const updated = await announcementImagesService.removeAnnouncementImage(
        announcementId,
        announcementImagesService.isAnnouncementImagePath(currentPath) ? currentPath : null,
      );
      setLiveAnnouncements((prev) => prev.map((a) => (a.id === announcementId ? updated : a)));
      resyncLiveAnnouncements();
    },
    [announcementsLive, supabaseProfileId, resyncLiveAnnouncements],
  );

  // --- Events (live Supabase slice ★, with local demo fallback) ---------------

  const refreshEvents: AppDataContextValue['refreshEvents'] = useCallback(async (options) => {
    const requestProfileId = supabaseProfileIdRef.current;
    if (!liveDataEnabledRef.current || !requestProfileId) return;
    if (!options?.quiet) {
      setEventsLoading(true);
      setEventsError(null);
    }
    try {
      const list = await eventsService.listEvents();
      if (
        liveDataEnabledRef.current &&
        supabaseProfileIdRef.current === requestProfileId
      ) {
        setLiveEvents(list);
      }
    } catch (error) {
      if (
        liveDataEnabledRef.current &&
        supabaseProfileIdRef.current === requestProfileId
      ) {
        if (!options?.quiet) setEventsError(
          error instanceof Error
            ? error.message
            : 'We couldn’t load events right now. Please try again.',
        );
      }
    } finally {
      if (
        liveDataEnabledRef.current &&
        supabaseProfileIdRef.current === requestProfileId
      ) {
        if (!options?.quiet) setEventsLoading(false);
      }
    }
  }, []);

  // Load live events when a Supabase session appears; clear them (and any
  // load error) when it goes away. Local demo data is untouched either way.
  useEffect(() => {
    if (eventsLive) {
      void refreshEvents();
    } else {
      setLiveEvents([]);
      setEventsError(null);
      setEventsLoading(false);
    }
  }, [eventsLive, refreshEvents]);

  // After a live mutation succeeds, quietly re-sync the list in the background
  // (no loading flicker; a failed re-sync keeps the optimistically-applied
  // server row, so nothing is lost).
  const resyncLiveEvents = useCallback(() => {
    queueSharedRefreshRef.current(['events']);
  }, []);

  const addEvent: AppDataContextValue['addEvent'] = useCallback(
    async (input) => {
      if (eventsLive && supabaseProfileId) {
        const created = await eventsService.createEvent(input, supabaseProfileId);
        setLiveEvents((prev) => [...prev, created]);
        resyncLiveEvents();
        return created;
      }
      const record: Event = {
        ...input,
        id: makeId('event'),
        organisation_id: ORG_ID,
        created_at: now(),
        updated_at: now(),
      };
      setLocalEvents((prev) => [...prev, record]);
      return record;
    },
    [eventsLive, supabaseProfileId, resyncLiveEvents],
  );

  const updateEvent: AppDataContextValue['updateEvent'] = useCallback(
    async (id, patch) => {
      if (eventsLive) {
        const updated = await eventsService.updateEvent(id, patch);
        setLiveEvents((prev) => prev.map((e) => (e.id === id ? updated : e)));
        resyncLiveEvents();
        return;
      }
      setLocalEvents((prev) =>
        prev.map((e) => (e.id === id ? { ...e, ...patch, updated_at: now() } : e)),
      );
    },
    [eventsLive, resyncLiveEvents],
  );

  const deleteEvent: AppDataContextValue['deleteEvent'] = useCallback(
    async (id) => {
      if (eventsLive) {
        await eventsService.deleteEvent(id);
        setLiveEvents((prev) => prev.filter((e) => e.id !== id));
        resyncLiveEvents();
        return;
      }
      setLocalEvents((prev) => prev.filter((e) => e.id !== id));
    },
    [eventsLive, resyncLiveEvents],
  );

  // --- People & teams directory + membership management (live slice ★) -------

  const commitLiveDirectory = useCallback(
    (directory: teamsService.TeamsDirectory, profileId: string) => {
      if (!liveDataEnabledRef.current || supabaseProfileIdRef.current !== profileId) return;
      liveDirectoryRef.current = directory;
      setLiveDirectory(directory);
      applySessionDirectorySnapshot(profileId, {
        profile: directory.users.find((profile) => profile.id === profileId),
        orgRole: directory.currentOrgRole,
        memberships: membershipsForProfile(directory.memberships, profileId),
      });
    },
    [applySessionDirectorySnapshot],
  );

  const refreshTeams: AppDataContextValue['refreshTeams'] = useCallback(async (options) => {
    const requestProfileId = supabaseProfileIdRef.current;
    if (!liveDataEnabledRef.current || !requestProfileId) return;
    if (!options?.quiet) {
      setTeamsLoading(true);
      setTeamsError(null);
    }
    try {
      const directory = await teamsService.fetchTeamsDirectory(requestProfileId);
      if (
        liveDataEnabledRef.current &&
        supabaseProfileIdRef.current === requestProfileId
      ) {
        commitLiveDirectory(directory, requestProfileId);
      }
    } catch (error) {
      if (
        liveDataEnabledRef.current &&
        supabaseProfileIdRef.current === requestProfileId
      ) {
        if (!options?.quiet) setTeamsError(
          error instanceof Error
            ? error.message
            : 'We couldn’t load your teams right now. Please try again.',
        );
      }
    } finally {
      if (
        liveDataEnabledRef.current &&
        supabaseProfileIdRef.current === requestProfileId
      ) {
        if (!options?.quiet) setTeamsLoading(false);
      }
    }
  }, [commitLiveDirectory]);

  const commitMemberships = useCallback(
    (memberships: TeamMembership[]) => {
      const directory = liveDirectoryRef.current;
      if (!directory) return;
      const nextDirectory = { ...directory, memberships };
      liveDirectoryRef.current = nextDirectory;
      setLiveDirectory(nextDirectory);
      const profileId = supabaseProfileIdRef.current;
      if (profileId) {
        applySessionDirectorySnapshot(profileId, {
          profile: nextDirectory.users.find((profile) => profile.id === profileId),
          orgRole: nextDirectory.currentOrgRole,
          memberships: membershipsForProfile(memberships, profileId),
        });
      }
    },
    [applySessionDirectorySnapshot],
  );

  const applyLiveMembership = useCallback(
    (membership: TeamMembership) => {
      const current = liveDirectoryRef.current?.memberships;
      if (current) commitMemberships(upsertMembership(current, membership));
    },
    [commitMemberships],
  );

  const addTeamMember: AppDataContextValue['addTeamMember'] = useCallback(
    async (teamId, profileId) => {
      const requestProfileId = supabaseProfileIdRef.current;
      if (!liveDataEnabled || !requestProfileId) {
        throw new Error(teamMembershipsService.TEAM_MEMBERSHIP_DEMO_ERROR);
      }
      const membership = await teamMembershipsService.addTeamMember({ teamId, profileId });
      if (
        !liveDataEnabledRef.current ||
        supabaseProfileIdRef.current !== requestProfileId
      ) {
        return;
      }
      applyLiveMembership(membership);
      queueSharedRefreshRef.current(['directory']);
    },
    [liveDataEnabled, applyLiveMembership],
  );

  const removeTeamMember: AppDataContextValue['removeTeamMember'] = useCallback(
    async (teamId, profileId) => {
      const requestProfileId = supabaseProfileIdRef.current;
      if (!liveDataEnabled || !requestProfileId) {
        throw new Error(teamMembershipsService.TEAM_MEMBERSHIP_DEMO_ERROR);
      }
      const removed = await teamMembershipsService.removeTeamMember({ teamId, profileId });
      if (
        !liveDataEnabledRef.current ||
        supabaseProfileIdRef.current !== requestProfileId
      ) {
        return;
      }
      const current = liveDirectoryRef.current?.memberships;
      if (current) commitMemberships(withoutMembership(current, removed));
      queueSharedRefreshRef.current(['directory']);
    },
    [liveDataEnabled, commitMemberships],
  );

  const leaveTeam: AppDataContextValue['leaveTeam'] = useCallback(
    async (teamId) => {
      const requestProfileId = supabaseProfileIdRef.current;
      if (!liveDataEnabled || !requestProfileId) {
        throw new Error(teamMembershipsService.TEAM_MEMBERSHIP_DEMO_ERROR);
      }
      const removed = await teamMembershipsService.leaveTeam({ teamId });
      if (!liveDataEnabledRef.current || supabaseProfileIdRef.current !== requestProfileId) {
        return;
      }
      const current = liveDirectoryRef.current?.memberships;
      if (current) commitMemberships(withoutMembership(current, removed));
      queueSharedRefreshRef.current(['directory']);
    },
    [liveDataEnabled, commitMemberships],
  );

  // Load the live directory when a Supabase session appears; clear it (and
  // any load error) when it goes away. Mock data is untouched either way.
  useEffect(() => {
    if (teamsLive) {
      void refreshTeams();
    } else {
      setLiveDirectory(null);
      setTeamsError(null);
      setTeamsLoading(false);
    }
  }, [teamsLive, refreshTeams]);

  // --- Profile avatars (first Supabase Storage slice ★) ------------------------

  // Every avatar path visible this session: the live directory's profiles
  // plus the session user's own (kept in step immediately after an upload,
  // before any directory reload).
  const liveAvatarPaths = useMemo<string[]>(() => {
    if (!teamsLive) return [];
    const paths = new Set<string>();
    for (const person of liveDirectory?.users ?? []) {
      if (person.avatar_url) paths.add(person.avatar_url);
    }
    const own = authMode === 'supabase' ? user?.profile.avatar_url : null;
    if (own) paths.add(own);
    return [...paths].sort();
  }, [teamsLive, liveDirectory, authMode, user]);
  const liveAvatarPathsRef = useRef<string[]>([]);
  liveAvatarPathsRef.current = liveAvatarPaths;

  // Sign whichever paths have no display URL yet. Failures just leave the
  // initials fallback in place — signing is display-only and never an error.
  useEffect(() => {
    if (liveAvatarPaths.length === 0) {
      avatarsSignedAtRef.current = 0;
      setAvatarSignedUrls((prev) => (Object.keys(prev).length > 0 ? {} : prev));
      return;
    }
    const missing = liveAvatarPaths.filter((path) => !avatarSignedUrlsRef.current[path]);
    if (missing.length === 0) return;
    let cancelled = false;
    void profileAvatarsService.createAvatarSignedUrls(missing).then((signed) => {
      if (cancelled || !signed || !liveDataEnabledRef.current) return;
      avatarsSignedAtRef.current = Date.now();
      setAvatarSignedUrls((prev) => ({ ...prev, ...signed }));
    });
    return () => {
      cancelled = true;
    };
  }, [liveAvatarPaths]);

  // Signed URLs expire (1 hour TTL): re-sign everything when the app returns
  // to the foreground past half that lifetime, so photos survive long sessions.
  useEffect(() => {
    if (!liveDataEnabled) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const paths = liveAvatarPathsRef.current;
      const halfLifeMs = (profileAvatarsService.AVATAR_SIGNED_URL_TTL_SECONDS * 1000) / 2;
      if (paths.length === 0 || Date.now() - avatarsSignedAtRef.current < halfLifeMs) return;
      void profileAvatarsService.createAvatarSignedUrls(paths).then((signed) => {
        if (!signed || !liveDataEnabledRef.current) return;
        avatarsSignedAtRef.current = Date.now();
        setAvatarSignedUrls((prev) => ({ ...prev, ...signed }));
      });
    });
    return () => subscription.remove();
  }, [liveDataEnabled]);

  const getAvatarUri: AppDataContextValue['getAvatarUri'] = useCallback(
    (profile) => {
      const path = profile?.avatar_url;
      if (!path) return undefined;
      if (liveDataEnabled) return avatarSignedUrls[path];
      // Demo/mock data only ever carries a plain URL (currently always null).
      return /^https?:\/\//.test(path) ? path : undefined;
    },
    [liveDataEnabled, avatarSignedUrls],
  );

  // Keep the live directory's profile copy in step with self edits so every
  // screen updates without a full (flickering) reload.
  const patchLiveDirectoryProfile = useCallback(
    (
      profileId: string,
      patch: Partial<Pick<UserProfile, 'full_name' | 'phone' | 'avatar_url'>>,
    ) => {
      setLiveDirectory((prev) =>
        prev
          ? {
              ...prev,
              users: prev.users.map((person) =>
                person.id === profileId ? { ...person, ...patch } : person,
              ),
            }
          : prev,
      );
    },
    [],
  );

  const setOwnAvatar: AppDataContextValue['setOwnAvatar'] = useCallback(
    async (file) => {
      if (!liveDataEnabled || !supabaseProfileId) {
        // The UI only offers photo management in live mode; keep a calm
        // message anyway in case that ever regresses.
        throw new Error('Profile photos are available when signed in with your church account.');
      }
      const previousPath = user?.profile.avatar_url ?? null;
      const newPath = await profileAvatarsService.uploadOwnProfileAvatar(
        file,
        supabaseProfileId,
        previousPath,
      );
      // The path-set effect above signs the new path for display.
      applySessionAvatarUrl(newPath);
      patchLiveDirectoryProfile(supabaseProfileId, { avatar_url: newPath });
    },
    [liveDataEnabled, supabaseProfileId, user, applySessionAvatarUrl, patchLiveDirectoryProfile],
  );

  const removeOwnAvatar: AppDataContextValue['removeOwnAvatar'] = useCallback(async () => {
    if (!liveDataEnabled || !supabaseProfileId) {
      throw new Error('Profile photos are available when signed in with your church account.');
    }
    const currentPath = user?.profile.avatar_url ?? null;
    await profileAvatarsService.removeOwnProfileAvatar(supabaseProfileId, currentPath);
    applySessionAvatarUrl(null);
    patchLiveDirectoryProfile(supabaseProfileId, { avatar_url: null });
  }, [liveDataEnabled, supabaseProfileId, user, applySessionAvatarUrl, patchLiveDirectoryProfile]);

  const updateOwnProfile: AppDataContextValue['updateOwnProfile'] = useCallback(
    async (input) => {
      if (!liveDataEnabled || !supabaseProfileId) {
        throw new Error('Profile editing is available with your church account.');
      }
      const updated = await profilesService.updateOwnProfile(supabaseProfileId, input);
      const patch = { full_name: updated.full_name, phone: updated.phone };
      applySessionProfile(patch);
      patchLiveDirectoryProfile(supabaseProfileId, patch);
    },
    [liveDataEnabled, supabaseProfileId, applySessionProfile, patchLiveDirectoryProfile],
  );

  // --- Team avatars (private Storage, leaders/admins manage) -------------------

  const liveTeamAvatarPaths = useMemo<string[]>(() => {
    if (!teamsLive) return [];
    return [
      ...new Set(
        (liveDirectory?.teams ?? []).flatMap((team) =>
          team.avatar_url ? [team.avatar_url] : [],
        ),
      ),
    ].sort();
  }, [teamsLive, liveDirectory]);
  const liveTeamAvatarPathsRef = useRef<string[]>([]);
  liveTeamAvatarPathsRef.current = liveTeamAvatarPaths;

  useEffect(() => {
    if (liveTeamAvatarPaths.length === 0) {
      teamAvatarsSignedAtRef.current = 0;
      setTeamAvatarSignedUrls((prev) => (Object.keys(prev).length > 0 ? {} : prev));
      return;
    }
    const missing = liveTeamAvatarPaths.filter(
      (path) => !teamAvatarSignedUrlsRef.current[path],
    );
    if (missing.length === 0) return;
    let cancelled = false;
    void teamAvatarsService.createTeamAvatarSignedUrls(missing).then((signed) => {
      if (cancelled || !signed || !liveDataEnabledRef.current) return;
      teamAvatarsSignedAtRef.current = Date.now();
      setTeamAvatarSignedUrls((prev) => ({ ...prev, ...signed }));
    });
    return () => {
      cancelled = true;
    };
  }, [liveTeamAvatarPaths]);

  useEffect(() => {
    if (!liveDataEnabled) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const paths = liveTeamAvatarPathsRef.current;
      const halfLifeMs =
        (teamAvatarsService.TEAM_AVATAR_SIGNED_URL_TTL_SECONDS * 1000) / 2;
      if (
        paths.length === 0 ||
        Date.now() - teamAvatarsSignedAtRef.current < halfLifeMs
      ) {
        return;
      }
      void teamAvatarsService.createTeamAvatarSignedUrls(paths).then((signed) => {
        if (!signed || !liveDataEnabledRef.current) return;
        teamAvatarsSignedAtRef.current = Date.now();
        setTeamAvatarSignedUrls((prev) => ({ ...prev, ...signed }));
      });
    });
    return () => subscription.remove();
  }, [liveDataEnabled]);

  const getTeamAvatarUri: AppDataContextValue['getTeamAvatarUri'] = useCallback(
    (team) => {
      const path = team?.avatar_url;
      if (!path) return undefined;
      if (liveDataEnabled) return teamAvatarSignedUrls[path];
      return /^https?:\/\//.test(path) ? path : undefined;
    },
    [liveDataEnabled, teamAvatarSignedUrls],
  );

  const patchLiveTeamAvatar = useCallback((teamId: string, avatarPath: string | null) => {
    setLiveDirectory((prev) =>
      prev
        ? {
            ...prev,
            teams: prev.teams.map((team) =>
              team.id === teamId ? { ...team, avatar_url: avatarPath } : team,
            ),
          }
        : prev,
    );
  }, []);

  const setTeamAvatar: AppDataContextValue['setTeamAvatar'] = useCallback(
    async (teamId, file) => {
      if (!liveDataEnabled || teamId.startsWith('team-')) {
        throw new Error('Team photos are available with your church account.');
      }
      const team = liveDirectoryRef.current?.teams.find((candidate) => candidate.id === teamId);
      if (!team) throw new Error("We couldn't find that team right now.");
      const newPath = await teamAvatarsService.uploadTeamAvatar(
        teamId,
        team.avatar_url,
        file,
      );
      patchLiveTeamAvatar(teamId, newPath);
    },
    [liveDataEnabled, patchLiveTeamAvatar],
  );

  const removeTeamAvatar: AppDataContextValue['removeTeamAvatar'] = useCallback(
    async (teamId) => {
      if (!liveDataEnabled || teamId.startsWith('team-')) {
        throw new Error('Team photos are available with your church account.');
      }
      const team = liveDirectoryRef.current?.teams.find((candidate) => candidate.id === teamId);
      if (!team) throw new Error("We couldn't find that team right now.");
      await teamAvatarsService.removeTeamAvatar(teamId, team.avatar_url);
      patchLiveTeamAvatar(teamId, null);
    },
    [liveDataEnabled, patchLiveTeamAvatar],
  );

  // --- Rotas (live Supabase slice ★, with local demo fallback) -----------------

  const refreshRotas: AppDataContextValue['refreshRotas'] = useCallback(async (options) => {
    const requestProfileId = supabaseProfileIdRef.current;
    if (!liveDataEnabledRef.current || !requestProfileId) return;
    if (!options?.quiet) {
      setRotasLoading(true);
      setRotasError(null);
    }
    try {
      const rotaData = await rotasService.fetchRotaData();
      if (
        liveDataEnabledRef.current &&
        supabaseProfileIdRef.current === requestProfileId
      ) {
        setLiveRota(rotaData);
      }
    } catch (error) {
      if (
        liveDataEnabledRef.current &&
        supabaseProfileIdRef.current === requestProfileId
      ) {
        if (!options?.quiet) setRotasError(
          error instanceof Error
            ? error.message
            : 'We couldn’t load the rota right now. Please try again.',
        );
      }
    } finally {
      if (
        liveDataEnabledRef.current &&
        supabaseProfileIdRef.current === requestProfileId
      ) {
        if (!options?.quiet) setRotasLoading(false);
      }
    }
  }, []);

  // Load live rotas when a Supabase session appears; clear them (and any
  // load error) when it goes away. Local demo data is untouched either way.
  useEffect(() => {
    if (rotasLive) {
      void refreshRotas();
    } else {
      setLiveRota(null);
      setRotasError(null);
      setRotasLoading(false);
    }
  }, [rotasLive, refreshRotas]);

  // After a live mutation succeeds, quietly re-sync in the background (no
  // loading flicker; a failed re-sync keeps the optimistically-applied
  // server rows, so nothing is lost). This is also what heals the rare
  // partial assignment replace (see rotas service).
  const resyncLiveRotas = useCallback(() => {
    queueSharedRefreshRef.current(['rotas']);
  }, []);

  const addRotaEntry: AppDataContextValue['addRotaEntry'] = useCallback(
    async (input, assignments) => {
      if (rotasLive && supabaseProfileId) {
        const created = await rotasService.createRotaEntry(
          input,
          assignments,
          supabaseProfileId,
        );
        setLiveRota((prev) =>
          prev
            ? {
                ...prev,
                entries: [...prev.entries, created.entry],
                assignments: [...prev.assignments, ...created.assignments],
              }
            : { entries: [created.entry], assignments: created.assignments, responses: [] },
        );
        resyncLiveRotas();
        return created.entry;
      }
      const record: RotaEntry = {
        ...input,
        id: makeId('rota'),
        organisation_id: ORG_ID,
        status: 'active',
        cancelled_at: null,
        cancelled_by: null,
        cancellation_reason: null,
        created_at: now(),
        updated_at: now(),
      };
      setLocalRotaEntries((prev) => [...prev, record]);
      setLocalRotaAssignments((prev) => [
        ...prev,
        ...assignments.map((a) => ({
          id: makeId('ra'),
          rota_entry_id: record.id,
          user_id: a.user_id,
          role_name: a.role_name,
          created_at: now(),
        })),
      ]);
      return record;
    },
    [rotasLive, supabaseProfileId, resyncLiveRotas],
  );

  const updateRotaEntry: AppDataContextValue['updateRotaEntry'] = useCallback(
    async (id, patch, assignments) => {
      if (rotasLive) {
        const saved = await rotasService.updateRotaEntry(id, patch, assignments);
        setLiveRota((prev) => {
          if (!prev) return prev;
          const keptIds = new Set(saved.assignments.map((a) => a.id));
          return {
            entries: prev.entries.map((e) => (e.id === id ? saved.entry : e)),
            assignments: [
              ...prev.assignments.filter((a) => a.rota_entry_id !== id),
              ...saved.assignments,
            ],
            // Responses for removed assignments cascade away server-side.
            responses: prev.responses.filter(
              (r) =>
                keptIds.has(r.rota_assignment_id) ||
                !prev.assignments.some(
                  (a) => a.id === r.rota_assignment_id && a.rota_entry_id === id,
                ),
            ),
          };
        });
        resyncLiveRotas();
        return;
      }
      setLocalRotaEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, ...patch, updated_at: now() } : e)),
      );
      if (assignments) {
        // Replace the assignment list; keep ids stable where person+role match
        setLocalRotaAssignments((prev) => {
          const existing = prev.filter((a) => a.rota_entry_id === id);
          const others = prev.filter((a) => a.rota_entry_id !== id);
          const next = assignments.map((a) => {
            const match = existing.find(
              (x) => x.user_id === a.user_id && x.role_name === a.role_name,
            );
            return (
              match ?? {
                id: makeId('ra'),
                rota_entry_id: id,
                user_id: a.user_id,
                role_name: a.role_name,
                created_at: now(),
              }
            );
          });
          const keptIds = new Set(next.map((a) => a.id));
          // Clean up availability responses for removed assignments
          setLocalAvailabilityResponses((responses) =>
            responses.filter(
              (r) =>
                keptIds.has(r.rota_assignment_id) ||
                !existing.some((x) => x.id === r.rota_assignment_id),
            ),
          );
          return [...others, ...next];
        });
      }
    },
    [rotasLive, resyncLiveRotas],
  );

  const deleteRotaEntry: AppDataContextValue['deleteRotaEntry'] = useCallback(
    async (id) => {
      if (rotasLive) {
        await rotasService.deleteRotaEntry(id);
        setLiveRota((prev) => {
          if (!prev) return prev;
          const removed = new Set(
            prev.assignments.filter((a) => a.rota_entry_id === id).map((a) => a.id),
          );
          return {
            entries: prev.entries.filter((e) => e.id !== id),
            assignments: prev.assignments.filter((a) => a.rota_entry_id !== id),
            responses: prev.responses.filter((r) => !removed.has(r.rota_assignment_id)),
          };
        });
        // The database cascades live song selections; keep session state in step.
        setLiveSongsData((prev) =>
          prev
            ? {
                ...prev,
                selections: prev.selections.filter((s) => s.rota_entry_id !== id),
              }
            : prev,
        );
        resyncLiveRotas();
        return;
      }
      setLocalRotaEntries((prev) => prev.filter((e) => e.id !== id));
      setLocalRotaAssignments((prev) => {
        const removed = new Set(
          prev.filter((a) => a.rota_entry_id === id).map((a) => a.id),
        );
        setLocalAvailabilityResponses((responses) =>
          responses.filter((r) => !removed.has(r.rota_assignment_id)),
        );
        return prev.filter((a) => a.rota_entry_id !== id);
      });
      setLocalSongSelections((prev) => prev.filter((s) => s.rota_entry_id !== id));
    },
    [rotasLive, resyncLiveRotas],
  );

  const cancelRotaEntry: AppDataContextValue['cancelRotaEntry'] = useCallback(
    async (id, cancelledBy, reason) => {
      if (rotasLive && supabaseProfileId) {
        const cancelled = await rotasService.cancelRotaEntry(id, supabaseProfileId, reason);
        setLiveRota((prev) =>
          prev
            ? { ...prev, entries: prev.entries.map((e) => (e.id === id ? cancelled : e)) }
            : prev,
        );
        resyncLiveRotas();
        return;
      }
      setLocalRotaEntries((prev) =>
        prev.map((e) =>
          e.id === id
            ? {
                ...e,
                status: 'cancelled',
                cancelled_at: now(),
                cancelled_by: cancelledBy,
                cancellation_reason: reason,
                updated_at: now(),
              }
            : e,
        ),
      );
    },
    [rotasLive, supabaseProfileId, resyncLiveRotas],
  );

  const restoreRotaEntry: AppDataContextValue['restoreRotaEntry'] = useCallback(
    async (id) => {
      if (rotasLive) {
        const restored = await rotasService.restoreRotaEntry(id);
        setLiveRota((prev) =>
          prev
            ? { ...prev, entries: prev.entries.map((e) => (e.id === id ? restored : e)) }
            : prev,
        );
        resyncLiveRotas();
        return;
      }
      setLocalRotaEntries((prev) =>
        prev.map((e) =>
          e.id === id
            ? {
                ...e,
                status: 'active',
                cancelled_at: null,
                cancelled_by: null,
                cancellation_reason: null,
                updated_at: now(),
              }
            : e,
        ),
      );
    },
    [rotasLive, resyncLiveRotas],
  );

  const setAvailability: AppDataContextValue['setAvailability'] = useCallback(
    async (assignmentId, userId, status, note) => {
      if (rotasLive && supabaseProfileId) {
        const saved = await rotasService.submitAvailability(
          assignmentId,
          supabaseProfileId,
          status,
          note,
        );
        setLiveRota((prev) =>
          prev
            ? {
                ...prev,
                responses: [
                  ...prev.responses.filter((r) => r.rota_assignment_id !== assignmentId),
                  saved,
                ],
              }
            : prev,
        );
        resyncLiveRotas();
        return;
      }
      setLocalAvailabilityResponses((prev) => {
        const existing = prev.find((r) => r.rota_assignment_id === assignmentId);
        if (existing) {
          return prev.map((r) =>
            r.rota_assignment_id === assignmentId
              ? { ...r, status, note, updated_at: now() }
              : r,
          );
        }
        return [
          ...prev,
          {
            id: makeId('av'),
            rota_assignment_id: assignmentId,
            user_id: userId,
            status,
            note,
            updated_at: now(),
          },
        ];
      });
    },
    [rotasLive, supabaseProfileId, resyncLiveRotas],
  );

  // --- Songs (live Supabase slice, with local demo fallback) ------------------

  const refreshSongs: AppDataContextValue['refreshSongs'] = useCallback(async (options) => {
    const requestProfileId = supabaseProfileIdRef.current;
    if (!liveDataEnabledRef.current || !requestProfileId) return;
    if (!options?.quiet) {
      setSongsLoading(true);
      setSongsError(null);
    }
    try {
      const songsData = await songsService.fetchSongsData();
      if (
        liveDataEnabledRef.current &&
        supabaseProfileIdRef.current === requestProfileId
      ) {
        setLiveSongsData(songsData);
      }
    } catch (error) {
      if (
        liveDataEnabledRef.current &&
        supabaseProfileIdRef.current === requestProfileId
      ) {
        if (!options?.quiet) setSongsError(
          error instanceof Error
            ? error.message
            : "We couldn't load songs right now. Please try again.",
        );
      }
    } finally {
      if (
        liveDataEnabledRef.current &&
        supabaseProfileIdRef.current === requestProfileId
      ) {
        if (!options?.quiet) setSongsLoading(false);
      }
    }
  }, []);

  // Load live songs/selections when a Supabase session appears; clear them
  // when it goes away. Local demo data is untouched either way.
  useEffect(() => {
    if (songsLive) {
      void refreshSongs();
    } else {
      setLiveSongsData(null);
      setSongsError(null);
      setSongsLoading(false);
    }
  }, [songsLive, refreshSongs]);

  const resyncLiveSongs = useCallback(() => {
    queueSharedRefreshRef.current(['songs']);
  }, []);

  const addSong: AppDataContextValue['addSong'] = useCallback(
    async (input) => {
      if (songsLive && supabaseProfileId) {
        const created = await songsService.createSong(input, supabaseProfileId);
        setLiveSongsData((prev) =>
          prev
            ? {
                ...prev,
                songs: [...prev.songs, created].sort((a, b) =>
                  a.title.localeCompare(b.title),
                ),
              }
            : { songs: [created], selections: [] },
        );
        resyncLiveSongs();
        return created;
      }

      const id = makeId('song');
      const record: Song = {
        ...input,
        id,
        organisation_id: ORG_ID,
        links: input.links.map((link) => ({ ...link, song_id: id })),
        created_at: now(),
        updated_at: now(),
      };
      setLocalSongs((prev) =>
        [...prev, record].sort((a, b) => a.title.localeCompare(b.title)),
      );
      return record;
    },
    [songsLive, supabaseProfileId, resyncLiveSongs],
  );

  const updateSong: AppDataContextValue['updateSong'] = useCallback(
    async (id, patch) => {
      if (songsLive) {
        const updated = await songsService.updateSong(id, patch);
        setLiveSongsData((prev) =>
          prev
            ? {
                ...prev,
                songs: prev.songs
                  .map((s) => (s.id === id ? updated : s))
                  .sort((a, b) => a.title.localeCompare(b.title)),
              }
            : prev,
        );
        resyncLiveSongs();
        return;
      }

      const localPatch = { ...patch };
      if (localPatch.links) {
        localPatch.links = localPatch.links.map((link) => ({ ...link, song_id: id }));
      }
      setLocalSongs((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...localPatch, updated_at: now() } : s)),
      );
    },
    [songsLive, resyncLiveSongs],
  );

  const deleteSong: AppDataContextValue['deleteSong'] = useCallback(
    async (id) => {
      if (songsLive) {
        await songsService.deleteSong(id);
        setLiveSongsData((prev) =>
          prev
            ? {
                songs: prev.songs.filter((s) => s.id !== id),
                selections: prev.selections.filter((s) => s.song_id !== id),
              }
            : prev,
        );
        resyncLiveSongs();
        return;
      }
      setLocalSongs((prev) => prev.filter((s) => s.id !== id));
      setLocalSongSelections((prev) => prev.filter((s) => s.song_id !== id));
    },
    [songsLive, resyncLiveSongs],
  );

  // --- Choir song selection ----------------------------------------------------

  const setSongSelections: AppDataContextValue['setSongSelections'] = useCallback(
    async (rotaEntryId, section, songIds, selectedBy) => {
      if (songsLive && supabaseProfileId) {
        const saved = await songsService.replaceSongSelections(
          rotaEntryId,
          section,
          songIds,
          supabaseProfileId,
        );
        setLiveSongsData((prev) =>
          prev
            ? {
                ...prev,
                selections: [
                  ...prev.selections.filter(
                    (s) => s.rota_entry_id !== rotaEntryId || s.section !== section,
                  ),
                  ...saved,
                ],
              }
            : { songs: [], selections: saved },
        );
        resyncLiveSongs();
        return;
      }

      setLocalSongSelections((prev) => [
        ...prev.filter((s) => s.rota_entry_id !== rotaEntryId || s.section !== section),
        ...songIds.map((songId, i) => ({
          id: makeId('sel'),
          rota_entry_id: rotaEntryId,
          song_id: songId,
          section,
          selected_by: selectedBy,
          order_index: i,
          notes: null,
        })),
      ]);
    },
    [songsLive, supabaseProfileId, resyncLiveSongs],
  );

  // --- Chat (live Supabase slice ★, with local demo fallback) ------------------

  const liveChatAttachmentPaths = useMemo<string[]>(() => {
    if (!chatLive) return [];
    const paths = new Set<string>();
    for (const message of liveChatMessages) {
      const path = message.attachment?.file_url;
      if (chatAttachmentsService.isChatAttachmentPath(path)) paths.add(path);
    }
    return [...paths].sort();
  }, [chatLive, liveChatMessages]);
  const liveChatAttachmentPathsRef = useRef<string[]>([]);
  liveChatAttachmentPathsRef.current = liveChatAttachmentPaths;

  // Sign new private attachment paths for display. A signing failure leaves a
  // calm photo fallback; message text and the rest of chat remain readable.
  useEffect(() => {
    if (liveChatAttachmentPaths.length === 0) {
      chatAttachmentsSignedAtRef.current = 0;
      setChatAttachmentSignedUrls((prev) => (Object.keys(prev).length > 0 ? {} : prev));
      return;
    }
    const missing = liveChatAttachmentPaths.filter(
      (path) => !chatAttachmentSignedUrlsRef.current[path],
    );
    if (missing.length === 0) return;
    let cancelled = false;
    void chatAttachmentsService.createChatAttachmentSignedUrls(missing).then((signed) => {
      if (cancelled || !signed || !liveDataEnabledRef.current) return;
      chatAttachmentsSignedAtRef.current = Date.now();
      setChatAttachmentSignedUrls((prev) => ({ ...prev, ...signed }));
    });
    return () => {
      cancelled = true;
    };
  }, [liveChatAttachmentPaths]);

  // Re-sign on foreground past half the one-hour TTL so long-running chats do
  // not keep expired URLs. Focus/reconnect message refetch remains separate.
  useEffect(() => {
    if (!liveDataEnabled) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const paths = liveChatAttachmentPathsRef.current;
      const halfLifeMs =
        (chatAttachmentsService.CHAT_ATTACHMENT_SIGNED_URL_TTL_SECONDS * 1000) / 2;
      if (
        paths.length === 0 ||
        Date.now() - chatAttachmentsSignedAtRef.current < halfLifeMs
      ) {
        return;
      }
      void chatAttachmentsService.createChatAttachmentSignedUrls(paths).then((signed) => {
        if (!signed || !liveDataEnabledRef.current) return;
        chatAttachmentsSignedAtRef.current = Date.now();
        setChatAttachmentSignedUrls((prev) => ({ ...prev, ...signed }));
      });
    });
    return () => subscription.remove();
  }, [liveDataEnabled]);

  const getChatAttachmentUri: AppDataContextValue['getChatAttachmentUri'] = useCallback(
    (message) => {
      if (!chatLive) return undefined;
      const path = message?.attachment?.file_url;
      return chatAttachmentsService.isChatAttachmentPath(path)
        ? chatAttachmentSignedUrls[path]
        : undefined;
    },
    [chatLive, chatAttachmentSignedUrls],
  );

  const refreshChat: AppDataContextValue['refreshChat'] = useCallback(async () => {
    const requestProfileId = supabaseProfileIdRef.current;
    if (!liveDataEnabledRef.current || !requestProfileId) return;
    setChatLoading(true);
    setChatError(null);
    try {
      const list = await chatService.listChatMessages();
      if (
        liveDataEnabledRef.current &&
        supabaseProfileIdRef.current === requestProfileId
      ) {
        setLiveChatMessages((prev) => mergeChatMessages(prev, list));
      }
    } catch (error) {
      if (
        liveDataEnabledRef.current &&
        supabaseProfileIdRef.current === requestProfileId
      ) {
        setChatError(
          error instanceof Error
            ? error.message
            : "We couldn't load messages right now. Please try again.",
        );
      }
    } finally {
      if (
        liveDataEnabledRef.current &&
        supabaseProfileIdRef.current === requestProfileId
      ) {
        setChatLoading(false);
      }
    }
  }, []);

  // Authoritative unread reconciliation: fetch the server unread summary and
  // replace the live per-team map (pruning teams no longer accessible, adding
  // newly accessible ones). Runs quietly — badges/content stay rendered until
  // the replacement arrives, and an "unavailable" summary (client missing,
  // migration not applied, or a load failure) leaves the current map untouched.
  // A session/profile guard stops a late response updating a new account.
  const reconcileUnreadSummary = useCallback(async () => {
    const requestProfileId = supabaseProfileIdRef.current;
    if (!liveDataEnabledRef.current || !requestProfileId) return;
    const entries = await chatReadStateService.fetchTeamChatUnreadSummary();
    if (
      !liveDataEnabledRef.current ||
      supabaseProfileIdRef.current !== requestProfileId ||
      entries === null
    ) {
      return;
    }
    // The actively-viewed team stays cleared (the reader is looking at it).
    const activeTeam =
      AppState.currentState === 'active' ? activeTeamChatRef.current : null;
    setLiveUnreadByTeam(unreadFromSummary(entries, activeTeam));
  }, []);

  // Merge one message into chat state (dedupe by row id). Used by the session
  // channel and the send path; safe for the same row to arrive twice.
  const applyLiveChatMessage = useCallback((message: ChatMessage) => {
    if (!liveDataEnabledRef.current) return;
    setLiveChatMessages((prev) => mergeChatMessages(prev, [message]));
  }, []);

  // chat_messages Realtime payloads never include attachment metadata. When a
  // message lands for the team currently being viewed, coalesce a short-delayed
  // canonical refetch so an image committed in the same transaction appears.
  const scheduleActiveTeamAttachmentRefetch = useCallback(() => {
    if (activeTeamRefetchTimerRef.current) {
      clearTimeout(activeTeamRefetchTimerRef.current);
    }
    activeTeamRefetchTimerRef.current = setTimeout(() => {
      activeTeamRefetchTimerRef.current = null;
      if (liveDataEnabledRef.current && activeTeamChatRef.current) void refreshChat();
    }, 250);
  }, [refreshChat]);

  // A message arrived on the session channel. Always merge it (fast preview
  // update). Then, for a genuinely new message from someone else in a team the
  // user is NOT actively viewing, bump that team's unread immediately; the
  // authoritative summary reconciles afterwards. The actively-viewed team is
  // never incremented — the open screen advances the read cursor instead.
  const handleIncomingChatMessage = useCallback(
    (message: ChatMessage) => {
      if (!liveDataEnabledRef.current) return;
      const knownIds = new Set(liveChatMessagesRef.current.map((m) => m.id));
      const isNew = !knownIds.has(message.id);
      applyLiveChatMessage(message);
      if (!isNew) return;
      const activeTeam =
        AppState.currentState === 'active' ? activeTeamChatRef.current : null;
      if (message.team_id === activeTeam) scheduleActiveTeamAttachmentRefetch();
      setLiveUnreadByTeam((prev) =>
        applyIncomingMessage(prev, {
          message,
          knownMessageIds: knownIds,
          selfProfileId: supabaseProfileIdRef.current,
          activeTeamId: activeTeam,
        }),
      );
    },
    [applyLiveChatMessage, scheduleActiveTeamAttachmentRefetch],
  );

  // One session-scoped messaging lifecycle: the chat channel + AppState
  // foreground catch-up + the coalescing unread reconciliation scheduler. Only
  // runs for a linked live session; torn down (no stale callbacks) on
  // logout/account switch.
  const { reconcileNow } = useSessionChatMessaging({
    enabled: liveDataEnabled,
    profileId: supabaseProfileId,
    onIncomingMessage: handleIncomingChatMessage,
    reconcile: reconcileUnreadSummary,
    onStatus: setChatRealtimeStatus,
  });
  const reconcileNowRef = useRef(reconcileNow);
  reconcileNowRef.current = reconcileNow;

  const refreshUnreadSummary = useCallback(() => {
    reconcileNowRef.current();
  }, []);

  const registerActiveTeamChat = useCallback((teamId: string) => {
    activeTeamChatRef.current = teamId;
  }, []);

  const unregisterActiveTeamChat = useCallback((teamId: string) => {
    if (activeTeamChatRef.current === teamId) activeTeamChatRef.current = null;
  }, []);

  // Load messages when a live session appears, and reset all chat state when it
  // goes away so nothing leaks across a user switch. The unread summary loads
  // via the session messaging lifecycle above; the channel keeps it fresh.
  useEffect(() => {
    if (chatLive) {
      void refreshChat();
    } else {
      setLiveChatMessages([]);
      setChatError(null);
      setChatLoading(false);
      setLiveUnreadByTeam({});
      setChatRealtimeStatus('idle');
      activeTeamChatRef.current = null;
      lastMarkedMessageByTeamRef.current = {};
      if (activeTeamRefetchTimerRef.current) {
        clearTimeout(activeTeamRefetchTimerRef.current);
        activeTeamRefetchTimerRef.current = null;
      }
    }
  }, [chatLive, refreshChat]);

  // After a live send succeeds, quietly re-sync in the background so messages
  // other people sent since the last load appear even when realtime is down.
  const resyncLiveChat = useCallback(() => {
    const requestProfileId = supabaseProfileIdRef.current;
    if (!requestProfileId) return;
    chatService
      .listChatMessages()
      .then((list) => {
        if (
          liveDataEnabledRef.current &&
          supabaseProfileIdRef.current === requestProfileId
        ) {
          setLiveChatMessages((prev) => mergeChatMessages(prev, list));
        }
      })
      .catch((error) => console.warn('[appData] chat re-sync failed', error));
  }, []);

  const sendChatMessage: AppDataContextValue['sendChatMessage'] = useCallback(
    async (teamId, senderId, body, image) => {
      if (chatLive && supabaseProfileId) {
        // RLS only accepts the caller's own profile as sender.
        const sent = image
          ? await chatAttachmentsService.sendChatImageMessage(
              teamId,
              body,
              supabaseProfileId,
              image,
            )
          : await chatService.sendChatMessage(teamId, body, supabaseProfileId);
        setLiveChatMessages((prev) => mergeChatMessages(prev, [sent]));
        // Best-effort push to the other team members — only ever from this
        // send-success path (never from realtime arrivals or refetches, which
        // would ask again for every receiver). Fire-and-forget by design.
        requestChatMessagePushDelivery(sent.id);
        resyncLiveChat();
        return;
      }
      if (image) {
        // Demo UI hides the image action; keep this guard so local mode can
        // never call Storage even if a future screen accidentally passes one.
        throw new Error('Chat images are available when signed in with your church account.');
      }
      setLocalChatMessages((prev) => [
        ...prev,
        {
          id: makeId('msg'),
          organisation_id: ORG_ID,
          team_id: teamId,
          sender_id: senderId,
          body,
          created_at: now(),
          attachment: null,
        },
      ]);
    },
    [chatLive, supabaseProfileId, resyncLiveChat],
  );

  const markTeamChatRead = useCallback((teamId: string) => {
    if (liveDataEnabledRef.current) {
      const profileId = supabaseProfileIdRef.current;
      // Nothing to record for mock ids.
      if (!profileId || teamId.startsWith('team-')) return;
      // Clear the badge optimistically whether or not there is a message to
      // point at (an empty chat still shouldn't show a stale count).
      setLiveUnreadByTeam((prev) => clearTeamUnread(prev, teamId));
      const teamMessages = liveChatMessagesRef.current.filter((m) => m.team_id === teamId);
      const latest = teamMessages[teamMessages.length - 1];
      if (!latest) return;
      // Never re-issue the mark for a cursor already sent this session.
      if (lastMarkedMessageByTeamRef.current[teamId] === latest.id) return;
      lastMarkedMessageByTeamRef.current[teamId] = latest.id;
      // Advance the server read cursor (forward-only, idempotent). A failure is
      // logged, never shown — reading is unaffected — and the guard is cleared
      // so a later focus can retry. On success reconcile authoritatively.
      chatReadStateService
        .markTeamChatRead({ teamId, messageId: latest.id })
        .then(() => {
          if (
            liveDataEnabledRef.current &&
            supabaseProfileIdRef.current === profileId
          ) {
            reconcileNowRef.current();
          }
        })
        .catch((error) => {
          console.warn('[appData] mark chat read failed', {
            code: (error as { code?: string })?.code,
          });
          if (lastMarkedMessageByTeamRef.current[teamId] === latest.id) {
            delete lastMarkedMessageByTeamRef.current[teamId];
          }
        });
      return;
    }
    // Demo mode: clear the simulated, persisted count.
    setUnreadByTeam((prev) => (prev[teamId] ? { ...prev, [teamId]: 0 } : prev));
  }, []);

  // Prune/refresh live unread when the set of teams the caller can access
  // changes (membership added/removed). The authoritative summary reconciles
  // the exact counts; the immediate prune keeps a removed team from lingering.
  const accessibleTeamKey = useMemo(() => {
    if (!chatLive || !user) return '';
    const ids = isChurchAdmin(user)
      ? (liveDirectory?.teams.map((t) => t.id) ?? [])
      : user.memberships.map((m) => m.team_id);
    return [...new Set(ids)].sort().join(',');
  }, [chatLive, user, liveDirectory]);
  useEffect(() => {
    if (!chatLive) return;
    const accessible = new Set(accessibleTeamKey ? accessibleTeamKey.split(',') : []);
    setLiveUnreadByTeam((prev) => pruneUnread(prev, accessible));
    reconcileNowRef.current();
  }, [chatLive, accessibleTeamKey]);

  // --- Notification preferences (live Supabase slice ★, with local demo fallback)

  const refreshNotificationPrefs: AppDataContextValue['refreshNotificationPrefs'] =
    useCallback(async () => {
      const requestProfileId = supabaseProfileIdRef.current;
      if (!liveDataEnabledRef.current || !requestProfileId) return;
      setNotificationPrefsLoading(true);
      setNotificationPrefsError(null);
      try {
        const prefs = await notificationsService.fetchNotificationPreferences(requestProfileId);
        if (
          liveDataEnabledRef.current &&
          supabaseProfileIdRef.current === requestProfileId
        ) {
          setLiveNotificationPrefs(prefs);
        }
      } catch (error) {
        if (
          liveDataEnabledRef.current &&
          supabaseProfileIdRef.current === requestProfileId
        ) {
          setNotificationPrefsError(
            error instanceof Error
              ? error.message
              : "We couldn't load your notification settings right now. Please try again.",
          );
        }
      } finally {
        if (
          liveDataEnabledRef.current &&
          supabaseProfileIdRef.current === requestProfileId
        ) {
          setNotificationPrefsLoading(false);
        }
      }
    }, []);

  // Load live notification preferences when a Supabase session appears; clear
  // them (and any load error) when it goes away, so a different user never
  // sees stale settings. Local demo data is untouched either way.
  useEffect(() => {
    if (notificationPrefsLive) {
      void refreshNotificationPrefs();
    } else {
      setLiveNotificationPrefs(null);
      setNotificationPrefsError(null);
      setNotificationPrefsLoading(false);
    }
  }, [notificationPrefsLive, refreshNotificationPrefs]);

  const getNotificationPreferences = useCallback(
    (userId: string) => {
      if (notificationPrefsLive) {
        return liveNotificationPrefs && liveNotificationPrefs.user_id === userId
          ? liveNotificationPrefs
          : defaultNotificationPreferences(userId);
      }
      return notificationPrefs[userId] ?? defaultNotificationPreferences(userId);
    },
    [notificationPrefsLive, liveNotificationPrefs, notificationPrefs],
  );

  const updateNotificationPreferences: AppDataContextValue['updateNotificationPreferences'] =
    useCallback(
      async (userId, patch) => {
        if (notificationPrefsLive && supabaseProfileId) {
          // Merge onto the saved row (or the defaults when none exists yet) and
          // upsert the whole row; the server-returned row becomes the new state.
          // Nothing changes locally on failure — screens show the message.
          const current =
            liveNotificationPrefs && liveNotificationPrefs.user_id === supabaseProfileId
              ? liveNotificationPrefs
              : defaultNotificationPreferences(supabaseProfileId);
          const saved = await notificationsService.saveNotificationPreferences(
            supabaseProfileId,
            { ...current, ...patch },
          );
          setLiveNotificationPrefs(saved);
          return;
        }
        setNotificationPrefs((prev) => ({
          ...prev,
          [userId]: { ...(prev[userId] ?? defaultNotificationPreferences(userId)), ...patch },
        }));
      },
      [notificationPrefsLive, supabaseProfileId, liveNotificationPrefs],
    );

  const sharedRefreshers = useMemo<Record<SharedRefreshDomain, () => Promise<void>>>(
    () => ({
      announcements: () => refreshAnnouncements({ quiet: true }),
      events: () => refreshEvents({ quiet: true }),
      rotas: () => refreshRotas({ quiet: true }),
      songs: () => refreshSongs({ quiet: true }),
      directory: () => refreshTeams({ quiet: true }),
    }),
    [refreshAnnouncements, refreshEvents, refreshRotas, refreshSongs, refreshTeams],
  );
  const invalidateSharedDomains = useSharedLiveDataFreshness({
    enabled: liveDataEnabled,
    profileId: supabaseProfileId,
    refreshers: sharedRefreshers,
  });
  queueSharedRefreshRef.current = invalidateSharedDomains;

  const value = useMemo<AppDataContextValue>(
    () => ({
      isHydrated,
      // People & teams: live directory for linked Supabase sessions (empty
      // lists while it loads — screens show the teamsLoading state), mock
      // data in demo mode. Categories stay mock in both modes for now.
      organisation: teamsLive ? (liveDirectory?.organisation ?? mockOrganisation) : mockOrganisation,
      users: teamsLive ? (liveDirectory?.users ?? []) : mockUsers,
      teams: teamsLive ? (liveDirectory?.teams ?? []) : mockTeams,
      memberships: teamsLive ? (liveDirectory?.memberships ?? []) : mockMemberships,
      categories: mockCategories,
      teamsLive,
      teamsLoading,
      teamsError,
      refreshTeams,
      addTeamMember,
      removeTeamMember,
      leaveTeam,
      getAvatarUri,
      setOwnAvatar,
      removeOwnAvatar,
      updateOwnProfile,
      getTeamAvatarUri,
      setTeamAvatar,
      removeTeamAvatar,
      announcements: announcementsLive ? liveAnnouncements : localAnnouncements,
      announcementsLive,
      announcementsLoading,
      announcementsError,
      refreshAnnouncements,
      getAnnouncementImageUri,
      setAnnouncementImage,
      removeAnnouncementImage,
      events: eventsLive ? liveEvents : localEvents,
      eventsLive,
      eventsLoading,
      eventsError,
      refreshEvents,
      // Rotas: live rows for linked Supabase sessions (empty lists while they
      // load — screens show the rotasLoading state), local demo data otherwise.
      rotaEntries: rotasLive ? (liveRota?.entries ?? []) : localRotaEntries,
      rotaAssignments: rotasLive ? (liveRota?.assignments ?? []) : localRotaAssignments,
      availabilityResponses: rotasLive
        ? (liveRota?.responses ?? [])
        : localAvailabilityResponses,
      rotasLive,
      rotasLoading,
      rotasError,
      refreshRotas,
      // Songs are live for linked Supabase sessions, local/persisted in demo.
      songs: songsLive ? (liveSongsData?.songs ?? []) : localSongs,
      songSelections: songsLive ? (liveSongsData?.selections ?? []) : localSongSelections,
      songsLive,
      songsLoading,
      songsError,
      refreshSongs,
      // Chat: live rows for linked Supabase sessions (empty while they load —
      // screens show the chatLoading state), local demo data otherwise.
      // Unread counts come from the authoritative server summary in live mode
      // and from the persisted simulation in demo mode.
      chatMessages: chatLive ? liveChatMessages : localChatMessages,
      unreadByTeam: chatLive ? liveUnreadByTeam : unreadByTeam,
      chatLive,
      chatLoading,
      chatError,
      chatRealtimeStatus,
      refreshChat,
      refreshUnreadSummary,
      registerActiveTeamChat,
      unregisterActiveTeamChat,
      getChatAttachmentUri,
      addAnnouncement,
      updateAnnouncement,
      deleteAnnouncement,
      addEvent,
      updateEvent,
      deleteEvent,
      addRotaEntry,
      updateRotaEntry,
      deleteRotaEntry,
      cancelRotaEntry,
      restoreRotaEntry,
      setAvailability,
      addSong,
      updateSong,
      deleteSong,
      setSongSelections,
      sendChatMessage,
      markTeamChatRead,
      // Notification preferences: live row for linked Supabase sessions
      // (defaults client-side until first save), local demo data otherwise.
      notificationPrefsLive,
      notificationPrefsLoading,
      notificationPrefsError,
      refreshNotificationPrefs,
      getNotificationPreferences,
      updateNotificationPreferences,
      resetDemoData,
    }),
    [
      isHydrated,
      teamsLive,
      liveDirectory,
      teamsLoading,
      teamsError,
      refreshTeams,
      addTeamMember,
      removeTeamMember,
      leaveTeam,
      getAvatarUri,
      setOwnAvatar,
      removeOwnAvatar,
      updateOwnProfile,
      getTeamAvatarUri,
      setTeamAvatar,
      removeTeamAvatar,
      announcementsLive,
      liveAnnouncements,
      localAnnouncements,
      announcementsLoading,
      announcementsError,
      refreshAnnouncements,
      getAnnouncementImageUri,
      setAnnouncementImage,
      removeAnnouncementImage,
      eventsLive,
      liveEvents,
      localEvents,
      eventsLoading,
      eventsError,
      refreshEvents,
      rotasLive,
      liveRota,
      localRotaEntries,
      localRotaAssignments,
      localAvailabilityResponses,
      rotasLoading,
      rotasError,
      refreshRotas,
      songsLive,
      liveSongsData,
      localSongs,
      localSongSelections,
      songsLoading,
      songsError,
      refreshSongs,
      chatLive,
      liveChatMessages,
      localChatMessages,
      unreadByTeam,
      liveUnreadByTeam,
      chatLoading,
      chatError,
      chatRealtimeStatus,
      refreshChat,
      refreshUnreadSummary,
      registerActiveTeamChat,
      unregisterActiveTeamChat,
      getChatAttachmentUri,
      addAnnouncement,
      updateAnnouncement,
      deleteAnnouncement,
      addEvent,
      updateEvent,
      deleteEvent,
      addRotaEntry,
      updateRotaEntry,
      deleteRotaEntry,
      cancelRotaEntry,
      restoreRotaEntry,
      setAvailability,
      addSong,
      updateSong,
      deleteSong,
      setSongSelections,
      sendChatMessage,
      markTeamChatRead,
      notificationPrefsLive,
      notificationPrefsLoading,
      notificationPrefsError,
      refreshNotificationPrefs,
      getNotificationPreferences,
      updateNotificationPreferences,
      resetDemoData,
    ],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppDataContextValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider');
  return ctx;
}
