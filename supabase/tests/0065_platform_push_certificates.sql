-- 0065 Platform: push subscriptions, the push log and the finish certificate.
-- Each block must raise or return the expected value; a failure aborts the script.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('a6500000-0000-0000-0000-000000000001', 'reader65a@test'),
  ('a6500000-0000-0000-0000-000000000002', 'reader65b@test');

insert into public.organisations (id, code, kind, legal_name, display_name, slug, country) values
  ('a6500000-0000-0000-0000-0000000000a1', 'PB-TD065', 'publisher', 'Org 65 Ltd', 'Org 65', 'org-65', 'GB');
insert into public.books (id, org_id, slug, title, rights_status) values
  ('a6500000-0000-0000-0000-0000000000b1', 'a6500000-0000-0000-0000-0000000000a1', 'book-65', 'Book 65', 'public_domain');
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, safety_tier, depth, status) values
  ('a6500000-0000-0000-0000-0000000000c1', 'AK-T65A0', 'a6500000-0000-0000-0000-0000000000b1', 'a6500000-0000-0000-0000-0000000000a1', 'wb-65a', 'Plain Workbook 65', 'Card', 'productivity', 'none', 'full', 'live'),
  ('a6500000-0000-0000-0000-0000000000c2', 'AK-T65B0', 'a6500000-0000-0000-0000-0000000000b1', 'a6500000-0000-0000-0000-0000000000a1', 'wb-65b', 'Careful Workbook 65', 'Card', 'productivity', 'standard', 'full', 'live');
insert into public.workbook_versions (id, workbook_id, semver, content, content_hash) values
  ('a6500000-0000-0000-0000-0000000000d1', 'a6500000-0000-0000-0000-0000000000c1', '1.0.0', '{}'::jsonb, repeat('a', 64)),
  ('a6500000-0000-0000-0000-0000000000d2', 'a6500000-0000-0000-0000-0000000000c2', '1.0.0', '{}'::jsonb, repeat('b', 64));
insert into public.enrolments (id, user_id, tenant_id, workbook_id, version_id) values
  ('a6500000-0000-0000-0000-0000000000e1', 'a6500000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'a6500000-0000-0000-0000-0000000000c1', 'a6500000-0000-0000-0000-0000000000d1'),
  ('a6500000-0000-0000-0000-0000000000e2', 'a6500000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'a6500000-0000-0000-0000-0000000000c2', 'a6500000-0000-0000-0000-0000000000d2'),
  ('a6500000-0000-0000-0000-0000000000e3', 'a6500000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'a6500000-0000-0000-0000-0000000000c1', 'a6500000-0000-0000-0000-0000000000d1');

create or replace function pg_temp.as_service() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "service_role"}'::text, true);
  execute 'set local role service_role';
end $$;

-- ---------------------------------------------------------------------------
-- 1. Push subscriptions: save, shape, five at most, own rows only, shared device
-- ---------------------------------------------------------------------------
select test_as('a6500000-0000-0000-0000-000000000001');
do $$ declare i int; begin
  perform public.save_push_subscription('https://push.example/ep/1', 'key1', 'auth1');
  -- The same endpoint again updates rather than duplicating.
  perform public.save_push_subscription('https://push.example/ep/1', 'key1b', 'auth1b');
  if (select count(*) from public.push_subscriptions) <> 1 then raise exception 'saving twice made two rows'; end if;
  begin perform public.save_push_subscription('http://push.example/ep/x', 'k', 'a'); raise exception 'accepted a plain http endpoint'; exception when invalid_parameter_value then null; end;
  begin perform public.save_push_subscription('https://push.example/ep/x', '', 'a'); raise exception 'accepted empty keys'; exception when invalid_parameter_value then null; end;
  for i in 2..7 loop
    perform public.save_push_subscription('https://push.example/ep/' || i, 'k', 'a');
  end loop;
  if (select count(*) from public.push_subscriptions) <> 5 then raise exception 'a reader may keep five devices, got %', (select count(*) from public.push_subscriptions); end if;
end $$;
reset role;
do $$ begin
  if exists (select 1 from public.push_subscriptions where endpoint = 'https://push.example/ep/1') then raise exception 'the oldest device should go first'; end if;
end $$;
select test_as('a6500000-0000-0000-0000-000000000001');
-- The keys and endpoint are not readable by the client.
do $$ begin
  begin perform endpoint from public.push_subscriptions limit 1; raise exception 'a reader read an endpoint'; exception when insufficient_privilege then null; end;
  begin perform p256dh from public.push_subscriptions limit 1; raise exception 'a reader read a push key'; exception when insufficient_privilege then null; end;
  begin insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ('a6500000-0000-0000-0000-000000000001', 'https://x.example/1', 'k', 'a'); raise exception 'a direct insert was allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;

select test_as('a6500000-0000-0000-0000-000000000002');
do $$ begin
  if exists (select 1 from public.push_subscriptions) then raise exception 'a reader saw another reader''s devices'; end if;
  delete from public.push_subscriptions;
end $$;
-- A device that changes hands moves to the new reader.
select public.save_push_subscription('https://push.example/ep/7', 'k2', 'a2');
do $$ begin
  if (select count(*) from public.push_subscriptions) <> 1 then raise exception 'the shared device did not move'; end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.push_subscriptions where user_id = 'a6500000-0000-0000-0000-000000000001') <> 4 then raise exception 'the first reader should have 4 devices left'; end if;
end $$;

-- A reader removes their own device by address, and not another reader's.
select test_as('a6500000-0000-0000-0000-000000000002');
do $$ begin
  if public.remove_push_subscription('https://push.example/ep/2') then raise exception 'removed another reader''s device'; end if;
  if not public.remove_push_subscription('https://push.example/ep/7') then raise exception 'could not remove own device'; end if;
  if public.remove_push_subscription('https://push.example/ep/7') then raise exception 'removed twice'; end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.push_subscriptions where user_id = 'a6500000-0000-0000-0000-000000000001') <> 4 then raise exception 'the first reader lost a device'; end if;
end $$;

-- A signed-out caller cannot save.
select set_config('request.jwt.claims', '', true);
set local role anon;
do $$ begin
  begin perform public.save_push_subscription('https://push.example/ep/9', 'k', 'a'); raise exception 'anon saved a subscription'; exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 2. The push log: service role only, one per reader per day
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
insert into public.push_log (user_id, local_date) values ('a6500000-0000-0000-0000-000000000001', '2026-11-02');
do $$ begin
  begin insert into public.push_log (user_id, local_date) values ('a6500000-0000-0000-0000-000000000001', '2026-11-02'); raise exception 'a second push on one day was allowed'; exception when unique_violation then null; end;
  if public.prune_push_log() <> 0 then raise exception 'a fresh row was pruned'; end if;
end $$;
reset role;
select test_as('a6500000-0000-0000-0000-000000000001');
do $$ begin
  begin perform 1 from public.push_log; raise exception 'a reader read the push log'; exception when insufficient_privilege then null; end;
  begin perform public.prune_push_log(); raise exception 'a reader pruned the log'; exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. Certificates: only when finished, private by default, no public link for tier above none
-- ---------------------------------------------------------------------------
select test_as('a6500000-0000-0000-0000-000000000001');
do $$ begin
  begin perform public.make_certificate('a6500000-0000-0000-0000-0000000000e1', 'Sam'); raise exception 'a certificate for an unfinished programme'; exception when object_not_in_prerequisite_state then null; end;
  begin perform public.make_certificate('a6500000-0000-0000-0000-0000000000e3', 'Sam'); raise exception 'a certificate for someone else''s programme'; exception when insufficient_privilege then null; end;
end $$;
insert into public.progress_events (enrolment_id, kind) values ('a6500000-0000-0000-0000-0000000000e1', 'finished'), ('a6500000-0000-0000-0000-0000000000e2', 'finished');
do $$ declare c uuid; begin
  c := public.make_certificate('a6500000-0000-0000-0000-0000000000e1', '  Sam Reader  ');
  if c is null then raise exception 'no certificate id'; end if;
  if (select holder_name from public.my_certificate('a6500000-0000-0000-0000-0000000000e1')) <> 'Sam Reader' then raise exception 'the name was not trimmed'; end if;
  if (select shared from public.my_certificate('a6500000-0000-0000-0000-0000000000e1')) then raise exception 'a certificate must be private by default'; end if;
  if not (select shareable from public.my_certificate('a6500000-0000-0000-0000-0000000000e1')) then raise exception 'a tier none title can be shared'; end if;
  begin perform public.make_certificate('a6500000-0000-0000-0000-0000000000e1', '<b>x</b>'); raise exception 'markup in a name'; exception when check_violation then null; end;
  begin perform public.make_certificate('a6500000-0000-0000-0000-0000000000e1', repeat('x', 61)); raise exception 'a long name'; exception when check_violation then null; end;
  -- Renaming keeps one row.
  perform public.make_certificate('a6500000-0000-0000-0000-0000000000e1', 'Sam');
  if (select count(*) from public.certificates) <> 1 then raise exception 'renaming made a second certificate'; end if;
  -- No date column is exposed, and the share hash is not readable.
  begin perform share_hash from public.certificates; raise exception 'the share hash was readable'; exception when insufficient_privilege then null; end;
  begin update public.certificates set holder_name = 'X'; raise exception 'a direct update was allowed'; exception when insufficient_privilege then null; end;
end $$;

-- A tier above none stays private whatever is asked.
do $$ begin
  perform public.make_certificate('a6500000-0000-0000-0000-0000000000e2', 'Sam');
  if (select shareable from public.my_certificate('a6500000-0000-0000-0000-0000000000e2')) then raise exception 'a standard tier title must not be shareable'; end if;
  begin perform public.set_certificate_share('a6500000-0000-0000-0000-0000000000e2', repeat('a', 64)); raise exception 'a public link for a standard tier title'; exception when object_not_in_prerequisite_state then null; end;
  -- Sharing a plain title works, and a bad hash does not.
  begin perform public.set_certificate_share('a6500000-0000-0000-0000-0000000000e1', 'not a hash'); raise exception 'accepted a bad hash'; exception when invalid_parameter_value then null; end;
  perform public.set_certificate_share('a6500000-0000-0000-0000-0000000000e1', repeat('b', 64));
  if not (select shared from public.my_certificate('a6500000-0000-0000-0000-0000000000e1')) then raise exception 'the link did not turn on'; end if;
end $$;
reset role;

-- Another reader sees nothing and cannot touch it.
select test_as('a6500000-0000-0000-0000-000000000002');
do $$ begin
  if exists (select 1 from public.certificates) then raise exception 'a reader saw another reader''s certificate'; end if;
  if exists (select 1 from public.my_certificate('a6500000-0000-0000-0000-0000000000e1')) then raise exception 'my_certificate leaked'; end if;
  begin perform public.set_certificate_share('a6500000-0000-0000-0000-0000000000e1', null); raise exception 'turned off someone else''s link'; exception when insufficient_privilege then null; end;
end $$;
reset role;

-- The public lookup: service role only, plain titles only, gone when switched off.
select pg_temp.as_service();
do $$ begin
  if (select title from public.certificate_by_hash(repeat('b', 64))) <> 'Plain Workbook 65' then raise exception 'the shared certificate was not found'; end if;
  if exists (select 1 from public.certificate_by_hash(repeat('c', 64))) then raise exception 'an unknown hash matched'; end if;
end $$;
reset role;
select test_as('a6500000-0000-0000-0000-000000000001');
do $$ begin
  begin perform public.certificate_by_hash(repeat('b', 64)); raise exception 'a reader called the public lookup'; exception when insufficient_privilege then null; end;
  perform public.set_certificate_share('a6500000-0000-0000-0000-0000000000e1', null);
end $$;
reset role;
select pg_temp.as_service();
do $$ begin
  if exists (select 1 from public.certificate_by_hash(repeat('b', 64))) then raise exception 'the link still worked after switching off'; end if;
end $$;
reset role;

-- The certificate goes with the enrolment.
delete from public.enrolments where id = 'a6500000-0000-0000-0000-0000000000e1';
do $$ begin
  if exists (select 1 from public.certificates where enrolment_id = 'a6500000-0000-0000-0000-0000000000e1') then raise exception 'the certificate outlived its enrolment'; end if;
end $$;

select set_config('request.jwt.claims', '', true);
rollback;
