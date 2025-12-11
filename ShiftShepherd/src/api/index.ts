import {
  Assignment,
  Event,
  Team,
  User,
  getAssignmentById,
  getAssignmentsForTeam,
  getAssignmentsForUser,
  getEventById,
  getTeamById,
  getNextAssignmentForUser,
  mockAssignments,
  mockEvents,
  mockTeams,
  mockUser,
} from '../data/mockData';

const delay = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchCurrentUser(): Promise<User> {
  await delay();
  return mockUser;
}

export async function fetchTeams(): Promise<Team[]> {
  await delay();
  return mockTeams;
}

export async function fetchEvents(): Promise<Event[]> {
  await delay();
  return mockEvents;
}

export async function fetchAssignments(): Promise<Assignment[]> {
  await delay();
  return mockAssignments;
}

export async function fetchAssignmentsForUser(userId: string): Promise<Assignment[]> {
  await delay();
  return getAssignmentsForUser(userId);
}

export async function fetchAssignmentsForTeam(teamId: string): Promise<Assignment[]> {
  await delay();
  return getAssignmentsForTeam(teamId);
}

export async function fetchAssignmentById(id: string) {
  await delay();
  return getAssignmentById(id);
}

export async function fetchEventById(id: string) {
  await delay();
  return getEventById(id);
}

export async function fetchTeamById(id: string) {
  await delay();
  return getTeamById(id);
}

export async function fetchNextAssignment(userId: string) {
  await delay();
  return getNextAssignmentForUser(userId);
}
