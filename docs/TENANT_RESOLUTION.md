# Tenant resolution (F-066, week 2)

How a request host becomes a tenant, what is cached, what happens when the lookup fails, and what still needs a decision. Code: `apps/web/proxy.ts`, `apps/web/lib/tenant.ts`, `apps/web/lib/tenant-resolve.ts`, `apps/web/lib/tenant-id.ts`.

## 1. From host to tenant

The proxy reads the `Host` header and normalises it. It lower-cases the value, trims it, drops the port and drops any trailing dot. IPv6 literals keep their brackets. A value with characters outside `a-z 0-9 . -`, an empty label or more than 253 characters becomes empty and is answered with a 404 before any lookup.

The normalised host then goes through these rules, in order.

1. **Localhost and previews.** `localhost`, `127.0.0.1`, `[::1]` and any `*.vercel.app` host are the marketplace. No lookup.
2. **The marketplace apex.** `AKANA_HOST` and `www.` in front of it are the marketplace. No lookup. The marketplace id is fixed by migration 0001 (`00000000-0000-0000-0000-00000000000a`).
3. **Everything else.** With `TENANT_DB_LOOKUP=1`, the `public.resolve_tenant` function from migration 0008: an exact match on `tenant_domains.host`, verified rows only (`verified_at is not null`), joined to `tenants`. It returns only `tenant_id`, `slug`, `kind` and `status`. A tenant whose status is not `active` is treated as unknown. Without the flag, the config map in `lib/tenant.ts` decides: a single-label subdomain of `TENANT_APEX` becomes a white-label tenant with that slug and no id.

There is no wildcard and no suffix matching on the database path. A host is a tenant only if that exact host is in `tenant_domains` and verified. Hosts should be stored lower case with no trailing dot, matching what the proxy sends.

The lookup is a plain `fetch` to the Supabase REST RPC endpoint with the publishable key in the `apikey` header:

```
POST /rest/v1/rpc/resolve_tenant
{"p_host": "<host>"}
```

It never uses supabase-js or the session cookies. The proxy may run on the edge runtime, and a tenant lookup must not depend on who is signed in.

## 2. Headers passed to the app

| Header | Value |
|---|---|
| `x-akana-tenant` | Tenant slug. Unchanged. |
| `x-akana-tenant-kind` | `marketplace` or `white_label`. Unchanged. |
| `x-akana-path` | Path and query, for return-after-gate. Unchanged. |
| `x-akana-tenant-id` | Tenant uuid, when known. New. |

The proxy deletes any `x-akana-tenant-id` the client sent, then sets its own. `tenantIdForRequest()` in `lib/tenant-id.ts` prefers the header and falls back to the slug map, so existing callers keep working. It also refuses an `akana` slug carrying any id other than the marketplace id.

One gap: paths the proxy matcher skips (`_next/static`, `_next/image`, `favicon.ico`, `icons/`, `fonts/`, `manifest.webmanifest`) never pass through the proxy, so a client-supplied header would reach them untouched. None of them read the tenant today. Any new route that reads the tenant must sit inside the matcher.

## 3. Cache

Each proxy instance keeps a small in-memory map from host to result.

- A hit is held for 60 seconds.
- A miss (no verified row, or an inactive tenant) is held for 30 seconds. This stops a stream of random hosts from becoming a stream of database queries.
- A fallback after a failed lookup is held for 30 seconds, so an outage costs one slow request per host per instance, not every request.
- Concurrent requests for the same host share one lookup.
- The map holds at most 1,000 hosts and drops the oldest first.

The cost is that a domain change can take up to 60 seconds to reach every instance, and a newly verified domain up to 30 seconds. That is fine for go-live. The publisher console should say "live within a minute".

**Why Edge Config later.** Edge Config is read at the edge in about a millisecond with no database round trip and no cold-cache window per instance. It needs a sync job that writes the host map whenever `tenant_domains` changes, plus a Vercel token in the background job. That is more moving parts than week 2 needs with a handful of tenants. When it lands, the order becomes Edge Config, then this database lookup, then the config map.

## 4. When the lookup fails

The lookup has a 1.5-second timeout. On a timeout, a network error, a non-2xx answer or an unexpected response shape, the resolver logs a warning naming the host and the reason, and falls back to the config map. On fallback a white-label tenant is known by slug only, so `x-akana-tenant-id` is absent. Pages that need the id (checkout, enrolment, reading) refuse rather than guess, as `lib/tenant-id.ts` already does.

## 5. Unknown hosts and staff routes

- **Unknown host:** 404. Never the marketplace. Serving the marketplace on a stray host would let anyone point a domain at Akana and show it under their name.
- **Staff routes on a tenant host:** `/admin`, `/studio` and `/console` (and anything under them) are a 404 on any host that is not the marketplace. F-066 also says auth stays on the Akana apex, but `/sign-in` and `/auth/callback` are not blocked on tenant hosts yet. That waits on the shared identity decision (F-133, question 5 below).

## 6. Cookies

The auth cookie is `__Host-akana-auth`: `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, and no `Domain` attribute (the `__Host-` prefix forbids one). The browser binds it to the exact host that set it. A tenant host therefore never receives the marketplace session, and one tenant never receives another's, even before the tenant apex is on the Public Suffix List. Server actions also check `Origin`.

## 7. The database lookup (built)

Built in migration 0008 (7 October 2026). `public.resolve_tenant(p_host text)` is a `security definer` function with an empty `search_path`, granted to `anon`, `authenticated` and `service_role`. It returns at most one row (`tenant_id`, `slug`, `kind`, `status`) for an exact, verified host. The comparison is case-insensitive through `citext`. `anon` still has no select on `tenant_domains`, so the list of hosts cannot be read; only a host the caller already knows resolves. `lib/tenant-resolve.ts` calls it.

The path stays behind `TENANT_DB_LOOKUP=1`, so nothing changes until the flag is set for a deployment. Set it once the migration is applied and the first verified domain is in `tenant_domains`.

The same migration closes the `tenants` column gap. `anon` and `authenticated` now have a column-level select that leaves out `stripe_account_id` and `plan`. The row policy is unchanged. Clients must name their columns, as with `authors.legal_name`; `select *` on `tenants` now fails for those roles. Server code on the service role still reads every column.

## 8. Open questions for Crent

1. **Tenant apex (A7).** Which domain hosts tenant subdomains? Until `TENANT_APEX` is set, only custom domains in `tenant_domains` (with the flag on) can serve a white-label site.
2. **Policy choice.** Settled: the `security definer` function (`public.resolve_tenant`, migration 0008). Hosts cannot be listed.
3. **Suspended tenants.** Today a suspended or closed tenant is a 404. Should it show a plain "this site is unavailable" page instead?
4. **Public Suffix List.** Submit the tenant apex once it is bought. Cookie rules already hold without it, but inclusion takes weeks.
5. **Sign-in on tenant hosts.** With one shared reader identity (F-133), does a tenant reader sign in on the tenant host (its own `__Host-` cookie) or hop to the Akana apex and back?
