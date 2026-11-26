-- 0074 Permissions from the 21 November 2026 review (H1, H2, M1, M2, M4, L1,
-- L5, M14). The review's proofs are ported here: red team RT-01, RT-02, RT-03,
-- RT-05 and RT-07, and the access seat's proof_a23 and proof_staff_aal1.
-- Every case that was a fault before 0074 must now be refused, and the paths
-- the app uses (functions, staff sessions, the service role) must still work.
--
-- RT-04 (the referral cap race) needs two sessions, which a plain SQL file
-- cannot run. It is kept as a shell proof beside the tests. To run it:
--
--   DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres \
--     bash supabase/tests/proofs/referral-cap-race.sh
--
-- It builds its own throwaway database, races two claims and exits 0 when the
-- cap holds. Section 8 below checks the same function in one session.
\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------------
-- Fixtures. Organisation X is a publisher with an owner, an editor and an
-- author. Organisation Z is an individual author's. C is a closed church.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('74740000-0000-0000-0000-000000000001', 'owner74@test.example'),
  ('74740000-0000-0000-0000-000000000002', 'author74@test.example'),
  ('74740000-0000-0000-0000-000000000003', 'editor74@test.example'),
  ('74740000-0000-0000-0000-000000000004', 'reader74@test.example'),
  ('74740000-0000-0000-0000-000000000005', 'stranger74@test.example'),
  ('74740000-0000-0000-0000-000000000006', 'staff74@test.example'),
  ('74740000-0000-0000-0000-000000000007', 'solo74@test.example'),
  ('74740000-0000-0000-0000-000000000008', 'church74@test.example'),
  ('74740000-0000-0000-0000-000000000009', 'support74@test.example'),
  ('74740000-0000-0000-0000-00000000000a', 'referrer74@test.example');
insert into public.profiles (user_id)
select id from auth.users where email like '%74@test.example' on conflict do nothing;

insert into public.organisations (id, code, kind, legal_name, display_name, slug, country, status) values
  ('74740000-0000-0000-0000-0000000000a1', 'PB-T74X1', 'publisher',  'Seventy Four X Ltd', 'Seventy Four X', 't74-org-x', 'GB', 'active'),
  ('74740000-0000-0000-0000-0000000000a2', 'PB-T74Y1', 'publisher',  'Seventy Four Y Ltd', 'Seventy Four Y', 't74-org-y', 'GB', 'active'),
  ('74740000-0000-0000-0000-0000000000a3', 'AU-T74Z1', 'individual', 'Seventy Four Z',     'Seventy Four Z', 't74-org-z', 'GB', 'active'),
  ('74740000-0000-0000-0000-0000000000a4', null,       'church',     'Seventy Four Church', 'Seventy Four Church', 't74-church', 'GB', 'closed');
insert into public.org_members (org_id, user_id, role) values
  ('74740000-0000-0000-0000-0000000000a1', '74740000-0000-0000-0000-000000000001', 'owner'),
  ('74740000-0000-0000-0000-0000000000a1', '74740000-0000-0000-0000-000000000002', 'author'),
  ('74740000-0000-0000-0000-0000000000a1', '74740000-0000-0000-0000-000000000003', 'editor'),
  ('74740000-0000-0000-0000-0000000000a3', '74740000-0000-0000-0000-000000000007', 'owner'),
  ('74740000-0000-0000-0000-0000000000a4', '74740000-0000-0000-0000-000000000008', 'owner');
insert into public.tenants (id, slug, kind, name) values
  ('74740000-0000-0000-0000-0000000000f1', 't74-other-tenant', 'white_label', 'Seventy Four Other Tenant');
insert into public.books (id, org_id, slug, title) values
  ('74740000-0000-0000-0000-0000000000b1', '74740000-0000-0000-0000-0000000000a1', 't74-book-x', 'T74 Book X'),
  ('74740000-0000-0000-0000-0000000000b2', '74740000-0000-0000-0000-0000000000a2', 't74-book-y', 'T74 Book Y'),
  ('74740000-0000-0000-0000-0000000000b3', '74740000-0000-0000-0000-0000000000a3', 't74-book-z', 'T74 Book Z');
-- c1 live wellbeing title with a higher safety tier; c2 draft; c3 live demo; c4 the individual author's draft.
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, depth, status, badge, is_demo, safety_tier) values
  ('74740000-0000-0000-0000-0000000000c1', 'AK-T74X1', '74740000-0000-0000-0000-0000000000b1', '74740000-0000-0000-0000-0000000000a1', 't74-wb-live',  'T74 Live',  'Card', 'wellbeing',    'full', 'live',  'official', false, 'higher'),
  ('74740000-0000-0000-0000-0000000000c2', 'AK-T74X2', '74740000-0000-0000-0000-0000000000b1', '74740000-0000-0000-0000-0000000000a1', 't74-wb-draft', 'T74 Draft', 'Card', 'productivity', 'full', 'draft', 'official', false, 'none'),
  ('74740000-0000-0000-0000-0000000000c3', 'AK-T74X3', '74740000-0000-0000-0000-0000000000b1', '74740000-0000-0000-0000-0000000000a1', 't74-wb-demo',  'T74 Demo',  'Card', 'productivity', 'full', 'live',  'demo',     true,  'none'),
  ('74740000-0000-0000-0000-0000000000c4', 'AK-T74Z1', '74740000-0000-0000-0000-0000000000b3', '74740000-0000-0000-0000-0000000000a3', 't74-wb-solo',  'T74 Solo',  'Card', 'productivity', 'full', 'draft', 'official', false, 'none');
insert into public.workbook_versions (id, workbook_id, semver, schema_version, content, content_hash, validated_at) values
  ('74740000-0000-0000-0000-0000000000d2', '74740000-0000-0000-0000-0000000000c2', '1.0.0', '3.0', '{"units": []}'::jsonb, repeat('2', 64), now()),
  ('74740000-0000-0000-0000-0000000000d4', '74740000-0000-0000-0000-0000000000c4', '1.0.0', '3.0', '{"units": []}'::jsonb, repeat('4', 64), now());
insert into public.platform_roles (user_id, role) values
  ('74740000-0000-0000-0000-000000000006', 'owner'),
  ('74740000-0000-0000-0000-000000000009', 'support');

-- Claims exactly as given: no platform_roles row is added, unlike test_as.
create or replace function pg_temp.as_claims(p_user uuid, p_aal text, p_roles text[] default '{}') returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal,
    'amr', case when p_aal = 'aal2'
                then jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint))
                else '[{"method": "otp", "timestamp": 1}]'::jsonb end,
    'app_metadata', jsonb_build_object('platform_roles', to_jsonb(p_roles)))::text, true);
  execute 'set local role authenticated';
end $$;
create or replace function pg_temp.as_service() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "service_role"}'::text, true);
  execute 'set local role service_role';
end $$;
create or replace function pg_temp.as_anon() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "anon"}'::text, true);
  execute 'set local role anon';
end $$;
-- Runs a statement in a subtransaction. Returns 'rows=N' when it ran, or the
-- SQLSTATE when it was refused. Nothing it wrote is kept when it is refused.
create or replace function pg_temp.try(p_sql text) returns text
language plpgsql as $$
declare n int;
begin
  begin
    execute p_sql;
    get diagnostics n = row_count;
    return 'rows=' || n;
  exception when others then
    return sqlstate;
  end;
end $$;
-- A direct table write must be refused by the grant (42501).
create or replace function pg_temp.denied(p_sql text, p_what text) returns void
language plpgsql as $$
declare r text := pg_temp.try(p_sql);
begin
  if r <> '42501' then raise exception 'not refused (%): %', r, p_what; end if;
end $$;
-- A call must be refused with some error; used beside a control that runs.
create or replace function pg_temp.refused(p_sql text, p_what text) returns void
language plpgsql as $$
declare r text := pg_temp.try(p_sql);
begin
  if r like 'rows=%' then raise exception 'not refused (%): %', r, p_what; end if;
end $$;
create or replace function pg_temp.works(p_sql text, p_what text) returns void
language plpgsql as $$
declare r text := pg_temp.try(p_sql);
begin
  if r not like 'rows=%' or r = 'rows=0' then raise exception 'should work but gave %: %', r, p_what; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. H1 (RT-01, proof_a23 P3 to P6): no direct client write on workbooks.
-- ---------------------------------------------------------------------------
-- The author of organisation X, role "author", on a full second-factor session.
select test_as('74740000-0000-0000-0000-000000000002');
select pg_temp.denied($q$update public.workbooks set safety_tier = 'none' where id = '74740000-0000-0000-0000-0000000000c1'$q$, 'RT-01.1 safety_tier lowered on a live title');
select pg_temp.denied($q$update public.workbooks set is_demo = false, badge = 'official' where id = '74740000-0000-0000-0000-0000000000c3'$q$, 'RT-01.2 is_demo cleared on a demo title');
select pg_temp.denied($q$update public.workbooks set badge = 'public_domain' where id = '74740000-0000-0000-0000-0000000000c2'$q$, 'RT-01.3 badge set to public_domain');
select pg_temp.denied($q$update public.workbooks set tenant_id = '74740000-0000-0000-0000-0000000000f1' where id = '74740000-0000-0000-0000-0000000000c1'$q$, 'RT-01.4 tenant_id moved');
select pg_temp.denied($q$update public.workbooks set book_id = '74740000-0000-0000-0000-0000000000b2' where id = '74740000-0000-0000-0000-0000000000c1'$q$, 'RT-01.5 book_id pointed at another organisation');
select pg_temp.denied($q$update public.workbooks set code = 'AK-EVVVV', slug = 't74-hijack' where id = '74740000-0000-0000-0000-0000000000c1'$q$, 'RT-01.6 code and slug rewritten');
select pg_temp.denied($q$insert into public.workbooks (code, book_id, org_id, tenant_id, slug, title, genre_id, status, badge)
  values ('AK-EV002', '74740000-0000-0000-0000-0000000000b2', '74740000-0000-0000-0000-0000000000a1', '74740000-0000-0000-0000-0000000000f1', 't74-evil', 'Evil', 'productivity', 'draft', 'official')$q$, 'RT-01.7 draft inserted into another tenant');
select pg_temp.refused($q$update public.workbooks set status = 'live' where id = '74740000-0000-0000-0000-0000000000c2'$q$, 'RT-01.8 status set to live');
select pg_temp.refused($q$update public.workbooks set price_point_id = (select id from public.price_points where kind = 'workbook' limit 1) where id = '74740000-0000-0000-0000-0000000000c1'$q$, 'RT-01.9 price point changed');
select pg_temp.denied($q$update public.workbooks set org_id = '74740000-0000-0000-0000-0000000000a2' where id = '74740000-0000-0000-0000-0000000000c2'$q$, 'org_id moved');
select pg_temp.denied($q$update public.workbooks set current_version_id = '74740000-0000-0000-0000-0000000000d2' where id = '74740000-0000-0000-0000-0000000000c2'$q$, 'current_version_id set');
select pg_temp.denied($q$update public.workbooks set in_membership = true, licence_ref = 'x' where id = '74740000-0000-0000-0000-0000000000c2'$q$, 'in_membership and licence_ref set');
select pg_temp.denied($q$update public.workbooks set title = 'Renamed' where id = '74740000-0000-0000-0000-0000000000c1'$q$, 'title of a live workbook changed without review');
select pg_temp.denied($q$delete from public.workbooks where id = '74740000-0000-0000-0000-0000000000c2'$q$, 'workbook deleted');
reset role;
select set_config('request.jwt.claims', '', true);

-- The same author at aal1 (proof_a23 P3 to P6).
select pg_temp.as_claims('74740000-0000-0000-0000-000000000002', 'aal1');
select pg_temp.denied($q$update public.workbooks set safety_tier = 'none' where id = '74740000-0000-0000-0000-0000000000c1'$q$, 'A23 P3 safety_tier at aal1');
select pg_temp.refused($q$update public.workbooks set status = 'live' where id = '74740000-0000-0000-0000-0000000000c2'$q$, 'A23 P4 status at aal1');
select pg_temp.denied($q$update public.workbooks set badge = 'public_domain', licence_ref = 'x' where id = '74740000-0000-0000-0000-0000000000c2'$q$, 'A23 P5 badge at aal1');
select pg_temp.denied($q$update public.workbooks set badge = 'demo', is_demo = true where id = '74740000-0000-0000-0000-0000000000c2'$q$, 'A23 P5 is_demo at aal1');
select pg_temp.denied($q$update public.workbooks set tenant_id = '74740000-0000-0000-0000-0000000000f1' where id = '74740000-0000-0000-0000-0000000000c1'$q$, 'A23 P6 tenant at aal1');
reset role;
select set_config('request.jwt.claims', '', true);

-- The owner of the organisation, and a staff session, are the authenticated
-- role too: neither writes the table directly.
select test_as('74740000-0000-0000-0000-000000000001');
select pg_temp.denied($q$update public.workbooks set safety_tier = 'none' where id = '74740000-0000-0000-0000-0000000000c1'$q$, 'owner lowering safety_tier');
reset role;
select set_config('request.jwt.claims', '', true);
select test_as('74740000-0000-0000-0000-000000000006', array['owner']);
select pg_temp.denied($q$update public.workbooks set safety_tier = 'none' where id = '74740000-0000-0000-0000-0000000000c1'$q$, 'staff direct update');
reset role;
select set_config('request.jwt.claims', '', true);

do $$ declare w public.workbooks%rowtype; begin
  select * into w from public.workbooks where id = '74740000-0000-0000-0000-0000000000c1';
  if w.safety_tier <> 'higher' or w.code <> 'AK-T74X1' or w.slug <> 't74-wb-live' or w.title <> 'T74 Live'
     or w.tenant_id = '74740000-0000-0000-0000-0000000000f1' or w.book_id <> '74740000-0000-0000-0000-0000000000b1' then
    raise exception 'the live workbook was changed';
  end if;
  if not (select is_demo from public.workbooks where id = '74740000-0000-0000-0000-0000000000c3') then
    raise exception 'the demo flag was cleared'; end if;
  if (select badge from public.workbooks where id = '74740000-0000-0000-0000-0000000000c2') <> 'official'
     or app.workbook_licence_exempt('74740000-0000-0000-0000-0000000000c2') then
    raise exception 'the draft became licence exempt'; end if;
end $$;

-- What still works. A member reads their own titles, staff read them all and
-- change status through the staff function, and the service role writes.
select test_as('74740000-0000-0000-0000-000000000002');
do $$ begin
  if (select count(*) from public.workbooks where org_id = '74740000-0000-0000-0000-0000000000a1') <> 3 then
    raise exception 'the author no longer reads their organisation''s workbooks'; end if;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
select test_as('74740000-0000-0000-0000-000000000006', array['owner']);
do $$ begin
  if (select count(*) from public.workbooks where code like 'AK-T74%') <> 4 then
    raise exception 'staff no longer read every workbook'; end if;
  perform public.set_workbook_paused('74740000-0000-0000-0000-0000000000c1', true, 'test 0074');
  if (select status from public.workbooks where id = '74740000-0000-0000-0000-0000000000c1') <> 'paused' then
    raise exception 'the staff function did not pause the workbook'; end if;
  perform public.set_workbook_paused('74740000-0000-0000-0000-0000000000c1', false, 'test 0074');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
select pg_temp.as_service();
select pg_temp.works($q$update public.workbooks set card_line = 'Card two' where id = '74740000-0000-0000-0000-0000000000c2'$q$, 'service role updating a workbook');
reset role;
select set_config('request.jwt.claims', '', true);

-- No client write privilege is left on the three tables, on the table or on
-- any column, so a column added later starts out not writable by clients.
do $$ declare t text; r text; p text; begin
  foreach t in array array['public.workbooks', 'public.organisations', 'public.org_members'] loop
    foreach r in array array['anon', 'authenticated'] loop
      foreach p in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
        if has_table_privilege(r, t, p) then raise exception '% holds % on %', r, p, t; end if;
      end loop;
      foreach p in array array['INSERT', 'UPDATE', 'REFERENCES'] loop
        if has_any_column_privilege(r, t, p) then raise exception '% holds a column % on %', r, p, t; end if;
      end loop;
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. H2 (RT-02, proof_a23 P1): no direct client write on organisations.
-- ---------------------------------------------------------------------------
update public.organisations set status = 'suspended' where id = '74740000-0000-0000-0000-0000000000a1';
select test_as('74740000-0000-0000-0000-000000000001');
select pg_temp.denied($q$update public.organisations set status = 'active' where id = '74740000-0000-0000-0000-0000000000a1'$q$, 'RT-02.1 suspended publisher sets itself active');
select pg_temp.denied($q$update public.organisations set kind = 'akana_house' where id = '74740000-0000-0000-0000-0000000000a1'$q$, 'RT-02.2 kind set to akana_house');
select pg_temp.denied($q$update public.organisations set code = 'PB-EVVVV' where id = '74740000-0000-0000-0000-0000000000a1'$q$, 'RT-02.3 code rewritten');
select pg_temp.refused($q$update public.organisations set stripe_connect_id = 'acct_evil1' where id = '74740000-0000-0000-0000-0000000000a1'$q$, 'RT-02.5 payout account changed');
select pg_temp.denied($q$update public.organisations set is_demo = true where id = '74740000-0000-0000-0000-0000000000a1'$q$, 'is_demo set');
select pg_temp.denied($q$update public.organisations set display_name = 'Renamed' where id = '74740000-0000-0000-0000-0000000000a1'$q$, 'display name changed directly');
reset role;
select set_config('request.jwt.claims', '', true);
select test_as('74740000-0000-0000-0000-000000000008');
select pg_temp.denied($q$update public.organisations set status = 'active', kind = 'publisher' where id = '74740000-0000-0000-0000-0000000000a4'$q$, 'RT-02.4 closed church re-opens as a publisher');
reset role;
select set_config('request.jwt.claims', '', true);
select test_as('74740000-0000-0000-0000-000000000007');
select pg_temp.refused($q$update public.organisations set status = 'active' where id = '74740000-0000-0000-0000-0000000000a1'$q$, 'RT-02.6 another organisation''s owner');
reset role;
select set_config('request.jwt.claims', '', true);
select pg_temp.as_claims('74740000-0000-0000-0000-000000000001', 'aal1');
select pg_temp.denied($q$update public.organisations set kind = 'akana_house', status = 'active' where id = '74740000-0000-0000-0000-0000000000a1'$q$, 'A23 P1 kind and status at aal1');
select pg_temp.denied($q$update public.organisations set kind = 'church' where id = '74740000-0000-0000-0000-0000000000a1'$q$, 'A23 P1 kind church at aal1');
reset role;
select set_config('request.jwt.claims', '', true);
do $$ declare o public.organisations%rowtype; begin
  select * into o from public.organisations where id = '74740000-0000-0000-0000-0000000000a1';
  if o.status <> 'suspended' or o.kind <> 'publisher' or o.code <> 'PB-T74X1' or o.display_name <> 'Seventy Four X' or o.is_demo then
    raise exception 'organisation X was changed';
  end if;
  select * into o from public.organisations where id = '74740000-0000-0000-0000-0000000000a4';
  if o.status <> 'closed' or o.kind <> 'church' then raise exception 'the closed church was changed'; end if;
end $$;
-- The owner still reads their organisation; the service role still writes.
select test_as('74740000-0000-0000-0000-000000000001');
do $$ begin
  if (select count(*) from public.organisations where id = '74740000-0000-0000-0000-0000000000a1') <> 1 then
    raise exception 'the owner no longer reads their organisation'; end if;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
select pg_temp.as_service();
select pg_temp.works($q$update public.organisations set status = 'active' where id = '74740000-0000-0000-0000-0000000000a1'$q$, 'service role re-opening an organisation');
reset role;
select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- 3. M2 (RT-03, proof_a23 P2): membership changes go through the functions.
-- ---------------------------------------------------------------------------
select test_as('74740000-0000-0000-0000-000000000001');
select pg_temp.denied($q$insert into public.org_members (org_id, user_id, role) values ('74740000-0000-0000-0000-0000000000a1', '74740000-0000-0000-0000-000000000004', 'finance')$q$, 'RT-03 owner added a reader as finance with no invitation');
select pg_temp.denied($q$update public.org_members set role = 'owner' where org_id = '74740000-0000-0000-0000-0000000000a1' and user_id = '74740000-0000-0000-0000-000000000002'$q$, 'owner changed a role directly');
select pg_temp.denied($q$delete from public.org_members where org_id = '74740000-0000-0000-0000-0000000000a1' and user_id = '74740000-0000-0000-0000-000000000002'$q$, 'owner removed a member directly');
reset role;
select set_config('request.jwt.claims', '', true);
select pg_temp.as_claims('74740000-0000-0000-0000-000000000001', 'aal1');
select pg_temp.denied($q$insert into public.org_members (org_id, user_id, role) values ('74740000-0000-0000-0000-0000000000a1', '74740000-0000-0000-0000-000000000005', 'owner')$q$, 'A23 P2 owner at aal1 added a stranger as owner');
reset role;
select set_config('request.jwt.claims', '', true);
select test_as('74740000-0000-0000-0000-000000000006', array['owner']);
select pg_temp.denied($q$insert into public.org_members (org_id, user_id, role) values ('74740000-0000-0000-0000-0000000000a1', '74740000-0000-0000-0000-000000000005', 'owner')$q$, 'staff added a member directly');
reset role;
select set_config('request.jwt.claims', '', true);
do $$ begin
  if exists (select 1 from public.org_members where user_id in ('74740000-0000-0000-0000-000000000004', '74740000-0000-0000-0000-000000000005')) then
    raise exception 'a forced membership was stored'; end if;
end $$;
-- The reader who would have been forced in keeps self-service recovery codes.
select test_as('74740000-0000-0000-0000-000000000004');
do $$ begin
  if public.mfa_recovery_codes_issue((select array_agg(encode(sha256(convert_to('t74c' || n, 'UTF8')), 'hex')) from generate_series(1, 10) n)) <> 10 then
    raise exception 'the reader could not issue recovery codes'; end if;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
-- The functions still work: the owner reads the roster, changes a role and
-- removes a member, with a second factor; without one the 0032 gate refuses.
select test_as('74740000-0000-0000-0000-000000000001');
do $$ begin
  if (select count(*) from public.org_members where org_id = '74740000-0000-0000-0000-0000000000a1') <> 3 then
    raise exception 'the owner no longer reads the roster'; end if;
  perform public.org_member_set_role('74740000-0000-0000-0000-0000000000a1', '74740000-0000-0000-0000-000000000003', 'viewer');
  if (select role from public.org_members where org_id = '74740000-0000-0000-0000-0000000000a1' and user_id = '74740000-0000-0000-0000-000000000003') <> 'viewer' then
    raise exception 'org_member_set_role did not change the role'; end if;
  perform public.org_member_set_role('74740000-0000-0000-0000-0000000000a1', '74740000-0000-0000-0000-000000000003', 'editor');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
select pg_temp.as_claims('74740000-0000-0000-0000-000000000001', 'aal1');
do $$ begin
  begin
    perform public.org_member_set_role('74740000-0000-0000-0000-0000000000a1', '74740000-0000-0000-0000-000000000003', 'viewer');
    raise exception 'an owner at aal1 changed a role';
  exception when sqlstate 'AKM01' then null; end;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- 4. M1 (proof_staff_aal1): staff power needs aal2 and a platform_roles row.
-- ---------------------------------------------------------------------------
-- Control: a proper staff session (aal2, role in the token and in the table).
select pg_temp.as_claims('74740000-0000-0000-0000-000000000006', 'aal2', array['owner']);
do $$ begin
  if not app.is_staff() or not app.is_platform(array['owner']) or app.platform_roles() <> array['owner'] then
    raise exception 'a proper staff session lost its role'; end if;
  if (select count(*) from public.organisations where code like '%-T74%') <> 3 then
    raise exception 'staff no longer read every organisation'; end if;
  if (select count(*) from public.platform_roles where user_id = '74740000-0000-0000-0000-000000000009') <> 1 then
    raise exception 'staff no longer read the staff list'; end if;
end $$;
select pg_temp.works($q$select * from public.staff_lookup_account('reader74@test.example', 'test 0074')$q$, 'S1 lookup on a staff session');
select pg_temp.works($q$select public.set_flag('reader_passkeys', false, 100, 'test 0074')$q$, 'S2 set_flag on a staff session');
reset role;
select set_config('request.jwt.claims', '', true);

-- A staff token at aal1: no second factor, so no staff power at all.
select pg_temp.as_claims('74740000-0000-0000-0000-000000000006', 'aal1', array['owner']);
do $$ begin
  if app.session_mfa_verified() then raise exception 'aal1 counted as verified'; end if;
  if app.is_staff() or app.is_platform(array['owner']) or cardinality(app.platform_roles()) <> 0 then
    raise exception 'a staff token at aal1 kept its role'; end if;
  if (select count(*) from public.organisations) <> 0 then
    raise exception 'S4 a staff token at aal1 read organisations through the staff policy'; end if;
  if (select count(*) from public.workbooks where code like 'AK-T74%' and status <> 'live') <> 0 then
    raise exception 'a staff token at aal1 read unpublished workbooks'; end if;
  -- The enrolment flow: they still read their own role row, and only theirs,
  -- so /admin can send them to /admin/mfa instead of a 404.
  if (select count(*) from public.platform_roles) <> 1
     or (select count(*) from public.platform_roles where user_id = '74740000-0000-0000-0000-000000000006' and role = 'owner') <> 1 then
    raise exception 'a staff member at aal1 should read their own role row and no other'; end if;
  -- And they are still told a second factor is required.
  if not (select required from public.role_mfa_status()) or (select verified from public.role_mfa_status()) then
    raise exception 'role_mfa_status should say required and not verified for staff at aal1'; end if;
end $$;
select pg_temp.refused($q$select * from public.staff_lookup_account('reader74@test.example', 'test 0074')$q$, 'S1 lookup at aal1');
select pg_temp.refused($q$select public.set_flag('reader_passkeys', true, 100, 'test 0074')$q$, 'S2 set_flag at aal1');
select pg_temp.refused($q$select public.staff_restore_access('74740000-0000-0000-0000-000000000004', null, 'AK-T74X1', now() + interval '1 day', 'test 0074')$q$, 'S3 restore access at aal1');
select pg_temp.refused($q$select public.set_workbook_paused('74740000-0000-0000-0000-0000000000c1', true, 'test 0074')$q$, 'pause at aal1');
reset role;
select set_config('request.jwt.claims', '', true);

-- A token that still names a role after the row was removed gets nothing,
-- even at aal2. The claim no longer makes anyone staff by itself.
delete from public.platform_roles where user_id = '74740000-0000-0000-0000-000000000006';
select pg_temp.as_claims('74740000-0000-0000-0000-000000000006', 'aal2', array['owner']);
do $$ begin
  if app.is_staff() or app.is_platform(array['owner']) then
    raise exception 'a removed role kept working on an unexpired token'; end if;
  if (select count(*) from public.organisations) <> 0 then
    raise exception 'a removed role still read organisations'; end if;
end $$;
select pg_temp.refused($q$select * from public.staff_lookup_account('reader74@test.example', 'test 0074')$q$, 'lookup after the role was removed');
select pg_temp.refused($q$select public.set_flag('reader_passkeys', true, 100, 'test 0074')$q$, 'set_flag after the role was removed');
reset role;
select set_config('request.jwt.claims', '', true);
-- A reader who never held a role, with a forged-looking claim, likewise.
select pg_temp.as_claims('74740000-0000-0000-0000-000000000004', 'aal2', array['owner', 'finance']);
do $$ begin
  if app.is_staff() then raise exception 'a claim with no row made a reader staff'; end if;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- The token and the table must agree role by role. Support holds 'support' in
-- the table: a token naming 'owner' as well gets support only, and a token
-- naming no role gets nothing until it is refreshed.
select pg_temp.as_claims('74740000-0000-0000-0000-000000000009', 'aal2', array['owner', 'support']);
do $$ begin
  if app.platform_roles() <> array['support'] or app.is_platform(array['owner']) or not app.is_platform(array['support']) then
    raise exception 'roles should be those in both the token and the table, saw %', app.platform_roles(); end if;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
select pg_temp.as_claims('74740000-0000-0000-0000-000000000009', 'aal2');
do $$ begin
  if app.is_staff() then raise exception 'a row with no claim made the session staff'; end if;
  -- Held to the rules all the same: a second factor is required, and
  -- self-service recovery codes stay closed to staff accounts (0037).
  if not (select required from public.role_mfa_status()) then
    raise exception 'a staff account whose token names no role should still need a second factor'; end if;
  begin
    perform public.mfa_recovery_codes_issue((select array_agg(encode(sha256(convert_to('t74s' || n, 'UTF8')), 'hex')) from generate_series(1, 10) n));
    raise exception 'a staff account issued self-service recovery codes';
  exception when sqlstate 'AKR03' then null; end;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- The service role has no token roles and never had staff roles. Its paths
-- are recognised by app.is_service_role() and are unchanged.
select pg_temp.as_service();
do $$ begin
  if app.is_staff() then raise exception 'the service role should not be staff'; end if;
  if not app.is_service_role() then raise exception 'the service role was not recognised'; end if;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
-- No token at all (cron, migrations): no roles, no error.
do $$ begin
  if app.is_staff() or cardinality(app.platform_roles()) <> 0 then raise exception 'no token should mean no roles'; end if;
end $$;
-- The two new helpers are not callable from a client.
do $$ begin
  if has_function_privilege('authenticated', 'app.claimed_platform_roles()', 'execute')
     or has_function_privilege('anon', 'app.claimed_platform_roles()', 'execute')
     or has_function_privilege('authenticated', 'app.holds_platform_role()', 'execute')
     or has_function_privilege('anon', 'app.holds_platform_role()', 'execute') then
    raise exception 'a client can call the role helpers'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. M4: the public forms are callable by the service role only.
-- ---------------------------------------------------------------------------
do $$ declare f record; begin
  for f in select p.oid, p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('public', 'app')
              and p.proname in ('submit_lead', 'submit_support_message', 'submit_support_message_as', 'submit_takedown_notice') loop
    if has_function_privilege('anon', f.oid, 'execute') or has_function_privilege('authenticated', f.oid, 'execute') then
      raise exception 'a client can call %', f.sig; end if;
    if not has_function_privilege('service_role', f.oid, 'execute') then
      raise exception 'the service role cannot call %', f.sig; end if;
  end loop;
end $$;
select pg_temp.as_anon();
select pg_temp.denied($q$select public.submit_lead(p_kind => 'author', p_name => 'Anon', p_email => 'anon74@test.example', p_consent => true, p_ip_hash => repeat('a', 64))$q$, 'anon submit_lead with its own ip_hash');
select pg_temp.denied($q$select public.submit_support_message('access', 'Jo', 'jo74@test.example', 'Hello', true, repeat('a', 64))$q$, 'anon submit_support_message');
select pg_temp.denied($q$select public.submit_takedown_notice('notice', 'other_illegal', 'Someone', 's74@example.com', 'Somewhere', null, 'owner', null, null, 'AK-T74X1', 'Unlawful content.', true, true, null, 'Someone', null, repeat('a', 64))$q$, 'anon submit_takedown_notice');
reset role;
select set_config('request.jwt.claims', '', true);
select test_as('74740000-0000-0000-0000-000000000004');
select pg_temp.denied($q$select public.submit_lead(p_kind => 'author', p_name => 'Reader', p_email => 'reader74@test.example', p_consent => true, p_ip_hash => repeat('b', 64))$q$, 'reader submit_lead with their own ip_hash');
select pg_temp.denied($q$select public.submit_support_message('access', 'Jo', 'jo74@test.example', 'Hello', true, repeat('b', 64))$q$, 'reader submit_support_message');
select pg_temp.denied($q$select public.submit_support_message_as('74740000-0000-0000-0000-000000000005', 'access', 'Jo', 'jo74@test.example', 'Hello', true, repeat('b', 64))$q$, 'reader submit_support_message_as');
select pg_temp.denied($q$select public.submit_takedown_notice('notice', 'other_illegal', 'Someone', 's74@example.com', 'Somewhere', null, 'owner', null, null, 'AK-T74X1', 'Unlawful content.', true, true, null, 'Someone', null, repeat('b', 64))$q$, 'reader submit_takedown_notice');
reset role;
select set_config('request.jwt.claims', '', true);
select pg_temp.as_service();
do $$ declare v uuid; begin
  if public.submit_lead(p_kind => 'author', p_name => 'Server', p_email => 'server74@test.example', p_consent => true, p_ip_hash => repeat('c', 64)) is null then
    raise exception 'the service role could not submit a lead'; end if;
  if public.submit_takedown_notice('notice', 'other_illegal', 'Someone', 's74@example.com', 'Somewhere', null, 'owner', null, null, 'AK-T74X1', 'Unlawful content.', true, true, null, 'Someone', null, repeat('c', 64)) is null then
    raise exception 'the service role could not submit a notice'; end if;
  -- The contact form keeps the signed-in sender, drops an id that is not a
  -- user, and takes none for a signed-out visitor.
  v := public.submit_support_message_as('74740000-0000-0000-0000-000000000004', 'access', 'Jo', 'jo74@test.example', 'Hello', true, repeat('c', 64));
  if (select user_id from public.support_messages where id = v) is distinct from '74740000-0000-0000-0000-000000000004'::uuid then
    raise exception 'the sender was not kept on the contact message'; end if;
  v := public.submit_support_message_as('74749999-0000-0000-0000-000000000000', 'access', 'Jo', 'jo74@test.example', 'Hello', true, repeat('c', 64));
  if (select user_id from public.support_messages where id = v) is not null then
    raise exception 'an unknown sender id was stored'; end if;
  v := public.submit_support_message_as(null, 'access', 'Jo', 'jo74@test.example', 'Hello', true, repeat('c', 64));
  if (select user_id from public.support_messages where id = v) is not null then
    raise exception 'a signed-out message has a sender'; end if;
  -- The limit still counts the hash the server sent: 5 an hour.
  perform public.submit_support_message('access', 'Jo', 'jo74@test.example', 'Hello', true, repeat('c', 64));
  perform public.submit_support_message('access', 'Jo', 'jo74@test.example', 'Hello', true, repeat('c', 64));
  begin
    perform public.submit_support_message_as(null, 'access', 'Jo', 'jo74@test.example', 'Hello', true, repeat('c', 64));
    raise exception 'the sixth contact message in an hour was stored';
  exception when sqlstate 'AKH29' then null; end;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- 6. L1 (RT-05): the recovery code tables, and a sweep of every public table.
-- ---------------------------------------------------------------------------
do $$ declare t text; r text; p text; begin
  foreach t in array array['public.mfa_recovery_codes', 'public.mfa_recovery_attempts'] loop
    foreach r in array array['anon', 'authenticated'] loop
      foreach p in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
        if has_table_privilege(r, t, p) then raise exception 'RT-05 % holds % on %', r, p, t; end if;
      end loop;
    end loop;
    if has_table_privilege('anon', t, 'SELECT') then raise exception 'RT-05 anon reads %', t; end if;
  end loop;
  if has_table_privilege('authenticated', 'public.mfa_recovery_attempts', 'SELECT') then
    raise exception 'a signed-in caller reads the attempts table'; end if;
  if not has_table_privilege('authenticated', 'public.mfa_recovery_codes', 'SELECT') then
    raise exception 'the reader lost the read of their own codes'; end if;
end $$;
select pg_temp.as_anon();
select pg_temp.denied($q$truncate public.mfa_recovery_codes$q$, 'RT-05 anon truncating the recovery codes');
select pg_temp.denied($q$truncate public.mfa_recovery_attempts$q$, 'RT-05 anon truncating the attempts');
reset role;
select set_config('request.jwt.claims', '', true);
select test_as('74740000-0000-0000-0000-000000000004');
select pg_temp.denied($q$truncate public.mfa_recovery_codes$q$, 'a reader truncating the recovery codes');
select pg_temp.denied($q$delete from public.mfa_recovery_codes$q$, 'a reader deleting recovery codes');
do $$ begin
  -- The ten codes issued in section 3 are still there and still readable.
  if (select count(*) from public.mfa_recovery_codes) <> 10 or public.mfa_recovery_codes_left() <> 10 then
    raise exception 'the reader should still read their own ten codes'; end if;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- The sweep. The test shim gives new public tables the privileges a Supabase
-- project gives them, so a migration that creates a table and forgets the
-- revoke fails here. anon must hold no write privilege on any table or view
-- in public; nobody but the service role may truncate one.
do $$ declare bad text; begin
  select string_agg(r || ' on ' || c.relname || ': ' || privs, '; ' order by c.relname, r) into bad
    from pg_class c
    cross join unnest(array['anon', 'authenticated']) r
    cross join lateral (
      select string_agg(p, ',') as privs
        from unnest(case when r = 'anon'
                         then array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']
                         else array['TRUNCATE', 'REFERENCES', 'TRIGGER'] end) p
       where has_table_privilege(r, c.oid, p)
          or (p in ('INSERT', 'UPDATE', 'REFERENCES') and has_any_column_privilege(r, c.oid, p))) x
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f')
     and x.privs is not null;
  if bad is not null then
    raise exception 'a missed revoke on a public table (revoke it in the migration that made the table): %', bad;
  end if;
end $$;

-- Sequences and functions get the same default. No client holds anything on a
-- sequence in public, and the five service-role functions that kept the
-- default grant (0065, 0066) are closed to clients.
do $$ declare bad text; f record; begin
  select string_agg(r || ' on ' || c.relname, '; ' order by c.relname, r) into bad
    from pg_class c cross join unnest(array['anon', 'authenticated']) r
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'S'
     and (has_sequence_privilege(r, c.oid, 'USAGE') or has_sequence_privilege(r, c.oid, 'SELECT') or has_sequence_privilege(r, c.oid, 'UPDATE'));
  if bad is not null then raise exception 'a client holds a privilege on a sequence: %', bad; end if;
  for f in select p.oid, p.oid::regprocedure::text as sig from pg_proc p
            where p.pronamespace = 'public'::regnamespace
              and p.proname in ('certificate_by_hash', 'prune_push_log', 'pair_invite_state', 'pair_channels_for', 'prune_pairs') loop
    if has_function_privilege('anon', f.oid, 'execute') or has_function_privilege('authenticated', f.oid, 'execute') then
      raise exception 'a client can call %', f.sig; end if;
    if not has_function_privilege('service_role', f.oid, 'execute') then
      raise exception 'the service role cannot call %', f.sig; end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 7. L5 (RT-07): record_signoff applies the publisher rule.
-- ---------------------------------------------------------------------------
select test_as('74740000-0000-0000-0000-000000000002');   -- role "author" in publisher X
select pg_temp.refused($q$select public.author_signoff('74740000-0000-0000-0000-0000000000d2', repeat('2', 64), 'publisher', 'A N Author', null)$q$, 'RT-07 author_signoff as publisher');
select pg_temp.denied($q$select public.record_signoff('74740000-0000-0000-0000-0000000000d2', 'publisher', 'A N Author', null, null, null)$q$, 'RT-07 record_signoff recorded a publisher sign-off for an author');
select pg_temp.denied($q$select public.record_signoff('74740000-0000-0000-0000-0000000000d2', 'editor', 'A N Author', null, null, null)$q$, 'RT-07 record_signoff recorded an editor sign-off for an author');
-- Their own author sign-off still goes through, by the Studio path.
select pg_temp.works($q$select public.author_signoff('74740000-0000-0000-0000-0000000000d2', repeat('2', 64), 'author', 'A N Author', null)$q$, 'author sign-off by the author');
reset role;
select set_config('request.jwt.claims', '', true);
-- An owner of an individual author's organisation is not a publisher.
select test_as('74740000-0000-0000-0000-000000000007');
select pg_temp.denied($q$select public.record_signoff('74740000-0000-0000-0000-0000000000d4', 'publisher', 'Solo Owner', null, null, null)$q$, 'publisher sign-off from an individual author''s organisation');
reset role;
select set_config('request.jwt.claims', '', true);
-- An editor of the publisher gives it through the Studio path, as before.
select test_as('74740000-0000-0000-0000-000000000003');
select pg_temp.works($q$select public.author_signoff('74740000-0000-0000-0000-0000000000d2', repeat('2', 64), 'publisher', 'E D Itor', null)$q$, 'publisher sign-off by the publisher''s editor');
reset role;
select set_config('request.jwt.claims', '', true);
-- Staff record either kind from the review desk, as before.
select test_as('74740000-0000-0000-0000-000000000009', array['support', 'editor']);
select pg_temp.works($q$select public.record_signoff('74740000-0000-0000-0000-0000000000d4', 'publisher', 'Akana Editor', null, null, 'recorded for the publisher')$q$, 'publisher sign-off recorded by staff');
select pg_temp.works($q$select public.record_signoff('74740000-0000-0000-0000-0000000000d4', 'editor', 'Akana Editor', null, null, null)$q$, 'editor sign-off by staff');
reset role;
select set_config('request.jwt.claims', '', true);
do $$ begin
  if (select count(*) from public.release_signoffs where version_id = '74740000-0000-0000-0000-0000000000d2' and kind = 'publisher') <> 1 then
    raise exception 'expected exactly the editor''s publisher sign-off on the draft'; end if;
  if exists (select 1 from public.release_signoffs where kind = 'publisher' and recorded_by in
       ('74740000-0000-0000-0000-000000000002', '74740000-0000-0000-0000-000000000007')) then
    raise exception 'a publisher sign-off was stored for someone who may not give one'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 8. M14: the yearly referral cap, one session. The race itself is proved by
-- supabase/tests/proofs/referral-cap-race.sh (see the top of this file).
-- ---------------------------------------------------------------------------
do $$ begin
  if position('pg_advisory_xact_lock' in (select prosrc from pg_proc where proname = 'referral_claim_reward' and pronamespace = 'public'::regnamespace)) = 0 then
    raise exception 'referral_claim_reward does not lock on the referrer before counting';
  end if;
  if (select count(*) from pg_proc where proname = 'referral_claim_reward' and pronamespace = 'public'::regnamespace) <> 1 then
    raise exception 'there should be one referral_claim_reward';
  end if;
end $$;
insert into auth.users (id, email)
select ('74741000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'friend74-' || n || '@test' from generate_series(1, 13) n;
insert into public.referrals (referrer_id, referred_id, code, status, qualified_at, rewarded_at, reward_kind, reward_value, reward_currency, card_fingerprint)
select '74740000-0000-0000-0000-00000000000a', ('74741000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'TSTSEVFOUR',
       'rewarded', now() - interval '10 days', now() - interval '10 days', 'credit', 500, 'GBP', 'fp74_old_' || n
  from generate_series(1, 11) n;
insert into public.referrals (referrer_id, referred_id, code) values
  ('74740000-0000-0000-0000-00000000000a', '74741000-0000-0000-0000-000000000012', 'TSTSEVFOUR'),
  ('74740000-0000-0000-0000-00000000000a', '74741000-0000-0000-0000-000000000013', 'TSTSEVFOUR');
select pg_temp.as_service();
do $$ declare n int; begin
  select count(*) into n from public.referral_claim_reward('74741000-0000-0000-0000-000000000012', 'fp74_new_1', '{}', false, 'GBP');
  if n <> 1 then raise exception 'the twelfth friend should earn the referrer a reward'; end if;
  select count(*) into n from public.referral_claim_reward('74741000-0000-0000-0000-000000000013', 'fp74_new_2', '{}', false, 'GBP');
  if n <> 0 then raise exception 'the thirteenth friend passed the yearly cap'; end if;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
do $$ begin
  if (select count(*) from public.referrals where referrer_id = '74740000-0000-0000-0000-00000000000a' and status in ('rewarding', 'rewarded')) <> 12 then
    raise exception 'the referrer should hold 12 rewards'; end if;
  if (select block_reason from public.referrals where referred_id = '74741000-0000-0000-0000-000000000013') is distinct from 'cap_reached' then
    raise exception 'the thirteenth referral should be blocked by the cap'; end if;
end $$;
select test_as('74740000-0000-0000-0000-000000000004');
select pg_temp.denied($q$select * from public.referral_claim_reward('74741000-0000-0000-0000-000000000013', 'fp', '{}', false, 'GBP')$q$, 'a reader claiming a referral reward');
reset role;
select set_config('request.jwt.claims', '', true);

rollback;
\echo PASS 0074_review_permissions
