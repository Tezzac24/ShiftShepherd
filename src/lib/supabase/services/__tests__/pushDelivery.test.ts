/**
 * Push delivery triggers (Chat Message Push Delivery V1, Announcement Push
 * Delivery V1, and Rota Push Delivery V1).
 *
 * The Supabase client is mocked — no Edge Function is ever invoked.
 * Guards the fire-and-forget contract: called once with just the row id(s)
 * after a live write, silent no-op in demo mode / for local ids, and no
 * failure may ever escape to break a send, a post, or a rota save. Also pins
 * the parts of the Edge Function source that must not regress (active-profile
 * caller resolution, unchanged chat/announcement resolution, and announcement
 * or rota text never being read for a payload).
 */
import { getSupabase } from '../../client';
import {
  requestAnnouncementPushDelivery,
  requestChatMessagePushDelivery,
  requestRotaPushDelivery,
} from '../pushDelivery';
import { createHash } from 'node:crypto';
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

describe('requestRotaPushDelivery', () => {
  const ENTRY_1 = '1a2b3c4d-aaaa-bbbb-cccc-1234567890ab';
  const ENTRY_2 = '2a2b3c4d-aaaa-bbbb-cccc-1234567890ab';

  it('does nothing in demo mode (no Supabase client)', () => {
    mockGetSupabase.mockReturnValue(null);
    expect(() => requestRotaPushDelivery([ENTRY_1])).not.toThrow();
  });

  it('never sends mock/local rota ids and skips the call when none remain', () => {
    const invoke = mockClient(jest.fn().mockResolvedValue({ error: null }));
    requestRotaPushDelivery(['rota-3', 'rota-4']);
    requestRotaPushDelivery([]);
    expect(invoke).not.toHaveBeenCalled();
    requestRotaPushDelivery(['rota-3', ENTRY_1]);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('send-chat-message-push', {
      body: { rotaEntryIds: [ENTRY_1] },
    });
  });

  it('invokes the same Edge Function once per logical save with only the deduplicated entry ids', () => {
    const invoke = mockClient(jest.fn().mockResolvedValue({ error: null }));
    requestRotaPushDelivery([ENTRY_1, ENTRY_2, ENTRY_1]);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('send-chat-message-push', {
      body: { rotaEntryIds: [ENTRY_1, ENTRY_2] },
    });
  });

  it('splits more than fifty entries into requests the function accepts', () => {
    const invoke = mockClient(jest.fn().mockResolvedValue({ error: null }));
    const ids = Array.from(
      { length: 51 },
      (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    );
    requestRotaPushDelivery(ids);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke.mock.calls[0][1]).toEqual({ body: { rotaEntryIds: ids.slice(0, 50) } });
    expect(invoke.mock.calls[1][1]).toEqual({ body: { rotaEntryIds: ids.slice(50) } });
  });

  it('swallows Edge Function errors and rejections so a failed push can never fail a rota save', async () => {
    mockClient(
      jest.fn().mockResolvedValue({
        error: { name: 'FunctionsHttpError', message: 'Edge Function returned 403' },
      }),
    );
    expect(() => requestRotaPushDelivery([ENTRY_1])).not.toThrow();
    await flushMicrotasks();
    expect(warnSpy).toHaveBeenCalledWith('[pushDelivery] rota push request failed', {
      name: 'FunctionsHttpError',
      message: 'Edge Function returned 403',
    });

    mockClient(jest.fn().mockRejectedValue(new Error('network down')));
    expect(() => requestRotaPushDelivery([ENTRY_1])).not.toThrow();
    await flushMicrotasks();
    expect(warnSpy).toHaveBeenCalledWith('[pushDelivery] rota push request failed', 'network down');
  });
});

describe('rota push call sites', () => {
  const source = readFileSync(join(process.cwd(), 'src/lib/appData/AppDataContext.tsx'), 'utf8');

  it('asks once per live logical save: create, plan batch, edit, cancel, and restore', () => {
    // Exactly five call sites (the import has no parenthesis).
    expect(source.match(/requestRotaPushDelivery\(/g) ?? []).toHaveLength(5);
    // Single create: only when the entry was saved live.
    expect(source).toContain('if (saved.live) requestRotaPushDelivery([saved.entry.id]);');
    // Plan the Month: one request after the ordered batch, covering every created entry.
    expect(source).toMatch(
      /saveRotaEntriesInOrder\(items,[\s\S]{0,400}requestRotaPushDelivery\(result\.created\.map\(\(entry\) => entry\.id\)\)/,
    );
    expect(source).toMatch(
      /rotasService\.updateRotaEntry\(id, patch, assignments\);[\s\S]{0,1500}requestRotaPushDelivery\(\[id\]\);/,
    );
    expect(source).toMatch(
      /rotasService\.cancelRotaEntry\(id, supabaseProfileId, reason\);[\s\S]{0,400}requestRotaPushDelivery\(\[id\]\);/,
    );
    expect(source).toMatch(
      /rotasService\.restoreRotaEntry\(id\);[\s\S]{0,400}requestRotaPushDelivery\(\[id\]\);/,
    );
  });

  it('never asks from deletes, availability responses, or the demo branches', () => {
    const deleteBranch = source.match(
      /await rotasService\.deleteRotaEntry\(id\);[\s\S]*?resyncLiveRotas\(\);\s*return;/,
    );
    expect(deleteBranch).not.toBeNull();
    expect(deleteBranch?.[0]).not.toContain('requestRotaPushDelivery');
    const availability = source.match(
      /await rotasService\.submitAvailability\([\s\S]*?\n {4}\[rotasLive, supabaseProfileId/,
    );
    expect(availability).not.toBeNull();
    expect(availability?.[0]).not.toContain('requestRotaPushDelivery');
    // The shared create helper never asks by itself; only its callers decide.
    const helper = source.match(/const saveNewRotaEntry = useCallback\([\s\S]*?\n {2}\);\n/);
    expect(helper).not.toBeNull();
    expect(helper?.[0]).not.toContain('requestRotaPushDelivery');
  });

  it('keeps Plan the Month on the single batch action', () => {
    const planMonth = readFileSync(
      join(process.cwd(), 'src/features/rota/PlanMonthScreen.tsx'),
      'utf8',
    );
    expect(planMonth.match(/data\.addRotaEntries\(/g) ?? []).toHaveLength(1);
    expect(planMonth).not.toContain('data.addRotaEntry(');
  });
});

describe('send-chat-message-push rota source contract', () => {
  function functionSlice(source: string, name: string): string {
    const start = source.indexOf(`async function ${name}(`);
    const end = source.indexOf('\n}\n', start);
    if (start < 0 || end < 0) throw new Error(`Missing ${name}`);
    return source.slice(start, end + 3);
  }

  it('leaves the chat and announcement resolvers byte-for-byte unchanged', () => {
    const source = functionSource();
    const digest = (name: string) =>
      createHash('sha256').update(functionSlice(source, name)).digest('hex').toUpperCase();
    expect(digest('resolveChatMessage')).toBe(
      'C448AF9FB3CFA6B17C5119B918D64CE12F19F226208CB91D9D3E563A1AE9F5ED',
    );
    expect(digest('resolveAnnouncement')).toBe(
      'BEFC8823D07BB3AA4AD286A2ECCD38FE9CF397293BFD4374070ECB38C5A7A48B',
    );
    // Both still flow through the single-event adapter.
    expect(source).toContain('{ delivery: singleEventDelivery(single.event) }');
  });

  it('reads only routing columns of rota entries and assignments', () => {
    const source = functionSource();
    expect(source).toContain(
      ".from('rota_entries')\n    .select('id, organisation_id, team_id, details_change_id, details_changed_at')",
    );
    expect(source).toContain(
      ".from('rota_assignments')\n      .select('id, rota_entry_id, user_id, created_at')",
    );
    expect(source).not.toMatch(
      /\.from\('rota_(entries|assignments)'\)\s*\.select\('[^']*\b(title|notes|date|time|role_name|status)\b/,
    );
    expect(source).not.toContain("from('availability_responses')");
  });

  it('requires one active team that the caller may manage, and honours rota_notifications', () => {
    const rota = functionSlice(functionSource(), 'resolveRota');
    expect(rota).toContain('entry.organisation_id !== profile.organisation_id');
    expect(rota).toContain("'Rota entries must belong to one team'");
    expect(rota).toContain('if (!team || team.archived_at)');
    expect(rota).toContain(".eq('role', 'team_leader')");
    expect(rota).toContain(".eq('role', 'church_admin')");
    expect(rota).toContain("preferenceKeyFor({ kind: 'rota' })");
    expect(rota).toContain('actorId: profile.id');
    // Assignee memberships are checked against the entry's own team.
    expect(rota).toContain(".from('team_memberships').select('user_id').eq('team_id', teamId)");
  });

  it('coalesces claims into one message per device for every kind', () => {
    const source = functionSource();
    expect(source).toContain('const devices = groupPendingClaimsByToken(claimed, tokenById);');
    expect(source).toContain(
      'part.flatMap((device, index) => buildExpoMessages([device.token], contents[index]))',
    );
    expect(source).toContain(
      ".select('id, event_type, event_id, recipient_user_id, push_token_id, status')",
    );
  });
});
