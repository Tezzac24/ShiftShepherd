export type User = {
  id: string;
  name: string;
  email: string;
  phone?: string;
};

export type Team = {
  id: string;
  name: string;
  description?: string;
  whatsappGroupLink?: string;
};

export type Event = {
  id: string;
  name: string;
  start: string;
  end?: string;
  location?: string;
};

export type AssignmentStatus = 'assigned' | 'cancelled';

export type Assignment = {
  id: string;
  eventId: string;
  teamId: string;
  userId: string;
  role: string;
  status: AssignmentStatus;
  notes?: string;
};

const baseDate = new Date();
const startOfToday = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());

const toIsoAt = (daysFromNow: number, hour: number, minute: number) => {
  const d = new Date(startOfToday);
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};

export const mockUser: User = {
  id: 'user-1',
  name: 'Jordan Kim',
  email: 'jordan.kim@example.com',
  phone: '+44 7911 123456',
};

export const mockTeams: Team[] = [
  {
    id: 'team-1',
    name: 'Worship Team',
    description: 'Vocals and band serving Sunday services and rehearsals.',
    whatsappGroupLink: 'https://chat.whatsapp.com/sample-worship-link',
  },
  {
    id: 'team-2',
    name: 'Media Team',
    description: 'Cameras, livestream, and visuals.',
    whatsappGroupLink: 'https://chat.whatsapp.com/sample-media-link',
  },
];

export const mockEvents: Event[] = [
  {
    id: 'event-1',
    name: 'Sunday Service',
    start: toIsoAt(2, 10, 0),
    end: toIsoAt(2, 11, 30),
    location: 'Main Hall',
  },
  {
    id: 'event-2',
    name: 'Thursday Rehearsal',
    start: toIsoAt(1, 19, 0),
    end: toIsoAt(1, 20, 30),
    location: 'Auditorium',
  },
  {
    id: 'event-3',
    name: 'Family Service',
    start: toIsoAt(7, 9, 30),
    end: toIsoAt(7, 11, 0),
    location: 'Main Hall',
  },
  {
    id: 'event-4',
    name: 'Media Training Night',
    start: toIsoAt(5, 18, 30),
    end: toIsoAt(5, 20, 0),
    location: 'Production Room',
  },
];

export const mockAssignments: Assignment[] = [
  {
    id: 'assignment-1',
    eventId: 'event-1',
    teamId: 'team-1',
    userId: 'user-1',
    role: 'Lead Vocal',
    status: 'assigned',
    notes: 'Arrive 45 mins before for soundcheck.',
  },
  {
    id: 'assignment-2',
    eventId: 'event-2',
    teamId: 'team-1',
    userId: 'user-1',
    role: 'Keys',
    status: 'assigned',
    notes: 'Bring in-ears.',
  },
  {
    id: 'assignment-3',
    eventId: 'event-4',
    teamId: 'team-2',
    userId: 'user-1',
    role: 'Camera Op',
    status: 'assigned',
  },
  {
    id: 'assignment-4',
    eventId: 'event-3',
    teamId: 'team-1',
    userId: 'user-1',
    role: 'Backing Vocal',
    status: 'assigned',
  },
];

export const getEventById = (id: string) => mockEvents.find((event) => event.id === id);
export const getTeamById = (id: string) => mockTeams.find((team) => team.id === id);
export const getAssignmentById = (id: string) => mockAssignments.find((assignment) => assignment.id === id);

export const getAssignmentsForUser = (userId: string) =>
  mockAssignments
    .filter((assignment) => assignment.userId === userId)
    .sort((a, b) => {
      const eventA = getEventById(a.eventId);
      const eventB = getEventById(b.eventId);
      const timeA = eventA ? new Date(eventA.start).getTime() : 0;
      const timeB = eventB ? new Date(eventB.start).getTime() : 0;
      return timeA - timeB;
    });

export const getAssignmentsForTeam = (teamId: string) =>
  mockAssignments
    .filter((assignment) => assignment.teamId === teamId)
    .sort((a, b) => {
      const eventA = getEventById(a.eventId);
      const eventB = getEventById(b.eventId);
      const timeA = eventA ? new Date(eventA.start).getTime() : 0;
      const timeB = eventB ? new Date(eventB.start).getTime() : 0;
      return timeA - timeB;
    });

export const getNextAssignmentForUser = (userId: string) => {
  const now = Date.now();
  return getAssignmentsForUser(userId).find((assignment) => {
    const event = getEventById(assignment.eventId);
    return event ? new Date(event.start).getTime() >= now : false;
  });
};
