-- Selling (0045): the pause window decides the membership entitlement, a
-- pause is recorded and cleared by the service role only, and the staff
-- cancel is limited to owner and support and writes an audit row.
-- Each block must raise or return the expected value; a failure aborts the script.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('45450000-0000-0000-0000-00000000000a', 'payer45@test'),
  ('45450000-0000-0000-0000-00000000000b', 'other45@test'),
  ('45450000-0000-0000-0000-0000000000a1', 'support45@test'),
  ('45450000-0000-0000-0000-0000000000a2', 'editor45@test');
insert into public.platform_roles (user_id, role) values
  ('45450000-0000-0000-0000-0000000000a1', 'support'),
  ('45450000-0000-0000-0000-0000000000a2', 'editor');

create or replace function pg_temp.as_service() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "service_role"}'::text, true);
  execute 'set local role service_role';
end $$;

select pg_temp.as_service();
do $$ declare r text; begin
  r := public.upsert_subscription('sub_pause45', 'cus_pause45', '45450000-0000-0000-0000-00000000000a',
    '00000000-0000-0000-0000-00000000000a', 'active', 'member_month', 'price_test_month', now() + interval '10 days', false, null, null, null, now());
  if r <> 'applied' then raise exception 'subscription: %', r; end if;
end $$;
reset role;

create or replace function pg_temp.open_ends() returns text
language sql as $$
  select coalesce(status || ':' || coalesce(ends_at::text, 'open'), 'none') from public.entitlements
   where user_id = '45450000-0000-0000-0000-00000000000a' and workbook_id is null and source = 'membership'
$$;

-- 1. Running: open ended.
do $$ begin
  if pg_temp.open_ends() <> 'active:open' then raise exception 'running membership: %', pg_temp.open_ends(); end if;
end $$;

-- 2. A pause ahead: access runs to the start of the pause, then stops.
select pg_temp.as_service();
do $$ declare r text; begin
  r := public.record_subscription_pause('sub_pause45', now() + interval '10 days', now() + interval '40 days');
  if r <> 'set' then raise exception 'record pause: %', r; end if;
  if public.record_subscription_pause('sub_pause45', now() + interval '10 days', now() + interval '40 days') <> 'unchanged' then
    raise exception 'recording the same window twice should change nothing';
  end if;
end $$;
reset role;
do $$ declare v text; begin
  v := pg_temp.open_ends();
  if v not like 'active:%' or v = 'active:open' then raise exception 'pause ahead should end access at its start: %', v; end if;
end $$;

-- 3. The pause has started: suspended.
select pg_temp.as_service();
do $$ declare r text; begin
  update public.subscriptions set paused_from = now() - interval '1 day', paused_until = now() + interval '29 days' where stripe_subscription_id = 'sub_pause45';
  perform public.sync_membership_entitlement('45450000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a');
end $$;
reset role;
do $$ begin
  if pg_temp.open_ends() not like 'lapsed:%' then raise exception 'a running pause should lapse the membership: %', pg_temp.open_ends(); end if;
end $$;

-- 4. Cleared (or over): open ended again.
select pg_temp.as_service();
do $$ declare r text; begin
  r := public.record_subscription_pause('sub_pause45', null, null);
  if r <> 'cleared' then raise exception 'clear: %', r; end if;
  if public.record_subscription_pause('sub_pause45', null, null) <> 'unchanged' then raise exception 'clear twice should change nothing'; end if;
  if public.record_subscription_pause('sub_nope45', null, null) <> 'unknown' then raise exception 'unknown subscription'; end if;
  -- a window that is already over is stored as none
  if public.record_subscription_pause('sub_pause45', now() - interval '40 days', now() - interval '10 days') <> 'unchanged' then
    raise exception 'an old window should be stored as none';
  end if;
end $$;
reset role;
do $$ begin
  if pg_temp.open_ends() <> 'active:open' then raise exception 'after the pause: %', pg_temp.open_ends(); end if;
  if (select count(*) from public.audit_log where action in ('commerce.subscription_paused', 'commerce.subscription_resumed') and target = 'subscription:sub_pause45') < 2 then
    raise exception 'the pause and the resume should both be audited';
  end if;
end $$;

-- 5. The window shape is enforced, and readers cannot call the recorder.
do $$ begin
  begin
    update public.subscriptions set paused_from = now(), paused_until = null where stripe_subscription_id = 'sub_pause45';
    raise exception 'half a window was accepted';
  exception when check_violation then null; end;
end $$;
select test_as('45450000-0000-0000-0000-00000000000a');
do $$ begin
  begin
    perform public.record_subscription_pause('sub_pause45', now() + interval '1 day', now() + interval '30 days');
    raise exception 'a reader recorded a pause';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 6. Staff cancel: support yes, editor no, wrong reader no, audited.
select test_as('45450000-0000-0000-0000-0000000000a2', array['editor']);
do $$ begin
  begin
    perform public.staff_cancel_membership('45450000-0000-0000-0000-00000000000a', 'sub_pause45', 'Reader wrote in, ticket 45');
    raise exception 'an editor cancelled a membership';
  exception when sqlstate 'AKX01' then null; end;
end $$;
reset role;

select test_as('45450000-0000-0000-0000-0000000000a1', array['support']);
do $$ declare j jsonb; begin
  begin
    perform public.staff_cancel_membership('45450000-0000-0000-0000-00000000000a', 'sub_pause45', 'no');
    raise exception 'a short reason was accepted';
  exception when sqlstate 'AKX02' then null; end;
  begin
    perform public.staff_cancel_membership('45450000-0000-0000-0000-00000000000b', 'sub_pause45', 'Reader wrote in, ticket 45');
    raise exception 'another reader''s membership was cancelled';
  exception when sqlstate 'AKX04' then null; end;
  j := public.staff_cancel_membership('45450000-0000-0000-0000-00000000000a', 'sub_pause45', 'Reader wrote in, ticket 45');
  if j ->> 'subscription' <> 'sub_pause45' then raise exception 'wrong subscription returned: %', j; end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.audit_log where action = 'account.membership_cancel_requested' and target = 'user:45450000-0000-0000-0000-00000000000a') <> 1 then
    raise exception 'the staff cancel should write one audit row';
  end if;
end $$;

-- 7. Already ending: refused.
select pg_temp.as_service();
update public.subscriptions set cancel_at_period_end = true where stripe_subscription_id = 'sub_pause45';
reset role;
select test_as('45450000-0000-0000-0000-0000000000a1', array['support']);
do $$ begin
  begin
    perform public.staff_cancel_membership('45450000-0000-0000-0000-00000000000a', 'sub_pause45', 'Reader wrote in again, ticket 46');
    raise exception 'an ending membership was cancelled again';
  exception when sqlstate 'AKX08' then null; end;
end $$;
reset role;

rollback;
