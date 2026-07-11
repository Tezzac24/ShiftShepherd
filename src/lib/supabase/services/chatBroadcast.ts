/**
 * Private Supabase Broadcast transport for session-wide chat freshness.
 *
 * Database triggers emit minimal versioned signals. This client validates the
 * signal, fetches exactly one authoritative message through chat RLS, and keeps
 * one private channel per currently accessible team plus one private profile
 * read-state channel. It never sends Broadcast messages from the client.
 */
import {
  REALTIME_SUBSCRIBE_STATES,
  RealtimeChannel,
  SupabaseClient,
} from '@supabase/supabase-js';

import { ChatMessage } from '../../../types';
import { getSupabase } from '../client';
import { fetchChatMessageById } from './chat';

export const CHAT_MESSAGE_BROADCAST_EVENT = 'chat_message_inserted';
export const CHAT_READ_STATE_BROADCAST_EVENT = 'chat_read_state_changed';
export const TEAM_CHAT_TOPIC_PREFIX = 'team-chat:';
export const PROFILE_CHAT_READ_TOPIC_PREFIX = 'profile-chat-read:';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const MAX_SEEN_MESSAGE_IDS = 2_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLiveUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function requireTopicUuid(value: string, label: string): string {
  if (!isLiveUuid(value)) {
    throw new Error(`A live ${label} UUID is required.`);
  }
  return value.toLowerCase();
}

export function teamChatTopic(teamId: string): string {
  return `${TEAM_CHAT_TOPIC_PREFIX}${requireTopicUuid(teamId, 'team')}`;
}

export function profileChatReadTopic(profileId: string): string {
  return `${PROFILE_CHAT_READ_TOPIC_PREFIX}${requireTopicUuid(profileId, 'profile')}`;
}

export interface ChatMessageBroadcastPayload {
  version: 1;
  message_id: string;
  team_id: string;
  sender_id: string;
  created_at: string;
}

export interface ChatReadStateBroadcastPayload {
  version: 1;
  team_id: string;
}

function broadcastBody(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  // supabase-js callbacks receive { type, event, payload }. Accepting the inner
  // value too keeps the pure decoder independent of transport-envelope tests.
  return isRecord(value.payload) ? value.payload : value;
}

export function decodeChatMessageBroadcast(
  value: unknown,
  expectedTeamId: string,
): ChatMessageBroadcastPayload | null {
  const payload = broadcastBody(value);
  if (
    !payload ||
    payload.version !== 1 ||
    !isLiveUuid(payload.message_id) ||
    !isLiveUuid(payload.team_id) ||
    !isLiveUuid(payload.sender_id) ||
    typeof payload.created_at !== 'string' ||
    !ISO_TIMESTAMP_PATTERN.test(payload.created_at) ||
    Number.isNaN(Date.parse(payload.created_at)) ||
    payload.team_id.toLowerCase() !== expectedTeamId.toLowerCase()
  ) {
    return null;
  }

  return {
    version: 1,
    message_id: payload.message_id,
    team_id: payload.team_id,
    sender_id: payload.sender_id,
    created_at: payload.created_at,
  };
}

export function decodeChatReadStateBroadcast(
  value: unknown,
): ChatReadStateBroadcastPayload | null {
  const payload = broadcastBody(value);
  if (!payload || payload.version !== 1 || !isLiveUuid(payload.team_id)) {
    return null;
  }
  return { version: 1, team_id: payload.team_id };
}

/** Health summarized across the profile channel and desired team channels. */
export type ChatRealtimeStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected';

export interface SessionChatBroadcastHandlers {
  onMessage: (message: ChatMessage) => void;
  onReadStateChanged: (teamId: string) => void;
  onReconnect: () => void;
  onReconcileRequired: () => void;
  onStatus: (status: ChatRealtimeStatus) => void;
}

export interface SessionChatBroadcastSubscription {
  /** Set-based reconciliation; unchanged team topics retain their channels. */
  reconcileTeamIds: (teamIds: Iterable<string>) => void;
  unsubscribe: () => void;
}

type ManagedChannelState = 'connecting' | 'subscribed' | 'error' | 'closed';

interface ManagedChannel {
  channel: RealtimeChannel;
  state: ManagedChannelState;
  teamId: string | null;
}

class SessionChatBroadcastManager implements SessionChatBroadcastSubscription {
  private readonly channels = new Map<string, ManagedChannel>();
  private readonly desiredTeamIds = new Set<string>();
  private readonly seenMessageIds = new Set<string>();
  private readonly pendingMessageIds = new Set<string>();
  private readonly pendingMessageTeams = new Map<string, string>();
  private initialized = false;
  private stopped = false;
  private authInvalidated = false;
  private expectedAuthUserId: string | null = null;
  private sessionHadConnectionIssue = false;
  private authUnsubscribe: (() => void) | null = null;

  constructor(
    private readonly supabase: SupabaseClient,
    private readonly profileId: string,
    private readonly handlers: SessionChatBroadcastHandlers,
  ) {
    this.handlers.onStatus('connecting');
    void this.initialize();
  }

  reconcileTeamIds(teamIds: Iterable<string>): void {
    if (this.stopped) return;
    const next = new Set<string>();
    for (const teamId of teamIds) {
      if (isLiveUuid(teamId)) next.add(teamId.toLowerCase());
    }

    for (const teamId of this.desiredTeamIds) {
      if (!next.has(teamId)) this.removeTeamChannel(teamId);
    }
    this.desiredTeamIds.clear();
    for (const teamId of next) this.desiredTeamIds.add(teamId);
    if (this.initialized && !this.authInvalidated) this.ensureDesiredChannels();
  }

  unsubscribe(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.authUnsubscribe?.();
    this.authUnsubscribe = null;
    this.pendingMessageIds.clear();
    this.pendingMessageTeams.clear();
    this.removeAllChannels();
  }

  private async initialize(): Promise<void> {
    try {
      const { data, error } = await this.supabase.auth.getSession();
      if (error) throw error;
      const session = data.session;
      if (!session?.access_token || !session.user?.id || this.stopped) {
        if (!this.stopped) this.handlers.onStatus('disconnected');
        return;
      }

      this.expectedAuthUserId = session.user.id;
      // Required before any private channel is created/subscribed. The token is
      // neither logged nor copied into app state.
      await this.supabase.realtime.setAuth(session.access_token);
      if (this.stopped) return;

      const { data: authListener } = this.supabase.auth.onAuthStateChange(
        (event, nextSession) => {
          if (this.stopped) return;
          if (
            event === 'SIGNED_OUT' ||
            !nextSession?.access_token ||
            nextSession.user.id !== this.expectedAuthUserId
          ) {
            this.authInvalidated = true;
            this.removeAllChannels();
            this.handlers.onStatus('disconnected');
            return;
          }

          // Sending the new JWT refreshes Realtime's cached topic policies for
          // this connection. setAuth is the supported token-refresh path and
          // does not recreate or duplicate channels.
          void this.supabase.realtime.setAuth(nextSession.access_token).catch(() => {
            if (!this.stopped && !this.authInvalidated) {
              this.sessionHadConnectionIssue = true;
              this.handlers.onStatus('reconnecting');
            }
          });
        },
      );
      this.authUnsubscribe = () => authListener.subscription.unsubscribe();
      this.initialized = true;
      this.ensureDesiredChannels();
    } catch {
      if (!this.stopped) this.handlers.onStatus('disconnected');
    }
  }

  private ensureDesiredChannels(): void {
    if (this.stopped || this.authInvalidated) return;
    const profileTopic = profileChatReadTopic(this.profileId);
    if (!this.channels.has(profileTopic)) this.addProfileChannel(profileTopic);

    for (const teamId of [...this.desiredTeamIds].sort()) {
      const topic = teamChatTopic(teamId);
      if (!this.channels.has(topic)) this.addTeamChannel(topic, teamId);
    }
    this.updateOverallStatus();
  }

  private addTeamChannel(topic: string, teamId: string): void {
    const channel = this.supabase.channel(topic, { config: { private: true } });
    const managed: ManagedChannel = { channel, state: 'connecting', teamId };
    this.channels.set(topic, managed);
    channel
      .on('broadcast', { event: CHAT_MESSAGE_BROADCAST_EVENT }, (event) => {
        this.handleMessageEvent(teamId, event);
      })
      .subscribe((status) => this.handleChannelStatus(topic, managed, status));
  }

  private addProfileChannel(topic: string): void {
    const channel = this.supabase.channel(topic, { config: { private: true } });
    const managed: ManagedChannel = { channel, state: 'connecting', teamId: null };
    this.channels.set(topic, managed);
    channel
      .on('broadcast', { event: CHAT_READ_STATE_BROADCAST_EVENT }, (event) => {
        if (this.stopped || this.authInvalidated) return;
        const payload = decodeChatReadStateBroadcast(event);
        if (payload) this.handlers.onReadStateChanged(payload.team_id);
      })
      .subscribe((status) => this.handleChannelStatus(topic, managed, status));
  }

  private handleMessageEvent(teamId: string, event: unknown): void {
    if (this.stopped || this.authInvalidated || !this.desiredTeamIds.has(teamId)) return;
    const payload = decodeChatMessageBroadcast(event, teamId);
    if (
      !payload ||
      this.seenMessageIds.has(payload.message_id) ||
      this.pendingMessageIds.has(payload.message_id)
    ) {
      return;
    }

    this.pendingMessageIds.add(payload.message_id);
    this.pendingMessageTeams.set(payload.message_id, teamId);
    void fetchChatMessageById({ teamId, messageId: payload.message_id })
      .then((message) => {
        if (
          this.stopped ||
          this.authInvalidated ||
          !this.desiredTeamIds.has(teamId) ||
          this.pendingMessageTeams.get(payload.message_id) !== teamId
        ) {
          return;
        }
        if (!message) {
          this.handlers.onReconcileRequired();
          return;
        }
        this.rememberSeenMessage(payload.message_id);
        this.handlers.onMessage(message);
      })
      .catch((error) => {
        if (
          !this.stopped &&
          !this.authInvalidated &&
          this.desiredTeamIds.has(teamId) &&
          this.pendingMessageTeams.get(payload.message_id) === teamId
        ) {
          console.warn('[chatBroadcast] exact message fetch failed', {
            code: (error as { code?: string })?.code,
          });
          this.handlers.onReconcileRequired();
        }
      })
      .finally(() => {
        this.pendingMessageIds.delete(payload.message_id);
        this.pendingMessageTeams.delete(payload.message_id);
      });
  }

  private rememberSeenMessage(messageId: string): void {
    this.seenMessageIds.add(messageId);
    if (this.seenMessageIds.size <= MAX_SEEN_MESSAGE_IDS) return;
    const oldest = this.seenMessageIds.values().next().value as string | undefined;
    if (oldest) this.seenMessageIds.delete(oldest);
  }

  private handleChannelStatus(
    topic: string,
    managed: ManagedChannel,
    status: string,
  ): void {
    if (this.stopped || this.channels.get(topic) !== managed) return;
    if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
      managed.state = 'subscribed';
    } else if (
      status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR ||
      status === REALTIME_SUBSCRIBE_STATES.TIMED_OUT
    ) {
      managed.state = 'error';
      this.sessionHadConnectionIssue = true;
    } else if (status === REALTIME_SUBSCRIBE_STATES.CLOSED) {
      managed.state = 'closed';
      this.sessionHadConnectionIssue = true;
    } else {
      return;
    }
    this.updateOverallStatus();
  }

  private updateOverallStatus(): void {
    if (this.stopped || this.authInvalidated || !this.initialized) return;
    const entries = [...this.channels.values()];
    if (!entries.length) {
      this.handlers.onStatus('disconnected');
      return;
    }
    const allSubscribed = entries.every((entry) => entry.state === 'subscribed');
    if (allSubscribed) {
      this.handlers.onStatus('connected');
      if (this.sessionHadConnectionIssue) {
        this.sessionHadConnectionIssue = false;
        this.handlers.onReconnect();
      }
      return;
    }
    if (entries.every((entry) => entry.state === 'closed')) {
      this.handlers.onStatus('disconnected');
      return;
    }
    this.handlers.onStatus(this.sessionHadConnectionIssue ? 'reconnecting' : 'connecting');
  }

  private removeTeamChannel(teamId: string): void {
    let removed = false;
    for (const [topic, managed] of this.channels) {
      if (managed.teamId === teamId) {
        this.channels.delete(topic);
        void this.supabase.removeChannel(managed.channel);
        removed = true;
      }
    }
    for (const [messageId, pendingTeamId] of this.pendingMessageTeams) {
      if (pendingTeamId === teamId) {
        this.pendingMessageTeams.delete(messageId);
        this.pendingMessageIds.delete(messageId);
      }
    }
    if (removed) this.updateOverallStatus();
  }

  private removeAllChannels(): void {
    const channels = [...this.channels.values()];
    this.channels.clear();
    for (const managed of channels) void this.supabase.removeChannel(managed.channel);
  }
}

/**
 * Start a private Broadcast session. Invalid/demo profiles create no channel;
 * callers still receive a harmless disconnected status and a no-op handle.
 */
export function subscribeToSessionChatBroadcast(
  profileId: string,
  teamIds: Iterable<string>,
  handlers: SessionChatBroadcastHandlers,
): SessionChatBroadcastSubscription {
  const supabase = getSupabase();
  if (!supabase || !isLiveUuid(profileId)) {
    handlers.onStatus('disconnected');
    return { reconcileTeamIds: () => {}, unsubscribe: () => {} };
  }

  const manager = new SessionChatBroadcastManager(
    supabase,
    profileId.toLowerCase(),
    handlers,
  );
  manager.reconcileTeamIds(teamIds);
  return manager;
}
