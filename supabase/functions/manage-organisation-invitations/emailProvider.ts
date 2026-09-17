/**
 * Resend delivery adapter for invitation emails.
 *
 * Pure apart from the injected `fetch`: no Deno globals and no imports, so the
 * app's Jest suite exercises the request shape, status mapping, timeout, and
 * result hygiene offline. It never throws for provider or network failures;
 * it returns a bounded result that is safe to log. Resend's free-text error
 * `message` is never copied into a result because it can contain email
 * addresses (the test-mode rejection names the account owner's inbox); only
 * the machine-readable error `name` is kept, and only when it looks like one.
 */

export const RESEND_EMAILS_ENDPOINT = 'https://api.resend.com/emails';

/** Upper bound for one provider call, including reading its response body. */
export const EMAIL_PROVIDER_TIMEOUT_MS = 10_000;

/**
 * `rejected`: the provider refused this request and retrying it unchanged will
 * fail again (sender or domain not verified, test-mode recipient restriction,
 * invalid or revoked key, invalid payload).
 * `unavailable`: rate limiting, provider or network outage, or a timeout;
 * retrying later can succeed.
 */
export type EmailDeliveryFailure = 'rejected' | 'unavailable';

export type EmailDeliveryReason = 'provider_status' | 'timeout' | 'network';

export type EmailDeliveryErrorCode = 'EMAIL_DELIVERY_REJECTED' | 'EMAIL_DELIVERY_UNAVAILABLE';

export interface InvitationEmailMessage {
  from: string;
  to: string;
  subject: string;
  html: string;
}

export type EmailDeliveryResult =
  | { ok: true }
  | {
      ok: false;
      failure: EmailDeliveryFailure;
      reason: EmailDeliveryReason;
      providerStatus: number | null;
      providerError: string | null;
    };

export interface ProviderRequestInit {
  method: 'POST';
  headers: Record<string, string>;
  body: string;
  signal: AbortSignal;
}

export interface ProviderResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type ProviderFetch = (url: string, init: ProviderRequestInit) => Promise<ProviderResponse>;

/** 4xx statuses that mean "try again later" rather than "this request is wrong". */
const RETRYABLE_CLIENT_STATUSES = new Set([408, 409, 425, 429]);
const PROVIDER_ERROR_NAME = /^[a-z][a-z0-9_]{0,63}$/;
const MAX_ERROR_BODY_LENGTH = 4096;

export function classifyProviderStatus(status: number): EmailDeliveryFailure {
  return status >= 400 && status < 500 && !RETRYABLE_CLIENT_STATUSES.has(status)
    ? 'rejected'
    : 'unavailable';
}

/** Extracts Resend's error `name` (for example `validation_error`), or null. */
export function providerErrorName(bodyText: string): string | null {
  if (!bodyText || bodyText.length > MAX_ERROR_BODY_LENGTH) return null;
  try {
    const parsed = JSON.parse(bodyText) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const name = (parsed as { name?: unknown }).name;
    return typeof name === 'string' && PROVIDER_ERROR_NAME.test(name) ? name : null;
  } catch {
    return null;
  }
}

export function deliveryErrorCode(failure: EmailDeliveryFailure): EmailDeliveryErrorCode {
  return failure === 'rejected' ? 'EMAIL_DELIVERY_REJECTED' : 'EMAIL_DELIVERY_UNAVAILABLE';
}

export async function sendInvitationEmail(input: {
  apiKey: string;
  message: InvitationEmailMessage;
  fetch: ProviderFetch;
  timeoutMs?: number;
}): Promise<EmailDeliveryResult> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, input.timeoutMs ?? EMAIL_PROVIDER_TIMEOUT_MS);
  const providerFetch = input.fetch;

  try {
    const response = await providerFetch(RESEND_EMAILS_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: input.message.from,
        to: [input.message.to],
        subject: input.message.subject,
        html: input.message.html,
      }),
      signal: controller.signal,
    });
    // Always drain the body so the connection is released; a failure to read
    // it never changes the outcome the status already decided.
    const bodyText = await response.text().catch(() => '');
    if (response.ok) return { ok: true };
    return {
      ok: false,
      failure: classifyProviderStatus(response.status),
      reason: 'provider_status',
      providerStatus: response.status,
      providerError: providerErrorName(bodyText),
    };
  } catch {
    return {
      ok: false,
      failure: 'unavailable',
      reason: timedOut ? 'timeout' : 'network',
      providerStatus: null,
      providerError: null,
    };
  } finally {
    clearTimeout(timer);
  }
}
