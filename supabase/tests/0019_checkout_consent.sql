-- Immediate-access consent at checkout (F-096, F-097). Each block must raise
-- or return the expected result; a failure aborts the script and the CI step.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('a19a19a1-0000-0000-0000-0000000000a1', 'consent-a@test'),
  ('a19a19a1-0000-0000-0000-0000000000b1', 'consent-b@test');

insert into public.organisations (id, kind, legal_name, display_name, slug, country) values
  ('a19a19a1-0000-0000-0000-00000000f001', 'publisher', 'Consent Test Press Ltd', 'Consent Test Press', 'consent-test-press', 'GB');
insert into public.books (id, org_id, slug, title) values
  ('a19a19a1-0000-0000-0000-00000000b001', 'a19a19a1-0000-0000-0000-00000000f001', 'consent-book', 'Consent Book');
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, depth, status, badge, is_demo, price_point_id) values
  ('a19a19a1-0000-0000-0000-00000000c001', 'AK-C0NS1', 'a19a19a1-0000-0000-0000-00000000b001', 'a19a19a1-0000-0000-0000-00000000f001',
   'consent-workbook', 'Consent Workbook', 'Card', 'productivity', 'full', 'live', 'official', false, 'p2');

-- The register is public and holds the two wordings word for word.
set local role anon;
do $$ declare n int; w text; begin
  select count(*) into n from public.checkout_consent_wordings;
  if n <> 2 then raise exception 'expected 2 wordings, saw %', n; end if;
  select wording into w from public.checkout_consent_wordings where kind = 'workbook' and version = 'immediate-access-2026-10';
  if w <> 'I want access to start right now. I understand that once access starts, I lose my 14-day right to cancel and get a refund.' then
    raise exception 'workbook wording differs: %', w;
  end if;
  begin
    perform public.record_checkout_consent('workbook', 'immediate-access-2026-10', null, 'a19a19a1-0000-0000-0000-00000000c001');
    raise exception 'anon recorded a consent';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.checkout_consent_wordings (kind, version, wording) values ('workbook', 'anon-1', 'A wording made up by anon here.');
    raise exception 'anon wrote a wording';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Reader A records both kinds, links one to a session, and cannot change anything else.
savepoint s1;
select test_as('a19a19a1-0000-0000-0000-0000000000a1');
do $$ declare v_w bigint; v_m bigint; n int; r record; begin
  v_w := public.record_checkout_consent('workbook', 'immediate-access-2026-10', '00000000-0000-0000-0000-00000000000a', 'a19a19a1-0000-0000-0000-00000000c001');
  v_m := public.record_checkout_consent('membership', 'membership-refund-2026-10', '00000000-0000-0000-0000-00000000000a', null, 'member_month');
  select count(*) into n from public.checkout_consents;
  if n <> 2 then raise exception 'reader A sees % consents, expected 2', n; end if;

  if not public.link_checkout_consent(v_w, 'cs_test_a19consent1') then raise exception 'link failed'; end if;
  select stripe_checkout_session_id, linked_at, version into r from public.checkout_consents where id = v_w;
  if r.stripe_checkout_session_id <> 'cs_test_a19consent1' or r.linked_at is null or r.version <> 'immediate-access-2026-10' then
    raise exception 'link not recorded: %', r;
  end if;

  -- a row links once
  begin
    perform public.link_checkout_consent(v_w, 'cs_test_a19consent2');
    raise exception 'a consent was linked twice';
  exception when sqlstate 'AKC01' then null; end;
  -- a session id must look like one
  begin
    perform public.link_checkout_consent(v_m, 'not a session');
    raise exception 'a bad session id was linked';
  exception when sqlstate 'AKC03' then null; end;

  -- unknown wordings and mismatched fields are refused
  begin
    perform public.record_checkout_consent('workbook', 'immediate-access-1999-01', null, 'a19a19a1-0000-0000-0000-00000000c001');
    raise exception 'an unknown wording was recorded';
  exception when sqlstate 'AKC02' then null; end;
  begin
    perform public.record_checkout_consent('workbook', 'membership-refund-2026-10', null, 'a19a19a1-0000-0000-0000-00000000c001');
    raise exception 'the membership wording was recorded for a workbook';
  exception when sqlstate 'AKC02' then null; end;
  begin
    perform public.record_checkout_consent('workbook', 'immediate-access-2026-10');
    raise exception 'a workbook consent with no workbook was recorded';
  exception when sqlstate 'AKC03' then null; end;
  begin
    perform public.record_checkout_consent('membership', 'membership-refund-2026-10', null, null, 'member_week');
    raise exception 'an unknown plan was recorded';
  exception when sqlstate 'AKC03' then null; end;
  begin
    perform public.record_checkout_consent('sideways', 'immediate-access-2026-10');
    raise exception 'an unknown kind was recorded';
  exception when sqlstate 'AKC03' then null; end;

  -- no direct writes
  begin
    update public.checkout_consents set version = 'membership-refund-2026-10' where id = v_m;
    raise exception 'reader A edited a consent';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.checkout_consents where id = v_m;
    raise exception 'reader A deleted a consent';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.checkout_consents (user_id, kind, version) values ('a19a19a1-0000-0000-0000-0000000000a1', 'membership', 'membership-refund-2026-10');
    raise exception 'reader A inserted a consent directly';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Reader B sees none of A's rows and cannot link them.
select test_as('a19a19a1-0000-0000-0000-0000000000b1');
reset role;
create temp table a19_ids on commit drop as select max(id) as id from public.checkout_consents;
grant select on a19_ids to authenticated;
select test_as('a19a19a1-0000-0000-0000-0000000000b1');
do $$ declare n int; begin
  select count(*) into n from public.checkout_consents;
  if n <> 0 then raise exception 'reader B sees % of A''s consents', n; end if;
  begin
    perform public.link_checkout_consent((select id from a19_ids), 'cs_test_b19steal');
    raise exception 'reader B linked a consent';
  exception when sqlstate 'AKC01' then null; end;
end $$;
reset role;

-- The guard holds even for the table owner: only the link and the foreign
-- key clean-up may change a row.
do $$ declare v_id bigint; begin
  select id into v_id from public.checkout_consents where kind = 'membership' limit 1;
  begin
    update public.checkout_consents set consented_at = now() - interval '1 day' where id = v_id;
    raise exception 'consented_at was changed';
  exception when insufficient_privilege then null; end;
  begin
    update public.checkout_consent_wordings set wording = 'Something else entirely, said later.' where kind = 'workbook';
    raise exception 'a wording was edited';
  exception when insufficient_privilege then null; end;
  -- deleting the workbook clears the reference and keeps the record
  delete from public.workbooks where id = 'a19a19a1-0000-0000-0000-00000000c001';
  if not exists (select 1 from public.checkout_consents where kind = 'workbook' and workbook_id is null and stripe_checkout_session_id = 'cs_test_a19consent1') then
    raise exception 'workbook delete did not keep the consent';
  end if;
end $$;
rollback to savepoint s1;

-- Rate limit: the 31st consent in an hour is refused.
select test_as('a19a19a1-0000-0000-0000-0000000000a1');
do $$ begin
  for i in 1..30 loop
    perform public.record_checkout_consent('membership', 'membership-refund-2026-10', null, null, 'member_year');
  end loop;
  begin
    perform public.record_checkout_consent('membership', 'membership-refund-2026-10', null, null, 'member_year');
    raise exception 'rate limit not applied';
  exception when sqlstate 'AKC29' then null; end;
end $$;
reset role;

rollback;
