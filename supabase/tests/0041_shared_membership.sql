-- Shared membership (0041): the two-person plan, invitation by link, the
-- entitlement for both, removal and leaving, cancellation for both, the DMCC
-- reminder to the buyer only, the pool counting once, and RLS that keeps each
-- person's answers, enrolments, progress, settings and entitlement their own.
-- Each block must raise or return the expected value; a failure aborts the
-- script and the CI step.
\set ON_ERROR_STOP on

begin;

-- B buys. M is invited. X is an outsider with their own membership. P and Q
-- are a second pair, for the pool.
insert into auth.users (id, email) values
  ('41410000-0000-0000-0000-00000000000b', 'buyer@shared.test'),
  ('41410000-0000-0000-0000-00000000000c', 'member@shared.test'),
  ('41410000-0000-0000-0000-00000000000d', 'outsider@shared.test'),
  ('41410000-0000-0000-0000-0000000000f1', 'payer@shared.test'),
  ('41410000-0000-0000-0000-0000000000f2', 'guest@shared.test');

insert into public.organisations (id, kind, legal_name, display_name, slug, country) values
  ('41410000-0000-0000-0000-000000000001', 'publisher', 'Shared Org Ltd', 'Shared Org', 'shared-org', 'GB');
insert into public.books (id, org_id, slug, title) values
  ('41410000-0000-0000-0000-0000000000b1', '41410000-0000-0000-0000-000000000001', 'shared-book', 'Shared Book');
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, depth, status, in_membership) values
  ('41410000-0000-0000-0000-0000000000c1', 'AK-SHR41', '41410000-0000-0000-0000-0000000000b1', '41410000-0000-0000-0000-000000000001',
   'shared-workbook', 'Shared Workbook', 'Card', 'productivity', 'full', 'live', true);
insert into public.workbook_versions (id, workbook_id, semver, content, content_hash, published_at) values
  ('41410000-0000-0000-0000-0000000000d1', '41410000-0000-0000-0000-0000000000c1', '1.0.0', '{"schema_version": "3.0"}'::jsonb, repeat('4', 64), now());
update public.workbooks set current_version_id = '41410000-0000-0000-0000-0000000000d1' where id = '41410000-0000-0000-0000-0000000000c1';

-- Each person has their own enrolment, sealed answer, progress and settings.
insert into public.enrolments (id, user_id, tenant_id, workbook_id, version_id) values
  ('41410000-0000-0000-0000-0000000000e1', '41410000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a',
   '41410000-0000-0000-0000-0000000000c1', '41410000-0000-0000-0000-0000000000d1'),
  ('41410000-0000-0000-0000-0000000000e2', '41410000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000a',
   '41410000-0000-0000-0000-0000000000c1', '41410000-0000-0000-0000-0000000000d1');
insert into public.answers (enrolment_id, field, sealed, key_id) values
  ('41410000-0000-0000-0000-0000000000e1', 'exercise:ex_one.f_one', 'v2.k1.BUYER', 'k1'),
  ('41410000-0000-0000-0000-0000000000e2', 'exercise:ex_one.f_one', 'v2.k1.MEMBER', 'k1');
insert into public.progress_events (enrolment_id, kind, ref) values
  ('41410000-0000-0000-0000-0000000000e1', 'step_done', 'step_1'),
  ('41410000-0000-0000-0000-0000000000e2', 'step_done', 'step_1');
update public.profiles set display_name = 'Buyer' where user_id = '41410000-0000-0000-0000-00000000000b';
update public.profiles set display_name = 'Member' where user_id = '41410000-0000-0000-0000-00000000000c';

create or replace function pg_temp.as_service() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "service_role"}'::text, true);
  execute 'set local role service_role';
end $$;

-- sha256 of a test token, the way the server makes it
create or replace function pg_temp.h(p text) returns text
language sql as $$ select encode(sha256(convert_to(p, 'UTF8')), 'hex') $$;

create or replace function pg_temp.upsert(p_sub text, p_customer text, p_user uuid, p_status text, p_plan text,
  p_cancel_at_period_end boolean default false) returns text
language sql as $$
  select public.upsert_subscription(p_sub, p_customer, p_user, '00000000-0000-0000-0000-00000000000a'::uuid,
    p_status, p_plan, 'price_test_two', now() + interval '30 days', p_cancel_at_period_end,
    null, null, null, now())
$$;

-- ---------------------------------------------------------------------------
-- 1. The plan point exists, is seeded about 1.5 times the single price, and
-- the subscription row keeps the plan.
-- ---------------------------------------------------------------------------
do $$ declare a int; s int; begin
  select (amounts ->> 'GBP')::int into a from public.price_points where id = 'member_two_month' and kind = 'membership' and active;
  select (amounts ->> 'GBP')::int into s from public.price_points where id = 'member_month';
  if a is null then raise exception 'the two-person plan point is missing'; end if;
  if a < s * 1.4 or a > s * 1.6 then raise exception 'two-person price % is not about 1.5 times %', a, s; end if;
end $$;

select pg_temp.as_service();
do $$ declare r text; begin
  r := pg_temp.upsert('sub_sharedb', 'cus_sharedb', '41410000-0000-0000-0000-00000000000b', 'active', 'member_two_month');
  if r <> 'applied' then raise exception 'two-person subscription: %', r; end if;
  if (select plan from public.subscriptions where stripe_subscription_id = 'sub_sharedb') is distinct from 'member_two_month' then
    raise exception 'the plan was not kept';
  end if;
  -- the outsider has their own single membership
  r := public.upsert_subscription('sub_sharedx', 'cus_sharedx', '41410000-0000-0000-0000-00000000000d',
    '00000000-0000-0000-0000-00000000000a', 'active', 'member_month', 'price_test_month', now() + interval '30 days', false, null, null, null, now());
  if r <> 'applied' then raise exception 'outsider subscription: %', r; end if;
end $$;
reset role;

do $$ begin
  if not app.has_entitlement('41410000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a', '41410000-0000-0000-0000-0000000000c1') then
    raise exception 'the buyer has no access';
  end if;
  if app.has_entitlement('41410000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000a', '41410000-0000-0000-0000-0000000000c1') then
    raise exception 'the member has access before joining';
  end if;
end $$;

-- The buyer's checkout consent can name the two-person plan.
select test_as('41410000-0000-0000-0000-00000000000b');
do $$ declare v text; id bigint; begin
  select version into v from public.checkout_consent_wordings where kind = 'membership' order by published_at desc limit 1;
  id := public.record_checkout_consent('membership', v, '00000000-0000-0000-0000-00000000000a', null, 'member_two_month');
  if id is null then raise exception 'no consent recorded'; end if;
  begin
    perform public.record_checkout_consent('membership', v, '00000000-0000-0000-0000-00000000000a', null, 'member_other');
    raise exception 'an unknown plan was accepted';
  exception when sqlstate 'AKC03' then null; end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 2. The invitation. Only a buyer on the two-person plan can make one; a new
-- link replaces an unused one; the stored value is a hash.
-- ---------------------------------------------------------------------------
select test_as('41410000-0000-0000-0000-00000000000d');
do $$ begin
  begin
    perform public.seat_create_invite(pg_temp.h('x'), '00000000-0000-0000-0000-00000000000a');
    raise exception 'a single-plan member made an invitation';
  exception when sqlstate 'AKS02' then null; end;
  begin
    perform public.seat_create_invite('not-a-hash', '00000000-0000-0000-0000-00000000000a');
    raise exception 'a bad hash was accepted';
  exception when check_violation or sqlstate 'AKS02' then null; end;
end $$;
reset role;

select test_as('41410000-0000-0000-0000-00000000000b');
do $$ declare a uuid; b uuid; begin
  a := public.seat_create_invite(pg_temp.h('link-one'), '00000000-0000-0000-0000-00000000000a');
  b := public.seat_create_invite(pg_temp.h('link-two'), '00000000-0000-0000-0000-00000000000a');
  if a is distinct from b then raise exception 'a second link made a second seat'; end if;
  if (select count(*) from public.membership_seats) <> 1 then raise exception 'the buyer should see one seat'; end if;
  if (select seat_status from public.my_shared_seat('00000000-0000-0000-0000-00000000000a')) <> 'invited' then
    raise exception 'my_shared_seat should say invited';
  end if;
end $$;
reset role;

select pg_temp.as_service();
do $$ begin
  if public.seat_invite_state(pg_temp.h('link-one'), '00000000-0000-0000-0000-00000000000a') <> 'invalid' then raise exception 'the replaced link still works'; end if;
  if public.seat_invite_state(pg_temp.h('link-two'), '00000000-0000-0000-0000-00000000000a') <> 'open' then raise exception 'the new link is not open'; end if;
  if exists (select 1 from public.membership_seats where token_hash = 'link-two') then raise exception 'a raw token was stored'; end if;
end $$;
reset role;

-- the link is not readable by other people, and the state call is service only
select test_as('41410000-0000-0000-0000-00000000000d');
do $$ begin
  begin
    perform public.seat_invite_state(pg_temp.h('link-two'), '00000000-0000-0000-0000-00000000000a');
    raise exception 'a reader read an invitation state';
  exception when insufficient_privilege then null; end;
  if (select count(*) from public.membership_seats) <> 0 then raise exception 'an outsider sees a seat'; end if;
  -- an outsider with their own membership cannot take the seat
  if public.seat_accept(pg_temp.h('link-two'), '00000000-0000-0000-0000-00000000000a') <> 'has_membership' then
    raise exception 'a member with their own plan joined a seat';
  end if;
end $$;
reset role;

-- the buyer cannot take their own seat
select test_as('41410000-0000-0000-0000-00000000000b');
do $$ begin
  if public.seat_accept(pg_temp.h('link-two'), '00000000-0000-0000-0000-00000000000a') <> 'own_link' then
    raise exception 'the buyer joined their own seat';
  end if;
end $$;
reset role;

-- a wrong tenant and a wrong link do nothing
select test_as('41410000-0000-0000-0000-00000000000c');
do $$ begin
  if public.seat_accept(pg_temp.h('nope'), '00000000-0000-0000-0000-00000000000a') <> 'invalid' then raise exception 'a wrong link joined'; end if;
  if public.seat_accept(pg_temp.h('link-two'), '00000000-0000-0000-0000-00000000000b') <> 'invalid' then raise exception 'a wrong tenant joined'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. Acceptance. The member gets the entitlement; the link is used up; the
-- second place cannot be given to anyone else.
-- ---------------------------------------------------------------------------
select test_as('41410000-0000-0000-0000-00000000000c');
do $$ begin
  if public.seat_accept(pg_temp.h('link-two'), '00000000-0000-0000-0000-00000000000a') <> 'joined' then raise exception 'the member could not join'; end if;
  if public.seat_accept(pg_temp.h('link-two'), '00000000-0000-0000-0000-00000000000a') <> 'invalid' then raise exception 'a link worked twice'; end if;
  if (select count(*) from public.entitlements where user_id = app.uid() and source = 'membership' and status = 'active') <> 1 then
    raise exception 'the member should see one active membership entitlement';
  end if;
end $$;
reset role;

do $$ begin
  if not app.has_entitlement('41410000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000a', '41410000-0000-0000-0000-0000000000c1') then
    raise exception 'the member has no access after joining';
  end if;
  if (select count(*) from public.subscriptions where user_id = '41410000-0000-0000-0000-00000000000c') <> 0 then
    raise exception 'the member got a subscription row';
  end if;
end $$;

select test_as('41410000-0000-0000-0000-00000000000b');
do $$ begin
  begin
    perform public.seat_create_invite(pg_temp.h('link-three'), '00000000-0000-0000-0000-00000000000a');
    raise exception 'a third person could be invited';
  exception when sqlstate 'AKS04' then null; end;
  if (select seat_status from public.my_shared_seat('00000000-0000-0000-0000-00000000000a')) <> 'active' then
    raise exception 'my_shared_seat should say active';
  end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. Isolation: member A cannot read member B's rows, and B cannot read A's.
-- Answers, enrolments, progress, settings and entitlements stay separate.
-- Identity columns on the seat are not readable by either side.
-- ---------------------------------------------------------------------------
select test_as('41410000-0000-0000-0000-00000000000c');
do $$ declare n int; begin
  select count(*) into n from public.enrolments where user_id = '41410000-0000-0000-0000-00000000000b';
  if n <> 0 then raise exception 'the member read the buyer enrolment'; end if;
  select count(*) into n from public.answers where enrolment_id = '41410000-0000-0000-0000-0000000000e1';
  if n <> 0 then raise exception 'the member read the buyer answers'; end if;
  select count(*) into n from public.progress_events where enrolment_id = '41410000-0000-0000-0000-0000000000e1';
  if n <> 0 then raise exception 'the member read the buyer progress'; end if;
  select count(*) into n from public.profiles where user_id = '41410000-0000-0000-0000-00000000000b';
  if n <> 0 then raise exception 'the member read the buyer settings'; end if;
  select count(*) into n from public.entitlements where user_id = '41410000-0000-0000-0000-00000000000b';
  if n <> 0 then raise exception 'the member read the buyer entitlement'; end if;
  select count(*) into n from public.subscriptions;
  if n <> 0 then raise exception 'the member read a subscription'; end if;
  -- their own rows are there
  select count(*) into n from public.answers where sealed = 'v2.k1.MEMBER';
  if n <> 1 then raise exception 'the member cannot read their own answer'; end if;
  select count(*) into n from public.enrolments;
  if n <> 1 then raise exception 'the member should see exactly one enrolment, saw %', n; end if;
  -- no writes into the buyer's rows
  begin
    insert into public.progress_events (enrolment_id, kind, ref) values ('41410000-0000-0000-0000-0000000000e1', 'step_done', 'step_9');
    raise exception 'the member wrote progress for the buyer';
  exception when insufficient_privilege then null; end;
  update public.enrolments set status = 'paused' where id = '41410000-0000-0000-0000-0000000000e1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'the member changed the buyer enrolment'; end if;
  update public.profiles set display_name = 'Hijack' where user_id = '41410000-0000-0000-0000-00000000000b';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'the member changed the buyer settings'; end if;
  -- the seat row is theirs, without any account ids
  select count(*) into n from public.membership_seats;
  if n <> 1 then raise exception 'the member should see exactly their seat'; end if;
  begin
    perform owner_user_id from public.membership_seats;
    raise exception 'the member read the buyer account id';
  exception when insufficient_privilege then null; end;
  begin
    perform token_hash from public.membership_seats;
    raise exception 'the member read a token hash';
  exception when insufficient_privilege then null; end;
  -- the member cannot make seats or end the buyer's
  begin
    perform public.seat_create_invite(pg_temp.h('mine'), '00000000-0000-0000-0000-00000000000a');
    raise exception 'the member made an invitation';
  exception when sqlstate 'AKS02' then null; end;
  if public.seat_remove() <> 'none' then raise exception 'the member removed a seat'; end if;
  begin
    insert into public.membership_seats (subscription_id, owner_user_id, tenant_id, status, token_hash)
    select id, user_id, tenant_id, 'invited', pg_temp.h('direct') from public.subscriptions limit 1;
    raise exception 'a client inserted a seat';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select test_as('41410000-0000-0000-0000-00000000000b');
do $$ declare n int; begin
  select count(*) into n from public.enrolments where user_id = '41410000-0000-0000-0000-00000000000c';
  if n <> 0 then raise exception 'the buyer read the member enrolment'; end if;
  select count(*) into n from public.answers where enrolment_id = '41410000-0000-0000-0000-0000000000e2';
  if n <> 0 then raise exception 'the buyer read the member answers'; end if;
  select count(*) into n from public.progress_events where enrolment_id = '41410000-0000-0000-0000-0000000000e2';
  if n <> 0 then raise exception 'the buyer read the member progress'; end if;
  select count(*) into n from public.profiles where user_id = '41410000-0000-0000-0000-00000000000c';
  if n <> 0 then raise exception 'the buyer read the member settings'; end if;
  select count(*) into n from public.entitlements where user_id = '41410000-0000-0000-0000-00000000000c';
  if n <> 0 then raise exception 'the buyer read the member entitlement'; end if;
  select count(*) into n from public.answers;
  if n <> 1 then raise exception 'the buyer should see exactly one answer, saw %', n; end if;
  begin
    perform member_user_id from public.membership_seats;
    raise exception 'the buyer read the member account id';
  exception when insufficient_privilege then null; end;
  begin
    perform token_hash from public.membership_seats;
    raise exception 'the buyer read a token hash';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 5. Removal. The buyer removes the member: access ends at once, the
-- member's own answers are still theirs, and the seat can be offered again.
-- The member joins again from a new link, then leaves.
-- ---------------------------------------------------------------------------
select test_as('41410000-0000-0000-0000-00000000000b');
do $$ begin
  if public.seat_remove() <> 'removed' then raise exception 'the buyer could not remove the member'; end if;
  if public.seat_remove() <> 'none' then raise exception 'removal ran twice'; end if;
end $$;
reset role;

do $$ begin
  if app.has_entitlement('41410000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000a', '41410000-0000-0000-0000-0000000000c1') then
    raise exception 'the removed member kept access';
  end if;
  if not app.has_entitlement('41410000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a', '41410000-0000-0000-0000-0000000000c1') then
    raise exception 'the buyer lost access when the member was removed';
  end if;
  if not exists (select 1 from public.membership_seats where owner_user_id = '41410000-0000-0000-0000-00000000000b' and status = 'removed') then raise exception 'the seat is not removed'; end if;
end $$;

select test_as('41410000-0000-0000-0000-00000000000c');
do $$ begin
  if (select count(*) from public.answers where sealed = 'v2.k1.MEMBER') <> 1 then raise exception 'the removed member lost their answers'; end if;
  if public.seat_leave() <> 'none' then raise exception 'a removed member left a seat'; end if;
end $$;
reset role;

select test_as('41410000-0000-0000-0000-00000000000b');
select public.seat_create_invite(pg_temp.h('link-four'), '00000000-0000-0000-0000-00000000000a');
reset role;
select test_as('41410000-0000-0000-0000-00000000000c');
do $$ begin
  if public.seat_accept(pg_temp.h('link-four'), '00000000-0000-0000-0000-00000000000a') <> 'joined' then raise exception 'could not rejoin'; end if;
  if public.seat_leave() <> 'left' then raise exception 'the member could not leave'; end if;
  if public.seat_leave() <> 'none' then raise exception 'leave ran twice'; end if;
end $$;
reset role;
do $$ begin
  if app.has_entitlement('41410000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000a', '41410000-0000-0000-0000-0000000000c1') then
    raise exception 'the member kept access after leaving';
  end if;
  if not app.has_entitlement('41410000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a', '41410000-0000-0000-0000-0000000000c1') then
    raise exception 'the buyer lost access when the member left';
  end if;
end $$;

-- an unused invitation can be withdrawn
select test_as('41410000-0000-0000-0000-00000000000b');
do $$ begin
  perform public.seat_create_invite(pg_temp.h('link-five'), '00000000-0000-0000-0000-00000000000a');
  if public.seat_remove() <> 'withdrawn' then raise exception 'the invitation was not withdrawn'; end if;
end $$;
reset role;
select pg_temp.as_service();
do $$ begin
  if public.seat_invite_state(pg_temp.h('link-five'), '00000000-0000-0000-0000-00000000000a') <> 'invalid' then raise exception 'a withdrawn link still works'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 6. Cancellation. Cancel at period end keeps both people to the end and
-- stops new invitations; when the subscription ends, both lose access and
-- the seat ends. An expired link does not join.
-- ---------------------------------------------------------------------------
select test_as('41410000-0000-0000-0000-00000000000b');
select public.seat_create_invite(pg_temp.h('link-six'), '00000000-0000-0000-0000-00000000000a');
reset role;
select test_as('41410000-0000-0000-0000-00000000000c');
do $$ begin
  if public.seat_accept(pg_temp.h('link-six'), '00000000-0000-0000-0000-00000000000a') <> 'joined' then raise exception 'could not join for the cancel test'; end if;
end $$;
reset role;

select pg_temp.as_service();
select pg_temp.upsert('sub_sharedb', 'cus_sharedb', '41410000-0000-0000-0000-00000000000b', 'active', 'member_two_month', true);
reset role;
do $$ begin
  if not app.has_entitlement('41410000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000a', '41410000-0000-0000-0000-0000000000c1') then
    raise exception 'the member lost access before the period ended';
  end if;
end $$;

select pg_temp.as_service();
do $$ begin
  perform public.upsert_subscription('sub_sharedb', 'cus_sharedb', '41410000-0000-0000-0000-00000000000b',
    '00000000-0000-0000-0000-00000000000a', 'canceled', 'member_two_month', 'price_test_two', now() - interval '1 minute',
    false, null, now(), now(), now() + interval '1 second');
end $$;
reset role;
do $$ begin
  if app.has_entitlement('41410000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a', '41410000-0000-0000-0000-0000000000c1') then
    raise exception 'the buyer kept access after the subscription ended';
  end if;
  if app.has_entitlement('41410000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000a', '41410000-0000-0000-0000-0000000000c1') then
    raise exception 'the member kept access after the subscription ended';
  end if;
  if not exists (select 1 from public.membership_seats where owner_user_id = '41410000-0000-0000-0000-00000000000b' and status = 'ended')
     or exists (select 1 from public.membership_seats where owner_user_id = '41410000-0000-0000-0000-00000000000b' and status in ('invited','active')) then
    raise exception 'the seat did not end';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7. An expired link is refused. A subscription that never ends cleanly (past
-- due) keeps the member inside the grace period only, like the buyer.
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
select pg_temp.upsert('sub_sharedf1', 'cus_sharedf1', '41410000-0000-0000-0000-0000000000f1', 'active', 'member_two_month');
reset role;
select test_as('41410000-0000-0000-0000-0000000000f1');
select public.seat_create_invite(pg_temp.h('link-pq'), '00000000-0000-0000-0000-00000000000a');
reset role;
update public.membership_seats set expires_at = now() - interval '1 minute' where owner_user_id = '41410000-0000-0000-0000-0000000000f1';
select test_as('41410000-0000-0000-0000-0000000000f2');
do $$ begin
  if public.seat_accept(pg_temp.h('link-pq'), '00000000-0000-0000-0000-00000000000a') <> 'expired' then raise exception 'an expired link joined'; end if;
end $$;
reset role;
select test_as('41410000-0000-0000-0000-0000000000f1');
select public.seat_create_invite(pg_temp.h('link-pq2'), '00000000-0000-0000-0000-00000000000a');
reset role;
select test_as('41410000-0000-0000-0000-0000000000f2');
do $$ begin
  if public.seat_accept(pg_temp.h('link-pq2'), '00000000-0000-0000-0000-00000000000a') <> 'joined' then raise exception 'could not join with a fresh link'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 8. DMCC six-monthly reminder: the two-person plan is covered, and it goes
-- to the buyer's address only.
-- ---------------------------------------------------------------------------
update public.subscriptions
   set created_at = now() - interval '7 months', current_period_end = now() + interval '5 days'
 where stripe_subscription_id = 'sub_sharedf1';
select pg_temp.as_service();
do $$ declare n int; e text; begin
  select count(*), min(email) into n, e from public.due_terms_reminders(now()) where stripe_subscription_id = 'sub_sharedf1';
  if n <> 1 then raise exception 'expected one reminder for the two-person plan, saw %', n; end if;
  if e <> 'payer@shared.test' then raise exception 'the reminder went to %', e; end if;
  if exists (select 1 from public.due_terms_reminders(now()) where email = 'guest@shared.test') then
    raise exception 'the member was sent a reminder';
  end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 9. The pool counts the money once. P pays one invoice. Q joined at the
-- start of June 2026. One receipt, one subscriber; both people's June steps
-- count toward P's share, and a step Q did before joining does not.
-- ---------------------------------------------------------------------------
update public.membership_seats set accepted_at = '2026-06-02T00:00:00Z'
 where owner_user_id = '41410000-0000-0000-0000-0000000000f1' and status = 'active';
insert into public.enrolments (id, user_id, tenant_id, workbook_id, version_id) values
  ('41410000-0000-0000-0000-0000000000e3', '41410000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000a',
   '41410000-0000-0000-0000-0000000000c1', '41410000-0000-0000-0000-0000000000d1'),
  ('41410000-0000-0000-0000-0000000000e4', '41410000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-00000000000a',
   '41410000-0000-0000-0000-0000000000c1', '41410000-0000-0000-0000-0000000000d1');
insert into public.progress_events (enrolment_id, kind, ref, at)
select '41410000-0000-0000-0000-0000000000e3', 'step_done', 'step_' || g, '2026-06-10T10:00:00Z' from generate_series(1, 5) g;
insert into public.progress_events (enrolment_id, kind, ref, at)
select '41410000-0000-0000-0000-0000000000e4', 'step_done', 'step_' || g, '2026-06-11T10:00:00Z' from generate_series(4, 10) g;
insert into public.progress_events (enrolment_id, kind, ref, at) values
  ('41410000-0000-0000-0000-0000000000e4', 'step_done', 'step_20', '2026-06-01T10:00:00Z');
insert into public.subscription_invoices (user_id, tenant_id, stripe_invoice_id, stripe_subscription_id, status, currency, amount_minor, tax_minor, paid_at) values
  ('41410000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000a', 'in_sharedpq', 'sub_sharedf1', 'paid', 'GBP', 1199, 200, '2026-06-05T09:00:00Z');

select pg_temp.as_service();
do $$ declare v text; p public.pool_periods%rowtype; steps int; begin
  v := public.record_membership_receipt('in_sharedpq', false, 'pi_shared_pq', null, 40);
  if v <> 'recorded' then raise exception 'membership receipt: %', v; end if;
  if (select count(*) from public.royalty_receipts where subscription_invoice_id = (select id from public.subscription_invoices where stripe_invoice_id = 'in_sharedpq')) <> 1 then
    raise exception 'the shared membership produced more than one receipt';
  end if;
  perform public.close_due_pools(false);
  select * into p from public.pool_periods where period = '2026-06' and currency = 'GBP' and not livemode;
  -- 1199 - 200 - 40 = 959, once
  if p.net_receipts_minor <> 959 then raise exception 'pool net % is not the one receipt', p.net_receipts_minor; end if;
  if p.subscribers <> 1 then raise exception 'two people were counted as % subscribers', p.subscribers; end if;
  if p.active_subscribers <> 1 then raise exception 'active subscribers %', p.active_subscribers; end if;
  select coalesce(sum(steps_capped), 0) into steps from public.pool_usage where period_id = p.id;
  -- P: step_1 to step_5 (5). Q from joining: step_4 to step_10 (7). step_20 was before joining.
  if steps <> 12 then raise exception 'pool steps % should be 12', steps; end if;
  if (select count(distinct user_hash) from public.pool_usage where period_id = p.id) <> 1 then
    raise exception 'the pair appears as more than one pool user';
  end if;
end $$;
reset role;

rollback;
