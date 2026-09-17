# Production Email & Invitation Delivery Readiness

This runbook lists everything that must be true before Shift Shepherd sends email to real people, the exact owner actions that are still outstanding, and how the app and the `manage-organisation-invitations` Edge Function behave until they are done. The repository side (configuration validation, link building, provider error handling, and plain-language app messages) is implemented; the remaining items are owner-controlled accounts, DNS, secrets, and hosted Supabase Auth settings that code cannot change.

Nothing in this runbook has been executed against the hosted project by automation. Live delivery QA, including the first invitation to an arbitrary recipient, remains a manual owner step (section 5).

## 1. What sends email

| Email | Sent by | Configured by |
| --- | --- | --- |
| Organisation invitation | `manage-organisation-invitations` Edge Function, through the Resend HTTP API | Edge Function secrets `RESEND_API_KEY`, `INVITATION_FROM_EMAIL`, `INVITATION_APP_BASE_URL` |
| Sign-up confirmation (and any other Supabase Auth email) | Supabase Auth | Hosted Auth settings: SMTP, rate limits, Site URL, redirect URLs, email templates |

`supabase/config.toml` only configures the local development stack (`site_url = "http://127.0.0.1:3000"`, local email testing server, confirmations off). It does not change the hosted project, and the repository has no Auth email templates: the hosted dashboard is the source of truth for Auth email settings.

## 2. Known limits of the current development setup

- **Resend test sender.** Invitations are sent from `onboarding@resend.dev`. Resend's testing domain delivers only to the Resend account owner's own address and rejects every other recipient with HTTP 403 (`validation_error`). Only a verified sending domain removes this limit.
- **Custom-scheme links.** Invitation links use the `shiftshepherd://` app scheme. They open only on a device with a development or store build that registers the scheme (Expo Go cannot), and many email clients do not make custom-scheme links clickable. The email now also prints the link as copyable text, but production links should be https.
- **Built-in Auth email service.** Without custom SMTP, Supabase Auth sends only to addresses that are members of the Supabase organisation's team (others fail with `email_address_not_authorized`), applies a low hourly email limit (`over_email_send_rate_limit`), and offers no delivery guarantee.
- **Addresses without mail servers.** Supabase Auth rejects sign-ups for domains that cannot receive email, such as `example.com`, `.test`, or `.invalid` (`email_address_invalid`). Use real inboxes (plus-addressing works) for QA accounts.

## 3. Owner actions, in order

Apply these to `shift-shepherd-dev` first and verify (section 5) before repeating them for any production project. Never paste keys into chat, commits, issues, or `EXPO_PUBLIC_*` variables.

### 3.1 Own a domain

Choose a domain whose DNS you control. Resend recommends sending from a subdomain (for example a dedicated `mail` or `updates` subdomain of your domain) so transactional reputation stays separate. You also need an https host for invitation links (section 3.4); it can be another subdomain of the same domain.

### 3.2 Verify the sending domain in Resend

1. Resend dashboard, **Domains**, **Add domain**: enter the sending subdomain.
2. Add every DNS record Resend lists for it, exactly as shown: the SPF records (an MX record and a TXT record on the `send` host) and the DKIM record(s). Record names and values differ per domain and region, so always copy them from the dashboard.
3. Wait until the domain shows **Verified**.
4. Recommended: publish a DMARC TXT record at `_dmarc` for your domain, starting in monitoring mode (`p=none`) and tightening later.

### 3.3 Create a sending-only API key

Resend dashboard, **API Keys**, **Create API key**: permission **Sending access**, restricted to the verified domain. Store the key only in the places named in 3.5 and 3.6. Revoke the development key if it will no longer be used.

### 3.4 Provide an https host for invitation links

The invitation link is `<INVITATION_APP_BASE_URL>/invite/accept?token=<token>`.

- **Available now: web app.** Export the web build (`npx expo export --platform web`, with the real `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` set at build time) and host `dist/` on an https origin that serves `/invite/accept` (static hosts with "clean URLs" do this). The recipient opens the invitation in the browser, signs in or creates an account there, and accepts. Prefer a dedicated origin. A sub-path base (for example `https://<host>/shift-shepherd`) is supported by the function, but the web build must then also be configured for that base path, which is a repository change.
- **Follow-up repository change: open the installed app from the https link.** iOS Universal Links and Android App Links need the owned host plus two owner-supplied values: the Apple Developer Team ID (for `/.well-known/apple-app-site-association`, bundle identifier `com.tezzac24.shiftshepherd`) and the SHA-256 fingerprint of the Android release signing certificate (for `/.well-known/assetlinks.json`, package `com.tezzac24.shiftshepherd`). With those, the app config gains `ios.associatedDomains` (`applinks:<host>`) and an Android `intentFilters` entry (`autoVerify`, https, the host, path prefix `/invite`), followed by a new EAS build and hosting both well-known files on the same host. The app router already routes `https://<host>/invite/accept?token=...` to the invitation screen.

### 3.5 Update the invitation function secrets

Set the three secrets in the Supabase dashboard (**Edge Functions**, **Secrets**) or with `supabase secrets set --project-ref <project-ref> --env-file <file>` using a file outside the repository that you delete afterwards. Secret changes apply to new invocations immediately; no function redeploy is needed.

| Secret | Production value | Accepted format |
| --- | --- | --- |
| `RESEND_API_KEY` | The sending-access key from 3.3 | Printable ASCII with no spaces (surrounding whitespace is trimmed) |
| `INVITATION_FROM_EMAIL` | An address on the verified domain, for example `Shift Shepherd <invites@<verified sending domain>>` | `address@domain` or `Display Name <address@domain>` |
| `INVITATION_APP_BASE_URL` | The https origin from 3.4, for example `https://<app host>` | `https://host[:port][/base-path]`; development only: `shiftshepherd://`, or `http://localhost`, `http://127.0.0.1`, `http://[::1]` with optional port and path. No query, fragment, or credentials. |

For web-target development QA of invitation acceptance on one machine, `INVITATION_APP_BASE_URL` may temporarily point at the local web origin (for example `http://localhost:8081`); restore the previous value afterwards.

### 3.6 Configure custom SMTP for Supabase Auth

Supabase dashboard, **Authentication**, **SMTP Settings** (`/dashboard/project/<project-ref>/auth/smtp`), enable custom SMTP:

- Sender email: an address on the verified domain (for example `no-reply@<verified sending domain>`); sender name: `Shift Shepherd`.
- Host `smtp.resend.com`; port `465` (implicit TLS) or `587` (STARTTLS); username `resend`; password: the Resend API key.

After saving, Supabase applies a 30 emails per hour limit. Raise it to the expected sign-up volume under **Authentication**, **Rate Limits** (`/dashboard/project/<project-ref>/auth/rate-limits`).

### 3.7 Set the Site URL and redirect URLs

**Authentication**, **URL Configuration** (`/dashboard/project/<project-ref>/auth/url-configuration`):

- **Site URL:** the https origin from 3.4. The app does not pass `emailRedirectTo`, so a confirmation link verifies the address and then opens the Site URL; the person returns to the app (or the web app) and logs in with their password, as the sign-up screen tells them.
- **Redirect URLs:** add the same https origin (for example `https://<app host>/**`). Remove development-only entries from a production project.

### 3.8 Review the Auth email templates

**Authentication**, **Email Templates**: keep `{{ .ConfirmationURL }}` in **Confirm signup** and adjust the subject and wording to name Shift Shepherd. Templates are hosted-only; nothing in the repository overrides them.

## 4. Behaviour until email is ready

### Invitation function

Send and resend validate the three secrets before any invitation is issued or an older link is superseded.

| Response `error` | HTTP | Meaning | Invitation state | Admin message |
| --- | --- | --- | --- | --- |
| `INVITATION_EMAIL_NOT_CONFIGURED` | 503 | A secret is missing or malformed | Nothing issued or superseded | "Invitation emails aren’t set up yet, so nothing was sent. Please try again later." |
| `EMAIL_DELIVERY_REJECTED` | 502 | Resend refused the message: sender or domain not verified, test-mode recipient, invalid or revoked key, or invalid payload (any 4xx except 408, 409, 425, 429) | Saved as pending, not emailed | Saved but not delivered; check the address, then use Resend |
| `EMAIL_DELIVERY_UNAVAILABLE` | 502 | Rate limit, provider or network outage, or no answer within 10 seconds | Saved as pending, not emailed | Saved; the email service is busy; use Resend in a few minutes |
| `EMAIL_DELIVERY_FAILED` | 502 | The email could not be prepared (unexpected) | Saved as pending, not emailed | Saved but not sent; use Resend |

The invitation history marks a pending invitation that was never emailed as "Email not sent yet. Use Resend to email a new link." Resend issues a new link and supersedes the unsent one.

Function logs contain only fixed codes: configuration `problems` (for example `INVITATION_FROM_EMAIL_MALFORMED`), the provider HTTP status, and Resend's machine-readable error name (for example `validation_error`). They never contain email addresses, tokens, links, keys, or provider message text. Two warnings flag configuration that works but is not production-ready: `INVITATION_FROM_EMAIL_IS_RESEND_TEST_SENDER` and `INVITATION_APP_BASE_URL_NOT_HTTPS`. Both disappear once 3.5 is complete.

### Sign-up and log-in

| Supabase Auth code | Shown to the person |
| --- | --- |
| `email_not_confirmed` (log in before confirming) | "Please confirm your email address first. Open the link in the confirmation email we sent you, then log in." |
| `over_email_send_rate_limit`, `email_address_not_authorized` (sign-up) | "We couldn’t send a confirmation email just now. Please try again later." |
| `email_address_invalid` (sign-up) | "That email address can’t be used. Please check it and try again." |

## 5. Verification after the owner actions (manual)

Use inboxes you control; never invite real members during this check.

1. Invite an inbox you control that is not the Resend account owner's address, on a different email provider. The email arrives from the verified domain, the function logs show neither warning, and the history shows a "Sent" date.
2. Open the link from that inbox on a phone and on a desktop: the invitation screen loads, and acceptance works after signing in with the invited address.
3. Sign up with a new real inbox: the confirmation email arrives from the verified domain; logging in before confirming shows the confirmation message; after confirming, log-in works.
4. Inspect the received headers: SPF and DKIM pass, and the messages are not in spam.
5. Only after these pass, record the result in `docs/supabase-integration-plan.md` and approve real invitations.

## 6. Deferred and out of scope

- **Password reset** is not implemented and is not specified by `docs/shift_shepherd_design_doc.md` or `docs/one-shot-build-prompt.md`; it is deferred product work. Until it exists, a Supabase Auth recovery email would open the Site URL with no set-new-password screen, so do not send recovery emails to members.
- **Universal Links and App Links** follow 3.4 once the owner-supplied values exist.
- **Ambiguous timeouts:** if Resend accepts a message but does not answer within 10 seconds, the invitation shows as not sent although the email may arrive; a Resend then supersedes that link.
- **Sent marker failure:** if the email is delivered but recording `last_sent_at` fails, the history shows "Email not sent yet"; a Resend corrects it.
