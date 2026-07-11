/**
 * Chat push delivery trigger (Chat Message Push Delivery V1).
 *
 * The Supabase client is mocked — no Edge Function is ever invoked.
 * Guards the fire-and-forget contract: called once with just the messageId
 * after a live send, silent no-op in demo mode / for local ids, and no
 * failure may ever escape to break a message send.
 */
import { getSupabase } from '../../client';
import { requestChatMessagePushDelivery } from '../pushDelivery';

jest.mock('../../client', () => ({ getSupabase: jest.fn() }));

const mockGetSupabase = getSupabase as jest.Mock;

const MESSAGE_ID = '3f2f1a9c-aaaa-bbbb-cccc-1234567890ab';

function mockClient(invokeImpl: jest.Mock) {
  mockGetSupabase.mockReturnValue({ functions: { invoke: invokeImpl } });
  return invokeImpl;
}

// The trigger is fire-and-forget, so settle its internal promise chain
// before asserting on side effects.
const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

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
});
