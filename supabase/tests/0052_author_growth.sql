-- Author growth (0052): author links and attribution, the 25 percent referred
-- share for 12 months in the ledger, its reversal on a refund, and author
-- recommendations (three at most, public authors only, both directions).
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('52520000-0000-0000-0000-00000000000a', 'owner52a@test'),
  ('52520000-0000-0000-0000-00000000000b', 'owner52b@test'),
  ('52520000-0000-0000-0000-00000000000c', 'reader52@test'),
  ('52520000-0000-0000-0000-00000000000d', 'paid52@test'),
  ('52520000-0000-0000-0000-00000000000e', 'owner52c@test'),
  ('52520000-0000-0000-0000-00000000000f', 'owner52d@test');

insert into public.organisations (id, kind, legal_name, display_name, slug, country) values
  ('52520000-0000-0000-0000-0000000000a1', 'publisher', 'Author A Ltd', 'Author A', 'author-52a', 'GB'),
  ('52520000-0000-0000-0000-0000000000a2', 'publisher', 'Author B Ltd', 'Author B', 'author-52b', 'GB'),
  ('52520000-0000-0000-0000-0000000000a3', 'publisher', 'Author C Ltd', 'Author C', 'author-52c', 'GB'),
  ('52520000-0000-0000-0000-0000000000a4', 'publisher', 'Author D Ltd', 'Author D', 'author-52d', 'GB'),
  ('52520000-0000-0000-0000-0000000000a5', 'publisher', 'Hidden Ltd', 'Hidden', 'author-52h', 'GB');
insert into public.org_members (org_id, user_id, role) values
  ('52520000-0000-0000-0000-0000000000a1', '52520000-0000-0000-0000-00000000000a', 'owner'),
  ('52520000-0000-0000-0000-0000000000a2', '52520000-0000-0000-0000-00000000000b', 'owner'),
  ('52520000-0000-0000-0000-0000000000a3', '52520000-0000-0000-0000-00000000000e', 'owner'),
  ('52520000-0000-0000-0000-0000000000a4', '52520000-0000-0000-0000-00000000000f', 'owner');
-- A, B, C and D each have a live public workbook; Hidden has none.
insert into public.authors (id, code, org_id, slug, display_name, country) values
  ('52520000-0000-0000-0000-0000000000b1', 'AU-5252A', '52520000-0000-0000-0000-0000000000a1', 'a-52', 'Author A', 'GB'),
  ('52520000-0000-0000-0000-0000000000b2', 'AU-5252B', '52520000-0000-0000-0000-0000000000a2', 'b-52', 'Author B', 'GB'),
  ('52520000-0000-0000-0000-0000000000b3', 'AU-5252C', '52520000-0000-0000-0000-0000000000a3', 'c-52', 'Author C', 'GB'),
  ('52520000-0000-0000-0000-0000000000b4', 'AU-5252D', '52520000-0000-0000-0000-0000000000a4', 'd-52', 'Author D', 'GB'),
  ('52520000-0000-0000-0000-0000000000b5', 'AU-5252H', '52520000-0000-0000-0000-0000000000a5', 'h-52', 'Hidden', 'GB');
insert into public.books (id, org_id, slug, title) values
  ('52520000-0000-0000-0000-0000000000c1', '52520000-0000-0000-0000-0000000000a1', 'book-52a', 'Book 52A'),
  ('52520000-0000-0000-0000-0000000000c2', '52520000-0000-0000-0000-0000000000a2', 'book-52b', 'Book 52B'),
  ('52520000-0000-0000-0000-0000000000c3', '52520000-0000-0000-0000-0000000000a3', 'book-52c', 'Book 52C'),
  ('52520000-0000-0000-0000-0000000000c4', '52520000-0000-0000-0000-0000000000a4', 'book-52d', 'Book 52D'),
  ('52520000-0000-0000-0000-0000000000c5', '52520000-0000-0000-0000-0000000000a5', 'book-52h', 'Book 52H');
insert into public.book_contributors (book_id, author_id, role)
select ('52520000-0000-0000-0000-0000000000c' || n)::uuid, ('52520000-0000-0000-0000-0000000000b' || n)::uuid, 'author' from generate_series(1,5) n;
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, depth, status, badge)
select ('52520000-0000-0000-0000-0000000000d' || n)::uuid, 'AK-5252' || chr(64 + n), ('52520000-0000-0000-0000-0000000000c' || n)::uuid,
       ('52520000-0000-0000-0000-0000000000a' || n)::uuid, 'wb-52-' || n, 'Workbook 52 ' || n, 'Card', 'productivity', 'full',
       case when n = 5 then 'approved' else 'live' end, 'official'
  from generate_series(1,5) n;

create or replace function pg_temp.as_service() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "service_role"}'::text, true);
  execute 'set local role service_role';
end $$;

-- 1. The link: owners get one, stable; a reader cannot make one.
select test_as('52520000-0000-0000-0000-00000000000a');
do $$ declare c1 text; c2 text; begin
  c1 := public.my_author_link('52520000-0000-0000-0000-0000000000a1');
  c2 := public.my_author_link('52520000-0000-0000-0000-0000000000a1');
  if c1 <> c2 or c1 !~ '^[0-9a-f]{10}$' then raise exception 'link: % %', c1, c2; end if;
  begin
    perform public.my_author_link('52520000-0000-0000-0000-0000000000a2');
    raise exception 'made a link for another organisation';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('akana.link', (select code from public.author_links where org_id = '52520000-0000-0000-0000-0000000000a1'), false);

-- 2. The landing lookup is public and names the author only.
select test_as('52520000-0000-0000-0000-00000000000c');
do $$ declare r record; begin
  select * into r from public.author_link_lookup(current_setting('akana.link'));
  if r.slug <> 'a-52' or r.display_name <> 'Author A' then raise exception 'lookup: %', r.slug; end if;
  if (select count(*) from public.author_link_lookup('nope')) <> 0 then raise exception 'unknown link looked up'; end if;
end $$;
-- 3. Using it: own members refused, a new reader attributed once.
reset role;
select test_as('52520000-0000-0000-0000-00000000000a');
do $$ begin
  if public.author_link_use(current_setting('akana.link')) <> 'own_link' then raise exception 'own link used'; end if;
end $$;
reset role;
insert into public.purchases (user_id, tenant_id, kind, price_point_id, stripe_checkout_session_id, currency, amount_minor, status, paid_at)
values ('52520000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-00000000000a', 'membership', 'member_month', 'cs_test_52_paid', 'GBP', 799, 'paid', now());
select test_as('52520000-0000-0000-0000-00000000000d');
do $$ begin
  if public.author_link_use(current_setting('akana.link')) <> 'not_new' then raise exception 'a paying reader was attributed'; end if;
end $$;
reset role;
select test_as('52520000-0000-0000-0000-00000000000c');
do $$ begin
  if public.author_link_use(current_setting('akana.link')) <> 'attached' then raise exception 'attach'; end if;
  if public.author_link_use(current_setting('akana.link')) <> 'already' then raise exception 'second use'; end if;
end $$;
reset role;

-- 4. The channel check for checkout (service role only).
select pg_temp.as_service();
do $$ begin
  if not public.author_link_channel('52520000-0000-0000-0000-00000000000c', '52520000-0000-0000-0000-0000000000a1') then raise exception 'channel'; end if;
  if public.author_link_channel('52520000-0000-0000-0000-00000000000c', '52520000-0000-0000-0000-0000000000a2') then raise exception 'wrong org channel'; end if;
end $$;
reset role;

-- 5. A paid membership invoice: 25 percent of gross less VAT (fees not
-- known), recorded once, in the author's ledger, with Akana carrying it.
insert into public.subscriptions (user_id, tenant_id, stripe_customer_id, stripe_subscription_id, plan, status, observed_at)
values ('52520000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000a', 'cus_52c', 'sub_52c', 'member_month', 'active', now());
insert into public.subscription_invoices (user_id, tenant_id, stripe_invoice_id, stripe_subscription_id, status, currency, amount_minor, tax_minor, billing_reason, paid_at)
values ('52520000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000a', 'in_52one', 'sub_52c', 'paid', 'GBP', 1200, 200, 'subscription_cycle', now()),
       ('52520000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000a', 'in_52old', 'sub_52c', 'paid', 'GBP', 1200, 200, 'subscription_cycle', now() + interval '13 months');
select pg_temp.as_service();
do $$ begin
  if public.record_membership_receipt('in_52one', false, 'pi_52one', null, null) <> 'recorded' then raise exception 'receipt'; end if;
  if public.record_author_referral_share('in_52one', false) <> 'recorded' then raise exception 'share'; end if;
  if public.record_author_referral_share('in_52one', false) <> 'unchanged' then raise exception 'share twice'; end if;
end $$;
reset role;
do $$ declare l public.royalty_lines; begin
  select * into l from public.royalty_lines where idem_key = 'refshare:in_52one';
  if l.author_minor <> 250 or l.akana_minor <> -250 or l.kind <> 'referral_share' or l.org_id <> '52520000-0000-0000-0000-0000000000a1' then
    raise exception 'share line: % % %', l.author_minor, l.akana_minor, l.kind;
  end if;
end $$;

-- 6. Past 12 months from the first paid invoice: nothing.
select pg_temp.as_service();
do $$ begin
  if public.record_author_referral_share('in_52old', false) <> 'expired' then raise exception 'share after 12 months'; end if;
  if public.record_author_referral_share('in_nope', false) <> 'none' then raise exception 'unknown invoice'; end if;
end $$;
reset role;

-- 7. A refund of half the payment reverses half the share, once.
select pg_temp.as_service();
do $$ begin
  if public.reverse_author_referral_share('pi_52one', 600, false) <> 'recorded' then raise exception 'reversal'; end if;
  if public.reverse_author_referral_share('pi_52one', 600, false) <> 'unchanged' then raise exception 'reversal twice'; end if;
  if public.reverse_author_referral_share('pi_52one', 1200, false) <> 'recorded' then raise exception 'full reversal'; end if;
end $$;
reset role;
do $$ begin
  if (select sum(author_minor) from public.royalty_lines where kind = 'referral_share' and org_id = '52520000-0000-0000-0000-0000000000a1') <> 0 then
    raise exception 'a full refund should net the share to nothing';
  end if;
  begin
    update public.royalty_lines set author_minor = 1 where idem_key = 'refshare:in_52one';
    raise exception 'the ledger was edited';
  exception when insufficient_privilege then null; end;
end $$;

-- 8. The Studio summary: owners only, counts, no identities.
select test_as('52520000-0000-0000-0000-00000000000a');
do $$ declare s record; begin
  select * into s from public.author_referral_summary('52520000-0000-0000-0000-0000000000a1');
  if s.referred <> 1 or s.paying <> 1 then raise exception 'summary: % %', s.referred, s.paying; end if;
  begin
    perform * from public.author_referral_summary('52520000-0000-0000-0000-0000000000a2');
    raise exception 'summary of another organisation';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 9. Recommendations: up to three, public authors only, not yourself, replace.
select test_as('52520000-0000-0000-0000-00000000000a');
do $$ begin
  if public.set_author_recommendations('52520000-0000-0000-0000-0000000000a1',
       array['52520000-0000-0000-0000-0000000000a2','52520000-0000-0000-0000-0000000000a3']::uuid[]) <> 2 then raise exception 'set two'; end if;
  begin
    perform public.set_author_recommendations('52520000-0000-0000-0000-0000000000a1',
      array['52520000-0000-0000-0000-0000000000a2','52520000-0000-0000-0000-0000000000a3','52520000-0000-0000-0000-0000000000a4','52520000-0000-0000-0000-0000000000a5']::uuid[]);
    raise exception 'four accepted';
  exception when check_violation then null; end;
  begin
    perform public.set_author_recommendations('52520000-0000-0000-0000-0000000000a1', array['52520000-0000-0000-0000-0000000000a1']::uuid[]);
    raise exception 'self accepted';
  exception when check_violation then null; end;
  begin
    perform public.set_author_recommendations('52520000-0000-0000-0000-0000000000a1', array['52520000-0000-0000-0000-0000000000a5']::uuid[]);
    raise exception 'an author with nothing public accepted';
  exception when check_violation then null; end;
  begin
    perform public.set_author_recommendations('52520000-0000-0000-0000-0000000000a2', array['52520000-0000-0000-0000-0000000000a3']::uuid[]);
    raise exception 'set for another organisation';
  exception when insufficient_privilege then null; end;
  begin
    perform public.set_author_recommendations('52520000-0000-0000-0000-0000000000a1',
      array['52520000-0000-0000-0000-0000000000a2','52520000-0000-0000-0000-0000000000a2']::uuid[]);
    raise exception 'duplicate accepted';
  exception when check_violation then null; end;
end $$;
reset role;
-- the failed calls left the two recommendations as they were
do $$ begin
  if (select count(*) from public.author_recommendations where from_org = '52520000-0000-0000-0000-0000000000a1') <> 2 then raise exception 'list changed by failed calls'; end if;
end $$;

-- 10. Public reads: A recommends B and C; B sees A as a recommender.
select test_as('52520000-0000-0000-0000-00000000000c');
do $$ begin
  if (select string_agg(slug, ',' order by place) from public.author_recommendations_for('a-52') where direction = 'recommends') <> 'b-52,c-52' then
    raise exception 'recommends list wrong';
  end if;
  if (select string_agg(slug, ',') from public.author_recommendations_for('b-52') where direction = 'recommended_by') <> 'a-52' then
    raise exception 'recommended-by list wrong';
  end if;
  if (select string_agg(slug, ',' order by place) from public.workbook_recommendations('wb-52-1')) <> 'b-52,c-52' then
    raise exception 'programme end list wrong';
  end if;
  if (select count(*) from public.workbook_recommendations('wb-52-5')) <> 0 then raise exception 'an unpublished workbook leaked a list'; end if;
  begin
    perform 1 from public.author_recommendations;
    raise exception 'a reader read the recommendations table';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 11. B sees A in the Studio and recommends back.
select test_as('52520000-0000-0000-0000-00000000000b');
do $$ begin
  if (select count(*) from public.my_author_recommendations('52520000-0000-0000-0000-0000000000a2') where direction = 'recommended_by' and slug = 'a-52') <> 1 then
    raise exception 'B should see A as a recommender';
  end if;
  perform public.set_author_recommendations('52520000-0000-0000-0000-0000000000a2', array['52520000-0000-0000-0000-0000000000a1']::uuid[]);
end $$;
reset role;

rollback;
