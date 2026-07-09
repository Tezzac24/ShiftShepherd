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
 * ★ Announcements, events, and the people/teams directory (organisation,
 * profiles, teams, team memberships) are the live Supabase slices: when the
 * user is signed in through Supabase Auth with a linked profile, those
 * collections and their actions run against the live database (RLS enforces
 * permissions) via src/lib/supabase/services/. In demo mode — or whenever
 * Supabase env vars are missing — they stay local/mock exactly as before.
 * Live data is session state only: it is never written to the demo
 * AsyncStorage snapshot and Reset Demo Data does not touch it.
 *
 * The still-local slices (rotas, songs, chat) are keyed by mock ids; in live
 * mode they are re-keyed onto live team/profile UUIDs through the temporary
 * demoBridge so they keep working alongside live teams (see demoBridge.ts).
 *
 * TODO: wire to Supabase — repeat the same pattern for rotas, songs, chat,
 * and notification preferences (see docs/supabase-integration-plan.md).
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
import { clearPersisted, loadPersisted, savePersisted, STORAGE_KEYS } from '../storage/persistence';
import { isSupabaseConfigured } from '../supabase/client';
import * as announcementsService from '../supabase/services/announcements';
import * as eventsService from '../supabase/services/events';
import * as teamsService from '../supabase/services/teams';
import {
  bridgeDemoCollections,
  buildDemoIdBridge,
  DemoIdBridge,
  toLocalTeamId,
  toLocalUserId,
} from './demoBridge';

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

  // Mutable collections
  announcements: Announcement[];
  events: Event[];
  rotaEntries: RotaEntry[];
  rotaAssignments: RotaAssignment[];
  availabilityResponses: AvailabilityResponse[];
  songs: Song[];
  songSelections: ChoirSongSelection[];
  chatMessages: ChatMessage[];
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

  // Rotas
  addRotaEntry: (
    input: NewRotaEntryInput,
    assignments: NewRotaAssignmentInput[],
  ) => RotaEntry;
  updateRotaEntry: (
    id: string,
    patch: Partial<RotaEntry>,
    assignments?: NewRotaAssignmentInput[],
  ) => void;
  deleteRotaEntry: (id: string) => void;
  /** Marks an entry as cancelled (kept visible) rather than deleting it. */
  cancelRotaEntry: (id: string, cancelledBy: string, reason: string | null) => void;
  /** Undoes a cancellation (e.g. after a mis-tap). */
  restoreRotaEntry: (id: string) => void;
  setAvailability: (
    assignmentId: string,
    userId: string,
    status: AvailabilityStatus,
    note: string | null,
  ) => void;

  // Songs
  addSong: (
    input: Omit<Song, 'id' | 'organisation_id' | 'created_at' | 'updated_at'>,
  ) => Song;
  updateSong: (id: string, patch: Partial<Song>) => void;
  deleteSong: (id: string) => void;

  // Choir song selection (replaces one section's selection for a rota date;
  // the other section's songs are left untouched)
  setSongSelections: (
    rotaEntryId: string,
    section: SongSection,
    songIds: string[],
    selectedBy: string,
  ) => void;

  // Chat
  sendChatMessage: (teamId: string, senderId: string, body: string) => void;
  markTeamChatRead: (teamId: string) => void;

  // Notification preferences
  getNotificationPreferences: (userId: string) => NotificationPreferences;
  updateNotificationPreferences: (
    userId: string,
    patch: Partial<NotificationPreferences>,
  ) => void;

  /** Restores the original mock seed data and clears persisted demo changes. */
  resetDemoData: () => Promise<void>;
}

const AppDataContext = createContext<AppDataContextValue | undefined>(undefined);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  // Live-vs-local mode for the wired slices (announcements, events):
  // Supabase session + configured client + linked profile ⇒ live; demo mode
  // or missing env vars ⇒ local/mock.
  const { user, authMode } = useAuth();
  const supabaseProfileId =
    authMode === 'supabase' ? (user?.supabaseProfileId ?? null) : null;
  const liveDataEnabled = isSupabaseConfigured && supabaseProfileId !== null;
  const announcementsLive = liveDataEnabled;
  const eventsLive = liveDataEnabled;
  const teamsLive = liveDataEnabled;

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
  const [rotaEntries, setRotaEntries] = useState<RotaEntry[]>(mockRotaEntries);
  const [rotaAssignments, setRotaAssignments] = useState<RotaAssignment[]>(mockRotaAssignments);
  const [availabilityResponses, setAvailabilityResponses] = useState<AvailabilityResponse[]>(
    mockAvailabilityResponses,
  );
  const [songs, setSongs] = useState<Song[]>(mockSongs);
  const [songSelections, setSongSelectionsState] =
    useState<ChoirSongSelection[]>(mockSongSelections);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(mockChatMessages);
  const [unreadByTeam, setUnreadByTeam] = useState<Record<string, number>>(mockUnreadByTeam);
  const [notificationPrefs, setNotificationPrefs] = useState<
    Record<string, NotificationPreferences>
  >({});
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
        setRotaEntries(persisted.rotaEntries);
        setRotaAssignments(persisted.rotaAssignments);
        setAvailabilityResponses(persisted.availabilityResponses);
        setSongs(persisted.songs);
        setSongSelectionsState(persisted.songSelections);
        setChatMessages(persisted.chatMessages);
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
      rotaEntries,
      rotaAssignments,
      availabilityResponses,
      songs,
      songSelections,
      chatMessages,
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
    rotaEntries,
    rotaAssignments,
    availabilityResponses,
    songs,
    songSelections,
    chatMessages,
    unreadByTeam,
    notificationPrefs,
  ]);

  const resetDemoData = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await clearPersisted(STORAGE_KEYS.appData);
    setLocalAnnouncements(mockAnnouncements);
    setLocalEvents(mockEvents);
    setRotaEntries(mockRotaEntries);
    setRotaAssignments(mockRotaAssignments);
    setAvailabilityResponses(mockAvailabilityResponses);
    setSongs(mockSongs);
    setSongSelectionsState(mockSongSelections);
    setChatMessages(mockChatMessages);
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

  // TEMPORARY (see demoBridge.ts): while rotas/songs/chat stay demo/local,
  // re-key them onto live team/profile UUIDs in live mode so they keep
  // working next to the live directory, and map ids back on local writes so
  // the persisted demo snapshot stays keyed by mock ids.
  const demoBridge = useMemo<DemoIdBridge | null>(
    () =>
      teamsLive && liveDirectory
        ? buildDemoIdBridge(liveDirectory.users, liveDirectory.teams)
        : null,
    [teamsLive, liveDirectory],
  );
  // Lets mutation callbacks translate ids without re-creating on every load.
  const demoBridgeRef = useRef<DemoIdBridge | null>(null);
  demoBridgeRef.current = demoBridge;

  const demoView = useMemo(() => {
    const collections = {
      rotaEntries,
      rotaAssignments,
      availabilityResponses,
      songs,
      songSelections,
      chatMessages,
      unreadByTeam,
    };
    return demoBridge ? bridgeDemoCollections(collections, demoBridge) : collections;
  }, [
    demoBridge,
    rotaEntries,
    rotaAssignments,
    availabilityResponses,
    songs,
    songSelections,
    chatMessages,
    unreadByTeam,
  ]);

  // --- Rotas -----------------------------------------------------------------

  const addRotaEntry: AppDataContextValue['addRotaEntry'] = useCallback(
    (input, assignments) => {
      // Rotas are still demo/local: store mock ids, not live UUIDs.
      const bridge = demoBridgeRef.current;
      const record: RotaEntry = {
        ...input,
        team_id: toLocalTeamId(bridge, input.team_id),
        created_by: toLocalUserId(bridge, input.created_by),
        id: makeId('rota'),
        organisation_id: ORG_ID,
        status: 'active',
        cancelled_at: null,
        cancelled_by: null,
        cancellation_reason: null,
        created_at: now(),
        updated_at: now(),
      };
      setRotaEntries((prev) => [...prev, record]);
      setRotaAssignments((prev) => [
        ...prev,
        ...assignments.map((a) => ({
          id: makeId('ra'),
          rota_entry_id: record.id,
          user_id: toLocalUserId(bridge, a.user_id),
          role_name: a.role_name,
          created_at: now(),
        })),
      ]);
      return record;
    },
    [],
  );

  const updateRotaEntry: AppDataContextValue['updateRotaEntry'] = useCallback(
    (id, patch, assignments) => {
      // Rotas are still demo/local: store mock ids, not live UUIDs.
      const bridge = demoBridgeRef.current;
      const localPatch = { ...patch };
      if (localPatch.team_id) localPatch.team_id = toLocalTeamId(bridge, localPatch.team_id);
      if (localPatch.created_by) {
        localPatch.created_by = toLocalUserId(bridge, localPatch.created_by);
      }
      if (localPatch.cancelled_by) {
        localPatch.cancelled_by = toLocalUserId(bridge, localPatch.cancelled_by);
      }
      setRotaEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, ...localPatch, updated_at: now() } : e)),
      );
      if (assignments) {
        // Replace the assignment list; keep ids stable where person+role match
        setRotaAssignments((prev) => {
          const existing = prev.filter((a) => a.rota_entry_id === id);
          const others = prev.filter((a) => a.rota_entry_id !== id);
          const next = assignments.map((a) => {
            const userId = toLocalUserId(bridge, a.user_id);
            const match = existing.find(
              (x) => x.user_id === userId && x.role_name === a.role_name,
            );
            return (
              match ?? {
                id: makeId('ra'),
                rota_entry_id: id,
                user_id: userId,
                role_name: a.role_name,
                created_at: now(),
              }
            );
          });
          const keptIds = new Set(next.map((a) => a.id));
          // Clean up availability responses for removed assignments
          setAvailabilityResponses((responses) =>
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
    [],
  );

  const deleteRotaEntry = useCallback((id: string) => {
    setRotaEntries((prev) => prev.filter((e) => e.id !== id));
    setRotaAssignments((prev) => {
      const removed = new Set(
        prev.filter((a) => a.rota_entry_id === id).map((a) => a.id),
      );
      setAvailabilityResponses((responses) =>
        responses.filter((r) => !removed.has(r.rota_assignment_id)),
      );
      return prev.filter((a) => a.rota_entry_id !== id);
    });
    setSongSelectionsState((prev) => prev.filter((s) => s.rota_entry_id !== id));
  }, []);

  const cancelRotaEntry: AppDataContextValue['cancelRotaEntry'] = useCallback(
    (id, cancelledBy, reason) => {
      const localCancelledBy = toLocalUserId(demoBridgeRef.current, cancelledBy);
      setRotaEntries((prev) =>
        prev.map((e) =>
          e.id === id
            ? {
                ...e,
                status: 'cancelled',
                cancelled_at: now(),
                cancelled_by: localCancelledBy,
                cancellation_reason: reason,
                updated_at: now(),
              }
            : e,
        ),
      );
    },
    [],
  );

  const restoreRotaEntry = useCallback((id: string) => {
    setRotaEntries((prev) =>
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
  }, []);

  const setAvailability: AppDataContextValue['setAvailability'] = useCallback(
    (assignmentId, userId, status, note) => {
      const localUserId = toLocalUserId(demoBridgeRef.current, userId);
      setAvailabilityResponses((prev) => {
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
            user_id: localUserId,
            status,
            note,
            updated_at: now(),
          },
        ];
      });
    },
    [],
  );

  // --- Songs -----------------------------------------------------------------

  const addSong: AppDataContextValue['addSong'] = useCallback((input) => {
    // Songs are still demo/local: store mock ids, not live UUIDs.
    const bridge = demoBridgeRef.current;
    const record: Song = {
      ...input,
      team_id: toLocalTeamId(bridge, input.team_id),
      added_by: toLocalUserId(bridge, input.added_by),
      id: makeId('song'),
      organisation_id: ORG_ID,
      created_at: now(),
      updated_at: now(),
    };
    setSongs((prev) =>
      [...prev, record].sort((a, b) => a.title.localeCompare(b.title)),
    );
    return record;
  }, []);

  const updateSong: AppDataContextValue['updateSong'] = useCallback((id, patch) => {
    const bridge = demoBridgeRef.current;
    const localPatch = { ...patch };
    if (localPatch.team_id) localPatch.team_id = toLocalTeamId(bridge, localPatch.team_id);
    if (localPatch.added_by) localPatch.added_by = toLocalUserId(bridge, localPatch.added_by);
    setSongs((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...localPatch, updated_at: now() } : s)),
    );
  }, []);

  const deleteSong = useCallback((id: string) => {
    setSongs((prev) => prev.filter((s) => s.id !== id));
    setSongSelectionsState((prev) => prev.filter((s) => s.song_id !== id));
  }, []);

  // --- Choir song selection ----------------------------------------------------

  const setSongSelections: AppDataContextValue['setSongSelections'] = useCallback(
    (rotaEntryId, section, songIds, selectedBy) => {
      const localSelectedBy = toLocalUserId(demoBridgeRef.current, selectedBy);
      setSongSelectionsState((prev) => [
        ...prev.filter((s) => s.rota_entry_id !== rotaEntryId || s.section !== section),
        ...songIds.map((songId, i) => ({
          id: makeId('sel'),
          rota_entry_id: rotaEntryId,
          song_id: songId,
          section,
          selected_by: localSelectedBy,
          order_index: i,
          notes: null,
        })),
      ]);
    },
    [],
  );

  // --- Chat ------------------------------------------------------------------

  const sendChatMessage: AppDataContextValue['sendChatMessage'] = useCallback(
    (teamId, senderId, body) => {
      // Chat is still demo/local: store mock ids, not live UUIDs.
      const bridge = demoBridgeRef.current;
      setChatMessages((prev) => [
        ...prev,
        {
          id: makeId('msg'),
          organisation_id: ORG_ID,
          team_id: toLocalTeamId(bridge, teamId),
          sender_id: toLocalUserId(bridge, senderId),
          body,
          created_at: now(),
        },
      ]);
    },
    [],
  );

  const markTeamChatRead = useCallback((teamId: string) => {
    const localTeamId = toLocalTeamId(demoBridgeRef.current, teamId);
    setUnreadByTeam((prev) => (prev[localTeamId] ? { ...prev, [localTeamId]: 0 } : prev));
  }, []);

  // --- Notification preferences -------------------------------------------------

  const getNotificationPreferences = useCallback(
    (userId: string) => notificationPrefs[userId] ?? defaultNotificationPreferences(userId),
    [notificationPrefs],
  );

  const updateNotificationPreferences: AppDataContextValue['updateNotificationPreferences'] =
    useCallback((userId, patch) => {
      setNotificationPrefs((prev) => ({
        ...prev,
        [userId]: { ...(prev[userId] ?? defaultNotificationPreferences(userId)), ...patch },
      }));
    }, []);

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
      // Still-local slices, re-keyed onto live ids in live mode (demoBridge).
      rotaEntries: demoView.rotaEntries,
      rotaAssignments: demoView.rotaAssignments,
      availabilityResponses: demoView.availabilityResponses,
      songs: demoView.songs,
      songSelections: demoView.songSelections,
      chatMessages: demoView.chatMessages,
      unreadByTeam: demoView.unreadByTeam,
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
      demoView,
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
