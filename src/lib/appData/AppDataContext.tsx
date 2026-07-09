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
 * TODO: wire to Supabase — replace state mutations with inserts/updates/
 * deletes + Realtime subscriptions.
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

  // Static reference data (would be Supabase tables)
  organisation: Organisation;
  users: UserProfile[];
  teams: Team[];
  memberships: TeamMembership[];
  categories: EventCategory[];

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

  // Announcements
  addAnnouncement: (
    input: Omit<Announcement, 'id' | 'organisation_id' | 'created_at' | 'updated_at'>,
  ) => Announcement;
  updateAnnouncement: (id: string, patch: Partial<Announcement>) => void;
  deleteAnnouncement: (id: string) => void;

  // Events
  addEvent: (input: Omit<Event, 'id' | 'organisation_id' | 'created_at' | 'updated_at'>) => Event;
  updateEvent: (id: string, patch: Partial<Event>) => void;
  deleteEvent: (id: string) => void;

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
  const [announcements, setAnnouncements] = useState<Announcement[]>(mockAnnouncements);
  const [events, setEvents] = useState<Event[]>(mockEvents);
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
        setAnnouncements(persisted.announcements);
        setEvents(persisted.events);
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
      announcements,
      events,
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
    announcements,
    events,
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
    setAnnouncements(mockAnnouncements);
    setEvents(mockEvents);
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

  // --- Announcements ---------------------------------------------------------

  const addAnnouncement: AppDataContextValue['addAnnouncement'] = useCallback((input) => {
    const record: Announcement = {
      ...input,
      id: makeId('ann'),
      organisation_id: ORG_ID,
      created_at: now(),
      updated_at: now(),
    };
    setAnnouncements((prev) => [record, ...prev]);
    return record;
  }, []);

  const updateAnnouncement: AppDataContextValue['updateAnnouncement'] = useCallback(
    (id, patch) => {
      setAnnouncements((prev) =>
        prev.map((a) => (a.id === id ? { ...a, ...patch, updated_at: now() } : a)),
      );
    },
    [],
  );

  const deleteAnnouncement = useCallback((id: string) => {
    setAnnouncements((prev) => prev.filter((a) => a.id !== id));
  }, []);

  // --- Events ----------------------------------------------------------------

  const addEvent: AppDataContextValue['addEvent'] = useCallback((input) => {
    const record: Event = {
      ...input,
      id: makeId('event'),
      organisation_id: ORG_ID,
      created_at: now(),
      updated_at: now(),
    };
    setEvents((prev) => [...prev, record]);
    return record;
  }, []);

  const updateEvent: AppDataContextValue['updateEvent'] = useCallback((id, patch) => {
    setEvents((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...patch, updated_at: now() } : e)),
    );
  }, []);

  const deleteEvent = useCallback((id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
  }, []);

  // --- Rotas -----------------------------------------------------------------

  const addRotaEntry: AppDataContextValue['addRotaEntry'] = useCallback(
    (input, assignments) => {
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
      setRotaEntries((prev) => [...prev, record]);
      setRotaAssignments((prev) => [
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
    [],
  );

  const updateRotaEntry: AppDataContextValue['updateRotaEntry'] = useCallback(
    (id, patch, assignments) => {
      setRotaEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, ...patch, updated_at: now() } : e)),
      );
      if (assignments) {
        // Replace the assignment list; keep ids stable where person+role match
        setRotaAssignments((prev) => {
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
      setRotaEntries((prev) =>
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
            user_id: userId,
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
    const record: Song = {
      ...input,
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
    setSongs((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch, updated_at: now() } : s)),
    );
  }, []);

  const deleteSong = useCallback((id: string) => {
    setSongs((prev) => prev.filter((s) => s.id !== id));
    setSongSelectionsState((prev) => prev.filter((s) => s.song_id !== id));
  }, []);

  // --- Choir song selection ----------------------------------------------------

  const setSongSelections: AppDataContextValue['setSongSelections'] = useCallback(
    (rotaEntryId, section, songIds, selectedBy) => {
      setSongSelectionsState((prev) => [
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
    [],
  );

  // --- Chat ------------------------------------------------------------------

  const sendChatMessage: AppDataContextValue['sendChatMessage'] = useCallback(
    (teamId, senderId, body) => {
      setChatMessages((prev) => [
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
    [],
  );

  const markTeamChatRead = useCallback((teamId: string) => {
    setUnreadByTeam((prev) => (prev[teamId] ? { ...prev, [teamId]: 0 } : prev));
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
      organisation: mockOrganisation,
      users: mockUsers,
      teams: mockTeams,
      memberships: mockMemberships,
      categories: mockCategories,
      announcements,
      events,
      rotaEntries,
      rotaAssignments,
      availabilityResponses,
      songs,
      songSelections,
      chatMessages,
      unreadByTeam,
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
      announcements,
      events,
      rotaEntries,
      rotaAssignments,
      availabilityResponses,
      songs,
      songSelections,
      chatMessages,
      unreadByTeam,
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
