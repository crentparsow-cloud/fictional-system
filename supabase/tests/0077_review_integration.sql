-- 0077: no client holds a privilege on any sequence in public, including the
-- ones 0075 and 0076 made.
do $$ declare bad text; begin
  select string_agg(r || ' on ' || c.relname, '; ' order by c.relname, r) into bad
    from pg_class c cross join unnest(array['anon', 'authenticated']) r
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'S'
     and (has_sequence_privilege(r, c.oid, 'USAGE') or has_sequence_privilege(r, c.oid, 'SELECT') or has_sequence_privilege(r, c.oid, 'UPDATE'));
  if bad is not null then raise exception 'a client holds a privilege on a sequence: %', bad; end if;
end $$;

-- RX-1. The demo load files (supabase/staging/demo/group-1.sql to
-- group-10.sql and mv-live.sql, written by scripts/demo-sql.ts) publish each
-- version from the SQL editor. 0074 gives a staff claim nothing without a
-- platform_roles row and a second-factor session, so the files set up what a
-- real owner session holds. The two marked lines are copied from group-1.sql
-- as generated; packages/seed/src/demo-sql.test.ts fails if they drift.
begin;
insert into auth.users (id, email) values
  ('a7700000-0000-0000-0000-000000000001', 'owner77@test.example'),
  ('a7700000-0000-0000-0000-000000000002', 'later-owner77@test.example');
insert into public.organisations (id, code, kind, legal_name, display_name, slug, country) values
  ('a7700000-0000-0000-0000-0000000000a1', 'PB-TD77A', 'publisher', 'Org 77 Ltd', 'Org 77', 'org-77', 'GB');
insert into public.books (id, org_id, slug, title, rights_status) values
  ('a7700000-0000-0000-0000-0000000000b1', 'a7700000-0000-0000-0000-0000000000a1', 'book-77', 'Book 77', 'public_domain');
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, safety_tier, depth, status) values
  ('a7700000-0000-0000-0000-0000000000c1', 'AK-T77A0', 'a7700000-0000-0000-0000-0000000000b1', 'a7700000-0000-0000-0000-0000000000a1', 'wb-77', 'Workbook 77', 'Card', 'productivity', 'none', 'full', 'draft');
insert into public.workbook_versions (id, workbook_id, semver, content, content_hash) values
  ('a7700000-0000-0000-0000-0000000000d1', 'a7700000-0000-0000-0000-0000000000c1', '1.0.0', '{"units": [], "exercises": []}'::jsonb, repeat('7', 64));

-- The claim line the files carried before: a staff role and nothing else.
-- It must be refused (the retest proof RX-staged-demo-sql.sql).
select set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"platform_roles":["owner"]}}', true);
do $$ begin
  begin
    perform app.publish_version('a7700000-0000-0000-0000-0000000000d1'::uuid);
    raise exception 'a bare staff claim published a version';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims', '', true);

-- No owner in platform_roles: the prelude gives no claims and the publish is
-- refused, so a file stops before it commits anything.
delete from public.platform_roles where role = 'owner';
-- demo-sql prelude begin
select set_config('request.jwt.claims', (select jsonb_build_object('role', 'authenticated', 'sub', r.user_id, 'aal', 'aal2', 'amr', jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint)), 'app_metadata', jsonb_build_object('platform_roles', jsonb_build_array('owner')))::text from public.platform_roles r where r.role = 'owner' order by r.created_at, r.user_id limit 1), true);
-- demo-sql prelude end
do $$ begin
  begin
    perform app.publish_version('a7700000-0000-0000-0000-0000000000d1'::uuid);
    raise exception 'the prelude published with no owner in platform_roles';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims', '', true);

-- With owners: it acts as the longest-standing one and publishes.
insert into public.platform_roles (user_id, role, created_at) values
  ('a7700000-0000-0000-0000-000000000002', 'owner', now() - interval '1 day'),
  ('a7700000-0000-0000-0000-000000000001', 'owner', now() - interval '9 days');
select set_config('request.jwt.claims', (select jsonb_build_object('role', 'authenticated', 'sub', r.user_id, 'aal', 'aal2', 'amr', jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint)), 'app_metadata', jsonb_build_object('platform_roles', jsonb_build_array('owner')))::text from public.platform_roles r where r.role = 'owner' order by r.created_at, r.user_id limit 1), true);
do $publish$ begin if exists (select 1 from public.workbook_versions where id = 'a7700000-0000-0000-0000-0000000000d1' and published_at is null) then perform app.publish_version('a7700000-0000-0000-0000-0000000000d1'::uuid); end if; end $publish$;
update public.workbooks set status = 'live' where id = 'a7700000-0000-0000-0000-0000000000c1' and status is distinct from 'live';
-- demo-sql clear begin
select set_config('request.jwt.claims', '', true);
-- demo-sql clear end
do $$ begin
  if (select published_at from public.workbook_versions where id = 'a7700000-0000-0000-0000-0000000000d1') is null then
    raise exception 'the generated prelude did not publish under 0074';
  end if;
  if not exists (select 1 from public.workbook_sections where version_id = 'a7700000-0000-0000-0000-0000000000d1' and kind = 'listing') then
    raise exception 'publishing should fill workbook_sections';
  end if;
  if (select status from public.workbooks where id = 'a7700000-0000-0000-0000-0000000000c1') <> 'live' then raise exception 'the workbook should be live'; end if;
  if (select count(*) from public.audit_log where action = 'workbook.publish_version' and actor = 'a7700000-0000-0000-0000-000000000001' and actor_role = 'owner') <> 1 then
    raise exception 'the publish should be audited once, against the longest-standing owner';
  end if;
  if coalesce(current_setting('request.jwt.claims', true), '') <> '' then raise exception 'the claims should be cleared before the commit'; end if;
  if app.is_platform(array['owner']) then raise exception 'nothing of the owner session should be left'; end if;
end $$;
-- Run again, as a second paste of the file would: nothing to do, no error.
select set_config('request.jwt.claims', (select jsonb_build_object('role', 'authenticated', 'sub', r.user_id, 'aal', 'aal2', 'amr', jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint)), 'app_metadata', jsonb_build_object('platform_roles', jsonb_build_array('owner')))::text from public.platform_roles r where r.role = 'owner' order by r.created_at, r.user_id limit 1), true);
do $publish$ begin if exists (select 1 from public.workbook_versions where id = 'a7700000-0000-0000-0000-0000000000d1' and published_at is null) then perform app.publish_version('a7700000-0000-0000-0000-0000000000d1'::uuid); end if; end $publish$;
select set_config('request.jwt.claims', '', true);
rollback;
