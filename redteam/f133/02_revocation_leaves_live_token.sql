-- RT-2/RT-3: revocation does not reach the database layer.
-- (a) After the host is removed (sessions "revoked"), the already-issued scoped
--     access token (same claims, valid until exp) still reads and writes via REST.
-- (b) Suspending the tenant revokes nothing at all: scope row live, hook keeps minting.
\set ON_ERROR_STOP 1
\pset pager off
begin;
\i redteam/f133/_fixture.sql
\echo == (a) host removed -> trigger revokes
delete from public.tenant_domains where host = 'books.a73.example';
select count(*) as scope_rows_left, (select count(*) from auth.sessions where id='a7300000-0000-0000-0000-000000005e01') as auth_sessions_left from public.tenant_session_scopes;
select (after->>'sessions') as audit_sessions_revoked from public.audit_log where action='tenant_sessions.revoked';
savepoint a;
select test_as_tenant_reader('a7300000-0000-0000-0000-000000000001', 'a7300000-0000-0000-0000-0000000000b1');
select count(*) as answers_still_readable_after_revoke from public.answers;
insert into public.progress_events (enrolment_id, kind, ref) values ('a7300000-0000-0000-0000-0000000000f1', 'step_done', 'after-revoke') returning 'WRITE AFTER REVOKE OK' as result;
select public.tenant_reader_set_health_consent('rt-after-revoke') is not null as account_wide_write_after_revoke;
rollback to a; reset role;
rollback;

begin;
\i redteam/f133/_fixture.sql
\echo == (b) tenant suspended, then closed
update public.tenants set status = 'suspended' where id = 'a7300000-0000-0000-0000-0000000000b1';
select count(*) filter (where revoked_at is null) as live_scope_rows_after_suspend from public.tenant_session_scopes;
set local role supabase_auth_admin;
select public.akana_access_token_hook('{"claims":{"sub":"a7300000-0000-0000-0000-000000000001","role":"authenticated","session_id":"a7300000-0000-0000-0000-000000005e01"}}'::jsonb) #>> '{claims,role}' as hook_still_mints_role;
reset role;
select test_as_tenant_reader('a7300000-0000-0000-0000-000000000001', 'a7300000-0000-0000-0000-0000000000b1');
select count(*) as answers_readable_suspended_tenant from public.answers;
insert into public.progress_events (enrolment_id, kind, ref) values ('a7300000-0000-0000-0000-0000000000f1', 'step_done', 'suspended') returning 'WRITE ON SUSPENDED TENANT OK' as result;
reset role;
\echo == (c) flag switched off by direct row write (feature_flags_write policy: owner or safety_reviewer), not set_tenant_sign_in
select test_as('a7300000-0000-0000-0000-000000000003', array['safety_reviewer']);
update public.feature_flags set enabled = false where key='tenant_sign_in' and scope='tenant' and scope_id='a7300000-0000-0000-0000-0000000000b1' returning 'safety_reviewer flipped tenant_sign_in directly' as result;
reset role;
select public.tenant_sign_in_enabled('a7300000-0000-0000-0000-0000000000b1') as flag_on, count(*) filter (where revoked_at is null) as live_scope_rows from public.tenant_session_scopes;
rollback;
