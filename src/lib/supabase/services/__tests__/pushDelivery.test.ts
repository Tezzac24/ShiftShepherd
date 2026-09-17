/**
 * Push delivery triggers (Chat Message Push Delivery V1 + Announcement Push
 * Delivery V1).
 *
 * The Supabase client is mocked — no Edge Function is ever invoked.
 * Guards the fire-and-forget contract: called once with just the row id
 * after a live write, silent no-op in demo mode / for local ids, and no
 * failure may ever escape to break a send or a post. Also pins the parts of
 * the Edge Function source that must not regress (active-profile caller
 * resolution, and announcement text never being read for a payload).
 */
import { getSupabase } from '../../client';
import {
  requestAnnouncementPushDelivery,
  requestChatMessagePushDelivery,
} from '../pushDelivery';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

jest.mock('../../client', () => ({ getSupabase: jest.fn() }));

const mockGetSupabase = getSupabase as jest.Mock;

const MESSAGE_ID = '3f2f1a9c-aaaa-bbbb-cccc-1234567890ab';
const ANNOUNCEMENT_ID = '7c1d2e3f-aaaa-bbbb-cccc-1234567890ab';

function mockClient(invokeImpl: jest.Mock) {
  mockGetSupabase.mockReturnValue({ functions: { invoke: invokeImpl } });
  return invokeImpl;
}

// The trigger is fire-and-forget, so settle its internal promise chain
// before asserting on side effects.
const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

function functionSource(): string {
  return readFileSync(
    join(process.cwd(), 'supabase/functions/send-chat-message-push/index.ts'),
    'utf8',
  );
}

let warnSpy: jest.SpyInstance;

beforeEach(() => {
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe('requestChatMessagePushDelivery', () => {
  it('does nothing in demo mode (no Supabase client)', () => {
    mockGetSupabase.mockReturnValue(null);
    expect(() => requestChatMessagePushDelivery(MESSAGE_ID)).not.toThrow();
  });

  it('never sends mock/local message ids to the Edge Function', () => {
    const invoke = mockClient(jest.fn());
    requestChatMessagePushDelivery('msg-3');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('invokes send-chat-message-push exactly once with only the messageId', () => {
    const invoke = mockClient(jest.fn().mockResolvedValue({ error: null }));
    requestChatMessagePushDelivery(MESSAGE_ID);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('send-chat-message-push', {
      body: { messageId: MESSAGE_ID },
    });
  });

  it('swallows Edge Function errors so a failed push can never fail the send', async () => {
    mockClient(
      jest.fn().mockResolvedValue({
        error: { name: 'FunctionsHttpError', message: 'Edge Function returned 500' },
      }),
    );
    expect(() => requestChatMessagePushDelivery(MESSAGE_ID)).not.toThrow();
    await flushMicrotasks();
    // Redacted dev warning only — never a user-facing error.
    expect(warnSpy).toHaveBeenCalledWith('[pushDelivery] chat push request failed', {
      name: 'FunctionsHttpError',
      message: 'Edge Function returned 500',
    });
  });

  it('swallows a rejected invoke (network down) without an unhandled rejection', async () => {
    mockClient(jest.fn().mockRejectedValue(new Error('network down')));
    expect(() => requestChatMessagePushDelivery(MESSAGE_ID)).not.toThrow();
    await flushMicrotasks();
    expect(warnSpy).toHaveBeenCalledWith(
      '[pushDelivery] chat push request failed',
      'network down',
    );
  });

  it('resolves the sender through the validated active profile for multi-org accounts', () => {
    const source = functionSource();
    expect(source).toContain(".from('user_accounts')");
    expect(source).toContain(".select('active_profile_id')");
    expect(source).toContain(".eq('id', account.active_profile_id)");
    expect(source).not.toMatch(
      /\.from\('profiles'\)\s*\.select\('id, organisation_id'\)\s*\.eq\('auth_user_id'/,
    );
  });
});

describe('requestAnnouncementPushDelivery', () => {
  it('does nothing in demo mode (no Supabase client)', () => {
    mockGetSupabase.mockReturnValue(null);
    expect(() => requestAnnouncementPushDelivery(ANNOUNCEMENT_ID)).not.toThrow();
  });

  it('never sends mock/local announcement ids to the Edge Function', () => {
    const invoke = mockClient(jest.fn());
    requestAnnouncementPushDelivery('ann-3');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('invokes the same Edge Function exactly once with only the announcementId', () => {
    const invoke = mockClient(jest.fn().mockResolvedValue({ error: null }));
    requestAnnouncementPushDelivery(ANNOUNCEMENT_ID);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('send-chat-message-push', {
      body: { announcementId: ANNOUNCEMENT_ID },
    });
  });

  it('swallows Edge Function errors so a failed push can never fail the post', async () => {
    mockClient(
      jest.fn().mockResolvedValue({
        error: { name: 'FunctionsHttpError', message: 'Edge Function returned 404' },
      }),
    );
    expect(() => requestAnnouncementPushDelivery(ANNOUNCEMENT_ID)).not.toThrow();
    await flushMicrotasks();
    expect(warnSpy).toHaveBeenCalledWith('[pushDelivery] announcement push request failed', {
      name: 'FunctionsHttpError',
      message: 'Edge Function returned 404',
    });
  });

  it('swallows a rejected invoke without an unhandled rejection', async () => {
    mockClient(jest.fn().mockRejectedValue(new Error('network down')));
    expect(() => requestAnnouncementPushDelivery(ANNOUNCEMENT_ID)).not.toThrow();
    await flushMicrotasks();
    expect(warnSpy).toHaveBeenCalledWith(
      '[pushDelivery] announcement push request failed',
      'network down',
    );
  });

  it('is requested only from the live announcement create path, never from edits', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/lib/appData/AppDataContext.tsx'),
      'utf8',
    );
    const calls = source.match(/requestAnnouncementPushDelivery\(/g) ?? [];
    // Exactly one call site (the import has no parenthesis).
    expect(calls).toHaveLength(1);
    expect(source).toMatch(
      /createAnnouncement\([\s\S]{0,400}requestAnnouncementPushDelivery\(created\.id\)/,
    );
    expect(source).not.toMatch(
      /updateAnnouncement\([\s\S]{0,600}requestAnnouncementPushDelivery/,
    );
  });

  it('reads only routing columns of the announcement and shares the pure dispatch rules', () => {
    const source = functionSource();
    expect(source).toContain("from './dispatch.ts'");
    expect(source).toContain(
      ".from('announcements')\n    .select('id, organisation_id, team_id, created_by, created_at')",
    );
    // Announcement text can never reach a payload: it is never selected.
    expect(source).not.toMatch(/\.from\('announcements'\)[\s\S]{0,300}(title|body|image_url)/);
    // Team announcements refuse archived teams and resolve members only.
    expect(source).toContain(".select('id, name, archived_at')");
    expect(source).toContain('if (!team || team.archived_at)');
    // Church-wide readership is active linked profiles of that organisation.
    expect(source).toContain(".eq('access_status', 'active')");
    expect(source).toContain(".not('auth_user_id', 'is', null)");
    // Author-only, same-organisation authority.
    expect(source).toContain('announcement.created_by !== profile.id');
    expect(source).toContain('announcement.organisation_id !== profile.organisation_id');
  });
});
