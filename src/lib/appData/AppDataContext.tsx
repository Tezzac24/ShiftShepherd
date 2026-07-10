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
 * profiles, teams, team memberships), rotas (entries, assignments,
 * availability responses), choir songs/song selections, and team chat are the
 * live Supabase slices: when the user is
 * signed in through Supabase Auth with a linked profile, those collections
 * and their actions run against the live database (RLS enforces permissions)
 * via src/lib/supabase/services/. In demo mode — or whenever Supabase env
 * vars are missing — they stay local/mock exactly as before. Live data is
 * session state only: it is never written to the demo AsyncStorage snapshot
 * and Reset Demo Data does not touch it.
 *
 * Chat is realtime for the open conversation: the team chat screen subscribes
 * to new-message INSERTs while focused (see features/chat/useTeamChatRealtime)
 * and merges arrivals in through applyLiveChatMessage. The database stays the
 * source of truth — refetches on focus/foreground/reconnect fill anything the
 * socket missed, and every path (send, realtime, refetch) merges by row id so
 * nothing duplicates.
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
  ChatReadState,
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
import { clearPersisted, loadPersisted, savePersisted, STORAGE_KEYS } from '../storage/persistence';
import { isSupabaseConfigured } from '../supabase/client';
import * as announcementsService from '../supabase/services/announcements';
import * as chatService from '../supabase/services/chat';
import * as eventsService from '../supabase/services/events';
import * as notificationsService from '../supabase/services/notifications';
import * as profileAvatarsService from '../supabase/services/profileAvatars';
import * as rotasService from '../supabase/services/rotas';
import * as songsService from '../supabase/services/songs';
import * as teamsService from '../supabase/services/teams';

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

  // People & teams directory — the third live Supabase slice (read-only).
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
  refreshTeams: () => Promise<void>;

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
  refreshAnnouncements: () => Promise<void>;
  addAnnouncement: (
    input: Omit<Announcement, 'id' | 'organisation_id' | 'created_at' | 'updated_at'>,
  ) => Promise<Announcement>;
  updateAnnouncement: (id: string, patch: Partial<Announcement>) => Promise<void>;
  deleteAnnouncement: (id: string) => Promise<void>;

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
  refreshEvents: () => Promise<void>;
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
  refreshRotas: () => Promise<void>;
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
  refreshSongs: () => Promise<void>;
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
  // otherwise. The open chat screen additionally subscribes to realtime
  // inserts and feeds them in via applyLiveChatMessage; every write path
  // merges by row id so send responses, realtime events, and refetches never
  // duplicate. Live messages are session-only, never persisted.
  /** True when chat messages come from live Supabase rather than local demo data. */
  chatLive: boolean;
  /** True while live chat messages are being (re)loaded. Always false in demo mode. */
  chatLoading: boolean;
  /** Friendly load-failure message, or null. Always null in demo mode. */
  chatError: string | null;
  /** Reload live chat messages (no-op in demo mode). */
  refreshChat: () => Promise<void>;
  /** Merge one realtime-delivered live message into chat state (no-op in demo mode). */
  applyLiveChatMessage: (message: ChatMessage) => void;
  /** Async in both modes; rejects with a friendly message on live failures. */
  sendChatMessage: (teamId: string, senderId: string, body: string) => Promise<void>;
  /**
   * Reload the caller's live chat read states (no-op in demo mode). Never
   * rejects: when read states can't load, unread badges just hide.
   */
  refreshChatReadStates: () => Promise<void>;
  /**
   * Mark a team's chat read for the current user, up to the newest loaded
   * message. Fire-and-forget: live mode updates state optimistically and
   * upserts chat_read_states in the background (a failure is logged, never
   * shown — the chat itself is unaffected); demo mode clears the simulated
   * count.
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

// "Nothing unread" (also the neutral state while live read states are
// unavailable); stable reference so the context value doesn't churn.
const NO_UNREAD: Record<string, number> = {};

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
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
}

/** Timestamp strings arrive in mixed formats (+00:00 vs Z); compare as time. */
function timeOf(timestamp: string): number {
  return new Date(timestamp).getTime();
}

/**
 * Merge chat read states by team, keeping whichever last_read_at is newest —
 * a refetch that raced an in-flight mark-read can never move a team's read
 * point backwards. Incoming rows win ties so a server row (real id) replaces
 * its optimistic placeholder.
 */
function mergeChatReadStates(
  prev: ChatReadState[] | null,
  incoming: ChatReadState[],
): ChatReadState[] {
  const byTeam = new Map<string, ChatReadState>();
  for (const state of prev ?? []) byTeam.set(state.team_id, state);
  for (const state of incoming) {
    const existing = byTeam.get(state.team_id);
    if (!existing || timeOf(state.last_read_at) >= timeOf(existing.last_read_at)) {
      byTeam.set(state.team_id, state);
    }
  }
  return [...byTeam.values()];
}

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  // Live-vs-local mode for the wired slices:
  // Supabase session + configured client + linked profile ⇒ live; demo mode
  // or missing env vars ⇒ local/mock.
  const { user, authMode, applySessionAvatarUrl } = useAuth();
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
  // Lets in-flight fetches notice the mode flipped (e.g. sign-out mid-load).
  const liveDataEnabledRef = useRef(false);
  liveDataEnabledRef.current = liveDataEnabled;
  const supabaseProfileIdRef = useRef<string | null>(null);
  supabaseProfileIdRef.current = supabaseProfileId;
  const [localEvents, setLocalEvents] = useState<Event[]>(mockEvents);
  const [liveEvents, setLiveEvents] = useState<Event[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [liveDirectory, setLiveDirectory] = useState<teamsService.TeamsDirectory | null>(null);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  // Signed display URLs for live avatar paths (private bucket). Session-only:
  // cleared with the directory on sign-out, refreshed on app foreground.
  const [avatarSignedUrls, setAvatarSignedUrls] = useState<Record<string, string>>({});
  const avatarSignedUrlsRef = useRef<Record<string, string>>({});
  avatarSignedUrlsRef.current = avatarSignedUrls;
  const avatarsSignedAtRef = useRef(0);
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
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [unreadByTeam, setUnreadByTeam] = useState<Record<string, number>>(mockUnreadByTeam);
  // Null = live read states unavailable (not loaded yet, migration not
  // applied, or load failed) — live unread badges hide rather than guess.
  const [liveChatReadStates, setLiveChatReadStates] = useState<ChatReadState[] | null>(null);
  // Set once per session at the first successful read-state load: for teams
  // with no read-state row yet, only messages newer than this count as unread
  // (so pre-existing history never floods in the first time someone signs in).
  const [chatReadBaseline, setChatReadBaseline] = useState<string | null>(null);
  // Refs so markTeamChatRead (a stable callback) reads current chat state.
  const liveChatMessagesRef = useRef<ChatMessage[]>([]);
  liveChatMessagesRef.current = liveChatMessages;
  const liveChatReadStatesRef = useRef<ChatReadState[] | null>(null);
  liveChatReadStatesRef.current = liveChatReadStates;
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
    useCallback(async () => {
      const requestProfileId = supabaseProfileIdRef.current;
      if (!liveDataEnabledRef.current || !requestProfileId) return;
      setAnnouncementsLoading(true);
      setAnnouncementsError(null);
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
          setAnnouncementsError(
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
          setAnnouncementsLoading(false);
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
    const requestProfileId = supabaseProfileIdRef.current;
    if (!requestProfileId) return;
    announcementsService
      .listAnnouncements()
      .then((list) => {
        if (
          liveDataEnabledRef.current &&
          supabaseProfileIdRef.current === requestProfileId
        ) {
          setLiveAnnouncements(list);
        }
      })
      .catch((error) => console.warn('[appData] announcements re-sync failed', error));
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
        await announcementsService.deleteAnnouncement(id);
        setLiveAnnouncements((prev) => prev.filter((a) => a.id !== id));
        resyncLiveAnnouncements();
        return;
      }
      setLocalAnnouncements((prev) => prev.filter((a) => a.id !== id));
    },
    [announcementsLive, resyncLiveAnnouncements],
  );

  // --- Events (live Supabase slice ★, with local demo fallback) ---------------

  const refreshEvents: AppDataContextValue['refreshEvents'] = useCallback(async () => {
    const requestProfileId = supabaseProfileIdRef.current;
    if (!liveDataEnabledRef.current || !requestProfileId) return;
    setEventsLoading(true);
    setEventsError(null);
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
        setEventsError(
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
        setEventsLoading(false);
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
    const requestProfileId = supabaseProfileIdRef.current;
    if (!requestProfileId) return;
    eventsService
      .listEvents()
      .then((list) => {
        if (
          liveDataEnabledRef.current &&
          supabaseProfileIdRef.current === requestProfileId
        ) {
          setLiveEvents(list);
        }
      })
      .catch((error) => console.warn('[appData] events re-sync failed', error));
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

  // --- People & teams directory (live Supabase slice ★, read-only) ------------

  const refreshTeams: AppDataContextValue['refreshTeams'] = useCallback(async () => {
    const requestProfileId = supabaseProfileIdRef.current;
    if (!liveDataEnabledRef.current || !requestProfileId) return;
    setTeamsLoading(true);
    setTeamsError(null);
    try {
      const directory = await teamsService.fetchTeamsDirectory();
      if (
        liveDataEnabledRef.current &&
        supabaseProfileIdRef.current === requestProfileId
      ) {
        setLiveDirectory(directory);
      }
    } catch (error) {
      if (
        liveDataEnabledRef.current &&
        supabaseProfileIdRef.current === requestProfileId
      ) {
        setTeamsError(
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
        setTeamsLoading(false);
      }
    }
  }, []);

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

  // Keep the live directory's copy of a profile in step with an avatar change
  // so lists showing that person update without a full (flickering) reload.
  const patchLiveDirectoryAvatar = useCallback(
    (profileId: string, avatarPath: string | null) => {
      setLiveDirectory((prev) =>
        prev
          ? {
              ...prev,
              users: prev.users.map((person) =>
                person.id === profileId ? { ...person, avatar_url: avatarPath } : person,
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
      patchLiveDirectoryAvatar(supabaseProfileId, newPath);
    },
    [liveDataEnabled, supabaseProfileId, user, applySessionAvatarUrl, patchLiveDirectoryAvatar],
  );

  const removeOwnAvatar: AppDataContextValue['removeOwnAvatar'] = useCallback(async () => {
    if (!liveDataEnabled || !supabaseProfileId) {
      throw new Error('Profile photos are available when signed in with your church account.');
    }
    const currentPath = user?.profile.avatar_url ?? null;
    await profileAvatarsService.removeOwnProfileAvatar(supabaseProfileId, currentPath);
    applySessionAvatarUrl(null);
    patchLiveDirectoryAvatar(supabaseProfileId, null);
  }, [liveDataEnabled, supabaseProfileId, user, applySessionAvatarUrl, patchLiveDirectoryAvatar]);

  // --- Rotas (live Supabase slice ★, with local demo fallback) -----------------

  const refreshRotas: AppDataContextValue['refreshRotas'] = useCallback(async () => {
    const requestProfileId = supabaseProfileIdRef.current;
    if (!liveDataEnabledRef.current || !requestProfileId) return;
    setRotasLoading(true);
    setRotasError(null);
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
        setRotasError(
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
        setRotasLoading(false);
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
    const requestProfileId = supabaseProfileIdRef.current;
    if (!requestProfileId) return;
    rotasService
      .fetchRotaData()
      .then((rotaData) => {
        if (
          liveDataEnabledRef.current &&
          supabaseProfileIdRef.current === requestProfileId
        ) {
          setLiveRota(rotaData);
        }
      })
      .catch((error) => console.warn('[appData] rotas re-sync failed', error));
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

  const refreshSongs: AppDataContextValue['refreshSongs'] = useCallback(async () => {
    const requestProfileId = supabaseProfileIdRef.current;
    if (!liveDataEnabledRef.current || !requestProfileId) return;
    setSongsLoading(true);
    setSongsError(null);
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
        setSongsError(
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
        setSongsLoading(false);
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
    const requestProfileId = supabaseProfileIdRef.current;
    if (!requestProfileId) return;
    songsService
      .fetchSongsData()
      .then((songsData) => {
        if (
          liveDataEnabledRef.current &&
          supabaseProfileIdRef.current === requestProfileId
        ) {
          setLiveSongsData(songsData);
        }
      })
      .catch((error) => console.warn('[appData] songs re-sync failed', error));
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

  // The caller's own read states (RLS-scoped). Never sets an error state:
  // unread badges are an enhancement, so any failure — including the
  // chat_read_states migration not being applied yet — just hides them until
  // a later refresh succeeds. The baseline is pinned at the first successful
  // load of the session (see chatReadBaseline above).
  const refreshChatReadStates: AppDataContextValue['refreshChatReadStates'] =
    useCallback(async () => {
      const requestProfileId = supabaseProfileIdRef.current;
      if (!liveDataEnabledRef.current || !requestProfileId) return;
      const states = await chatService.fetchChatReadStates();
      if (
        !liveDataEnabledRef.current ||
        supabaseProfileIdRef.current !== requestProfileId
      ) {
        return;
      }
      if (states === null) {
        setLiveChatReadStates(null);
        return;
      }
      setChatReadBaseline((prev) => prev ?? new Date().toISOString());
      setLiveChatReadStates((prev) => mergeChatReadStates(prev, states));
    }, []);

  // Load live chat (and the user's read states) when a Supabase session
  // appears; clear them when it goes away so no read state leaks across a
  // user switch. Local demo data is untouched either way.
  useEffect(() => {
    if (chatLive) {
      void refreshChat();
      void refreshChatReadStates();
    } else {
      setLiveChatMessages([]);
      setChatError(null);
      setChatLoading(false);
      setLiveChatReadStates(null);
      setChatReadBaseline(null);
    }
  }, [chatLive, refreshChat, refreshChatReadStates]);

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

  // Realtime inserts from the open chat's subscription land here. Merging by
  // id makes it safe for the sender's own message to arrive twice (send
  // response + realtime event) and for events to race refetches.
  const applyLiveChatMessage: AppDataContextValue['applyLiveChatMessage'] = useCallback(
    (message) => {
      if (!liveDataEnabledRef.current) return;
      setLiveChatMessages((prev) => mergeChatMessages(prev, [message]));
    },
    [],
  );

  const sendChatMessage: AppDataContextValue['sendChatMessage'] = useCallback(
    async (teamId, senderId, body) => {
      if (chatLive && supabaseProfileId) {
        // RLS only accepts the caller's own profile as sender.
        const sent = await chatService.sendChatMessage(teamId, body, supabaseProfileId);
        setLiveChatMessages((prev) => mergeChatMessages(prev, [sent]));
        resyncLiveChat();
        return;
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
        },
      ]);
    },
    [chatLive, supabaseProfileId, resyncLiveChat],
  );

  const markTeamChatRead = useCallback((teamId: string) => {
    if (liveDataEnabledRef.current) {
      const profileId = supabaseProfileIdRef.current;
      // Nothing to record for mock ids or before any message has loaded —
      // an empty chat has no unread to clear.
      if (!profileId || teamId.startsWith('team-')) return;
      const teamMessages = liveChatMessagesRef.current.filter((m) => m.team_id === teamId);
      const latest = teamMessages[teamMessages.length - 1];
      if (!latest) return;
      const existing = liveChatReadStatesRef.current?.find((s) => s.team_id === teamId);
      // Never move the read point backwards (e.g. re-opening a chat after
      // reading further on another device).
      if (existing && timeOf(existing.last_read_at) >= timeOf(latest.created_at)) return;
      // Optimistic: badges clear immediately; the server row (real id)
      // replaces this placeholder when the upsert lands. On failure the
      // optimistic state stays for this session (unread would reappear next
      // session) — never an error in the user's face for a bookkeeping write.
      setLiveChatReadStates((prev) =>
        mergeChatReadStates(prev, [
          {
            id: `pending:${teamId}`,
            user_id: profileId,
            team_id: teamId,
            last_read_at: latest.created_at,
          },
        ]),
      );
      chatService
        .markChatRead(teamId, latest.created_at, profileId)
        .then((saved) => {
          if (
            liveDataEnabledRef.current &&
            supabaseProfileIdRef.current === profileId
          ) {
            setLiveChatReadStates((prev) => mergeChatReadStates(prev, [saved]));
          }
        })
        .catch((error) => console.warn('[appData] mark chat read failed', error));
      return;
    }
    // Demo mode: clear the simulated, persisted count.
    setUnreadByTeam((prev) => (prev[teamId] ? { ...prev, [teamId]: 0 } : prev));
  }, []);

  // Live unread counts: for each team, messages from other people newer than
  // the user's read point (their chat_read_states row, or the session
  // baseline for teams they haven't opened yet). Hidden entirely (empty map)
  // while read states are unavailable. Demo mode never reaches this — it
  // keeps its own persisted simulation.
  const liveUnreadByTeam = useMemo<Record<string, number>>(() => {
    if (!chatLive || !supabaseProfileId || !liveChatReadStates || !chatReadBaseline) {
      return NO_UNREAD;
    }
    const lastReadByTeam = new Map(
      liveChatReadStates.map((s) => [s.team_id, timeOf(s.last_read_at)] as const),
    );
    const counts: Record<string, number> = {};
    for (const message of liveChatMessages) {
      if (message.sender_id === supabaseProfileId) continue;
      const readPoint = lastReadByTeam.get(message.team_id) ?? timeOf(chatReadBaseline);
      if (timeOf(message.created_at) > readPoint) {
        counts[message.team_id] = (counts[message.team_id] ?? 0) + 1;
      }
    }
    return Object.keys(counts).length > 0 ? counts : NO_UNREAD;
  }, [chatLive, supabaseProfileId, liveChatReadStates, chatReadBaseline, liveChatMessages]);

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
      getAvatarUri,
      setOwnAvatar,
      removeOwnAvatar,
      announcements: announcementsLive ? liveAnnouncements : localAnnouncements,
      announcementsLive,
      announcementsLoading,
      announcementsError,
      refreshAnnouncements,
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
      // Unread counts come from chat_read_states in live mode and from the
      // persisted simulation in demo mode.
      chatMessages: chatLive ? liveChatMessages : localChatMessages,
      unreadByTeam: chatLive ? liveUnreadByTeam : unreadByTeam,
      chatLive,
      chatLoading,
      chatError,
      refreshChat,
      refreshChatReadStates,
      applyLiveChatMessage,
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
      getAvatarUri,
      setOwnAvatar,
      removeOwnAvatar,
      announcementsLive,
      liveAnnouncements,
      localAnnouncements,
      announcementsLoading,
      announcementsError,
      refreshAnnouncements,
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
      refreshChat,
      refreshChatReadStates,
      applyLiveChatMessage,
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
