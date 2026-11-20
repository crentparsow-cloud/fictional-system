-- Red team pass 2, database. Run after redteam/f133/setup-db.sh:
--   psql postgres://postgres:postgres@localhost:5432/akana_rt -q -f redteam/f133/pass2/01_db_pass2.sql
-- Every line printed starts with HELD or BROKEN. Nothing is committed.
\pset pager off
\pset tuples_only on
\set ON_ERROR_STOP 1
begin;
\i redteam/f133/after-fix/_fixture.sql
\set r1 '''a7300000-0000-0000-0000-000000000001'''
\set r2 '''a7300000-0000-0000-0000-000000000002'''
\set own '''a7300000-0000-0000-0000-000000000003'''
\set ta '''a7300000-0000-0000-0000-0000000000b1'''
\set tb '''a7300000-0000-0000-0000-0000000000b2'''
\set mk '''00000000-0000-0000-0000-00000000000a'''

create function pg_temp.try(p_label text, p_sql text) returns text language plpgsql as $$
declare n bigint; begin
  begin execute p_sql; get diagnostics n = row_count;
    return case when n > 0 then 'BROKEN ' else 'HELD(0 rows) ' end || p_label || ' rows=' || n;
  exception when others then return 'HELD(' || sqlstate || ') ' || p_label; end;
end $$;
grant execute on function pg_temp.try(text,text) to public;
create function pg_temp.verdict(p_label text, p_broken boolean) returns text language sql as $$
  select case when p_broken then 'BROKEN ' else 'HELD ' end || p_label $$;
grant execute on function pg_temp.verdict(text,boolean) to public;

select (select version from app.current_terms('reader_terms')) as tv, (select value #>> '{}' from public.app_config where key='health_consent_version') as hv \gset
\echo == RT-5 regression: gate functions
insert into public.terms_versions (doc, version, effective_at, published_at, is_draft)
  select 'reader_terms', 'rt-old', now() - interval '900 days', now() - interval '900 days', false
  where not exists (select 1 from public.terms_versions where doc='reader_terms' and version='rt-old');
update public.profiles set adult_confirmed_at = '2020-01-01', health_consent_at = '2020-01-01',
  health_consent_version = (select value #>> '{}' from public.app_config where key='health_consent_version') where user_id = :r1;
select test_as_tenant_reader(:r1, :ta);
select pg_temp.try('RT-5 consent with attacker version', $q$select public.tenant_reader_set_health_consent('attacker-v0')$q$);
select pg_temp.try('RT-5 superseded terms version', $q$select public.tenant_reader_accept_terms('rt-old')$q$);
select public.tenant_reader_confirm_adult(:'tv') is not null;
select public.tenant_reader_set_health_consent(:'hv') is not null;
reset role;
select pg_temp.verdict('RT-5 existing adult date and consent date left alone',
  (select adult_confirmed_at <> '2020-01-01' or health_consent_at <> '2020-01-01' from public.profiles where user_id = :r1));
select test_as_tenant_reader(:r1, :ta);
select count(*) from generate_series(1, 25) g where public.tenant_reader_accept_terms(:'tv');
reset role;
select pg_temp.verdict('RT-5 at most one terms row from tenant sessions', (select count(*) > 1 from public.terms_acceptances where user_id = :r1));

\echo == R2-1: a withdrawn health consent is given again from a tenant session
select test_as(:r1);
select app.clear_health_consent();
reset role;
select pg_temp.verdict('fixture: consent is withdrawn on the account', (select health_consent_at is not null from public.profiles where user_id = :r1));
select test_as_tenant_reader(:r1, :ta);
select public.tenant_reader_set_health_consent(:'hv') is not null;
reset role;
select pg_temp.verdict('R2-1 tenant session re-grants account-wide health consent after the reader withdrew it on the Akana site',
  (select health_consent_at is not null from public.profiles where user_id = :r1));

\echo == R2-6: a tenant session reads special-category facts about the wider account
update public.profiles set faith_consent_at = now(), faith_consent_version = (select value #>> '{}' from public.app_config where key='faith_consent_version') where user_id = :r1;
insert into public.account_deletion_requests (user_id, cancel_before) values (:r1, now() + interval '7 days');
select test_as_tenant_reader(:r1, :ta);
select pg_temp.verdict('R2-6 tenant A session learns the reader gave faith consent on the Akana site', (select faith_consent from public.tenant_reader_gates()));
select pg_temp.verdict('R2-6 tenant A session learns the Akana account has a deletion pending', (select read_only from public.tenant_reader_gates()));
reset role;
delete from public.account_deletion_requests where user_id = :r1;

\echo == R2-2: a tenant session writes a marketplace pair record (pair_finishes)
insert into public.programme_pairs (id, workbook_id, tenant_id, inviter_id, friend_id, friend_label, status, accepted_at)
values ('a7300000-0000-0000-0000-00000000aa01', 'a7300000-0000-0000-0000-0000000000d1', :mk, :r1, :r2, 'Friend', 'active', now());
select pg_temp.verdict('fixture: no pair finish yet', (select count(*) > 0 from public.pair_finishes));
select test_as_tenant_reader(:r1, :ta);
insert into public.progress_events (enrolment_id, kind, ref) values ('a7300000-0000-0000-0000-0000000000f1', 'step_done', 'rt2-step');
reset role;
select pg_temp.verdict('R2-2 step_done on a tenant A enrolment wrote pair_finishes for a marketplace pair (tenant ' ||
    (select tenant_id::text from public.programme_pairs where id='a7300000-0000-0000-0000-00000000aa01') || ')',
  (select count(*) > 0 from public.pair_finishes where pair_id = 'a7300000-0000-0000-0000-00000000aa01' and user_id = :r1));

\echo == R2-3: account pending deletion (read only) still takes account-wide writes and a new enrolment from a tenant session
delete from public.terms_acceptances where user_id = :r2;
update public.profiles set adult_confirmed_at = null, health_consent_at = null, health_consent_version = null where user_id = :r2;
delete from public.enrolments where user_id = :r2;
insert into public.account_deletion_requests (user_id, cancel_before) values (:r2, now() + interval '7 days');
select public.register_tenant_session('a7300000-0000-0000-0000-000000005e04', :r2, :ta, 'books.a73.example');
select test_as_tenant_reader(:r2, :ta);
select pg_temp.verdict('fixture: gates say read only', not (select read_only from public.tenant_reader_gates()));
select pg_temp.try('R2-3 confirm adult + accept terms while read only', format($q$select public.tenant_reader_confirm_adult(%L)$q$, :'tv'));
select pg_temp.try('R2-3 health consent while read only', format($q$select public.tenant_reader_set_health_consent(%L)$q$, :'hv'));
select pg_temp.try('R2-3 new enrolment while read only', format($q$insert into public.enrolments(user_id,tenant_id,workbook_id,version_id) values(%L,%L,'a7300000-0000-0000-0000-0000000000d1','a7300000-0000-0000-0000-0000000000e1')$q$, :r2, :ta));
reset role;

\echo == RT-3 / RT-4 regression: revocation closes a token already issued
select test_as_tenant_reader(:r1, :ta);
select pg_temp.verdict('fixture: live token reads own tenant A enrolment', (select count(*) <> 1 from public.enrolments));
reset role;
update public.tenants set status = 'suspended' where id = :ta;
select pg_temp.verdict('RT-4 suspending the tenant revoked its scope rows', (select count(*) > 0 from public.tenant_session_scopes where tenant_id = :ta and revoked_at is null));
update public.tenants set status = 'active' where id = :ta;
select test_as_tenant_reader(:r1, :ta, 'a7300000-0000-0000-0000-000000005e01');
select pg_temp.try('RT-3 old token after suspend then reactivate: enrolments', 'select 1 from public.enrolments');
select pg_temp.try('RT-3 old token after revocation: gates', 'select public.tenant_reader_gates()');
reset role;

\echo == RT-4 regression and the switch
select test_as(:own, array['safety_reviewer']);
select pg_temp.try('RT-4 safety_reviewer inserts flag row', format($q$insert into public.feature_flags(key,scope,scope_id,enabled) values('tenant_sign_in','tenant',%L,true) on conflict (key,scope,scope_id) do update set enabled=true$q$, 'a7300000-0000-0000-0000-0000000000c9'));
select pg_temp.try('RT-4 safety_reviewer updates flag row', $q$update public.feature_flags set enabled=true where key='tenant_sign_in'$q$);
select pg_temp.try('RT-4 safety_reviewer renames another flag row to tenant_sign_in', $q$update public.feature_flags set key='tenant_sign_in', scope='workbook', scope_id='', enabled=true where key = (select key from public.feature_flags where key<>'tenant_sign_in' limit 1)$q$);
select pg_temp.try('RT-4 safety_reviewer deletes flag row', $q$delete from public.feature_flags where key='tenant_sign_in'$q$);
select pg_temp.try('safety_reviewer calls set_tenant_sign_in', format($q$select public.set_tenant_sign_in(%L,true,'x')$q$, :tb));
reset role;
select test_as(:own);
select pg_temp.try('tenant org owner (no platform role) calls set_tenant_sign_in', format($q$select public.set_tenant_sign_in(%L,true,'x')$q$, :ta));
reset role;
-- a second, live session on tenant B for the switch-off check
insert into auth.sessions (id, user_id) values ('a7300000-0000-0000-0000-000000005e09', :r1);
select public.register_tenant_session('a7300000-0000-0000-0000-000000005e09', :r1, :tb, 'books.b73.example');
select test_as(:own, array['owner']);
select public.set_tenant_sign_in(:tb, false, 'rt2 off');
reset role;
select pg_temp.verdict('switch off ends tenant B sessions', (select count(*) > 0 from public.tenant_session_scopes where tenant_id = :tb and revoked_at is null));
select pg_temp.verdict('switch off wrote flag.changed and tenant_sessions.revoked audit rows',
  (select count(*) filter (where action = 'flag.changed') < 1 or count(*) filter (where action = 'tenant_sessions.revoked') < 1
     from public.audit_log where tenant_id = :tb));

\echo == R2-4: owner whose session has NOT passed a second factor (aal1) flips the switch by direct RPC, with no reason
select set_config('request.jwt.claim.sub', :own, true);
select set_config('request.jwt.claims', jsonb_build_object('sub', :own, 'role', 'authenticated', 'aal', 'aal1', 'amr', '[]'::jsonb,
  'app_metadata', jsonb_build_object('platform_roles', '["owner"]'::jsonb))::text, true);
set local role authenticated;
select pg_temp.try('R2-4 owner at aal1 switches tenant B sign-in ON with a null reason', format($q$select public.set_tenant_sign_in(%L, true, null)$q$, :tb));
reset role;

\echo == sign-in code bounds
select public.issue_tenant_sign_in_code(:ta, 'Victim@Example.com ', repeat('a', 64), 600);
select pg_temp.verdict('code for tenant A refused on tenant B', public.check_tenant_sign_in_code(:tb, 'victim@example.com', repeat('a', 64)));
select pg_temp.verdict('code for address X refused for address Y', public.check_tenant_sign_in_code(:ta, 'other@example.com', repeat('a', 64)));
select pg_temp.verdict('right code accepted once (broken if refused)', not public.check_tenant_sign_in_code(:ta, 'victim@example.com', repeat('a', 64)));
select pg_temp.verdict('replay refused', public.check_tenant_sign_in_code(:ta, 'victim@example.com', repeat('a', 64)));
select public.issue_tenant_sign_in_code(:ta, 'victim@example.com', repeat('b', 64), 600);
select count(*) from generate_series(1, 5) g where public.check_tenant_sign_in_code(:ta, 'victim@example.com', repeat('c', 64));
select pg_temp.verdict('right code refused after five wrong tries', public.check_tenant_sign_in_code(:ta, 'victim@example.com', repeat('b', 64)));
select public.issue_tenant_sign_in_code(:ta, 'victim@example.com', repeat('d', 64), 60);
update public.tenant_sign_in_codes set expires_at = now() - interval '1 second' where email = 'victim@example.com';
select pg_temp.verdict('expired code refused', public.check_tenant_sign_in_code(:ta, 'victim@example.com', repeat('d', 64)));
select pg_temp.try('ttl above 900 seconds refused', format($q$select public.issue_tenant_sign_in_code(%L, 'v@example.com', repeat('a',64), 86400)$q$, :ta));
select pg_temp.try('issue for tenant with the flag off', format($q$select public.issue_tenant_sign_in_code(%L, 'v@example.com', repeat('a',64), 600)$q$, 'a7300000-0000-0000-0000-0000000000c9'));
set local role anon;
select pg_temp.try('anon: check code', format($q$select public.check_tenant_sign_in_code(%L,'victim@example.com',repeat('a',64))$q$, :ta));
select pg_temp.try('anon: read codes / browser sessions / scopes', 'select 1 from public.tenant_sign_in_codes union all select 1 from public.tenant_browser_sessions union all select 1 from public.tenant_session_scopes');
select pg_temp.try('anon: register_tenant_session', format($q$select public.register_tenant_session(gen_random_uuid(), %L, %L, 'x')$q$, :r1, :ta));
reset role;
select test_as(:r1);
select pg_temp.try('authenticated: check code', format($q$select public.check_tenant_sign_in_code(%L,'victim@example.com',repeat('a',64))$q$, :ta));
select pg_temp.try('authenticated: issue code', format($q$select public.issue_tenant_sign_in_code(%L,'victim@example.com',repeat('a',64),600)$q$, :ta));
select pg_temp.try('authenticated: gate functions', 'select public.tenant_reader_gates()');
select pg_temp.try('authenticated: read codes / browser sessions / scopes', 'select 1 from public.tenant_sign_in_codes union all select 1 from public.tenant_browser_sessions union all select 1 from public.tenant_session_scopes');
select pg_temp.try('authenticated: hook', $q$select public.akana_access_token_hook('{}')$q$);
reset role;
rollback;
