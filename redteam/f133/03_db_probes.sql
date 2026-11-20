-- Attack attempts as tenant_reader (reader 1, token for tenant A). Each prints HELD or BROKEN.
\pset pager off
\pset tuples_only on
begin;
\i redteam/f133/_fixture.sql
insert into public.terms_versions (doc, version, effective_at, published_at, is_draft)
  select 'reader_terms', 'rt-old', now() - interval '900 days', now() - interval '900 days', false
  where not exists (select 1 from public.terms_versions where doc='reader_terms' and version='rt-old');
create function pg_temp.try(p_label text, p_sql text) returns text language plpgsql as $$
declare n bigint; begin
  begin execute p_sql; get diagnostics n = row_count;
    return case when n > 0 then 'BROKEN ' else 'HELD(0 rows) ' end || p_label || ' rows=' || n;
  exception when others then return 'HELD(' || sqlstate || ') ' || p_label; end;
end $$;
grant execute on function pg_temp.try(text,text) to public;
select test_as_tenant_reader('a7300000-0000-0000-0000-000000000001', 'a7300000-0000-0000-0000-0000000000b1');
select pg_temp.try(l, s) from (values
 ('read own enrolment in tenant B', $q$select 1 from public.enrolments where tenant_id='a7300000-0000-0000-0000-0000000000b2'$q$),
 ('read own marketplace enrolment', $q$select 1 from public.enrolments where tenant_id='00000000-0000-0000-0000-00000000000a'$q$),
 ('read reader 2 enrolment same tenant', $q$select 1 from public.enrolments where user_id='a7300000-0000-0000-0000-000000000002'$q$),
 ('read answers of f2/f3/f4', $q$select 1 from public.answers where enrolment_id<>'a7300000-0000-0000-0000-0000000000f1'$q$),
 ('progress into tenant B enrolment', $q$insert into public.progress_events(enrolment_id,kind,ref) values('a7300000-0000-0000-0000-0000000000f2','step_done','x')$q$),
 ('progress into marketplace enrolment', $q$insert into public.progress_events(enrolment_id,kind,ref) values('a7300000-0000-0000-0000-0000000000f3','step_done','x')$q$),
 ('progress into reader 2 enrolment', $q$insert into public.progress_events(enrolment_id,kind,ref) values('a7300000-0000-0000-0000-0000000000f4','step_done','x')$q$),
 ('answers insert', $q$insert into public.answers(enrolment_id,field,sealed,key_id) values('a7300000-0000-0000-0000-0000000000f1','z','v1.z','k')$q$),
 ('answers update/delete', $q$delete from public.answers$q$),
 ('progress delete', $q$delete from public.progress_events$q$),
 ('enrol: tenant B workbook d2 under tenant A', $q$insert into public.enrolments(user_id,tenant_id,workbook_id,version_id) values('a7300000-0000-0000-0000-000000000001','a7300000-0000-0000-0000-0000000000b1','a7300000-0000-0000-0000-0000000000d2','a7300000-0000-0000-0000-0000000000e2')$q$),
 ('enrol: unlisted d3', $q$insert into public.enrolments(user_id,tenant_id,workbook_id,version_id) values('a7300000-0000-0000-0000-000000000001','a7300000-0000-0000-0000-0000000000b1','a7300000-0000-0000-0000-0000000000d3','a7300000-0000-0000-0000-0000000000e3')$q$),
 ('enrol: into tenant B with tenant A token', $q$insert into public.enrolments(user_id,tenant_id,workbook_id,version_id) values('a7300000-0000-0000-0000-000000000001','a7300000-0000-0000-0000-0000000000b2','a7300000-0000-0000-0000-0000000000d2','a7300000-0000-0000-0000-0000000000e2')$q$),
 ('enrol: as reader 2', $q$insert into public.enrolments(user_id,tenant_id,workbook_id,version_id) values('a7300000-0000-0000-0000-000000000002','a7300000-0000-0000-0000-0000000000b1','a7300000-0000-0000-0000-0000000000d1','a7300000-0000-0000-0000-0000000000e1')$q$),
 ('enrol: extra column status', $q$insert into public.enrolments(user_id,tenant_id,workbook_id,version_id,status) values('a7300000-0000-0000-0000-000000000001','a7300000-0000-0000-0000-0000000000b1','a7300000-0000-0000-0000-0000000000d1','a7300000-0000-0000-0000-0000000000e1','finished')$q$),
 ('enrol: upsert moving f1 to stale version', $q$insert into public.enrolments(user_id,tenant_id,workbook_id,version_id) values('a7300000-0000-0000-0000-000000000001','a7300000-0000-0000-0000-0000000000b1','a7300000-0000-0000-0000-0000000000d1','a7300000-0000-0000-0000-0000000000e1') on conflict (user_id,tenant_id,workbook_id) do update set version_id='a7300000-0000-0000-0000-0000000000e4'$q$),
 ('update enrolment tenant_id (pins guard skips this role)', $q$update public.enrolments set tenant_id='00000000-0000-0000-0000-00000000000a'$q$),
 ('update enrolment status', $q$update public.enrolments set status='finished'$q$),
 ('update last_opened_at on tenant B row', $q$update public.enrolments set last_opened_at=now() where id='a7300000-0000-0000-0000-0000000000f2'$q$),
 ('delete enrolment', $q$delete from public.enrolments$q$),
 ('sections of tenant B title d2', $q$select 1 from public.workbook_sections where version_id='a7300000-0000-0000-0000-0000000000e2'$q$),
 ('paid section of own title (unit 2)', $q$select 1 from public.workbook_sections where version_id='a7300000-0000-0000-0000-0000000000e1' and unit_number=2$q$),
 ('profiles', 'select 1 from public.profiles'), ('auth.users', 'select 1 from auth.users'), ('scopes', 'select 1 from public.tenant_session_scopes'),
 ('feature_flags', 'select 1 from public.feature_flags'), ('workbooks', 'select 1 from public.workbooks'),
 ('app.uid()', 'select app.uid()'), ('hook', $q$select public.akana_access_token_hook('{}')$q$),
 ('register_tenant_session', $q$select public.register_tenant_session(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'x')$q$),
 ('revoke_tenant_sessions', $q$select public.revoke_tenant_sessions('a7300000-0000-0000-0000-0000000000b2','x')$q$),
 ('tenant_sign_in_enabled', $q$select public.tenant_sign_in_enabled('a7300000-0000-0000-0000-0000000000b2')$q$),
 ('set_tenant_sign_in', $q$select public.set_tenant_sign_in('a7300000-0000-0000-0000-0000000000b2',true,'x')$q$),
 ('tenant_site rpc (anon fn)', $q$select public.tenant_site('a7300000-0000-0000-0000-0000000000b2')$q$),
 ('accept_terms context checkout', $q$select public.tenant_reader_accept_terms('rt-old','checkout')$q$)
) v(l,s);
\echo == account-wide writes from a tenant token (profiles / terms_acceptances are shared with the marketplace)
select 'BROKEN? health consent stamped with attacker version: ' || (public.tenant_reader_set_health_consent('attacker-v0') is not null);
select 'BROKEN? superseded terms version accepted as latest: ' || (public.tenant_reader_accept_terms('rt-old','reask') is not null);
select 'gates leak (account-wide facts): ' || row_to_json(g)::text from public.tenant_reader_gates() g;
do $$ begin for i in 1..19 loop perform public.tenant_reader_accept_terms('rt-old','reask'); end loop; end $$;
reset role;
select 'profile now: ' || health_consent_version from public.profiles where user_id='a7300000-0000-0000-0000-000000000001';
\echo == same reader, ordinary marketplace session, tries to accept the current terms
select test_as('a7300000-0000-0000-0000-000000000001');
select pg_temp.try('marketplace accept_terms after tenant token burned the hourly limit (HELD here = victim locked out, AKT29)', format($q$select public.accept_terms('reader_terms', %L, 'reask')$q$, (select version from app.current_terms('reader_terms'))));
reset role;
\echo == claim / role mismatches
select set_config('request.jwt.claims', '{"sub":"a7300000-0000-0000-0000-000000000001","role":"tenant_reader"}', true); set local role tenant_reader;
select pg_temp.try('tenant_reader, no akana_tenant: enrolments', 'select 1 from public.enrolments'), pg_temp.try('gates', 'select public.tenant_reader_gates()');
reset role;
select set_config('request.jwt.claims', '{"sub":"a7300000-0000-0000-0000-000000000001","role":"tenant_reader","akana_tenant":["a7300000-0000-0000-0000-0000000000b1"]}', true); set local role tenant_reader;
select pg_temp.try('akana_tenant as array', 'select 1 from public.enrolments');
reset role;
select set_config('request.jwt.claims', '{"sub":"a7300000-0000-0000-0000-000000000001","role":"tenant_reader","akana_tenant":"a7300000-0000-0000-0000-0000000000b1\n"}', true); set local role tenant_reader;
select pg_temp.try('akana_tenant with trailing newline', 'select 1 from public.enrolments');
reset role;
select set_config('request.jwt.claims', '{"sub":"a7300000-0000-0000-0000-000000000001","role":"authenticated","akana_tenant":"a7300000-0000-0000-0000-0000000000b1"}', true); set local role tenant_reader;
select pg_temp.try('pg role tenant_reader, claim role authenticated', 'select 1 from public.enrolments');
reset role;
select set_config('request.jwt.claims', '{"sub":"a7300000-0000-0000-0000-000000000001","role":"tenant_reader","akana_tenant":"a7300000-0000-0000-0000-0000000000b1"}', true); set local role authenticated;
select pg_temp.try('pg role authenticated, claim role tenant_reader (hook-off shape): marketplace enrolment + profile', $q$select 1 from public.enrolments where tenant_id='00000000-0000-0000-0000-00000000000a' union all select 1 from public.profiles$q$);
reset role;
\echo == safety_reviewer (not owner) switches tenant sign-in ON for tenant B by direct row write, no audit, no set_tenant_sign_in
delete from public.feature_flags where key='tenant_sign_in' and scope_id='a7300000-0000-0000-0000-0000000000b2';
select test_as('a7300000-0000-0000-0000-000000000003', array['safety_reviewer']);
select pg_temp.try('safety_reviewer inserts tenant_sign_in row', $q$insert into public.feature_flags(key,scope,scope_id,enabled,reason) values('tenant_sign_in','tenant','a7300000-0000-0000-0000-0000000000b2',true,'rt')$q$);
select 'tenant_sign_in_enabled(B) = ' || public.tenant_sign_in_enabled('a7300000-0000-0000-0000-0000000000b2');
reset role;
rollback;
