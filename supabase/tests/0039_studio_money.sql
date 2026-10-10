-- Studio money (0039): the payout calendar config, the sale channel and
-- its two rates, the Connect hold rule and the schedule any member may
-- read. Each block must raise or return the expected value; a failure
-- aborts the script and the CI step.
\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------------
-- Fixtures: one publisher not yet verified on Connect, one verified, a
-- reader, the publisher's owner and author, and an outsider.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('a0390000-0000-0000-0000-000000000001', 'owner39@money.test'),
  ('a0390000-0000-0000-0000-000000000002', 'author39@money.test'),
  ('a0390000-0000-0000-0000-000000000004', 'outsider39@money.test'),
  ('a0390000-0000-0000-0000-000000000005', 'reader39@money.test'),
  ('a0390000-0000-0000-0000-000000000006', 'staff39@akana.example');

insert into public.organisations (id, code, kind, legal_name, display_name, slug, country, tax_residence, stripe_connect_id, connect_status) values
  ('a0390000-0000-0000-0000-0000000000a1', 'PB-TQD39', 'publisher', 'Hold One Ltd', 'Hold One', 'hold-one', 'GB', 'GB', 'acct_holdone39', 'pending'),
  ('a0390000-0000-0000-0000-0000000000a2', 'PB-TQD40', 'publisher', 'Paid Two Ltd', 'Paid Two', 'paid-two', 'GB', 'GB', 'acct_paidtwo39', 'verified');
insert into public.org_members (org_id, user_id, role) values
  ('a0390000-0000-0000-0000-0000000000a1', 'a0390000-0000-0000-0000-000000000001', 'owner'),
  ('a0390000-0000-0000-0000-0000000000a1', 'a0390000-0000-0000-0000-000000000002', 'author'),
  ('a0390000-0000-0000-0000-0000000000a2', 'a0390000-0000-0000-0000-000000000004', 'owner');

insert into public.books (id, org_id, slug, title) values
  ('a0390000-0000-0000-0000-0000000000c1', 'a0390000-0000-0000-0000-0000000000a1', 'hold-book', 'Hold Book');
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, depth, status, badge) values
  ('a0390000-0000-0000-0000-0000000000d1', 'AK-TQD39', 'a0390000-0000-0000-0000-0000000000c1', 'a0390000-0000-0000-0000-0000000000a1',
   'hold-wb-one', 'Hold WB One', 'Card', 'productivity', 'full', 'approved', 'official');

-- Two paid purchases of the same title: one with no channel (marketplace by
-- default), one through the author's own link.
insert into public.purchases (id, user_id, tenant_id, workbook_id, kind, stripe_checkout_session_id, stripe_payment_intent_id,
  currency, amount_minor, tax_minor, status, paid_at, channel) values
  ('a0390000-0000-0000-0000-0000000000e1', 'a0390000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000a',
   'a0390000-0000-0000-0000-0000000000d1', 'workbook', 'cs_test_hold1', 'pi_hold1', 'GBP', 1200, 200, 'paid', '2026-08-10T12:00:00Z', null),
  ('a0390000-0000-0000-0000-0000000000e2', 'a0390000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000a',
   'a0390000-0000-0000-0000-0000000000d1', 'workbook', 'cs_test_hold2', 'pi_hold2', 'GBP', 1200, 200, 'paid', '2026-08-11T12:00:00Z', 'author_link');

create or replace function pg_temp.as_service() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "service_role"}'::text, true);
  execute 'set local role service_role';
end $$;

-- ---------------------------------------------------------------------------
-- 1. The config in force is weekly on Fridays with a 10.00 GBP floor, still
-- a placeholder. The channel column refuses anything but the two values.
-- ---------------------------------------------------------------------------
do $$ declare c public.royalty_config; begin
  c := app.royalty_config();
  if c.payout_cadence <> 'weekly' or c.payout_weekday <> 5 then
    raise exception 'calendar default wrong: % %', c.payout_cadence, c.payout_weekday;
  end if;
  if (c.min_payout_minor ->> 'GBP')::bigint <> 1000 then raise exception 'GBP floor is %', c.min_payout_minor ->> 'GBP'; end if;
  if not c.is_placeholder then raise exception 'the seeded calendar must stay a placeholder'; end if;
  begin
    insert into public.purchases (user_id, tenant_id, workbook_id, kind, stripe_checkout_session_id, currency, status, channel)
    values ('a0390000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000a', 'a0390000-0000-0000-0000-0000000000d1',
      'workbook', 'cs_test_hold_bad', 'GBP', 'pending', 'affiliate');
    raise exception 'an unknown channel was accepted';
  exception when check_violation then null; end;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Two rates by channel. A purchase with no channel is a marketplace sale
-- at sale_rate_author; an author_link purchase uses sale_rate_author_link.
-- The line copies the channel and the rate it used, and the shares add up.
-- ---------------------------------------------------------------------------
select test_as('a0390000-0000-0000-0000-000000000006', array['owner']);
do $$ begin
  -- distinct rates so the test can tell them apart: 40% marketplace, 70% own link
  perform public.set_royalty_config(0.4000, 0.7000, 0.5000, 20, 1, 'deduct', 14, 30,
    '{"GBP": 1000}'::jsonb, '{"GBP": 100000}'::jsonb, 15, 'Test figures for 0039', null, 'weekly', 5);
end $$;
reset role;

select pg_temp.as_service();
do $$ declare v text; ln public.royalty_lines%rowtype; begin
  v := public.record_sale_receipt('a0390000-0000-0000-0000-0000000000e1', false, null, 50);
  if v <> 'recorded' then raise exception 'marketplace sale: %', v; end if;
  v := public.record_sale_receipt('a0390000-0000-0000-0000-0000000000e2', false, null, 50);
  if v <> 'recorded' then raise exception 'author link sale: %', v; end if;

  select l.* into ln from public.royalty_lines l join public.royalty_receipts r on r.id = l.receipt_id
   where r.purchase_id = 'a0390000-0000-0000-0000-0000000000e1';
  -- 1200 gross, 200 VAT, 50 fee: base 950, author 40% = 380, Akana 570
  if ln.channel <> 'marketplace' or ln.rate <> 0.4000 or ln.net_base_minor <> 950 or ln.author_minor <> 380 or ln.akana_minor <> 570 then
    raise exception 'marketplace line wrong: % % % % %', ln.channel, ln.rate, ln.net_base_minor, ln.author_minor, ln.akana_minor;
  end if;
  if ln.gross_minor - ln.tax_minor - ln.fee_minor <> ln.author_minor + ln.akana_minor then raise exception 'marketplace shares do not add up'; end if;

  select l.* into ln from public.royalty_lines l join public.royalty_receipts r on r.id = l.receipt_id
   where r.purchase_id = 'a0390000-0000-0000-0000-0000000000e2';
  -- base 950, author 70% = 665, Akana 285
  if ln.channel <> 'author_link' or ln.rate <> 0.7000 or ln.author_minor <> 665 or ln.akana_minor <> 285 then
    raise exception 'author link line wrong: % % % %', ln.channel, ln.rate, ln.author_minor, ln.akana_minor;
  end if;
  if ln.is_placeholder_rate then raise exception 'a set figure was marked placeholder'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. The hold rule. The title goes live while Connect is pending; the money
-- accrues; the payout run skips the organisation as unverified; the nudge
-- lists it; a verified organisation with no balance is not listed.
-- ---------------------------------------------------------------------------
do $$ declare t record; begin
  -- other release gates (licences, the release function) are off for this
  -- block, inside the rolled-back transaction, as in 0014's test
  for t in select tgname from pg_trigger
           where tgrelid = 'public.workbooks'::regclass and not tgisinternal and tgname <> 'workbooks_touch' loop
    execute format('alter table public.workbooks disable trigger %I', t.tgname);
  end loop;
end $$;
do $$ begin
  update public.workbooks set status = 'live' where id = 'a0390000-0000-0000-0000-0000000000d1';
  if (select status from public.workbooks where id = 'a0390000-0000-0000-0000-0000000000d1') <> 'live' then
    raise exception 'the title did not go live';
  end if;
  if exists (select 1 from pg_trigger where tgrelid = 'public.workbooks'::regclass and tgname = 'workbooks_status_payout_gate') then
    raise exception 'the 0014 go-live gate is still there';
  end if;
end $$;

-- A closed June line makes the balance payable, so only the Connect rule stands in the way.
insert into public.royalty_lines (org_id, kind, period, currency, livemode, author_minor, idem_key, note, occurred_at)
values ('a0390000-0000-0000-0000-0000000000a1', 'adjustment', '2026-06', 'GBP', false, 4000, 'adj:test-june-39', 'Test', '2026-06-15T10:00:00Z');
select pg_temp.as_service();
do $$ declare c record; n int; b record; begin
  perform public.close_due_statements(false);
  select * into c from public.payout_candidates(false) where org_id = 'a0390000-0000-0000-0000-0000000000a1';
  if c.decision is distinct from 'skip' or c.reason is distinct from 'unverified' then
    raise exception 'expected skip unverified, got % %', c.decision, c.reason;
  end if;
  select * into b from public.royalty_balances where org_id = 'a0390000-0000-0000-0000-0000000000a1' and currency = 'GBP' and not livemode;
  if b.balance_minor <> 4000 + 380 + 665 then raise exception 'balance % should still accrue', b.balance_minor; end if;

  select count(*) into n from public.connect_nudge_candidates(false) x where x.org_id = 'a0390000-0000-0000-0000-0000000000a1';
  if n <> 1 then raise exception 'the held organisation should be nudged once per currency, got %', n; end if;
  select * into c from public.connect_nudge_candidates(false) x where x.org_id = 'a0390000-0000-0000-0000-0000000000a1';
  if c.connect_status <> 'pending' or c.balance_minor <> 5045 then raise exception 'nudge row wrong: % %', c.connect_status, c.balance_minor; end if;
  if exists (select 1 from public.connect_nudge_candidates(false) x where x.org_id = 'a0390000-0000-0000-0000-0000000000a2') then
    raise exception 'a verified organisation with nothing owed was listed';
  end if;
end $$;
reset role;

-- Once verified, the organisation leaves the nudge list and may be paid.
update public.organisations set connect_status = 'verified' where id = 'a0390000-0000-0000-0000-0000000000a1';
select pg_temp.as_service();
do $$ declare c record; begin
  if exists (select 1 from public.connect_nudge_candidates(false) x where x.org_id = 'a0390000-0000-0000-0000-0000000000a1') then
    raise exception 'a verified organisation was still nudged';
  end if;
  select * into c from public.payout_candidates(false) where org_id = 'a0390000-0000-0000-0000-0000000000a1';
  if c.reason = 'unverified' then raise exception 'still unverified after verification'; end if;
end $$;
reset role;

-- The nudge list is service role only.
select test_as('a0390000-0000-0000-0000-000000000001');
do $$ begin
  begin
    perform public.connect_nudge_candidates(false);
    raise exception 'an organisation owner read the nudge list';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. The schedule: a member reads it; anon does not. royalty_config itself
-- stays closed to members.
-- ---------------------------------------------------------------------------
select test_as('a0390000-0000-0000-0000-000000000002');
do $$ declare s record; begin
  select * into s from public.payout_schedule();
  if s.payout_cadence <> 'weekly' or s.payout_weekday <> 5 or s.sale_rate_author <> 0.4000 or s.sale_rate_author_link <> 0.7000 then
    raise exception 'schedule wrong: % % % %', s.payout_cadence, s.payout_weekday, s.sale_rate_author, s.sale_rate_author_link;
  end if;
  if (s.min_payout_minor ->> 'GBP')::bigint <> 1000 then raise exception 'schedule floor wrong'; end if;
  if (select count(*) from public.royalty_config) <> 0 then raise exception 'an author read royalty_config'; end if;
end $$;
reset role;
do $$ begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "anon"}'::text, true);
  execute 'set local role anon';
  begin
    perform public.payout_schedule();
    raise exception 'anon read the schedule';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select 'PASS 0039_studio_money' as result;

rollback;
