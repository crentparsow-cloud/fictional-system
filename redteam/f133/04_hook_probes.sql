-- The access token hook with hostile / odd inputs, run as supabase_auth_admin.
\pset pager off
\pset tuples_only on
begin;
\i redteam/f133/_fixture.sql
create function pg_temp.h(p_label text, p_event jsonb) returns text language plpgsql as $$
declare r jsonb; begin
  begin r := public.akana_access_token_hook(p_event);
    return p_label || ' -> ' || coalesce(case when r ? 'error' then 'ERROR-OBJECT' when r is not distinct from p_event then 'UNCHANGED' else 'role=' || (r #>> '{claims,role}') || ' tenant=' || (r #>> '{claims,akana_tenant}') || ' kept_keys=' || (select count(*) from jsonb_object_keys(r->'claims')) end, 'NULL');
  exception when others then return p_label || ' -> THROWS ' || sqlstate || ' ' || sqlerrm; end;
end $$;
grant execute on function pg_temp.h(text, jsonb) to public;
set local role supabase_auth_admin;
select pg_temp.h(l, e::jsonb) from (values
 ('null event', null),
 ('empty object', '{}'),
 ('claims is a string', '{"claims":"x"}'),
 ('claims is an array', '{"claims":[1,2]}'),
 ('no session_id', '{"claims":{"sub":"a7300000-0000-0000-0000-000000000001","role":"authenticated"}}'),
 ('session_id number', '{"claims":{"session_id":5}}'),
 ('session_id object', '{"claims":{"session_id":{"a":1}}}'),
 ('session_id garbage', '{"claims":{"session_id":"zzz"}}'),
 ('session_id uuid + newline', '{"claims":{"session_id":"a7300000-0000-0000-0000-000000005e01\n"}}'),
 ('ordinary session (no scope row)', '{"claims":{"session_id":"a7300000-0000-0000-0000-000000005e04","role":"authenticated","sub":"x"}}'),
 ('scoped session, upper-case id', '{"claims":{"session_id":"A7300000-0000-0000-0000-000000005E01","role":"authenticated","aal":"aal1","sub":"s","iss":"i","aud":"authenticated","exp":1,"iat":1,"email":"e","phone":"","app_metadata":{},"user_metadata":{},"amr":[],"is_anonymous":false}}'),
 ('scoped session, forged akana_tenant B + role service_role', '{"claims":{"session_id":"a7300000-0000-0000-0000-000000005e01","role":"service_role","akana_tenant":"a7300000-0000-0000-0000-0000000000b2"}}')
) v(l,e);
reset role;
update public.tenant_session_scopes set revoked_at = now();
set local role supabase_auth_admin;
select pg_temp.h('revoked row', '{"claims":{"session_id":"a7300000-0000-0000-0000-000000005e01","role":"authenticated"}}');
reset role;
select 'execute: ' || string_agg(r || '=' || has_function_privilege(r, 'public.akana_access_token_hook(jsonb)', 'execute'), ' ') from unnest(array['anon','authenticated','tenant_reader','service_role','supabase_auth_admin']) r;
rollback;
