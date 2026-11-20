# Reader sign-in on tenant hosts (F-133)

Decided by Crent on 20 November 2026: a reader signs in on the tenant's own domain and never visits the Akana domain. There is one shared reader identity. The same email is the same Akana account everywhere.

Status: built on branch `f133-tenant-signin`, reworked after two independent red team passes on the same day (RT-1 to RT-7, then R2-1 to R2-7, section 11), off by default, not applied to any database. Nothing changes on any host until the switches in section 9 are set.

Code: `supabase/migrations/0073_tenant_sign_in.sql`, and in `apps/web`: `lib/session-scope.ts`, `lib/session-scope-server.ts`, `lib/supabase/proxy.ts`, `lib/supabase/server.ts`, `lib/tenant-code.ts`, `lib/tenant-code-server.ts`, `lib/tenant-session-store.ts`, `lib/tenant-sign-in.ts`, `lib/tenant-sign-in-server.ts`, `lib/tenant-reader.ts`, `app/site/*`. The email is `packages/emails/src/tenant-code.ts`. Tests: `supabase/tests/0073_tenant_sign_in.sql` and the `*.test.ts` file beside each of those.

## 1. The rule that shapes everything

A tenant controls the DNS of its own domain. If that domain is hijacked, lapses or is repointed, whoever serves it receives whatever the reader's browser holds for that host, and can show the reader any page they like. An ordinary Supabase session is good for the reader's whole Akana account, and so is an ordinary Supabase sign-in code. So on a tenant host:

1. **Nothing account-wide is ever typed there or stored there.** The sign-in code is Akana's own, made for one tenant and one address. The browser holds an opaque id, never a Supabase token.
2. **The session behind that id is scoped to the tenant**, in three layers, each denying by default.

| Layer | What it does | Where |
|---|---|---|
| Token | Every access token of a tenant session carries `role: tenant_reader` and `akana_tenant: <tenant uuid>`. | The access token hook, `public.akana_access_token_hook` |
| Database | The role `tenant_reader` has no privileges except those granted by name in 0073. Each policy asks for ownership and the tenant together, and the claims count only while the session's scope row is live. | Migration 0073 |
| App | One check: the verified session's scope must match the request's tenant. Applied in the proxy and again on the server. | `lib/session-scope.ts` |

## 2. The tenancy model for a reader

**What a tenant is.** A row in `public.tenants`. The marketplace is one tenant with a fixed id (`00000000-0000-0000-0000-00000000000a`). Every white-label site is another, of kind `white_label`. A host becomes a tenant through the proxy only (docs/TENANT_RESOLUTION.md): the config map, or an exact verified row in `tenant_domains`.

**How a reader comes to have data in one.** By opening a workbook there. The first open creates an enrolment for (reader, tenant, workbook). The same reader may hold an enrolment for the same workbook on the marketplace and on a tenant site. They are separate rows with separate answers.

**Where the tenant id lives.**

| Table | Tenant id | Notes |
|---|---|---|
| `enrolments` | `tenant_id` column | Unique on (user, tenant, workbook). The root of everything below. |
| `answers` | through `enrolment_id` | Sealed. The seal's AAD is user, tenant and field, so a row cannot be opened under another tenant even by the server. |
| `progress_events` | through `enrolment_id` | Ids and times only. |
| `terms_acceptances` | `tenant_id` column, nullable | Records where the terms were accepted. The acceptance itself is account-wide. |
| `profiles` | none | One row per account: adults-only confirmation and consents. Shared by design. |
| `tenant_session_scopes` | `tenant_id` column | New. Which Supabase session belongs to which tenant and host. |
| `tenant_browser_sessions` | `tenant_id` column | New. The server-side store behind the tenant cookie. |
| `tenant_sign_in_codes` | `tenant_id` column | New. One live sign-in code per tenant and address, and the count of codes issued this hour. |
| `health_consent_withdrawals` | none | New. One row per account that has ever withdrawn health consent, written by a trigger on `profiles`. Service role only. |

Account-wide facts (the profile, terms, consent, a pending deletion) are not tenant data. A tenant session never reads those tables. It asks four functions that act on the caller's own row and answer with booleans (section 4).

## 3. How a reader signs in

### 3.1 The code

`lib/tenant-code.ts`, `lib/tenant-code-server.ts`, `public.issue_tenant_sign_in_code`, `public.check_tenant_sign_in_code`.

- The reader enters an email address on the tenant site. Akana's server makes 8 random digits.
- The database keeps only an HMAC of (tenant, address, code). The HMAC key is derived from `TENANT_SESSION_KEYS` and never reaches the database.
- One live code per tenant and address. Asking again replaces it. Ten minutes, single use, dead after five wrong tries. All of that is one locked step in the database.
- The code is emailed through the house mailer (Resend, `EMAIL_MODE`, `TEST_RECIPIENT` as for every email). Subject: "Your sign-in code for <site name>, powered by Akana". The email comes from Akana, names the site, carries **no link** and never a workbook title.
- At most five codes an hour for one tenant and address. The database counts this itself, in the same locked statement that stores the code (`issue_tenant_sign_in_code` answers false and writes nothing for the sixth), so it holds on every server instance whatever the app does. With five wrong tries per code, that bounds guessing at 25 tries an hour against 100 million codes.
- In front of that, the Akana sign-in limits apply: 5 an hour per address, 20 an hour per IP. On a tenant host this check fails closed (`tenantSigninAllowed` in `lib/limits.ts`): if the counter errors, the service role is not configured or `LEAD_HASH_SALT` is missing, the request is refused. The Akana site's own sign-in still fails open, as before.
- Asking never looks at whether the address has an account. The answer is the same for every address.

There is no Supabase `signInWithOtp`, no magic link and no `/auth/callback` on a tenant host, and no tenant URL goes in the Supabase redirect allow list. A code for tenant A checks out on tenant A and nowhere else: not on tenant B, not on the Akana site, not at Supabase.

### 3.2 The session

`lib/tenant-sign-in.ts` holds the order. It is a pure function with every effect passed in, so the order is tested with fakes. `lib/tenant-sign-in-server.ts` supplies the effects.

1. **Establish.** After the code checks out, the server makes the Supabase session itself. With the service role it asks Supabase Auth for a one-time token for the address (`auth.admin.generateLink`, which sends no email), creating the account first when the address is new (`createUser` with the email confirmed, because the code has just proved it). It spends that token at once (`verifyOtp` with the token hash) on a client whose cookies are a map in memory. The session must be for the address that passed the code.
2. **Register.** The session id is read from the fresh token. `public.register_tenant_session(session, user, tenant, host)` is called with the service role. The tenant and host come from the proxy's headers. The function refuses unless the tenant is an active white-label tenant, the flag is on for it, and the session belongs to that user.
3. **Refresh.** The session is refreshed. The hook finds the scope row and stamps the role and the tenant claim.
4. **Check.** The new token must carry `tenant_reader` and this tenant, for the same user and the same session. Supabase Auth must accept it (`getUser(token)`).
5. **Commit.** The session is sealed into `public.tenant_browser_sessions` and the browser is given an opaque random id in `__Host-akana-tenant-session`.

If any step fails the session is signed out, nothing is stored, no cookie is written, and the reader sees "Sign-in is not available on this site right now." An account with two-step sign-in is refused, because a tenant host cannot ask for the second step. The app refuses it, `register_tenant_session` refuses it again (AKS10), and the hook ends a tenant session whose account enrols a second factor later (section 3.4).

### 3.3 The cookie and the store

`lib/tenant-session-store.ts`.

- The cookie is `__Host-akana-tenant-session`: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, no `Domain`. Its value is 32 random bytes. It is not a token and means nothing to Supabase.
- The store row holds the sha256 of that value (never the value), the tenant, the user, the Supabase session id, and the Supabase session sealed with `TENANT_SESSION_KEYS`. The seal is bound to the user and the tenant.
- A row is looked up with the tenant the proxy resolved, and checked again after it is read. An id from tenant A is nothing on tenant B.
- 30 days from sign-in at most, 7 days without use. Both are in `TENANT_SESSION_LIMITS`.
- `@supabase/ssr` is given the store in place of browser cookies on tenant hosts, in both the proxy and `createUserClient`. A token refresh is sealed and written back. Two requests refreshing at once: each write is a compare-and-swap on the row's version; the loser re-reads and keeps what the winner stored.
- `__Host-akana-auth` is never accepted on a tenant host. The tenant cookie is never read on the Akana site.
- With `TENANT_SESSION_KEYS` blank or malformed there is no store and no code key. Nobody can sign in on a tenant host: fail closed.

### 3.4 The hook

Tiny and total. No session id, or no scope row: the event is returned exactly as received, so the Akana site behaves as before, at the cost of one primary key lookup that finds nothing. A live scope row: the role and the claim are set and every other claim is passed through. A scope row that is revoked, or whose tenant is not an active white-label tenant, or whose flag is off: an error, so no token is issued. A scope row whose user has a verified second factor in `auth.mfa_factors`: an error too, so a reader who turns on two-step sign-in after signing in on a tenant host loses that session at its next refresh. The factor table is read only for scoped sessions; an unscoped session never reaches it. If a table cannot be read the function raises and no token is issued to anyone. That is deliberate, and it is why the hook is enabled on staging first.

### 3.5 Clean-up and revocation

- The scope row references `auth.sessions(id) on delete cascade`, and the store row references the scope row. Sign-out and expiry remove both.
- A scope row is never deleted while its session exists. Revoking sets `revoked_at` on the scope row and the store row first, then deletes the `auth.sessions` row. If that delete is not permitted, the revoked rows stay and the revocation still holds everywhere: the hook issues no token, the database returns nothing for that session's tokens (section 4), and the browser's id is dead.
- Scoped sessions are revoked, with an `audit_log` row (`tenant_sessions.revoked`), when: a host is removed or stopped by the three-strike check (trigger on `tenant_domains`, that host's sessions); a tenant stops being active (trigger on `tenants`); sign-in is switched off for a tenant (`public.set_tenant_sign_in`).
- The `tenant_sign_in` flag rows change only through `public.set_tenant_sign_in`. A trigger refuses every direct write of that key, whoever makes it, so the flag cannot be switched on without an audit row or off without signing readers out, and the global row stays off.

## 4. Authorisation matrix

Everything `tenant_reader` is granted. Nothing else is granted, and `supabase/tests/0073_tenant_sign_in.sql` block 1 checks that against the catalogue: every table in every schema, every function in the schemas the role can use, and the schemas themselves. A later migration that grants more, or leaves a function executable by public, fails that test.

Schemas: usage on `public` and `tenant_scope` only. No usage on `app`, `auth`, `storage` or `extensions`.

**When the claims count.** `tenant_scope.uid()` and `tenant_scope.tenant()` are null unless the token's `session_id` has a scope row that is not revoked, for the same user and tenant as the token says, the tenant is an active white-label tenant, and the flag is on. Every policy and every function below goes through them. So a token that has not yet expired reads and writes nothing after its session is revoked, its tenant is suspended, or sign-in is switched off.

### Tables

| Table | Privilege | Policy (to `tenant_reader`) | anon | authenticated on the Akana site | tenant_reader, own tenant | tenant_reader, another tenant |
|---|---|---|---|---|---|---|
| `enrolments` | select | own user and `tenant_id` = claim | denied | own rows, all tenants (unchanged) | own rows in this tenant | none |
| `enrolments` | insert (4 columns) | own user, tenant = claim, workbook listed visibly by this tenant, current version, account not read only | denied | unchanged | allowed, refused while a deletion is pending | refused |
| `enrolments` | update (`last_opened_at` only) | own user and tenant = claim | denied | unchanged | allowed, that column only | no rows |
| `progress_events` | select | through an own enrolment in this tenant | denied | unchanged | allowed | none |
| `progress_events` | insert | through an own enrolment in this tenant, account not read only | denied | unchanged | allowed, refused while a deletion is pending | refused |
| `answers` | select | through an own enrolment in this tenant | denied | unchanged | sealed rows of this tenant | none |
| `workbook_sections` | select | listing and free sections of a title this tenant lists; all sections of a demo title in the demo period (0070) | unchanged | unchanged | allowed | none of the other tenant's |
| every other table | none | none | unchanged | unchanged | denied | denied |

All of these are tested with `set role` and claims: expected equals tested. Tried for real and refused: `profiles`, `subscriptions`, `membership_seats`, `purchases`, `entitlements`, `habit_settings`, `programme_pairs`, `pair_finishes`, `push_subscriptions`, `tenant_members`, `tenant_domains`, `tenant_listings`, `tenants`, `org_members`, `audit_log`, `feature_flags`, `terms_acceptances`, `account_deletion_requests`, `reading_places`, `reader_marks`, `workbooks`, `workbook_versions`, `tenant_session_scopes`, `auth.users`, `auth.sessions`, `storage.objects`. The three other new tables, `tenant_sign_in_codes`, `tenant_browser_sessions` and `health_consent_withdrawals`, are service role only. No delete on anything. No write to answers: those stay with the service role behind the route's checks, as for every reader.

A step done on a tenant enrolment writes one `progress_events` row and nothing else. The friend pairing trigger (0066, redefined in 0073) records a pair finish only when the pairing's tenant is the enrolment's tenant, so a marketplace pairing is never touched from a tenant session. On the marketplace both are the marketplace tenant and nothing changes.

Also tested, and all see nothing: a token with no tenant claim, a malformed claim, the claim without the role, no session id, an unknown session, another reader's session, a session scoped to a different tenant, a revoked session, a suspended tenant, the flag off.

### Functions

| Function | What it does | anon | authenticated | tenant_reader |
|---|---|---|---|---|
| `tenant_scope.claims()`, `live()`, `uid()`, `tenant()` | The request's claims and the live scope behind them. | no | no | yes |
| `tenant_scope.owns_enrolment`, `lists_workbook`, `current_version`, `section_open`, `can_write` | The policy helpers. `can_write` is false while the account's deletion is pending. | no | no | yes |
| `public.tenant_reader_gates()` | Four booleans about the caller's own account: adult confirmed, current terms accepted, current health consent, can write. No dates, no versions, nothing about faith consent, and no reason why the account cannot be written to. | no | no | yes |
| `public.tenant_reader_confirm_adult(version)` | Adults-only confirmation and the current terms. Fills an empty confirmation only. Refused while read only (AKR01). | no | no | yes |
| `public.tenant_reader_accept_terms(version)` | Records the current terms, once. The tenant is the token's. Refused while read only (AKR01). | no | no | yes |
| `public.tenant_reader_set_health_consent(version)` | Records a first consent to the current wording. Refused if the account has ever withdrawn health consent (AKH09) and while read only (AKR01). | no | no | yes |
| every other function in `public` | | unchanged | unchanged | denied |

The four `tenant_reader_*` functions were written for this role and are deliberately narrow, because a tenant session is the weaker session:

- None takes a user or a tenant from the caller.
- Each takes the **current** version only: the terms register for terms, `app_config` (`health_consent_version`) for consent. An old or invented version is refused.
- None overwrites. An adult confirmation, an acceptance of the current terms, or a current consent already on the account is left exactly as it is, date included.
- None undoes a choice made on the Akana site. Withdrawing health consent there (0006) now leaves a row in `health_consent_withdrawals`, through a trigger on `profiles`. From then on a tenant session cannot give that consent, even after the reader has given it again on the Akana site and the wording has since changed. The reader sees "Manage this on the Akana site, under You".
- None writes while the account's deletion is pending. The reader sees that the account cannot be changed on this site and is sent to the Akana site. The tenant site is not told why.
- The gates report only what the tenant site can act on. Faith consent is not taken on a tenant site, so it is not reported, and a faith workbook cannot be read there whatever the account holds.
- Terms are written directly, not through `app.accept_terms`, so tenant calls cannot use up the account's hourly limit there. At most one row per terms version can come from tenant sessions.

When a consent version changes in `apps/web/lib/consent.ts`, a migration must update the `app_config` row in the same release. A unit test ties the constants to 0073.

Not for readers at all:

| Function | Who |
|---|---|
| `public.akana_access_token_hook(jsonb)` | `supabase_auth_admin` only |
| `public.register_tenant_session`, `public.revoke_tenant_sessions`, `public.issue_tenant_sign_in_code`, `public.check_tenant_sign_in_code` | service role only |
| `public.set_tenant_sign_in` | platform owners only, in a session that has passed a second factor (`app.require_role_mfa`, AKM01 otherwise), with a reason that is not blank |
| `public.tenant_sign_in_enabled(tenant)` | anon, authenticated, service role. A boolean. Not `tenant_reader`. |

The hook reads as `supabase_auth_admin` through three new policies for that role alone: `tenant_session_scopes`, three columns of `tenants`, and four columns of `feature_flags`.

## 5. The app layer

**The proxy** (`lib/supabase/proxy.ts`) is the choke point. Every request to a matched path passes through it.

- On the Akana site: the session is `__Host-akana-auth`, as ever. A token with role `tenant_reader`, or with an `akana_tenant` claim of any kind, is removed: dropped from the forwarded request and cleared in the browser. Every other session passes untouched. The tenant cookie is never read.
- On a tenant host, reader routes: `__Host-akana-auth` is dropped whatever it holds. The session is loaded from the store by the opaque id, for this tenant, refreshed there, and passes only if it is a verified `tenant_reader` token for this tenant and the stored user. Anything else revokes the stored row and clears the cookie.
- On a tenant host, every other route (the catalogue, the locked pages): every session cookie is removed from the forwarded request. Those pages never see a session.

**The server** (`lib/session-scope-server.ts`, `getScopedUser`) applies the same rule a second time. It reads the access token, sends that exact token to Supabase Auth (`getUser(token)`), and only then reads its claims. `getReaderSession` uses it, so `requireOwnedEnrolment`, `/api/answers` and `/api/progress` sit behind it. `/api/session` uses it too. `createUserClient` (`lib/supabase/server.ts`) serves the session from the store on a tenant host.

**Service role paths reachable on a tenant host.** The sealed answer write in `/api/answers`, behind `requireOwnedEnrolment` (scope check, RLS ownership, tenant match). The sign-in path: the rate limit counter (fail closed here), the two code functions, `generateLink` and `createUser` (only after the code has checked out), `register_tenant_session`. The session store, read and written with the tenant the proxy resolved.

**Public reads use no session.** The tenant site reads its site row, catalogue and workbook facts with a client that has no session (`lib/supabase/anon.ts`).

## 6. Routes on a tenant host

Default deny. `tenantSiteRoute` in `lib/tenant-resolve.ts` lists what is served. With the flag off the list is the first three rows only, exactly as before.

| Path | Served as | Session | Why |
|---|---|---|---|
| `/`, `/w/<slug>` | tenant site | no | The catalogue. Unchanged. |
| `/help-now`, `/help-offline`, `/legal/*` | Akana's locked pages | no | Unchanged. |
| `/tenant.css`, `/covers/*`, `/brand/*`, `/api/health` | files | no | Unchanged. |
| `/sign-in` | `app/site/sign-in` | yes | Ask for a code, type the code. |
| `/welcome` | `app/site/welcome` | yes | 18 or over, and the reader terms. Needed before reading. |
| `/consent` | `app/site/consent` | yes | Health data consent. Needed before a wellbeing workbook. |
| `/read/<slug>` | `app/site/read/[slug]` | yes | Reading. |
| `/my-workbooks` | `app/site/my-workbooks` | yes | This tenant's enrolments only. |
| `/account` | `app/site/account` | yes | Email, sign out, a link to the Akana site. |
| `/api/answers` | as it is | yes | The reader loads and saves sealed answers. |
| `/api/progress` | as it is | yes | The reader records progress. Stores the event and stops: no funnel count, marks, friends or partner email on a tenant host. |
| everything else | 404 | | |

`/auth/callback` is a 404 on tenant hosts: there is no link to land. `/api/session` stays a 404: only the Akana site's public header calls it. The tenant reader client calls `/api/answers` and `/api/progress` and nothing else. So `/api/marks`, `/api/then-now`, `/api/export`, `/api/checkout`, `/api/membership`, `/api/friends`, `/api/push` and `/api/today` stay 404.

Every reader page is drawn in `TenantShell`: Help now in the header, the locked footer block. The shell test checks every `page.tsx` under `app/site`.

**Tenant from the browser (T01).** Every page and route takes the tenant from the proxy's headers: `x-akana-tenant-id`, `x-akana-tenant-kind`, `x-akana-tenant-host` and `x-akana-tenant-sign-in`. The proxy deletes any value the client sent for each, then sets its own. No query parameter, form field or cookie names a tenant. `/my-workbooks` and `/read/<slug>` filter by that tenant, and the database filters by the token's claim as well.

**Caches (T04).** Every page under `app/site` is `force-dynamic`. The two API routes send `no-store`. `cache-headers.mjs` gives a public cache header to static assets and the sitemap only. The proxy's two in-memory caches hold host to tenant and tenant to flag, nothing about a reader.

**The matcher gap.** Paths the proxy matcher skips (`_next/static`, `_next/image`, `favicon.ico`, `icons/`, `fonts/`, `manifest.webmanifest`) still never read a tenant header. None of the new routes is among them.

**Redirects.** Every "next" value goes through `safeNextPath` (`lib/safe-next.ts`), fixed on 20 November (RT-6): control characters, backslashes and anything that parses to another origin are refused. Tenant pages redirect by path only.

**CSRF.** Server actions check `Origin` against the host. On a tenant host both are the tenant's. Checked locally against a built app on `demo.localhost` with Supabase mocked.

## 7. Threat model

| Threat | What happens |
|---|---|
| **A tenant domain is hijacked, lapses or is repointed, and the new server receives readers' cookies.** | The cookie is an opaque id. It is not a token: it cannot be sent to Supabase Auth or PostgREST, so it cannot set a password, enrol a factor or sign the account out. Sent back to Akana through that same host it reaches, at most, that reader's rows in that tenant. When the daily check stops the host or staff remove it, its sessions are revoked. |
| **The same server shows the reader a sign-in page of its own and asks for the emailed code (phishing).** | The code is Akana's, for that tenant and address. It checks out only at Akana's server for that tenant, and what it yields is a tenant-scoped session held on Akana's server. It is not a Supabase code. It opens nothing on the Akana site, on another tenant, or at Supabase. The worst outcome is the same as holding the opaque id: that reader's rows in that one tenant. |
| **A stolen opaque id is replayed on the Akana site or on another tenant's host.** | The Akana site never reads the cookie. Another tenant's host looks it up with its own tenant and finds nothing. |
| **A stolen Supabase cookie (`__Host-akana-auth`) is planted on a tenant host.** | Never accepted there. Dropped by the proxy, and `createUserClient` does not read it on a tenant host. |
| **A tenant-scoped Supabase token reaches the Akana site** (it should never leave the server). | The proxy sees `tenant_reader` or `akana_tenant` and removes the session before any page runs. The server check refuses it again. |
| **Direct REST calls with a scoped token** (it would have to leak from the server). | PostgREST switches to `tenant_reader`. Only the four tables and the listed functions answer, each filtered by owner and tenant, and only while the session's scope row is live. |
| **Direct Supabase Auth calls with a scoped token** (RT-1). | Supabase Auth does not look at the role, so a holder could act on the account. This is why no Supabase token is ever given to a browser on a tenant host. |
| **The hook is disabled or failing.** | New sign-ins on tenant hosts fail closed. A stored session that refreshes gets an ordinary token; the proxy's scope check refuses it, revokes the stored row and clears the cookie. Nothing reached the browser, so nothing can be replayed against the Akana site. If the hook raises, no token is issued to anyone, the Akana site included, until it is fixed or disabled. The runbook still says: revoke tenant sessions before disabling the hook. |
| **A tenant is suspended, or sign-in is switched off, while tokens are live.** | The hook issues no more tokens; the claim readers return null, so the database is closed at once; the sessions are revoked and audited. |
| **A safety reviewer or owner writes the flag row directly.** | Refused by a trigger. The flag changes only through `set_tenant_sign_in`: owners only, audited, and switching off signs readers out. |
| **A tenant session tampers with the shared account** (stamps a consent version, replaces a confirmation date, uses up the terms limit). | The gate functions take the current version only, never overwrite, and do not use the shared limit. |
| **A tenant session gives health consent again after the reader withdrew it on the Akana site** (R2-1). | Refused. A withdrawal leaves a permanent row, and a tenant session can only ever record a first consent. Giving it again is for the Akana site. |
| **A step done on a tenant host marks the reader's marketplace friend pairing** (R2-2). | The pairing trigger matches the pairing's tenant to the enrolment's. A tenant session writes nothing outside its tenant. |
| **An account whose deletion is pending is written to from a tenant session** (R2-3). | The three writing gate functions and the enrolment and progress insert policies all refuse while the account is read only. Answers were already refused by the route. |
| **A tenant session learns account facts it has no use for** (R2-6): faith consent given on the Akana site, a pending deletion. | The gates return four booleans. Faith consent is not among them. A pending deletion shows only as `can_write` false, and the pages say only that the account cannot be added to on this site. |
| **An owner's stolen first-factor session flips the switch, or it is flipped with no reason** (R2-4). | `set_tenant_sign_in` asks for a second factor in the session and a reason, in the database. |
| **Codes are requested without limit when the app's limiter is down or keyed per instance** (R2-5). | The database refuses a sixth code within the hour for one tenant and address. The app check in front fails closed on a tenant host. |
| **A tenant admin tries to see readers.** | Nothing new is granted to `authenticated`. The scope, code and store tables have no policy for readers or organisation members. Answers stay sealed. Tested. |
| **A reader's own second factor** (R2-7). | An account with two-step sign-in cannot sign in on a tenant host: the app and `register_tenant_session` both refuse. If the reader enrols a factor after signing in on a tenant host, the hook issues no further token for that session. |
| **A forged claim.** | Claims are read only from a token Supabase Auth has verified or just issued. The hook overwrites any `akana_tenant` in the incoming event. The database ignores claims with no live scope row behind them. |
| **An open redirect after sign-in** (RT-6). | `safeNextPath` refuses it. Fixed for the Akana site too, in its own commit. |

### Open risks

1. **A hijacked tenant host still reaches that tenant's data for readers who sign in on it.** That is the scope working as designed: the damage stops at one tenant. It is not zero.
2. **The service role now creates Supabase sessions** (`generateLink` then `verifyOtp`) on the tenant sign-in path. It runs only after Akana's code has checked out for that address, behind the sign-in rate limits. A bug in the code check would become an account takeover scoped to one tenant, so that check is small, in the database, and tested.
3. **`TENANT_SESSION_KEYS` is a new secret.** If it leaks together with a copy of `tenant_browser_sessions`, the stored tenant-scoped Supabase sessions can be opened. Rotate by adding a new first key; old rows still open until they expire.
4. **`generateLink` replaces any sign-in token outstanding for that address**, so a reader who asked for a code on the Akana site and then signs in on a tenant site must ask for a new one on the Akana site.
5. **Closed (R2-2).** A step done on a tenant host no longer marks a friend pairing on another tenant. What is left: 0073 redefines `app.record_pair_finish` from 0066. A later migration that redefines it again must keep the tenant match; the 0073 test fails if it does not.
6. **Narrowed (R2-1).** A tenant session can still record a first health consent to the current wording. That is the point of the consent page. It can no longer give consent again after a withdrawal. Two limits remain. A withdrawal made before 0073 is applied left no trace (0006 only cleared the columns), so such an account looks like one that was never asked and a tenant session can record consent for it once. And a reader who withdrew and later consents again on the Akana site must also renew there when the wording changes; the tenant site will send them.
7. **A token already issued outlives a new second factor until it expires** (R2-7). The hook refuses the next refresh, so the window is one access token lifetime. `tenant_scope.live()` does not read the factor table.
8. **The tenant code request path fails closed** (R2-5). If the rate limit counter is down or `LEAD_HASH_SALT` is missing in production, nobody can ask for a code on a tenant host until it is fixed. That is the chosen side to fail on. The Akana site's sign-in is not affected.

## 8. What is not built

- **Checkout and membership on tenant hosts.** Paid parts say "Not on sale on this site yet". Only what is free opens: the free part of a listed title, and demo titles in the demo period.
- **Tenant-branded email.** The code email is Akana's template. It names the tenant's site and no workbook.
- **Google sign-in** and **sign-in by link** on tenant hosts.
- **Faith consent** (F-150). A workbook that needs it shows "cannot be read on this site yet".
- **Two-step sign-in** on tenant hosts. Such an account is told to use the Akana site.
- Today, habit, friends, push, gifts, referrals, toolkit extras, marks, reading place, pace, then and now, export and deletion. Export, deletion, consent withdrawal and membership are on the Akana site, linked from `/account`.
- Funnel counts for tenant hosts.
- The higher-tier "I have read this" is asked on each visit on a tenant host, not stored.
- A job that deletes expired store rows. They are dead once expired; they are removed when their session is.

## 9. Go-live steps for Crent

Do all of this on **staging first**. Production only after the staging sign-in test passes. There is **no redirect URL step**: nothing about a tenant host goes in Supabase's URL configuration.

### A. Apply the migration

1. Apply `supabase/migrations/0073_tenant_sign_in.sql` to staging in the usual way.
2. If it fails on `references auth.sessions` or on a `grant ... to supabase_auth_admin`, stop and tell Claude.
3. In the Supabase dashboard open **SQL Editor** and run this. It should return no rows. A row means `tenant_reader` can reach something outside the list in section 4. Send any rows to Claude before going on.

```sql
select n.nspname, p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where has_schema_privilege('tenant_reader', n.oid, 'usage')
   and has_function_privilege('tenant_reader', p.oid, 'execute')
   and n.nspname not in ('pg_catalog', 'information_schema', 'tenant_scope', 'net')
   and p.proname not like 'tenant\_reader\_%'
union all
select n.nspname, c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where c.relkind in ('r', 'v', 'm', 'p')
   and n.nspname not in ('pg_catalog', 'information_schema', 'net')
   and has_schema_privilege('tenant_reader', n.oid, 'usage')
   and has_table_privilege('tenant_reader', c.oid, 'select, insert, update, delete')
   and n.nspname || '.' || c.relname not in ('public.enrolments', 'public.progress_events', 'public.answers', 'public.workbook_sections');
```

The `net` schema is left out on purpose. On Supabase the pg_net extension grants its schema to every role through PUBLIC, `anon` included, and a role cannot be denied a PUBLIC grant. It is not one of the schemas the Data API exposes, so no token can call it over REST, and a tenant token never leaves the server. Checked on staging on 20 November 2026: with `net` set aside the query returns no rows. Tables in `cron` and `extensions` show a table privilege but `tenant_reader` has no usage on those schemas, so they cannot be reached.

### B. Enable the hook

1. Supabase dashboard, the staging project.
2. **Authentication**, then **Hooks**.
3. **Add hook**, choose **Customize Access Token (JWT) Claims hook**.
4. Hook type **Postgres**. Schema `public`. Function `akana_access_token_hook`.
5. **Create hook**, and check it shows as enabled.
6. Sign in on the Akana staging site as yourself, with the email code. This must work exactly as before. If it does not, switch the hook off at once and tell Claude.

### C. Set the two variables

1. On your own machine run `pnpm tsx scripts/new-seal-key.ts`. Do not paste the key into a chat.
2. In Vercel, the Akana project, **Settings**, **Environment Variables**: add `TENANT_SESSION_KEYS` with that key, marked **Sensitive**. Use a key of its own, not the `ANSWERS_KEYS` one.
3. Add `TENANT_SIGN_IN` with value `1`.
4. Build fresh from git (a redeploy keeps the old variables).

### D. Switch it on for a tenant

1. On the Akana site open `/admin/white-label`, choose the tenant.
2. Under **Reader sign-in on this site**, tick the box, give a reason, and press **Switch sign-in on**. Platform owners only.
3. Wait a minute. Open `https://<tenant host>/sign-in`.

### E. Test on staging

1. Ask for a code on the tenant host. The email is from Akana, names the site, and has a code and no link. (Outside live mode it goes to `TEST_RECIPIENT`.)
2. Type the code. You should land on **Your workbooks**.
3. In the browser's developer tools look at the cookies for the tenant host. There is `__Host-akana-tenant-session` and no `__Host-akana-auth`.
4. Open a workbook, write an answer, reload. The answer is there.
5. Open the Akana staging site in the same browser. You are not signed in there.
6. In **SQL Editor** run `select session_id, tenant_id, host, created_at, revoked_at from public.tenant_session_scopes;` and see your session.
7. Sign out on the tenant host. Run the query again. The row is gone.
8. Ask for a code on the tenant host, then type it wrong five times, then right. It must be refused.
9. Wait an hour, or use another address. Ask for a code six times in a row. The sixth must say "Too many tries" and no sixth email arrives.
10. With a test account, sign in on the tenant host, then turn on two-step sign-in for that account on the Akana staging site. Within an hour the tenant host must sign that reader out.

### F. Switch it off

For one tenant: `/admin/white-label`, the tenant, **Switch sign-in off and sign readers out**. Sign-in becomes a 404 there within a minute and every reader signed in on that host is signed out at once.

For every tenant at once: switch each tenant off as above, then remove `TENANT_SIGN_IN` in Vercel and build fresh.

**Revoke tenant sessions before disabling the hook.** To disable it: switch every tenant off first, then **Authentication**, **Hooks**, and turn the hook off.

## 10. What could not be checked locally

The local database is plain Postgres with stand-ins for the Supabase roles, and Supabase Auth was mocked. These need the real Supabase, on staging:

1. That Supabase Auth accepts a hook that changes `role`, and issues the token.
2. That the hook runs on refresh as well as on sign-in, so step 3 of the procedure gets a scoped token.
3. That PostgREST switches to `tenant_reader` for such a token (`grant tenant_reader to authenticator` is in the migration).
4. That `auth.getUser(token)` accepts a token whose role is `tenant_reader`.
5. That `request.jwt.claims` carries `session_id` and `akana_tenant` as the claim readers expect.
6. That `auth.admin.generateLink({ type: "magiclink", email })` followed by `verifyOtp({ token_hash, type })` yields a session, for an existing account and for one just created with `createUser({ email, email_confirm: true })`, and which `verification_type` comes back in each case.
7. That the migration's role (`postgres`) may delete from `auth.sessions`. (Proved on staging on 20 November 2026: 0073 applied cleanly there, so the reference to `auth.sessions` and the grants to `supabase_auth_admin` are accepted. The delete itself is exercised by the sign-out step of the staging test.)
8. That `@supabase/ssr` awaits an asynchronous `setAll` on refresh in the deployed runtime, so a refreshed token is stored before the response ends. It does in 0.12.7 by its source.
9. That a hook returning an error object stops the refresh cleanly for a revoked or suspended session.
10. That `supabase_auth_admin` can read `auth.mfa_factors` from inside the hook, that `postgres` can read it from `register_tenant_session`, and that `status` compares with `'verified'` as text (it is an enum there, plain text in the local stand-in). If the hook cannot read it, scoped sessions get no token and tenant sign-in fails closed; ordinary sessions are not affected because they never reach that read.

The sign-in procedure fails closed on 1 to 6: if any is wrong, tenant sign-in says "not available" and nothing reaches the browser. The Akana site is not affected unless the hook itself raises, which step B6 checks.

## 11. Red team findings and where each is closed

| Id | Finding | Closed by | Permanent test |
|---|---|---|---|
| RT-1 | The tenant cookie held a real Supabase session; Supabase Auth ignores the role. | No Supabase token in the browser: opaque id and server-side store. | `lib/tenant-session-store.test.ts`, `lib/tenant-sign-in-server.test.ts`, `lib/supabase/server.test.ts`, `lib/supabase/proxy.test.ts` |
| RT-2 | An account-wide Supabase code and link were used on a tenant-controlled domain. | Akana's own tenant-bound code; no link, no callback, no allow-list entry. | `lib/tenant-code.test.ts`, 0073 test block 13, `packages/emails/src/tenant-code.test.ts` |
| RT-3 | A token issued before a revocation still read and wrote. | `tenant_scope.live()` behind every policy and function. | 0073 test block 10 |
| RT-4 | Suspending a tenant revoked nothing; a safety reviewer could write the flag row. | Trigger on `tenants`; hook and claim readers check tenant and flag; guard trigger on the flag. | 0073 test blocks 11 and 12 |
| RT-5 | Gate functions overwrote account facts, took any version, shared the terms limit, and returned dates. | Rewritten: current version only, never overwrite, own write path, booleans only. | 0073 test block 3 |
| RT-6 | Open redirect through `safeNextPath` (tab, newline, backslash). | `lib/safe-next.ts`, in its own commit for the live site. | `lib/safe-next.test.ts`, `app/auth/callback/route.test.ts` |
| RT-7 | With the hook off, a stored refresh token minted an ordinary token usable on the Akana site. | Nothing Supabase issued is in the browser; the proxy revokes the stored row. | `lib/supabase/proxy.test.ts` ("hook off") |

Second pass, the same day, against the reworked branch:

| Id | Finding | Closed by | Permanent test |
|---|---|---|---|
| R2-1 | A tenant session gave account-wide health consent again after the reader withdrew it on the Akana site. | `health_consent_withdrawals` and its trigger on `profiles`; `tenant_reader_set_health_consent` refuses (AKH09) once a withdrawal is on record; the consent page says "Manage this on the Akana site". | 0073 test block 15 (R2-1); `lib/tenant-reader.test.ts` ("a refused write is mapped to the Akana site") |
| R2-2 | A step done in a tenant session wrote `pair_finishes` for the reader's marketplace pairing. | `app.record_pair_finish` redefined in 0073: the pairing's tenant must be the enrolment's. | 0073 test block 15 (R2-2); `supabase/tests/0066_programme_pairs.sql` still passes |
| R2-3 | With a deletion pending, a tenant session could still confirm adult, accept terms, give consent and start an enrolment. | Read-only check in the three functions (AKR01) and in the enrolment and progress insert policies (`tenant_scope.can_write`). | 0073 test block 15 (R2-3); `lib/tenant-reader.test.ts` |
| R2-4 | An owner at aal1 could call `set_tenant_sign_in`, and with a null reason. | `app.require_role_mfa(null)` and a reason that is not blank. | 0073 test block 15 (R2-4) |
| R2-5 | The code-request limiter failed open when its counter errored and used a per-instance salt when `LEAD_HASH_SALT` was missing. | Five codes an hour per tenant and address inside `issue_tenant_sign_in_code`; `tenantSigninAllowed` and `strictLimiterSalt` fail closed on the tenant path. The Akana site's limiter is unchanged on purpose. | 0073 test block 15 (R2-5); `lib/limits.test.ts` ("R2-5"); `lib/tenant-code.test.ts` ("R2-5") |
| R2-6 | `tenant_reader_gates` revealed faith consent given on the Akana site and that a deletion was pending. | Four booleans: `faith_consent` dropped, `read_only` replaced by `can_write`. Tenant pages and `/api/answers` no longer name a deletion. | 0073 test block 15 (R2-6) and block 3; `lib/tenant-reader.test.ts` ("R2-6", two cases) |
| R2-7 | An account that enrolled a second factor after a tenant sign-in kept its tenant session. | The hook returns an error for a scoped session whose user has a verified factor; `register_tenant_session` refuses such a user (AKS10). Unscoped sessions never reach the factor table. | 0073 test block 15 (R2-7); `auth.mfa_factors` stand-in in `supabase/tests/_shim.sql` |

The original proofs are kept in `redteam/f133/` and `redteam/f133/pass2/`, unedited. `redteam/f133/rerun-after-fix.sh` runs the first pass again. `redteam/f133/pass2/rerun.sh` runs the second pass's database proof on an adapted copy: 8 BROKEN lines before the fixes, 0 after. Three of its lines can no longer print a verdict, because they select the `faith_consent` and `read_only` columns that no longer exist; the runner prints each as REFUSED with the error.

The two limiter proofs in `redteam/f133/pass2/limiter-fails-open.test.ts` still fail, on purpose. They call `signinAllowed` and `limiterSalt`, which are the Akana site's, and the Akana site's sign-in still fails open so that a limiter outage cannot lock readers out. The failing assertions are `expect(allowed).toBeLessThanOrEqual(5)` (20 allowed) and `expect(keyB).toBe(keyA)`. `redteam/f133/pass2/limiter-tenant-path.test.ts` is the same two proofs against the tenant path, and passes.
