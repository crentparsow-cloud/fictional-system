-- 0035 app.uid() reads the JSON JWT claims.
--
-- 0001 defined app.uid() from current_setting('request.jwt.claim.sub'), the
-- per-claim setting that older PostgREST populated. Current PostgREST sets
-- only request.jwt.claims (the whole payload as JSON), so on hosted Supabase
-- app.uid() returned null for every signed-in user. accept_terms then raised
-- AKT01 on the welcome page and every RLS policy built on app.uid() treated
-- the caller as anonymous. Found 9 October 2026 on production.
--
-- Same shape as Supabase's own auth.uid(): prefer the legacy setting if a
-- runtime still sets it, otherwise read sub from the JSON claims. Same
-- signature, so the 200-odd callers need no change.
create or replace function app.uid() returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;
