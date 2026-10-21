-- 0039 Studio money: the payout calendar, the sale channel and the Connect
-- hold rule (build list 14.27, 14.28, 14.29, 8.6 and 13.12).
--
-- Same rules as 0001 to 0035. Nothing earlier is edited; functions are
-- replaced in full, security definer with search_path pinned to '', and
-- every function a client may reach has execute revoked from public first.
-- Depends on 0001, 0004, 0010, 0014 and 0021.
--
-- 1. Payout calendar (14.27). royalty_config gains payout_cadence (weekly or
--    monthly) and payout_weekday (ISO, 1 Monday to 7 Sunday). The seeded
--    placeholder is weekly on Fridays with a GBP floor of 10.00 carried
--    forward. The payout run itself still acts on payout_day once a month:
--    changing its cadence is a follow-up, so the Studio shows the schedule
--    and says payouts are monthly until then.
-- 2. Sale channel (13.12). purchases.channel and royalty_lines.channel say
--    how a sale arrived: marketplace (the default) or author_link. Nothing
--    sets author_link yet: there is no author link or referral code in the
--    product, so the checkout hook is the column. record_sale_receipt reads
--    the purchase's channel and applies sale_rate_author_link to author_link
--    sales, sale_rate_author to the rest, and copies the channel to the line.
-- 3. Connect hold (14.29). A paid title may go live before Connect
--    onboarding is complete. The 0014 go-live gate is removed. Earnings for
--    an unverified organisation accrue and are skipped by the payout run
--    with the reason 'unverified' (0021 payout_candidates, unchanged).
--    connect_nudge_candidates lists them for the weekly email nudge.
-- 4. payout_schedule() gives any signed-in member the few config figures the
--    Studio shows (schedule, floor, the two share rates and whether they are
--    placeholders). royalty_config itself stays staff only.

-- ---------------------------------------------------------------------------
-- 1. Payout calendar config.
-- ---------------------------------------------------------------------------
alter table public.royalty_config
  add column payout_cadence text not null default 'weekly' check (payout_cadence in ('weekly','monthly')),
  add column payout_weekday int not null default 5 check (payout_weekday between 1 and 7);

-- The append-only trigger refuses updates, so the new figures are a new row.
-- Still a placeholder: weekly on Fridays with a 10.00 GBP floor is the
-- working default from the build list, not a decision on D1 to D5.
insert into public.royalty_config (effective_from, is_placeholder, sale_rate_author, sale_rate_author_link, pool_share_author,
  pool_step_cap, pool_activity_floor, fee_treatment, refund_window_days, first_payout_hold_days,
  min_payout_minor, approval_above_minor, payout_day, payout_cadence, payout_weekday, note)
select now(), true, c.sale_rate_author, c.sale_rate_author_link, c.pool_share_author,
  c.pool_step_cap, c.pool_activity_floor, c.fee_treatment, c.refund_window_days, c.first_payout_hold_days,
  c.min_payout_minor || '{"GBP": 1000}'::jsonb, c.approval_above_minor, c.payout_day, 'weekly', 5,
  'PLACEHOLDER pending D1 to D5. Weekly on Fridays, 10.00 GBP floor carried forward (0039). Not a decision. Test mode only.'
from app.royalty_config() c;

-- Owner staff set new figures, now with the cadence and weekday. The old
-- signature goes so PostgREST has one function to match.
drop function if exists public.set_royalty_config(numeric, numeric, numeric, int, int, text, int, int, jsonb, jsonb, int, text, timestamptz);
create or replace function public.set_royalty_config(
  p_sale_rate_author numeric, p_sale_rate_author_link numeric, p_pool_share_author numeric,
  p_pool_step_cap int, p_pool_activity_floor int, p_fee_treatment text, p_refund_window_days int,
  p_first_payout_hold_days int, p_min_payout_minor jsonb, p_approval_above_minor jsonb, p_payout_day int,
  p_note text, p_effective_from timestamptz default null,
  p_payout_cadence text default 'weekly', p_payout_weekday int default 5
) returns bigint
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_before public.royalty_config;
  v_id     bigint;
begin
  if not app.is_platform(array['owner']) then
    raise exception 'only platform owners set royalty figures' using errcode = 'insufficient_privilege';
  end if;
  v_before := app.royalty_config();
  insert into public.royalty_config (effective_from, is_placeholder, sale_rate_author, sale_rate_author_link, pool_share_author,
    pool_step_cap, pool_activity_floor, fee_treatment, refund_window_days, first_payout_hold_days,
    min_payout_minor, approval_above_minor, payout_day, payout_cadence, payout_weekday, note, created_by)
  values (greatest(coalesce(p_effective_from, now()), now()), false, p_sale_rate_author, p_sale_rate_author_link, p_pool_share_author,
    p_pool_step_cap, p_pool_activity_floor, p_fee_treatment, p_refund_window_days, p_first_payout_hold_days,
    coalesce(p_min_payout_minor, '{}'::jsonb), coalesce(p_approval_above_minor, '{}'::jsonb), p_payout_day,
    coalesce(p_payout_cadence, 'weekly'), coalesce(p_payout_weekday, 5),
    nullif(btrim(coalesce(p_note, '')), ''), app.uid())
  returning id into v_id;
  perform app.audit('money.config_set', 'royalty_config:' || v_id::text, p_note, null, null,
    to_jsonb(v_before) - 'created_by', jsonb_build_object('sale_rate_author', p_sale_rate_author,
      'sale_rate_author_link', p_sale_rate_author_link, 'pool_share_author', p_pool_share_author, 'fee_treatment', p_fee_treatment,
      'payout_day', p_payout_day, 'payout_cadence', p_payout_cadence, 'payout_weekday', p_payout_weekday));
  return v_id;
end $$;
revoke execute on function public.set_royalty_config(numeric, numeric, numeric, int, int, text, int, int, jsonb, jsonb, int, text, timestamptz, text, int) from public, anon;
grant execute on function public.set_royalty_config(numeric, numeric, numeric, int, int, text, int, int, jsonb, jsonb, int, text, timestamptz, text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The sale channel.
-- ---------------------------------------------------------------------------
alter table public.purchases
  add column channel text check (channel is null or channel in ('marketplace','author_link'));
alter table public.royalty_lines
  add column channel text default 'marketplace' check (channel is null or channel in ('marketplace','author_link'));

-- Same as 0021 with the channel added. Returns 'recorded',
-- 'recorded_no_royalty' (Akana house, demo), 'unchanged', 'not_paid' or
-- 'membership_via_invoice'.
create or replace function app.record_sale_receipt(p_purchase uuid, p_livemode boolean, p_balance_txn text default null, p_fee_minor int default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  p     public.purchases%rowtype;
  w     public.workbooks%rowtype;
  cfg   public.royalty_config;
  v_rid uuid;
  v_at  timestamptz;
  v_ref text;
  v_base bigint;
  v_rate numeric(5,4);
  v_author bigint;
  v_channel text;
begin
  if not (app.is_service_role() or app.is_money_staff()) then
    raise exception 'only the service role records receipts' using errcode = 'insufficient_privilege';
  end if;
  select * into p from public.purchases where id = p_purchase;
  if not found then
    raise exception 'purchase % not found', p_purchase using errcode = 'no_data_found';
  end if;
  if p.kind <> 'workbook' then return 'membership_via_invoice'; end if;
  if p.status not in ('paid','refunded') then return 'not_paid'; end if;
  if exists (select 1 from public.royalty_receipts r where r.kind = 'sale' and r.purchase_id = p.id) then return 'unchanged'; end if;

  v_at := coalesce(p.paid_at, now());
  v_ref := coalesce(p.stripe_payment_intent_id, p.stripe_checkout_session_id);
  insert into public.royalty_receipts (kind, source, tenant_id, user_id, purchase_id, workbook_id, stripe_ref, payment_intent_id,
    balance_txn_id, currency, gross_minor, tax_minor, fee_minor, livemode, period, occurred_at)
  values ('sale', 'purchase', p.tenant_id, p.user_id, p.id, p.workbook_id, v_ref, p.stripe_payment_intent_id,
    p_balance_txn, upper(p.currency), p.amount_minor, p.tax_minor, p_fee_minor, coalesce(p_livemode, false), app.money_month(v_at), v_at)
  on conflict (kind, stripe_ref) do nothing
  returning id into v_rid;
  if v_rid is null then return 'unchanged'; end if;

  select * into w from public.workbooks where id = p.workbook_id;
  if w.is_demo or not app.org_earns(w.org_id) then return 'recorded_no_royalty'; end if;

  cfg := app.royalty_config();
  v_channel := coalesce(p.channel, 'marketplace');
  v_rate := case v_channel when 'author_link' then cfg.sale_rate_author_link else cfg.sale_rate_author end;
  v_base := app.royalty_base(p.amount_minor, p.tax_minor, p_fee_minor, cfg.fee_treatment);
  v_author := floor(v_base * v_rate);
  insert into public.royalty_lines (org_id, workbook_id, tenant_id, kind, period, currency, livemode, units, gross_minor, tax_minor,
    fee_minor, net_base_minor, rate, author_minor, akana_minor, is_placeholder_rate, receipt_id, idem_key, occurred_at, channel)
  values (w.org_id, w.id, p.tenant_id, 'sale', app.money_month(v_at), upper(p.currency), coalesce(p_livemode, false), 1,
    p.amount_minor, p.tax_minor, coalesce(p_fee_minor, 0), v_base, v_rate, v_author, v_base - v_author,
    cfg.is_placeholder, v_rid, 'sale:' || v_rid::text, v_at, v_channel)
  on conflict (idem_key) do nothing;
  return 'recorded';
end $$;

-- ---------------------------------------------------------------------------
-- 3. The Connect hold. The 0014 gate that kept a paid title from going live
-- until payouts were verified is removed: the title goes live, the money
-- waits (payout_candidates skips the organisation as 'unverified').
-- ---------------------------------------------------------------------------
drop trigger if exists workbooks_status_payout_gate on public.workbooks;
drop function if exists app.guard_workbook_payout_ready();

-- Organisations whose earnings are waiting on Connect: not verified, not
-- Akana house or demo, still active, with a positive balance. One row per
-- organisation and currency. Service role only (the daily job mails the
-- organisation's owner and finance contacts through payout_contacts).
create or replace function public.connect_nudge_candidates(p_livemode boolean)
returns table (org_id uuid, display_name text, connect_status text, currency text, balance_minor bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_service_role() then
    raise exception 'only the service role reads nudge candidates' using errcode = 'insufficient_privilege';
  end if;
  return query
    select o.id, o.display_name, o.connect_status, b.currency::text, b.balance_minor
    from public.royalty_balances b
    join public.organisations o on o.id = b.org_id
    where b.livemode = p_livemode
      and b.balance_minor > 0
      and o.kind <> 'akana_house' and not o.is_demo
      and o.status in ('invited','active')
      and o.connect_status <> 'verified'
    order by o.id, b.currency;
end $$;
revoke execute on function public.connect_nudge_candidates(boolean) from public, anon, authenticated;
grant execute on function public.connect_nudge_candidates(boolean) to service_role;

-- ---------------------------------------------------------------------------
-- 4. The schedule the Studio publishes. Any signed-in user may read it: it
-- carries no money and no organisation, only the figures in force.
-- ---------------------------------------------------------------------------
create or replace function public.payout_schedule()
returns table (payout_cadence text, payout_weekday int, payout_day int, min_payout_minor jsonb,
               sale_rate_author numeric, sale_rate_author_link numeric, fee_treatment text,
               refund_window_days int, first_payout_hold_days int, is_placeholder boolean)
language sql stable security definer set search_path = '' as $$
  select c.payout_cadence, c.payout_weekday, c.payout_day, c.min_payout_minor,
         c.sale_rate_author, c.sale_rate_author_link, c.fee_treatment,
         c.refund_window_days, c.first_payout_hold_days, c.is_placeholder
  from app.royalty_config() c
  where app.uid() is not null
$$;
revoke execute on function public.payout_schedule() from public, anon;
grant execute on function public.payout_schedule() to authenticated, service_role;
