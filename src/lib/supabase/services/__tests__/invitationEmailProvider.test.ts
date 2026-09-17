/**
 * Resend delivery adapter of the manage-organisation-invitations Edge Function.
 *
 * `emailProvider.ts` has no Deno globals or imports and receives `fetch` as an
 * argument, so it is imported straight from supabase/functions and exercised
 * offline with a fake provider. Nothing here reaches the network or sends an
 * email. These tests pin the request shape, the rejected-versus-unavailable
 * status mapping (including Resend's test-mode 403), the timeout, network
 * failures, and that results never carry the API key or the provider's
 * free-text message.
 */
import {
  classifyProviderStatus,
  deliveryErrorCode,
  EMAIL_PROVIDER_TIMEOUT_MS,
  providerErrorName,
  RESEND_EMAILS_ENDPOINT,
  sendInvitationEmail,
  type ProviderFetch,
  type ProviderRequestInit,
} from '../../../../../supabase/functions/manage-organisation-invitations/emailProvider';

const API_KEY = 're_test_value_not_a_real_key';
const MESSAGE = {
  from: 'Shift Shepherd <invites@mail.shiftshepherd.example>',
  to: 'new.member@grace.example',
  subject: 'You’re invited to Grace Church on Shift Shepherd',
  html: '<p>Open invitation</p>',
};
const TEST_MODE_REJECTION = JSON.stringify({
  statusCode: 403,
  name: 'validation_error',
  message:
    'You can only send testing emails to your own email address (owner@shiftshepherd.example). To send emails to other recipients, please verify a domain.',
});

function providerReturning(status: number, body = '') {
  const calls: { url: string; init: ProviderRequestInit }[] = [];
  const fetch: ProviderFetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, text: async () => body };
  };
  return { fetch, calls };
}

afterEach(() => {
  jest.useRealTimers();
});

describe('sendInvitationEmail request', () => {
  it('posts one JSON message to the Resend emails endpoint with bearer auth', async () => {
    const provider = providerReturning(200, JSON.stringify({ id: 'email-id' }));
    await expect(
      sendInvitationEmail({ apiKey: API_KEY, message: MESSAGE, fetch: provider.fetch }),
    ).resolves.toEqual({ ok: true });

    expect(provider.calls).toHaveLength(1);
    const [{ url, init }] = provider.calls;
    expect(url).toBe('https://api.resend.com/emails');
    expect(url).toBe(RESEND_EMAILS_ENDPOINT);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(init.body)).toEqual({
      from: MESSAGE.from,
      to: [MESSAGE.to],
      subject: MESSAGE.subject,
      html: MESSAGE.html,
    });
    expect(init.signal.aborted).toBe(false);
  });

  it.each([200, 201, 202])('treats HTTP %s as delivered', async (status) => {
    const provider = providerReturning(status);
    await expect(
      sendInvitationEmail({ apiKey: API_KEY, message: MESSAGE, fetch: provider.fetch }),
    ).resolves.toEqual({ ok: true });
  });

  it('stays delivered when an accepted response body cannot be read', async () => {
    const fetch: ProviderFetch = async () => ({
      ok: true,
      status: 200,
      text: async () => {
        throw new Error('body stream failed');
      },
    });
    await expect(sendInvitationEmail({ apiKey: API_KEY, message: MESSAGE, fetch })).resolves.toEqual({
      ok: true,
    });
  });
});

describe('provider failure mapping', () => {
  it('maps the Resend test-mode rejection to a non-retryable rejection', async () => {
    const provider = providerReturning(403, TEST_MODE_REJECTION);
    const result = await sendInvitationEmail({
      apiKey: API_KEY,
      message: MESSAGE,
      fetch: provider.fetch,
    });
    expect(result).toEqual({
      ok: false,
      failure: 'rejected',
      reason: 'provider_status',
      providerStatus: 403,
      providerError: 'validation_error',
    });
    expect(result.ok ? null : deliveryErrorCode(result.failure)).toBe('EMAIL_DELIVERY_REJECTED');
    const serialised = JSON.stringify(result);
    expect(serialised).not.toContain('owner@shiftshepherd.example');
    expect(serialised).not.toContain('testing emails');
    expect(serialised).not.toContain(API_KEY);
  });

  it.each([
    [400, 'validation_error'],
    [401, 'missing_api_key'],
    [403, 'restricted_api_key'],
    [404, 'not_found'],
    [405, 'method_not_allowed'],
    [422, 'invalid_from_address'],
    [451, 'security_error'],
  ])('rejects HTTP %s (%s) as not worth retrying unchanged', async (status, name) => {
    const provider = providerReturning(
      status,
      JSON.stringify({ statusCode: status, name, message: 'x' }),
    );
    await expect(
      sendInvitationEmail({ apiKey: API_KEY, message: MESSAGE, fetch: provider.fetch }),
    ).resolves.toEqual({
      ok: false,
      failure: 'rejected',
      reason: 'provider_status',
      providerStatus: status,
      providerError: name,
    });
    expect(classifyProviderStatus(status)).toBe('rejected');
  });

  it.each([
    [408, null],
    [409, 'concurrent_idempotent_requests'],
    [425, null],
    [429, 'rate_limit_exceeded'],
    [429, 'daily_quota_exceeded'],
    [500, 'application_error'],
    [502, null],
    [503, 'service_unavailable'],
    [504, null],
  ])('treats HTTP %s (%s) as temporarily unavailable', async (status, name) => {
    const body = name
      ? JSON.stringify({ statusCode: status, name, message: 'x' })
      : '<html>Bad gateway</html>';
    const provider = providerReturning(status, body);
    await expect(
      sendInvitationEmail({ apiKey: API_KEY, message: MESSAGE, fetch: provider.fetch }),
    ).resolves.toEqual({
      ok: false,
      failure: 'unavailable',
      reason: 'provider_status',
      providerStatus: status,
      providerError: name,
    });
    expect(deliveryErrorCode(classifyProviderStatus(status))).toBe('EMAIL_DELIVERY_UNAVAILABLE');
  });

  it('keeps only a machine-readable provider error name', () => {
    expect(providerErrorName(JSON.stringify({ name: 'rate_limit_exceeded' }))).toBe(
      'rate_limit_exceeded',
    );
    expect(providerErrorName(JSON.stringify({ name: 'Rate limit exceeded!' }))).toBeNull();
    expect(providerErrorName(JSON.stringify({ name: 'owner@shiftshepherd.example' }))).toBeNull();
    expect(providerErrorName(JSON.stringify({ name: 'a'.repeat(65) }))).toBeNull();
    expect(providerErrorName(JSON.stringify({ message: 'no name' }))).toBeNull();
    expect(providerErrorName(JSON.stringify([{ name: 'validation_error' }]))).toBeNull();
    expect(providerErrorName('not json')).toBeNull();
    expect(providerErrorName('')).toBeNull();
    expect(
      providerErrorName(JSON.stringify({ name: 'validation_error', pad: 'x'.repeat(5000) })),
    ).toBeNull();
  });
});

describe('network failures and timeouts', () => {
  it('reports a network failure as unavailable instead of throwing', async () => {
    const fetch: ProviderFetch = async () => {
      throw new TypeError('error sending request for url (https://api.resend.com/emails)');
    };
    await expect(sendInvitationEmail({ apiKey: API_KEY, message: MESSAGE, fetch })).resolves.toEqual(
      {
        ok: false,
        failure: 'unavailable',
        reason: 'network',
        providerStatus: null,
        providerError: null,
      },
    );
  });

  it('aborts a provider call that exceeds the timeout and reports it as unavailable', async () => {
    jest.useFakeTimers();
    const signals: AbortSignal[] = [];
    const fetch: ProviderFetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        signals.push(init.signal);
        init.signal.addEventListener('abort', () => reject(new Error('The operation was aborted')));
      });
    const pending = sendInvitationEmail({ apiKey: API_KEY, message: MESSAGE, fetch });

    expect(signals).toHaveLength(1);
    jest.advanceTimersByTime(EMAIL_PROVIDER_TIMEOUT_MS - 1);
    expect(signals[0].aborted).toBe(false);
    jest.advanceTimersByTime(1);
    expect(signals[0].aborted).toBe(true);

    await expect(pending).resolves.toEqual({
      ok: false,
      failure: 'unavailable',
      reason: 'timeout',
      providerStatus: null,
      providerError: null,
    });
    expect(EMAIL_PROVIDER_TIMEOUT_MS).toBe(10_000);
  });

  it('honours a custom timeout and clears its timer once the provider answers', async () => {
    jest.useFakeTimers();
    const provider = providerReturning(202);
    await expect(
      sendInvitationEmail({
        apiKey: API_KEY,
        message: MESSAGE,
        fetch: provider.fetch,
        timeoutMs: 50,
      }),
    ).resolves.toEqual({ ok: true });
    expect(jest.getTimerCount()).toBe(0);
  });
});
