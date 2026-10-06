-- Leads (F-001): anon submits through public.submit_lead and reads nothing;
-- consent is required; one ip_hash gets 5 leads an hour and the sixth is
-- refused; staff read and change status with an audit row; readers see
-- nothing. Each block must raise or return the expected count; a failure
-- aborts the script and the CI step.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('55555555-5555-5555-5555-555555555551', 'reader@test'),
  ('55555555-5555-5555-5555-555555555552', 'support@test'),
  ('55555555-5555-5555-5555-555555555553', 'finance@test');

-- An hour-old lead from the same address does not count towards the limit.
insert into public.leads (created_at, kind, name, email, consent_contact, ip_hash)
values (now() - interval '2 hours', 'author', 'Old Lead', 'old@test.example', true, repeat('a', 64));

-- Anonymous visitors submit through the function and read nothing.
savepoint s1;
select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
set local role anon;
do $$ declare v uuid; i int; begin
  v := public.submit_lead(
    p_kind => 'author', p_name => 'Ann Author', p_email => 'Ann@Example.test', p_consent => true,
    p_ip_hash => repeat('a', 64), p_user_agent_hash => repeat('b', 64),
    p_book_title => 'A Book', p_genre => 'wellbeing', p_interest => 'marketplace',
    p_message => 'Hello');
  if v is null then raise exception 'anon submit returned no id'; end if;

  begin
    perform count(*) from public.leads;
    raise exception 'anon read leads';
  exception when insufficient_privilege then null; end;

  begin
    insert into public.leads (kind, name, email, consent_contact) values ('author', 'X', 'x@test.example', true);
    raise exception 'anon inserted a lead directly';
  exception when insufficient_privilege then null; end;

  -- consent false is refused
  begin
    perform public.submit_lead(p_kind => 'author', p_name => 'No Consent', p_email => 'nc@test.example',
      p_consent => false, p_ip_hash => repeat('c', 64));
    raise exception 'lead without consent was accepted';
  exception when sqlstate 'AKL01' then null; end;

  -- bad fields are refused with AKL02
  begin
    perform public.submit_lead(p_kind => 'author', p_name => 'Bad', p_email => 'not-an-email',
      p_consent => true, p_ip_hash => repeat('c', 64));
    raise exception 'bad email was accepted';
  exception when sqlstate 'AKL02' then null; end;
  begin
    perform public.submit_lead(p_kind => 'author', p_name => 'Long', p_email => 'long@test.example',
      p_consent => true, p_ip_hash => repeat('c', 64), p_message => repeat('x', 4001));
    raise exception 'message over 4000 characters was accepted';
  exception when sqlstate 'AKL02' then null; end;
  begin
    perform public.submit_lead(p_kind => 'robot', p_name => 'Kind', p_email => 'kind@test.example',
      p_consent => true, p_ip_hash => repeat('c', 64));
    raise exception 'unknown kind was accepted';
  exception when sqlstate 'AKL02' then null; end;
  begin
    perform public.submit_lead(p_kind => 'author', p_name => 'Hash', p_email => 'hash@test.example',
      p_consent => true, p_ip_hash => '203.0.113.9');
    raise exception 'a raw IP address was accepted as ip_hash';
  exception when sqlstate 'AKL02' then null; end;

  -- four more from the same ip_hash make five in the hour
  for i in 2..5 loop
    perform public.submit_lead(p_kind => 'publisher', p_name => 'Pat ' || i, p_email => 'pat' || i || '@test.example',
      p_consent => true, p_ip_hash => repeat('a', 64));
  end loop;

  -- the sixth in an hour from the same ip_hash is refused
  begin
    perform public.submit_lead(p_kind => 'author', p_name => 'Six', p_email => 'six@test.example',
      p_consent => true, p_ip_hash => repeat('a', 64));
    raise exception 'sixth lead in an hour from one ip_hash was accepted';
  exception when sqlstate 'AKL29' then null; end;

  -- another address is not affected
  perform public.submit_lead(p_kind => 'agent', p_name => 'Other', p_email => 'other@test.example',
    p_consent => true, p_ip_hash => repeat('d', 64));
end $$;
reset role;
do $$ declare n int; begin
  select count(*) into n from public.leads where ip_hash = repeat('a', 64) and created_at > now() - interval '1 hour';
  if n <> 5 then raise exception 'expected 5 recent leads for the limited hash, saw %', n; end if;
  select count(*) into n from public.leads where email = 'ann@example.test' and status = 'new' and source = 'publish_page';
  if n <> 1 then raise exception 'submitted lead not stored lower-cased with defaults, %', n; end if;
end $$;

-- A reader sees nothing and changes nothing.
select test_as('55555555-5555-5555-5555-555555555551');
do $$ declare n int; begin
  select count(*) into n from public.leads;
  if n <> 0 then raise exception 'reader saw % leads', n; end if;
  update public.leads set status = 'closed';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'reader updated % leads', n; end if;
  begin
    delete from public.leads;
    raise exception 'reader deleted leads';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Staff with another platform role (finance) see nothing.
select test_as('55555555-5555-5555-5555-555555555553', array['finance']);
do $$ declare n int; begin
  select count(*) into n from public.leads;
  if n <> 0 then raise exception 'finance staff saw % leads', n; end if;
end $$;
reset role;

-- Support staff read every lead and change status, and only status.
select test_as('55555555-5555-5555-5555-555555555552', array['support']);
do $$ declare n int; begin
  select count(*) into n from public.leads;
  if n <> 7 then raise exception 'support should see 7 leads, saw %', n; end if;
  update public.leads set status = 'contacted' where email = 'ann@example.test';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'support could not change status, %', n; end if;
  begin
    update public.leads set email = 'changed@test.example' where email = 'ann@example.test';
    raise exception 'support changed a lead email';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.leads;
    raise exception 'support deleted leads';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ declare n int; begin
  select count(*) into n from public.audit_log
   where action = 'leads.status' and before->>'status' = 'new' and after->>'status' = 'contacted'
     and actor = '55555555-5555-5555-5555-555555555552';
  if n <> 1 then raise exception 'status change should write one audit row, saw %', n; end if;
end $$;
rollback to savepoint s1;

rollback;
\echo PASS 0005_leads
