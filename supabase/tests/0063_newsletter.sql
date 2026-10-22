-- Newsletter (0063): double opt-in, unsubscribe, rate limits, the issue
-- lifecycle for staff, and the service-role-only send functions. Each block
-- must raise or return the expected value; a failure aborts the script.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('a6300000-0000-0000-0000-000000000001', 'editor63@test'),
  ('a6300000-0000-0000-0000-000000000002', 'support63@test'),
  ('a6300000-0000-0000-0000-000000000003', 'reader63@test');
insert into public.platform_roles (user_id, role) values
  ('a6300000-0000-0000-0000-000000000001', 'editor'),
  ('a6300000-0000-0000-0000-000000000002', 'support');

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
grant execute on function pg_temp.as_service(), pg_temp.as_anon() to public;

-- ---------------------------------------------------------------------------
-- 1. Nobody outside the service role touches subscribers or the send functions.
-- ---------------------------------------------------------------------------
do $$ begin
  perform pg_temp.as_anon();
  begin perform public.newsletter_subscribe('a@b.test', repeat('a', 64));
    raise exception 'anon should not subscribe through the database'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.newsletter_subscribers;
    raise exception 'anon should not read subscribers'; exception when insufficient_privilege then null; end;
  begin perform public.newsletter_confirm('x');
    raise exception 'anon should not confirm'; exception when insufficient_privilege then null; end;
  reset role;
  perform test_as('a6300000-0000-0000-0000-000000000003');
  begin perform public.newsletter_unsubscribe('x');
    raise exception 'a reader should not unsubscribe through the database'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.newsletter_subscribers;
    raise exception 'a reader should not read subscribers'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.newsletter_issues;
    -- A grant exists, so this returns no rows rather than raising.
    if exists (select 1 from public.newsletter_issues) then raise exception 'a reader should see no issues'; end if;
  end;
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Double opt-in: pending until confirmed; the same words either way.
-- ---------------------------------------------------------------------------
do $$ declare t1 text; t2 text; t3 text; ok boolean; st text; begin
  perform pg_temp.as_service();
  t1 := public.newsletter_subscribe('  Reader@Example.test ', repeat('a', 64));
  if t1 is null or char_length(t1) <> 64 then raise exception 'a new address should get a token'; end if;
  select status into st from public.newsletter_subscribers where email = 'reader@example.test';
  if st <> 'pending' then raise exception 'a new sign-up is pending, not %', st; end if;
  -- A second request within ten minutes sends nothing new.
  t2 := public.newsletter_subscribe('reader@example.test', repeat('a', 64));
  if t2 is not null then raise exception 'no second confirmation inside ten minutes'; end if;
  -- A pending address is not a recipient.
  if exists (select 1 from public.newsletter_next_recipients(gen_random_uuid(), 10)) then raise exception 'pending is not a recipient'; end if;
  ok := public.newsletter_confirm('not-a-token');
  if ok then raise exception 'unknown token confirmed'; end if;
  ok := public.newsletter_confirm(t1);
  if not ok then raise exception 'the token should confirm'; end if;
  select status into st from public.newsletter_subscribers where email = 'reader@example.test';
  if st <> 'confirmed' then raise exception 'should now be confirmed'; end if;
  if not public.newsletter_confirm(t1) then raise exception 'confirming twice is fine'; end if;
  -- A confirmed address signing up again gets no email.
  t3 := public.newsletter_subscribe('reader@example.test', repeat('b', 64));
  if t3 is not null then raise exception 'a confirmed address needs no email'; end if;
  begin perform public.newsletter_subscribe('not an address', repeat('a', 64));
    raise exception 'bad address accepted'; exception when sqlstate 'AKN01' then null; end;
  begin perform public.newsletter_subscribe('ok@example.test', 'short');
    raise exception 'bad ip hash accepted'; exception when sqlstate 'AKN02' then null; end;
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Unsubscribe, and coming back needs a fresh confirmation.
-- ---------------------------------------------------------------------------
do $$ declare t text; t2 text; st text; begin
  perform pg_temp.as_service();
  select token into t from public.newsletter_subscribers where email = 'reader@example.test';
  if not public.newsletter_unsubscribe(t) then raise exception 'the token should unsubscribe'; end if;
  if not public.newsletter_unsubscribe(t) then raise exception 'unsubscribing twice is fine'; end if;
  if public.newsletter_unsubscribe('nope') then raise exception 'unknown token unsubscribed someone'; end if;
  select status into st from public.newsletter_subscribers where email = 'reader@example.test';
  if st <> 'unsubscribed' then raise exception 'should be unsubscribed'; end if;
  if public.newsletter_confirm(t) then raise exception 'an unsubscribed token must not confirm'; end if;
  update public.newsletter_subscribers set confirm_sent_at = now() - interval '1 day' where email = 'reader@example.test';
  t2 := public.newsletter_subscribe('reader@example.test', repeat('a', 64));
  if t2 is null or t2 = t then raise exception 'coming back needs a fresh token'; end if;
  select status into st from public.newsletter_subscribers where email = 'reader@example.test';
  if st <> 'pending' then raise exception 'back to pending'; end if;
  perform public.newsletter_confirm(t2);
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Rate limit: five an hour from one ip hash.
-- ---------------------------------------------------------------------------
do $$ declare i int; begin
  perform pg_temp.as_service();
  for i in 1..5 loop
    perform public.newsletter_subscribe('rl' || i || '@example.test', repeat('c', 64));
  end loop;
  begin perform public.newsletter_subscribe('rl6@example.test', repeat('c', 64));
    raise exception 'the sixth sign-up in an hour was accepted'; exception when sqlstate 'AKN29' then null; end;
  perform public.newsletter_subscribe('rl6@example.test', repeat('d', 64));
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Staff write issues: roles, validation, lifecycle.
-- ---------------------------------------------------------------------------
do $$ declare v_id uuid; v_future timestamptz := now() + interval '2 days'; begin
  perform test_as('a6300000-0000-0000-0000-000000000002', array['support']);
  begin perform public.save_newsletter_issue(null, 'Subject', '', '', 'Exercise', 'Body', null, null, null, null, false);
    raise exception 'support should not write an issue'; exception when insufficient_privilege then null; end;
  if (select confirmed from public.newsletter_stats()) is null then raise exception 'support reads the counts'; end if;
  reset role;

  perform test_as('a6300000-0000-0000-0000-000000000001', array['editor']);
  v_id := public.save_newsletter_issue(null, 'A small step', 'Preheader', 'Hello.', 'Try this', 'Write one line.', null, null, null, null, false);
  if (select status from public.newsletter_issues where id = v_id) <> 'draft' then raise exception 'saved as a draft'; end if;
  begin perform public.save_newsletter_issue(null, '', '', '', 'E', 'B', null, null, null, null, false);
    raise exception 'empty subject accepted'; exception when sqlstate 'AKN03' then null; end;
  begin perform public.save_newsletter_issue(null, 'S', '', '', 'E', 'Body — dash', null, null, null, null, false);
    raise exception 'a dash accepted'; exception when sqlstate 'AKN03' then null; end;
  begin perform public.save_newsletter_issue(null, 'S', '', '', 'E', 'B', 'Sponsor', null, null, null, false);
    raise exception 'half a sponsor block accepted'; exception when sqlstate 'AKN03' then null; end;
  begin perform public.save_newsletter_issue(null, 'S', '', '', 'E', 'B', 'Sponsor', 'Text', 'http://insecure.test', null, false);
    raise exception 'a non-https sponsor link accepted'; exception when sqlstate 'AKN03' then null; end;
  begin perform public.save_newsletter_issue(v_id, 'S', '', '', 'E', 'B', null, null, null, now() - interval '1 day', true);
    raise exception 'a past send time accepted'; exception when sqlstate 'AKN06' then null; end;
  begin perform public.save_newsletter_issue(gen_random_uuid(), 'S', '', '', 'E', 'B', null, null, null, null, false);
    raise exception 'unknown issue accepted'; exception when sqlstate 'AKN04' then null; end;
  perform public.save_newsletter_issue(v_id, 'A small step', 'Pre', 'Hello.', 'Try this', 'Write one line.', 'Sam Author', 'A weekly note on habits.', 'https://example.test/sam', v_future, true);
  if (select status from public.newsletter_issues where id = v_id) <> 'scheduled' then raise exception 'scheduled'; end if;
  if (select sponsor_name from public.newsletter_issues where id = v_id) <> 'Sam Author' then raise exception 'sponsor saved'; end if;
  reset role;
  create temp table t63 as select v_id as issue_id;
  grant select on t63 to public;
end $$;

-- ---------------------------------------------------------------------------
-- 6. The send run: nothing is due before its time; then recipients, results,
--    retries and finishing.
-- ---------------------------------------------------------------------------
do $$ declare v_id uuid; r record; n int; sub uuid; begin
  select issue_id into v_id from t63;
  perform pg_temp.as_service();
  if exists (select 1 from public.newsletter_take_due_issue()) then raise exception 'nothing is due yet'; end if;
  reset role;
  update public.newsletter_issues set scheduled_for = now() - interval '1 minute' where id = v_id;
  perform pg_temp.as_service();
  select * into r from public.newsletter_take_due_issue();
  if r.id <> v_id or r.status <> 'sending' then raise exception 'the due issue should be taken and marked sending'; end if;
  -- Taken again while sending: the same issue comes back.
  select * into r from public.newsletter_take_due_issue();
  if r.id <> v_id then raise exception 'a sending issue is carried on'; end if;

  select count(*) into n from public.newsletter_next_recipients(v_id, 100);
  -- reader@example.test is confirmed; the rl* addresses are pending.
  if n <> 1 then raise exception 'one confirmed recipient expected, got %', n; end if;
  select subscriber_id into sub from public.newsletter_next_recipients(v_id, 100);
  perform public.newsletter_record_send(v_id, sub, false);
  if (select count(*) from public.newsletter_next_recipients(v_id, 100)) <> 1 then raise exception 'a failed send is retried'; end if;
  perform public.newsletter_record_send(v_id, sub, false);
  perform public.newsletter_record_send(v_id, sub, false);
  if (select count(*) from public.newsletter_next_recipients(v_id, 100)) <> 0 then raise exception 'three failures stop the retries'; end if;
  if not public.newsletter_finish_issue(v_id) then raise exception 'the issue should finish'; end if;
  reset role;
  if (select status from public.newsletter_issues where id = v_id) <> 'sent' then raise exception 'sent'; end if;
  if (select failed_count from public.newsletter_issues where id = v_id) <> 1 then raise exception 'failed count recorded'; end if;

  -- A sent issue cannot be edited or cancelled.
  perform test_as('a6300000-0000-0000-0000-000000000001', array['editor']);
  begin perform public.cancel_newsletter_issue(v_id);
    raise exception 'a sent issue was cancelled'; exception when sqlstate 'AKN05' then null; end;
  begin perform public.save_newsletter_issue(v_id, 'S', '', '', 'E', 'B', null, null, null, null, false);
    raise exception 'a sent issue was edited'; exception when sqlstate 'AKN05' then null; end;
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Cancelling a scheduled issue, and purging old pending sign-ups.
-- ---------------------------------------------------------------------------
do $$ declare v_id uuid; n int; begin
  perform test_as('a6300000-0000-0000-0000-000000000001', array['editor']);
  v_id := public.save_newsletter_issue(null, 'Later', '', '', 'E', 'B', null, null, null, now() + interval '3 days', true);
  perform public.cancel_newsletter_issue(v_id);
  if (select status from public.newsletter_issues where id = v_id) <> 'cancelled' then raise exception 'cancelled'; end if;
  reset role;
  update public.newsletter_issues set scheduled_for = now() - interval '1 hour' where id = v_id;
  perform pg_temp.as_service();
  if exists (select 1 from public.newsletter_take_due_issue()) then raise exception 'a cancelled issue is never taken'; end if;
  reset role;

  update public.newsletter_subscribers set created_at = now() - interval '20 days' where email = 'rl1@example.test';
  perform pg_temp.as_service();
  n := public.newsletter_purge_pending();
  if n <> 1 then raise exception 'one stale pending sign-up expected, got %', n; end if;
  reset role;
  if exists (select 1 from public.newsletter_subscribers where email = 'rl1@example.test') then raise exception 'stale pending removed'; end if;
  if not exists (select 1 from public.newsletter_subscribers where email = 'reader@example.test') then raise exception 'confirmed subscriber kept'; end if;
end $$;

rollback;
