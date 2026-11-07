-- 0072 Refunding the last gift closes the entitlement whatever the month
-- lengths. The drift is forced with fixed offsets, so the test does not depend
-- on the day it runs. Each block must raise or return the expected value.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('72720000-0000-0000-0000-000000000002', 'giver72@test'),
  ('72720000-0000-0000-0000-000000000003', 'payer72@test'),
  ('72720000-0000-0000-0000-000000000004', 'friend72@test');
insert into public.profiles (user_id)
select ('72720000-0000-0000-0000-00000000000' || n)::uuid from generate_series(2, 4) n on conflict do nothing;
insert into public.subscriptions (user_id, tenant_id, stripe_customer_id, stripe_subscription_id, plan, status, observed_at) values
  ('72720000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'cus_72g', 'sub_72g', 'member_month', 'active', now()),
  ('72720000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000a', 'cus_72p', 'sub_72p', 'member_month', 'active', now());

create or replace function pg_temp.as_service() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "service_role"}'::text, true);
  execute 'set local role service_role';
end $$;

select pg_temp.as_service();
do $$ begin
  perform public.gift_create('00000000-0000-0000-0000-00000000000a', '72720000-0000-0000-0000-000000000002', 'cs_g72a',
    'tok72aaxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 6, 'friend72@gift.test', null, null, null, 'GBP', 4794);
  perform public.gift_mark_paid('cs_g72a', 'pi_g72a', 4794, 0, 'GBP');
  perform public.gift_create('00000000-0000-0000-0000-00000000000a', '72720000-0000-0000-0000-000000000003', 'cs_g72b',
    'tok72bbxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 1, 'friend72@gift.test', null, null, null, 'GBP', 799);
  perform public.gift_mark_paid('cs_g72b', 'pi_g72b', 799, 0, 'GBP');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
select test_as('72720000-0000-0000-0000-000000000004');
do $$ begin
  perform public.claim_gift('tok72aaxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
  perform public.claim_gift('tok72bbxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
end $$;
reset role;

-- Refund the first gift, then force the leftover time to 31 days plus an
-- hour on both the entitlement and the second gift. A calendar month cut can
-- be 28 to 31 days, so the old function left time behind on some dates.
select pg_temp.as_service();
do $$ begin perform public.gift_refund('pi_g72a'); end $$;
reset role;
update public.entitlements set ends_at = now() + interval '31 days 1 hour'
 where user_id = '72720000-0000-0000-0000-000000000004' and source = 'gift' and workbook_id is null;
update public.gift_memberships set ends_at = now() + interval '31 days 1 hour' where stripe_checkout_session_id = 'cs_g72b';

select pg_temp.as_service();
do $$ begin perform public.gift_refund('pi_g72b'); end $$;
reset role;
do $$ begin
  if (select status from public.entitlements where user_id = '72720000-0000-0000-0000-000000000004' and source = 'gift' and workbook_id is null) <> 'revoked' then
    raise exception 'refunding the last gift should close the entitlement';
  end if;
end $$;

rollback;
