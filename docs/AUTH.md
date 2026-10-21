# Sign-in: magic links, Google One Tap and two-step sign-in

How a reader gets in, what Crent has to set up outside the repo, and where the code lives. Staff and organisation second factors are in `docs/SUPPORT_MFA_RECOVERY.md`.

## 1. Magic link (F-132)

The default. `/sign-in` takes an email address and Supabase Auth sends a one-time link to `/auth/callback`, which exchanges the code for a session and writes the `__Host-akana-auth` cookies. Rate limits are in `apps/web/lib/limits.ts`. Nothing to set up beyond the Supabase email settings already in place.

## 2. Google One Tap (13.1)

### What it does

With `NEXT_PUBLIC_GOOGLE_CLIENT_ID` set, `/sign-in` shows Google's One Tap prompt and a "Continue with Google" button above the email form (`apps/web/components/auth/GoogleSignIn.tsx`). Google hands the browser an ID token. The browser posts it to `POST /auth/google` (`apps/web/app/auth/google/route.ts`), which calls Supabase `signInWithIdToken` and writes the same cookies the magic link does. The soft sign-in wall at the end of a signed-out unit (5.2) will use the same component.

With the variable blank nothing changes: no Google script, no button, the route answers 404, and the Content Security Policy never names Google. With it set, only the paths in `ONE_TAP_PATHS` (`apps/web/csp.mjs`) allow `accounts.google.com`; `/`, `/help-now` and `/publish` keep the strict policy, which `scripts/check-csp.mjs` and the e2e third-party test enforce.

The nonce: the browser mints a random value, gives Google its SHA-256, and posts the raw value with the token. Supabase checks they match, so a token cannot be swapped between submissions. The route also refuses a form posted from another site (`Sec-Fetch-Site` or `Origin`).

### Account linking by verified email

Supabase Auth links a new identity to an existing user automatically when the provider reports the same email address and marks it verified, which Google does for every Google account email. So a reader who signed up by magic link and later taps Google lands in the same account, with the same answers, purchases and membership. No code in this repo does the linking and nothing needs to be stored. The one setting to keep as it is: in Supabase, Authentication, Providers, "Allow linking identities with the same email" (automatic linking) must stay on, which is the default. If it were off, a Google sign-in would make a second, empty account.

Where the Google email is not verified (rare: a Google Workspace account whose admin turned verification off), Supabase creates a separate account. That reader can still use their magic link.

### What Crent does, Google Cloud console

1. Open console.cloud.google.com, make a project called Akana (or reuse one).
2. APIs and Services, OAuth consent screen: user type External, app name Akana, support email, the Akana domain under Authorised domains, privacy policy `https://<domain>/legal/privacy` and terms `https://<domain>/legal/terms`. Scopes: none beyond the defaults (email, profile, openid). Publish the app, so any Google account can sign in, not only test users.
3. APIs and Services, Credentials, Create credentials, OAuth client ID, type Web application, name "Akana web".
   - Authorised JavaScript origins: `https://<domain>`, `https://www.<domain>` if it serves the site, `https://akana-one.vercel.app` for the current host, and `http://localhost:3000` for local work. One Tap needs the exact origins; a Vercel preview URL that changes every deploy will not work and does not need to.
   - Authorised redirect URIs: none are needed for One Tap. If the Supabase dashboard's Google provider page shows a callback URL, add it anyway, so the ordinary OAuth flow works too if it is ever turned on.
4. Copy the client ID (ends in `.apps.googleusercontent.com`). The client secret is not used by One Tap; keep it in a password manager in case the redirect flow is used later.
5. Vercel, project settings, Environment Variables: `NEXT_PUBLIC_GOOGLE_CLIENT_ID` = the client ID, for Production (and Preview if the preview host is in the origins). Redeploy: it is a build-time value.

### What Crent does, Supabase dashboard

1. Authentication, Providers, Google: enable it. Paste the same client ID into Client ID and into "Authorized Client IDs" (the second field is what makes `signInWithIdToken` accept One Tap tokens). Client secret: paste it if the dashboard requires a value; One Tap does not use it. Leave "Skip nonce check" off.
2. Authentication, Providers, check that "Allow linking identities with the same email" is on. The Supabase UI may call this automatic linking or may show it under the Google provider; the default is on.
3. Do this on `akana-staging` first and test with a Google account that already has a magic-link account there, then on production.

### Test plan

1. Staging, variable blank: `/sign-in` shows the email form only. View source: no `accounts.google.com`. Response header `Content-Security-Policy` on `/sign-in` has no Google origin.
2. Variable set, signed out, on `/sign-in`: One Tap appears or the Google button renders. Tap it with an account that already signed in by magic link. You land on `/home` (or `/welcome` for a new account) in the same account: the You tab shows the same email and membership.
3. Tap with a Google account that has never used Akana: a new account, `/welcome` first.
4. `/`, `/help-now`, `/publish`: no request to Google (browser network tab). `node scripts/check-csp.mjs` passes. `pnpm --filter @akana/web e2e e2e/third-party.spec.ts e2e/headers.spec.ts` passes.

## 3. Two-step sign-in for readers (13.2)

### What it does

Optional and off by default. From the You tab, Account, "Two-step sign-in: Off. Turn it on" leads to `/you/security` (`apps/web/app/(reader)/you/security`). The reader scans a QR code with any authenticator app, confirms a six-digit code, and sees eight recovery codes once. After that, every sign-in link is followed by `/verify?for=reader`, which asks for the current code before the five tabs open. The reader can make new recovery codes or turn it off from the same page.

Nothing is required of a reader who never turns it on, and nothing in the product nudges them to. Mental health titles and everything else behave the same either way.

Lost phone: on `/verify` the reader opens "Lost your authenticator? Use a recovery code". A matching code turns two-step sign-in off (the TOTP factor is removed with the service role, since Supabase will not let a session at aal1 remove a verified factor) and sends them to `/you/security` to set it up again. A code cannot lift a session to aal2 on its own; Supabase has no such API.

### Where things live

- Supabase Auth MFA holds the TOTP factor, as for staff and payees. The shared forms are `apps/web/components/mfa/TotpForms.tsx`.
- Recovery codes: migration `0037_reader_mfa_recovery.sql`, table `public.mfa_recovery_codes` (hashes only, RLS: the owner reads their own rows, no client writes), functions `mfa_recovery_codes_issue` (aal2 only, readers only), `mfa_recovery_code_use` (ten wrong tries an hour, then `AKR02`), `mfa_recovery_codes_clear`, `mfa_recovery_codes_left`. Test `supabase/tests/0037_reader_mfa_recovery.sql`.
- Code generation and hashing: `apps/web/lib/mfa/recovery-codes.ts`.
- The gate: `apps/web/app/(reader)/layout.tsx` sends a reader with a verified factor and a session below aal2 to `/verify?for=reader`.
- Owners, finance members and staff are refused recovery codes (`AKR03`) and `/you/security` tells them their second factor is set by their role. Their reset stays a support task, `docs/SUPPORT_MFA_RECOVERY.md`.

### What Crent does

Nothing in a dashboard. Supabase MFA (TOTP) is already enabled for staff. Apply migration 0037 with the others. Optional: in Supabase, Authentication, Multi-Factor, keep TOTP on; passkeys stay behind the `mfa_passkey` flag as before.

## 4. Error tracking (10.3), Sentry

Not sign-in, but set up at the same time and documented here so the three dashboard tasks sit together.

With `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` blank nothing loads: the browser SDK sits behind a dynamic import that never runs, `instrumentation.ts` returns early, `next.config.ts` is exported unwrapped and the CSP is unchanged. With them set, errors are reported after `apps/web/lib/sentry-scrub.ts` removes request bodies, cookies, query strings, emails, IPs and anything answer-like; the server never collects request bodies at all; replays, if ever turned on, mask all text and block all media and are limited to error sessions. The DSN's origin is added to `connect-src` only. There is no Sentry script tag: the SDK is bundled with the app, which is why the e2e third-party test stays green.

### What Crent does, Sentry

1. sentry.io, make an organisation (EU data region, so reader data stays in the EU) on the Developer plan.
2. Create a project, platform Next.js, name akana-web. Copy the DSN.
3. Vercel, Environment Variables: `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` = the DSN, Production (and Preview if wanted). Leave `NEXT_PUBLIC_SENTRY_REPLAY_ON_ERROR` blank: the privacy notice says "no session recording".
4. Optional, for readable stack traces: Settings, Auth Tokens, make a token with `project:releases` and `org:read`; set `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` (the org slug) and `SENTRY_PROJECT=akana-web`. Without these the build skips the upload.
5. Project settings, Security and Privacy: turn on "Prevent storing of IP addresses" and the default data scrubbers, and add `answer`, `answers`, `value`, `note`, `email` to the sensitive fields list as a second net.
6. Alerts: one rule, "an issue is first seen", email to the ops address. The free plan's uptime and cron monitors are a separate step and not wired here.
7. Redeploy, then throw a test error on staging from the browser console (`setTimeout(() => { throw new Error("sentry test") })` on any page) and check the event arrives with no request body, cookie or email in it.

### Checks

`node scripts/check-csp.mjs` passes with the DSN blank and confirms a set DSN adds only its origin to `connect-src`. `pnpm --filter @akana/web test` covers the scrubber (`lib/sentry-scrub.test.ts`).
