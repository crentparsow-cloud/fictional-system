\pset pager off
\echo == schemas tenant_reader has usage on
select nspname from pg_namespace where has_schema_privilege('tenant_reader', oid, 'usage') and nspname !~ '^pg_|information_schema' order by 1;
\echo == schemas with create
select nspname from pg_namespace where has_schema_privilege('tenant_reader', oid, 'create');
\echo == tables/views/sequences with any privilege (non-system)
select n.nspname, c.relname, c.relkind,
  concat_ws(',', case when has_table_privilege('tenant_reader', c.oid,'select') then 'S' end,
   case when has_table_privilege('tenant_reader', c.oid,'insert') then 'I' end,
   case when has_table_privilege('tenant_reader', c.oid,'update') then 'U' end,
   case when has_table_privilege('tenant_reader', c.oid,'delete') then 'D' end,
   case when has_any_column_privilege('tenant_reader', c.oid,'select,insert,update') then 'col' end) priv,
  c.relrowsecurity rls
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname !~ '^pg_|information_schema' and c.relkind in ('r','v','m','p','f')
 and (has_table_privilege('tenant_reader', c.oid,'select,insert,update,delete,truncate') or has_any_column_privilege('tenant_reader', c.oid,'select,insert,update'))
order by 1,2;
select n.nspname, c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='S' and n.nspname !~ '^pg_' and has_sequence_privilege('tenant_reader', c.oid, 'usage,select,update');
\echo == functions executable, by schema
select n.nspname, count(*) total, count(*) filter (where p.prosecdef) secdef
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname !~ '^pg_|information_schema' and has_function_privilege('tenant_reader', p.oid, 'execute') group by 1 order by 1;
\echo == of those, in schemas with usage
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosecdef secdef, p.proconfig
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname !~ '^pg_|information_schema' and has_function_privilege('tenant_reader', p.oid, 'execute') and has_schema_privilege('tenant_reader', n.oid,'usage') order by 1,2;
\echo == policies applying to public (roles {0}) or tenant_reader
select schemaname, tablename, policyname, roles, cmd from pg_policies where roles @> '{public}' or roles @> '{tenant_reader}' order by 1,2,3;
\echo == default privileges
select defaclrole::regrole, defaclnamespace::regnamespace, defaclobjtype, defaclacl from pg_default_acl;
\echo == role membership
select r.rolname, m.rolname member, a.inherit_option, a.set_option from pg_auth_members a join pg_roles r on r.oid=a.roleid join pg_roles m on m.oid=a.member where r.rolname in ('tenant_reader','authenticated','anon','service_role') or m.rolname='tenant_reader';
