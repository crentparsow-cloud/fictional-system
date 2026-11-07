-- "Send this workbook" (0053): one gift a quarter for a paying member, to
-- someone who has never paid, claimed without a card, and the author paid
-- half the list price from the marketing pool.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('53530000-0000-0000-0000-00000000000a', 'giver53@test'),
  ('53530000-0000-0000-0000-00000000000b', 'trialist53@test'),
  ('53530000-0000-0000-0000-00000000000c', 'friend53@test'),
  ('53530000-0000-0000-0000-00000000000d', 'payer53@test'),
  ('53530000-0000-0000-0000-00000000000e', 'owner53@test');

insert into public.organisations (id, kind, legal_name, display_name, slug, country) values
  ('53530000-0000-0000-0000-0000000000a1', 'publisher', 'Gift Org Ltd', 'Gift Org', 'gift-org-53', 'GB');
insert into public.authors (id, code, org_id, slug, display_name, country) values
  ('53530000-0000-0000-0000-0000000000b1', 'AU-5353A', '53530000-0000-0000-0000-0000000000a1', 'gift-author-53', 'Gift Author', 'GB');
insert into public.books (id, org_id, slug, title) values
  ('53530000-0000-0000-0000-0000000000c1', '53530000-0000-0000-0000-0000000000a1', 'gift-book-53', 'Gift Book');
insert into public.book_contributors (book_id, author_id, role) values
  ('53530000-0000-0000-0000-0000000000c1', '53530000-0000-0000-0000-0000000000b1', 'author');
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, depth, status, badge, price_point_id) values
  ('53530000-0000-0000-0000-0000000000d1', 'AK-53531', '53530000-0000-0000-0000-0000000000c1', '53530000-0000-0000-0000-0000000000a1',
   'gift-wb-53', 'Gift Workbook 53', 'Card', 'productivity', 'full', 'live', 'official', 'p2');
-- the list price used for the author's half (inactive points may carry any figure)
update public.price_points set amounts = jsonb_set(amounts, '{GBP}', '1200') where id = 'p2';

insert into public.subscriptions (user_id, tenant_id, stripe_customer_id, stripe_subscription_id, plan, status, observed_at) values
  ('53530000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'cus_53a', 'sub_53a', 'member_month', 'active', now()),
  ('53530000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a', 'cus_53b', 'sub_53b', 'member_month', 'trialing', now());
insert into public.purchases (user_id, tenant_id, kind, price_point_id, stripe_checkout_session_id, currency, amount_minor, status, paid_at)
values ('53530000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-00000000000a', 'membership', 'member_month', 'cs_test_53_paid', 'GBP', 799, 'paid', now());

create or replace function pg_temp.as_service() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "service_role"}'::text, true);
  execute 'set local role service_role';
end $$;

-- Hashes stand in for SHA-256 of the emailed token.
create or replace function pg_temp.h(p text) returns text language sql as $$ select md5(p) || md5(p || 'x') $$;

-- 1. Only a paying member (active, not trialing) can send.
-- 0068: the send is made by the server (service role) for the signed-in member.
select pg_temp.as_service();
do $$ declare r record; begin
  select * into r from public.gift_send_for('53530000-0000-0000-0000-00000000000b', '53530000-0000-0000-0000-0000000000d1', 'friend53@test', pg_temp.h('t0'));
  if r.status <> 'not_member' then raise exception 'a trialist sent a gift: %', r.status; end if;
end $$;
reset role;

-- 2. The giver sends one. Not to themselves, not to someone who has paid,
-- not a demo or unpublished title. (0068: a payer's address is answered like
-- any other and refused at the claim; see 0068_phase_b_security.sql.)
select pg_temp.as_service();
do $$ declare r record; begin
  select * into r from public.gift_send_for('53530000-0000-0000-0000-00000000000a', '53530000-0000-0000-0000-0000000000d1', 'GIVER53@test', pg_temp.h('t1'));
  if r.status <> 'self' then raise exception 'gift to self: %', r.status; end if;
  select * into r from public.gift_send_for('53530000-0000-0000-0000-00000000000a', '53530000-0000-0000-0000-00000000dddd', 'friend53@test', pg_temp.h('t3'));
  if r.status <> 'not_giftable' then raise exception 'gift of a missing title: %', r.status; end if;
  begin
    perform * from public.gift_send_for('53530000-0000-0000-0000-00000000000a', '53530000-0000-0000-0000-0000000000d1', 'not-an-email', pg_temp.h('t4'));
    raise exception 'bad email accepted';
  exception when check_violation then null; end;
  select * into r from public.gift_send_for('53530000-0000-0000-0000-00000000000a', '53530000-0000-0000-0000-0000000000d1', 'friend53@test', pg_temp.h('t5'));
  if r.status <> 'sent' or r.gift_id is null then raise exception 'send: %', r.status; end if;
  -- one a quarter, no rollover
  select * into r from public.gift_send_for('53530000-0000-0000-0000-00000000000a', '53530000-0000-0000-0000-0000000000d1', 'other53@test', pg_temp.h('t6'));
  if r.status <> 'used_this_quarter' then raise exception 'second gift in a quarter: %', r.status; end if;
end $$;
reset role;
select test_as('53530000-0000-0000-0000-00000000000a');
do $$ begin
  if (select used from public.gift_status()) is not true then raise exception 'status should say used'; end if;
  begin
    perform 1 from public.workbook_gifts;
    raise exception 'a reader read the gifts table';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 3. The preview shows the gift to the recipient only as far as the page needs.
select test_as('53530000-0000-0000-0000-00000000000c');
do $$ declare r record; begin
  select * into r from public.workbook_gift_preview(pg_temp.h('t5'));
  if r.status <> 'sent' or not r.can_claim or r.workbook_slug <> 'gift-wb-53' then raise exception 'preview'; end if;
  begin
    perform * from public.gift_claim('53530000-0000-0000-0000-00000000000c', pg_temp.h('t5'), false);
    raise exception 'a reader claimed through the service function';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 4. Claiming: the giver cannot, a payer cannot, a new reader can, once.
select pg_temp.as_service();
do $$ begin
  if public.gift_claim('53530000-0000-0000-0000-00000000000a', pg_temp.h('t5'), false) <> 'not_eligible' then raise exception 'giver claimed'; end if;
  if public.gift_claim('53530000-0000-0000-0000-00000000000d', pg_temp.h('t5'), false) <> 'not_eligible' then raise exception 'payer claimed'; end if;
  if public.gift_claim('53530000-0000-0000-0000-00000000000c', pg_temp.h('nope'), false) <> 'unknown' then raise exception 'unknown'; end if;
  if public.gift_claim('53530000-0000-0000-0000-00000000000c', pg_temp.h('t5'), false) <> 'claimed' then raise exception 'claim'; end if;
  if public.gift_claim('53530000-0000-0000-0000-00000000000c', pg_temp.h('t5'), false) <> 'unchanged' then raise exception 'claim twice'; end if;
  if public.gift_claim('53530000-0000-0000-0000-00000000000e', pg_temp.h('t5'), false) <> 'not_available' then raise exception 'claim by a second person'; end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.entitlements where user_id = '53530000-0000-0000-0000-00000000000c'
        and workbook_id = '53530000-0000-0000-0000-0000000000d1' and source = 'gift' and status = 'active' and ends_at is null) <> 1 then
    raise exception 'the recipient should hold the workbook';
  end if;
  if (select recipient_email from public.workbook_gifts where token_hash = pg_temp.h('t5')) is not null then raise exception 'the address should be cleared'; end if;
end $$;

-- 5. The author is paid half the list price, once, from the pool.
do $$ declare l public.royalty_lines; begin
  select * into l from public.royalty_lines where kind = 'gift_share' and org_id = '53530000-0000-0000-0000-0000000000a1';
  if l.author_minor <> 600 or l.akana_minor <> -600 or l.workbook_id <> '53530000-0000-0000-0000-0000000000d1' then
    raise exception 'gift share: % %', l.author_minor, l.akana_minor;
  end if;
  if (select sum(amount_minor) from public.marketing_pool_ledger where org_id = '53530000-0000-0000-0000-0000000000a1') <> -600 then
    raise exception 'pool ledger entry wrong';
  end if;
  begin
    delete from public.marketing_pool_ledger;
    raise exception 'the pool ledger was edited';
  exception when insufficient_privilege then null; end;
end $$;

-- 6. A recipient who has since paid cannot be gifted; a gift to a waiting
-- address is refused; cancelling gives the quarter back; expiry does not.
insert into auth.users (id, email) values ('53530000-0000-0000-0000-0000000000f1', 'giver53b@test');
insert into public.subscriptions (user_id, tenant_id, stripe_customer_id, stripe_subscription_id, plan, status, observed_at)
values ('53530000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000a', 'cus_53f1', 'sub_53f1', 'member_month', 'active', now());
select pg_temp.as_service();
do $$ declare r record; begin
  select * into r from public.gift_send_for('53530000-0000-0000-0000-0000000000f1', '53530000-0000-0000-0000-0000000000d1', 'new53@test', pg_temp.h('u1'));
  if r.status <> 'sent' then raise exception 'send u1: %', r.status; end if;
end $$;
reset role;
select test_as('53530000-0000-0000-0000-0000000000f1');
do $$ begin
  if public.gift_cancel((select gift_id from (select id as gift_id from public.my_gifts() where status = 'sent') x limit 1)) <> 'cancelled' then raise exception 'cancel'; end if;
end $$;
reset role;
select pg_temp.as_service();
do $$ declare r record; begin
  select * into r from public.gift_send_for('53530000-0000-0000-0000-0000000000f1', '53530000-0000-0000-0000-0000000000d1', 'new53@test', pg_temp.h('u2'));
  if r.status <> 'sent' then raise exception 'a cancelled gift should give the quarter back: %', r.status; end if;
end $$;
reset role;
-- 0068: another giver may send to the same waiting address; the first claim decides
insert into auth.users (id, email) values ('53530000-0000-0000-0000-0000000000f2', 'giver53c@test');
insert into public.subscriptions (user_id, tenant_id, stripe_customer_id, stripe_subscription_id, plan, status, observed_at)
values ('53530000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-00000000000a', 'cus_53f2', 'sub_53f2', 'member_month', 'active', now());
select pg_temp.as_service();
do $$ declare r record; begin
  select * into r from public.gift_send_for('53530000-0000-0000-0000-0000000000f2', '53530000-0000-0000-0000-0000000000d1', 'NEW53+x@test', pg_temp.h('u3'));
  if r.status <> 'sent' then raise exception 'a second gift to a waiting address: %', r.status; end if;
end $$;
reset role;
-- an unclaimed gift past its date: cannot be claimed, still uses the quarter
update public.workbook_gifts set expires_at = now() - interval '1 day' where token_hash = pg_temp.h('u2');
select pg_temp.as_service();
do $$ begin
  if public.gift_claim('53530000-0000-0000-0000-00000000000e', pg_temp.h('u2'), false) <> 'expired' then raise exception 'expired gift claimed'; end if;
end $$;
reset role;
select pg_temp.as_service();
do $$ declare r record; begin
  select * into r from public.gift_send_for('53530000-0000-0000-0000-0000000000f1', '53530000-0000-0000-0000-0000000000d1', 'later53@test', pg_temp.h('u4'));
  if r.status <> 'used_this_quarter' then raise exception 'an expired gift should still use the quarter: %', r.status; end if;
end $$;
reset role;
rollback;
