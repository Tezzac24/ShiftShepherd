/**
 * App data store for the scaffold.
 *
 * Holds every mutable collection in React state, seeded from mock data.
 * Actions mirror the calls a Supabase service layer would expose, so wiring
 * the real backend later means swapping implementations, not screens.
 *
 * TODO: wire to Supabase — replace state mutations with inserts/updates/
 * deletes + Realtime subscriptions.
 */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

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

export interface NewRotaAssignmentInput {
  user_id: string;
  role_name: string;
}

interface AppDataContextValue {
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
    input: Omit<RotaEntry, 'id' | 'organisation_id' | 'created_at' | 'updated_at'>,
    assignments: NewRotaAssignmentInput[],
  ) => RotaEntry;
  updateRotaEntry: (
    id: string,
    patch: Partial<RotaEntry>,
    assignments?: NewRotaAssignmentInput[],
  ) => void;
  deleteRotaEntry: (id: string) => void;
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

  // Choir song selection (replaces the whole selection for a rota date)
  setSongSelections: (rotaEntryId: string, songIds: string[], selectedBy: string) => void;

  // Chat
  sendChatMessage: (teamId: string, senderId: string, body: string) => void;
  markTeamChatRead: (teamId: string) => void;

  // Notification preferences
  getNotificationPreferences: (userId: string) => NotificationPreferences;
  updateNotificationPreferences: (
    userId: string,
    patch: Partial<NotificationPreferences>,
  ) => void;
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
    (rotaEntryId, songIds, selectedBy) => {
      setSongSelectionsState((prev) => [
        ...prev.filter((s) => s.rota_entry_id !== rotaEntryId),
        ...songIds.map((songId, i) => ({
          id: makeId('sel'),
          rota_entry_id: rotaEntryId,
          song_id: songId,
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
      setAvailability,
      addSong,
      updateSong,
      deleteSong,
      setSongSelections,
      sendChatMessage,
      markTeamChatRead,
      getNotificationPreferences,
      updateNotificationPreferences,
    }),
    [
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
      setAvailability,
      addSong,
      updateSong,
      deleteSong,
      setSongSelections,
      sendChatMessage,
      markTeamChatRead,
      getNotificationPreferences,
      updateNotificationPreferences,
    ],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppDataContextValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider');
  return ctx;
}
