-- Payouts and private storage (0014): the payout column guard, step-up,
-- begin_payout_change, tax details, the service-role Connect functions, the
-- go-live gate and the org-files bucket policies. Each block must raise or
-- return the expected count; a failure aborts the script and the CI step.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('a0140000-0000-0000-0000-000000000001', 'owner@pay.test'),
  ('a0140000-0000-0000-0000-000000000002', 'finance@pay.test'),
  ('a0140000-0000-0000-0000-000000000003', 'editor@pay.test'),
  ('a0140000-0000-0000-0000-000000000004', 'author@pay.test'),
  ('a0140000-0000-0000-0000-000000000005', 'outsider@pay.test'),
  ('a0140000-0000-0000-0000-000000000006', 'staff@pay.test'),
  ('a0140000-0000-0000-0000-000000000007', 'owner-in@pay.test');

insert into public.organisations (id, code, kind, legal_name, display_name, slug, country) values
  ('a0140000-0000-0000-0000-0000000000a1', 'PB-TPAY1', 'publisher', 'Pay One Ltd', 'Pay One', 'pay-one', 'GB'),
  ('a0140000-0000-0000-0000-0000000000a2', 'PB-TPAY2', 'publisher', 'Pay Two Ltd', 'Pay Two', 'pay-two', 'GB'),
  ('a0140000-0000-0000-0000-0000000000a3', 'AU-TPAY3', 'individual', 'Pay Three', 'Pay Three', 'pay-three', 'IN');
insert into public.org_members (org_id, user_id, role) values
  ('a0140000-0000-0000-0000-0000000000a1', 'a0140000-0000-0000-0000-000000000001', 'owner'),
  ('a0140000-0000-0000-0000-0000000000a1', 'a0140000-0000-0000-0000-000000000002', 'finance'),
  ('a0140000-0000-0000-0000-0000000000a1', 'a0140000-0000-0000-0000-000000000003', 'editor'),
  ('a0140000-0000-0000-0000-0000000000a1', 'a0140000-0000-0000-0000-000000000004', 'author'),
  ('a0140000-0000-0000-0000-0000000000a2', 'a0140000-0000-0000-0000-000000000005', 'owner'),
  ('a0140000-0000-0000-0000-0000000000a3', 'a0140000-0000-0000-0000-000000000007', 'owner');

insert into public.books (id, org_id, slug, title) values
  ('a0140000-0000-0000-0000-0000000000c1', 'a0140000-0000-0000-0000-0000000000a1', 'pay-book', 'Pay Book'),
  ('a0140000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000001', 'pay-house-book', 'House Book');
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, depth, status, badge) values
  ('a0140000-0000-0000-0000-0000000000d1', 'AK-TPAY1', 'a0140000-0000-0000-0000-0000000000c1', 'a0140000-0000-0000-0000-0000000000a1',
   'pay-wb-one', 'Pay WB One', 'Card', 'productivity', 'full', 'approved', 'official'),
  ('a0140000-0000-0000-0000-0000000000d2', 'AK-TPAY2', 'a0140000-0000-0000-0000-0000000000c1', 'a0140000-0000-0000-0000-0000000000a1',
   'pay-wb-two', 'Pay WB Two', 'Card', 'productivity', 'full', 'approved', 'public_domain'),
  ('a0140000-0000-0000-0000-0000000000d3', 'AK-TPAY3', 'a0140000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000001',
   'pay-wb-house', 'Pay WB House', 'Card', 'productivity', 'full', 'approved', 'official');

-- Act as a user with a chosen assurance level and TOTP age in seconds (null: no TOTP in amr).
create or replace function pg_temp.as_payee(p_user uuid, p_aal text, p_totp_age int, p_roles text[] default '{}') returns void
language plpgsql as $$
declare v_amr jsonb := '[{"method": "otp", "timestamp": 1}]'::jsonb;
begin
  if p_totp_age is not null then
    v_amr := v_amr || jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint - p_totp_age));
  end if;
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal, 'amr', v_amr,
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

-- ---------------------------------------------------------------------------
-- 1. The owner cannot write payout columns directly, but can still edit the name.
-- ---------------------------------------------------------------------------
select pg_temp.as_payee('a0140000-0000-0000-0000-000000000001', 'aal2', 10);
do $$ begin
  update public.organisations set display_name = 'Pay One Books' where id = 'a0140000-0000-0000-0000-0000000000a1';
  begin
    update public.organisations set connect_status = 'verified' where id = 'a0140000-0000-0000-0000-0000000000a1';
    raise exception 'owner set connect_status directly';
  exception when sqlstate 'AKY01' then null; end;
  begin
    update public.organisations set stripe_connect_id = 'acct_attacker1' where id = 'a0140000-0000-0000-0000-0000000000a1';
    raise exception 'owner set stripe_connect_id directly';
  exception when sqlstate 'AKY01' then null; end;
  begin
    update public.organisations set tax_residence = 'US' where id = 'a0140000-0000-0000-0000-0000000000a1';
    raise exception 'owner set tax_residence directly';
  exception when sqlstate 'AKY01' then null; end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 2. Step-up: recent TOTP at aal2 passes; old TOTP, aal1 or no TOTP fails.
-- ---------------------------------------------------------------------------
select pg_temp.as_payee('a0140000-0000-0000-0000-000000000001', 'aal2', 30);
do $$ begin if not app.recent_step_up() then raise exception 'fresh step-up refused'; end if; end $$;
reset role;
select pg_temp.as_payee('a0140000-0000-0000-0000-000000000001', 'aal2', 3600);
do $$ begin
  if app.recent_step_up() then raise exception 'an hour-old step-up passed'; end if;
  begin
    perform public.begin_payout_change('a0140000-0000-0000-0000-0000000000a1');
    raise exception 'stale step-up began a payout change';
  exception when sqlstate 'AKY03' then null; end;
  begin
    perform public.set_payout_tax_details('a0140000-0000-0000-0000-0000000000a1', 'GB', false);
    raise exception 'stale step-up changed tax details';
  exception when sqlstate 'AKY03' then null; end;
end $$;
reset role;
select pg_temp.as_payee('a0140000-0000-0000-0000-000000000001', 'aal1', 5);
do $$ begin if app.recent_step_up() then raise exception 'aal1 passed step-up'; end if; end $$;
reset role;
select pg_temp.as_payee('a0140000-0000-0000-0000-000000000001', 'aal2', null);
do $$ begin if app.recent_step_up() then raise exception 'no totp passed step-up'; end if; end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. begin_payout_change: owner and finance only, audited, rate limited.
-- ---------------------------------------------------------------------------
select pg_temp.as_payee('a0140000-0000-0000-0000-000000000003', 'aal2', 5);
do $$ begin
  begin
    perform public.begin_payout_change('a0140000-0000-0000-0000-0000000000a1');
    raise exception 'editor began a payout change';
  exception when sqlstate 'AKY01' then null; end;
end $$;
reset role;
select pg_temp.as_payee('a0140000-0000-0000-0000-000000000005', 'aal2', 5);
do $$ begin
  begin
    perform public.begin_payout_change('a0140000-0000-0000-0000-0000000000a1');
    raise exception 'another organisation began a payout change';
  exception when sqlstate 'AKY01' then null; end;
end $$;
reset role;
select pg_temp.as_payee('a0140000-0000-0000-0000-000000000002', 'aal2', 5);
do $$ declare r record; begin
  select * into r from public.begin_payout_change('a0140000-0000-0000-0000-0000000000a1');
  if r.connect_status <> 'not_started' or r.stripe_connect_id is not null or r.country <> 'GB' then
    raise exception 'unexpected payout start row %', row_to_json(r); end if;
  perform public.set_payout_tax_details('a0140000-0000-0000-0000-0000000000a1', 'gb', true);
  begin
    perform public.set_payout_tax_details('a0140000-0000-0000-0000-0000000000a1', 'Britain', true);
    raise exception 'bad tax residence accepted';
  exception when sqlstate 'AKY02' then null; end;
end $$;
reset role;
do $$ declare n int; o record; begin
  select count(*) into n from public.audit_log where org_id = 'a0140000-0000-0000-0000-0000000000a1'
    and action in ('payout.change_started', 'payout.tax_details_changed');
  if n <> 2 then raise exception 'expected 2 payout audit rows, saw %', n; end if;
  select tax_residence, treaty_declaration into o from public.organisations where id = 'a0140000-0000-0000-0000-0000000000a1';
  if o.tax_residence <> 'GB' or (o.treaty_declaration ->> 'claimed')::boolean is not true then
    raise exception 'tax details not stored'; end if;
  -- fill the day's allowance
  insert into public.audit_log (action, target, org_id)
  select 'payout.change_started', 'organisation:x', 'a0140000-0000-0000-0000-0000000000a1' from generate_series(1, 9);
end $$;
select pg_temp.as_payee('a0140000-0000-0000-0000-000000000001', 'aal2', 5);
do $$ begin
  begin
    perform public.begin_payout_change('a0140000-0000-0000-0000-0000000000a1');
    raise exception 'eleventh payout change allowed';
  exception when sqlstate 'AKY29' then null; end;
end $$;
reset role;

-- Outside the self-serve countries: held, and told so.
select pg_temp.as_payee('a0140000-0000-0000-0000-000000000007', 'aal2', 5);
do $$ declare r record; begin
  select * into r from public.begin_payout_change('a0140000-0000-0000-0000-0000000000a3');
  if r.connect_status <> 'held' then raise exception 'India payee was not held, got %', r.connect_status; end if;
end $$;
reset role;

-- The house organisation is never paid through Connect.
select pg_temp.as_payee('a0140000-0000-0000-0000-000000000001', 'aal2', 5);
do $$ begin
  begin
    perform public.begin_payout_change('00000000-0000-0000-0000-000000000001');
    raise exception 'house organisation began a payout change';
  exception when sqlstate 'AKY01' or sqlstate 'AKY04' then null; end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. Service-role functions refuse clients; link and sync work for the service.
-- ---------------------------------------------------------------------------
select pg_temp.as_payee('a0140000-0000-0000-0000-000000000001', 'aal2', 5);
do $$ begin
  begin
    perform public.record_connect_account('a0140000-0000-0000-0000-0000000000a1', 'acct_TESTpay001');
    raise exception 'client linked a Connect account';
  exception when insufficient_privilege or sqlstate 'AKY01' then null; end;
  begin
    perform public.sync_connect_status('acct_TESTpay001', 'verified', now());
    raise exception 'client synced Connect status';
  exception when insufficient_privilege or sqlstate 'AKY01' then null; end;
  begin
    perform public.payout_contacts('a0140000-0000-0000-0000-0000000000a1');
    raise exception 'client read payout contacts';
  exception when insufficient_privilege or sqlstate 'AKY01' then null; end;
end $$;
reset role;

select pg_temp.as_service();
do $$ declare v text; r record; n int; begin
  v := public.record_connect_account('a0140000-0000-0000-0000-0000000000a1', 'acct_TESTpay001');
  if v <> 'linked' then raise exception 'link returned %', v; end if;
  v := public.record_connect_account('a0140000-0000-0000-0000-0000000000a1', 'acct_TESTpay001');
  if v <> 'unchanged' then raise exception 'relink returned %', v; end if;
  begin
    perform public.record_connect_account('a0140000-0000-0000-0000-0000000000a1', 'acct_TESTother1');
    raise exception 'a second account replaced the first';
  exception when sqlstate 'AKY04' then null; end;

  select * into r from public.sync_connect_status('acct_TESTpay001', 'pending', now() - interval '1 minute');
  if r.result <> 'applied' or r.new_status <> 'pending' then raise exception 'pending sync gave %', row_to_json(r); end if;
  select * into r from public.sync_connect_status('acct_TESTpay001', 'verified', now());
  if r.result <> 'applied' or r.new_status <> 'verified' then raise exception 'verified sync gave %', row_to_json(r); end if;
  select * into r from public.sync_connect_status('acct_TESTpay001', 'action_needed', now() - interval '1 hour');
  if r.result <> 'stale' then raise exception 'old event was applied: %', row_to_json(r); end if;
  select * into r from public.sync_connect_status('acct_TESTnobody', 'verified', now());
  if r.result <> 'unlinked' then raise exception 'unknown account gave %', r.result; end if;

  if public.note_payout_details_changed('acct_TESTpay001', 'updated', 'evt_1') <> 'a0140000-0000-0000-0000-0000000000a1' then
    raise exception 'details change not matched to the organisation'; end if;
  perform public.note_payout_details_changed('acct_TESTpay001', 'updated', 'evt_1');
  select count(*) into n from public.payout_contacts('a0140000-0000-0000-0000-0000000000a1');
  if n <> 2 then raise exception 'expected owner and finance contacts, saw %', n; end if;
end $$;
reset role;
do $$ declare n int; begin
  select count(*) into n from public.audit_log where action = 'payout.details_changed' and org_id = 'a0140000-0000-0000-0000-0000000000a1';
  if n <> 1 then raise exception 'details change audited % times', n; end if;
end $$;

-- A held organisation stays held whatever Stripe says.
update public.organisations set stripe_connect_id = 'acct_TESTheld01' where id = 'a0140000-0000-0000-0000-0000000000a3';
select pg_temp.as_service();
do $$ declare r record; begin
  select * into r from public.sync_connect_status('acct_TESTheld01', 'verified', now() + interval '1 minute');
  if r.new_status <> 'held' then raise exception 'webhook lifted a hold'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 5. The go-live gate. Run as the database owner, like the release
-- function and server code: the gate holds for every caller.
-- ---------------------------------------------------------------------------
-- Other release gates (licences, the release function) are switched off for
-- this block, inside the rolled-back transaction, so only this one is tested.
do $$ declare t record; begin
  for t in select tgname from pg_trigger
           where tgrelid = 'public.workbooks'::regclass and not tgisinternal
             and tgname not in ('workbooks_status_payout_gate', 'workbooks_touch') loop
    execute format('alter table public.workbooks disable trigger %I', t.tgname);
  end loop;
end $$;
update public.organisations set connect_status = 'pending' where id = 'a0140000-0000-0000-0000-0000000000a1';
do $$ begin
  begin
    update public.workbooks set status = 'live' where id = 'a0140000-0000-0000-0000-0000000000d1';
    raise exception 'paid workbook went live without verified payouts';
  exception when sqlstate 'AKY10' then null; end;
  update public.workbooks set status = 'live' where id = 'a0140000-0000-0000-0000-0000000000d2';
  update public.workbooks set status = 'live' where id = 'a0140000-0000-0000-0000-0000000000d3';
  update public.workbooks set status = 'paused' where id = 'a0140000-0000-0000-0000-0000000000d2';
  update public.workbooks set status = 'live' where id = 'a0140000-0000-0000-0000-0000000000d2';
end $$;
update public.organisations set connect_status = 'verified' where id = 'a0140000-0000-0000-0000-0000000000a1';
update public.workbooks set status = 'live' where id = 'a0140000-0000-0000-0000-0000000000d1';

-- ---------------------------------------------------------------------------
-- 6. Private files.
-- ---------------------------------------------------------------------------
do $$ declare b record; begin
  select public, file_size_limit, allowed_mime_types into b from storage.buckets where id = 'org-files';
  if b.public is not false then raise exception 'org-files is public'; end if;
  if b.file_size_limit <> 26214400 then raise exception 'wrong size limit'; end if;
  if not ('application/pdf' = any (b.allowed_mime_types)) or 'image/png' = any (b.allowed_mime_types) then
    raise exception 'wrong mime types'; end if;
end $$;

-- Owner uploads a manuscript and a licence; the author a manuscript but not a licence.
select pg_temp.as_payee('a0140000-0000-0000-0000-000000000001', 'aal1', null);
do $$ begin
  insert into storage.objects (bucket_id, name) values
    ('org-files', 'a0140000-0000-0000-0000-0000000000a1/manuscripts/11111111-2222-3333-4444-555555555555.docx'),
    ('org-files', 'a0140000-0000-0000-0000-0000000000a1/licences/11111111-2222-3333-4444-666666666666.pdf');
  begin
    insert into storage.objects (bucket_id, name) values
      ('org-files', 'a0140000-0000-0000-0000-0000000000a1/licences/11111111-2222-3333-4444-777777777777.docx');
    raise exception 'licence accepted as docx';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects (bucket_id, name) values ('org-files', 'a0140000-0000-0000-0000-0000000000a1/manuscripts/../x.pdf');
    raise exception 'odd path accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects (bucket_id, name) values
      ('org-files', 'a0140000-0000-0000-0000-0000000000a2/manuscripts/11111111-2222-3333-4444-888888888888.pdf');
    raise exception 'owner wrote into another organisation';
  exception when insufficient_privilege then null; end;
  begin
    update storage.objects set name = name where bucket_id = 'org-files';
    delete from storage.objects where bucket_id = 'org-files';
  end;
  perform public.note_private_file('a0140000-0000-0000-0000-0000000000a1/licences/11111111-2222-3333-4444-666666666666.pdf', 'uploaded');
end $$;
reset role;
do $$ declare n int; begin
  select count(*) into n from storage.objects where bucket_id = 'org-files';
  if n <> 2 then raise exception 'client update or delete touched files: % left', n; end if;
end $$;

select pg_temp.as_payee('a0140000-0000-0000-0000-000000000004', 'aal1', null);
do $$ declare n int; begin
  insert into storage.objects (bucket_id, name) values
    ('org-files', 'a0140000-0000-0000-0000-0000000000a1/manuscripts/11111111-2222-3333-4444-999999999999.pdf');
  begin
    insert into storage.objects (bucket_id, name) values
      ('org-files', 'a0140000-0000-0000-0000-0000000000a1/licences/11111111-2222-3333-4444-aaaaaaaaaaaa.pdf');
    raise exception 'author uploaded a licence';
  exception when insufficient_privilege then null; end;
  select count(*) into n from storage.objects where bucket_id = 'org-files';
  if n <> 3 then raise exception 'author should read 3 files, saw %', n; end if;
end $$;
reset role;

-- Another organisation's owner and a signed-out visitor read nothing; staff read all.
select pg_temp.as_payee('a0140000-0000-0000-0000-000000000005', 'aal1', null);
do $$ declare n int; begin
  select count(*) into n from storage.objects where bucket_id = 'org-files';
  if n <> 0 then raise exception 'another organisation read % files', n; end if;
  begin
    perform public.note_private_file('a0140000-0000-0000-0000-0000000000a1/licences/11111111-2222-3333-4444-666666666666.pdf', 'download_link');
    raise exception 'outsider logged a download link';
  exception when sqlstate 'AKY01' then null; end;
end $$;
reset role;
select set_config('request.jwt.claims', '{"role": "anon"}', true), set_config('request.jwt.claim.sub', '', true);
set local role anon;
do $$ declare n int; begin
  select count(*) into n from storage.objects where bucket_id = 'org-files';
  if n <> 0 then raise exception 'anon read % files', n; end if;
end $$;
reset role;
select test_as('a0140000-0000-0000-0000-000000000006', array['support']);
do $$ declare n int; begin
  select count(*) into n from storage.objects where bucket_id = 'org-files';
  if n <> 3 then raise exception 'staff should read 3 files, saw %', n; end if;
end $$;
reset role;

-- Thirty uploads an hour per organisation.
insert into storage.objects (bucket_id, name, created_at)
select 'org-files', 'a0140000-0000-0000-0000-0000000000a2/manuscripts/' || gen_random_uuid()::text || '.pdf', now()
from generate_series(1, 30);
select pg_temp.as_payee('a0140000-0000-0000-0000-000000000005', 'aal1', null);
do $$ begin
  begin
    insert into storage.objects (bucket_id, name) values
      ('org-files', 'a0140000-0000-0000-0000-0000000000a2/manuscripts/11111111-2222-3333-4444-bbbbbbbbbbbb.pdf');
    raise exception 'thirty-first upload in an hour allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

rollback;
\echo PASS 0014_payouts_storage
