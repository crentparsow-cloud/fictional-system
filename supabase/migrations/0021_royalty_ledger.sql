-- 0021 Royalty ledger: money in, money owed and money out (M6: F-100,
-- F-101, F-102, F-103).
--
-- Same rules as 0001 to 0018. Every new table has RLS on, grants to anon and
-- authenticated are revoked and given back table by table, functions are
-- security definer with search_path pinned to '', and every function a
-- client may reach has execute revoked from public first. Nothing earlier is
-- edited. Depends on 0001, 0003, 0004, 0009 and 0014 (applied in production).
--
-- ===========================================================================
-- FOR OTHER BUILDERS (author earnings dashboards, 0022): what to read
-- ===========================================================================
--   public.royalty_lines         the ledger. One row per sale, refund,
--                                dispute, pool allocation, fee correction,
--                                adjustment, payout and payout reversal for
--                                one organisation. Append-only. author_minor
--                                is the signed amount owed to the
--                                organisation (minus means it owes back).
--                                RLS: platform owner and finance, and members
--                                of the organisation whose role has
--                                statements:read (owner, finance, author).
--   public.statements            one row per organisation, month, currency
--                                and livemode, written when the month closes
--                                (after the refund window). Same RLS.
--   public.payouts               transfers to the organisation's Connect
--                                account. RLS: owner and finance staff, and
--                                members with payouts:read.
--   public.royalty_balances      VIEW (security invoker, so the RLS above
--                                applies): balance, payable and pending per
--                                organisation, currency and livemode.
--   public.royalty_title_months  VIEW (security invoker): per organisation,
--                                workbook, month, currency and livemode:
--                                units, gross, VAT, fees, refunds, pool and
--                                the author amount.
--   Statement files: GET /api/statements/<statement id>?format=pdf|csv
--   (apps/web/app/api/statements/[id]/route.ts) renders either on demand
--   through the caller's own client, so RLS decides who may download.
--   Never read royalty_receipts or pool_usage from a dashboard: they are
--   staff only (receipts carry the reader's user id for the pool split).
--   Show livemode = false rows as test data, or hide them.
-- ===========================================================================
--
-- The shape of trust here:
--   * PLACEHOLDER RATES. Questions D1 to D4 (charge model, revenue share,
--     pool share and basis, royalty base) are NOT answered. Every figure in
--     public.royalty_config is seeded with is_placeholder = true. Each ledger
--     line copies the rate it used and whether it was a placeholder, so a
--     statement says "provisional" until Crent sets real figures. A payout
--     in live mode is refused while the config is a placeholder.
--   * Money in (royalty_receipts) is written by the Stripe webhook and the
--     daily reconciliation, through the functions below, with the service
--     role. Net receipts are gross less VAT, less the Stripe fee when
--     fee_treatment is 'deduct' (D4's recommended answer). Fees not known at
--     the time are filled in later by reconciliation as fee_correction rows.
--   * Money owed (royalty_lines) is append-only. A trigger refuses every
--     update and delete, for every role. Corrections are new lines. A line
--     whose month already has a closed statement for that organisation is
--     moved to the next open month, so a late refund is taken from the next
--     statement (D6's recommended answer).
--   * The membership pool (D3, as recommended): each month, per currency,
--     each subscriber's own net receipts times the pool share are split
--     across the workbooks they completed steps in, weighted by completed
--     steps capped per workbook (user-centric). Subscribers below the
--     activity floor allocate nothing. Rounding is down to the minor unit;
--     what is left stays with Akana and is recorded on the pool period.
--   * Money out (payouts) runs monthly on the payout day, in test mode, from
--     the payable balance: lines in closed statements plus payouts already
--     made, never more than the whole balance. Organisations with a hold,
--     unverified Connect, missing tax details or an unsupported country, a
--     balance below the minimum, or a first payout still inside the hold
--     period are skipped with a reason. Above the approval threshold a
--     payout waits for a member of staff to approve it.
--   * Refunds from the console (F-102) record a refund receipt and reverse
--     the author's share in the ledger. If the author has already been paid,
--     staff may reclaim it at once with a transfer reversal, recorded as a
--     payout_reversal line; otherwise it comes off the next statement.
--   * No reader names anywhere. Receipts carry a user id for the pool split
--     only and are staff only; pool_usage carries a salted hash.

-- ---------------------------------------------------------------------------
-- 1. Months. Akana's accounting month is the calendar month in London.
-- ---------------------------------------------------------------------------
create or replace function app.money_month(p_at timestamptz) returns text
language sql stable set search_path = '' as $$
  select to_char(p_at at time zone 'Europe/London', 'YYYY-MM')
$$;

create or replace function app.month_after(p_period text) returns text
language sql immutable set search_path = '' as $$
  select to_char(to_date(p_period || '-01', 'YYYY-MM-DD') + interval '1 month', 'YYYY-MM')
$$;

-- The instant the month starts in London.
create or replace function app.month_start(p_period text) returns timestamptz
language sql stable set search_path = '' as $$
  select (to_date(p_period || '-01', 'YYYY-MM-DD')::timestamp) at time zone 'Europe/London'
$$;

-- Money staff: platform owners and finance.
create or replace function app.is_money_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_platform(array['owner','finance'])
$$;

-- ---------------------------------------------------------------------------
-- 2. Config. Effective-dated and append-only: a change is a new row, so the
-- history of every rate is kept. app.royalty_config() returns the row in
-- force now.
--
-- PLACEHOLDER: every value below is a stand-in so the code has something to
-- run on in test mode. None is a decision. Crent sets them (D1 to D5):
--   sale_rate_author        D2  author share of net receipts on a single sale
--   sale_rate_author_link   D2  second rate for sales through the author's own
--                               link; kept for later, not used at launch
--   pool_share_author       D3  share of membership net receipts in the pool
--   pool_step_cap           D3  completed steps counted per subscriber per
--                               workbook per month
--   pool_activity_floor     D3  capped steps a subscriber needs in a month for
--                               their share to be allocated
--   fee_treatment           D4  'deduct': Stripe fees come off before the
--                               share; 'akana_carries': Akana carries them
--   refund_window_days      D5  a month closes this many days after it ends.
--                               14 follows the refund policy's window.
--   first_payout_hold_days  D5  no first payout until the first sale is this old
--   min_payout_minor        D5  per currency; a currency missing here is not paid
--   approval_above_minor    D5  per currency; above this a person approves
--   payout_day              D5  day of the month the payout run acts on
-- ---------------------------------------------------------------------------
create table public.royalty_config (
  id                     bigint generated always as identity primary key,
  effective_from         timestamptz not null default now(),
  is_placeholder         boolean not null,
  sale_rate_author       numeric(5,4) not null check (sale_rate_author between 0 and 1),
  sale_rate_author_link  numeric(5,4) not null check (sale_rate_author_link between 0 and 1),
  pool_share_author      numeric(5,4) not null check (pool_share_author between 0 and 1),
  pool_step_cap          int not null check (pool_step_cap between 1 and 1000),
  pool_activity_floor    int not null check (pool_activity_floor between 0 and 1000),
  fee_treatment          text not null check (fee_treatment in ('deduct','akana_carries')),
  refund_window_days     int not null check (refund_window_days between 0 and 120),
  first_payout_hold_days int not null check (first_payout_hold_days between 0 and 365),
  min_payout_minor       jsonb not null check (jsonb_typeof(min_payout_minor) = 'object'),
  approval_above_minor   jsonb not null check (jsonb_typeof(approval_above_minor) = 'object'),
  payout_day             int not null check (payout_day between 1 and 28),
  note                   text check (note is null or char_length(note) <= 500),
  created_by             uuid references auth.users(id) on delete set null,
  created_at             timestamptz not null default now()
);
create index royalty_config_effective_idx on public.royalty_config(effective_from desc);

insert into public.royalty_config (effective_from, is_placeholder, sale_rate_author, sale_rate_author_link, pool_share_author,
  pool_step_cap, pool_activity_floor, fee_treatment, refund_window_days, first_payout_hold_days,
  min_payout_minor, approval_above_minor, payout_day, note)
values ('2026-01-01T00:00:00Z', true, 0.5000, 0.5000, 0.5000,
  20, 1, 'deduct', 14, 30,
  '{"GBP": 2500, "USD": 2500, "EUR": 2500}'::jsonb, '{"GBP": 100000, "USD": 100000, "EUR": 100000}'::jsonb, 15,
  'PLACEHOLDER pending D1 to D5. Not a decision. Test mode only.');

create or replace function app.royalty_config() returns public.royalty_config
language sql stable security definer set search_path = '' as $$
  select c from public.royalty_config c where c.effective_from <= now() order by c.effective_from desc, c.id desc limit 1
$$;

-- Owner staff set new figures. Effective now unless a later time is given.
-- Always is_placeholder = false: setting a figure on purpose is a decision.
create or replace function public.set_royalty_config(
  p_sale_rate_author numeric, p_sale_rate_author_link numeric, p_pool_share_author numeric,
  p_pool_step_cap int, p_pool_activity_floor int, p_fee_treatment text, p_refund_window_days int,
  p_first_payout_hold_days int, p_min_payout_minor jsonb, p_approval_above_minor jsonb, p_payout_day int,
  p_note text, p_effective_from timestamptz default null
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
    min_payout_minor, approval_above_minor, payout_day, note, created_by)
  values (greatest(coalesce(p_effective_from, now()), now()), false, p_sale_rate_author, p_sale_rate_author_link, p_pool_share_author,
    p_pool_step_cap, p_pool_activity_floor, p_fee_treatment, p_refund_window_days, p_first_payout_hold_days,
    coalesce(p_min_payout_minor, '{}'::jsonb), coalesce(p_approval_above_minor, '{}'::jsonb), p_payout_day,
    nullif(btrim(coalesce(p_note, '')), ''), app.uid())
  returning id into v_id;
  perform app.audit('money.config_set', 'royalty_config:' || v_id::text, p_note, null, null,
    to_jsonb(v_before) - 'created_by', jsonb_build_object('sale_rate_author', p_sale_rate_author,
      'pool_share_author', p_pool_share_author, 'fee_treatment', p_fee_treatment, 'payout_day', p_payout_day));
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Receipts: money in and back out, as Stripe saw it. Staff only.
--   kind sale              a single workbook purchase (source purchase)
--   kind membership        a paid membership invoice (source membership)
--   kind refund, dispute   money back out (negative gross)
--   kind dispute_reversal  a dispute won (positive gross)
--   kind fee_correction    the Stripe fee learned later (gross 0)
-- period: for membership rows, the pool month they count in (moved forward
-- past a closed pool, like ledger lines); otherwise the London month.
-- ---------------------------------------------------------------------------
create table public.royalty_receipts (
  id                      uuid primary key default gen_random_uuid(),
  kind                    text not null check (kind in ('sale','membership','refund','dispute','dispute_reversal','fee_correction')),
  source                  text not null check (source in ('purchase','membership')),
  tenant_id               uuid not null references public.tenants(id),
  user_id                 uuid references auth.users(id) on delete set null,
  purchase_id             uuid references public.purchases(id),
  subscription_invoice_id uuid references public.subscription_invoices(id),
  workbook_id             uuid references public.workbooks(id),
  original_receipt_id     uuid references public.royalty_receipts(id),
  stripe_ref              text not null check (char_length(stripe_ref) between 3 and 255),
  payment_intent_id       text check (payment_intent_id is null or payment_intent_id ~ '^pi_[A-Za-z0-9_]+$'),
  balance_txn_id          text check (balance_txn_id is null or balance_txn_id ~ '^txn_[A-Za-z0-9_]+$'),
  currency                char(3) not null check (currency ~ '^[A-Z]{3}$'),
  gross_minor             integer not null,
  tax_minor               integer not null default 0,
  fee_minor               integer,
  livemode                boolean not null,
  period                  text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  occurred_at             timestamptz not null,
  reason                  text check (reason is null or char_length(reason) <= 200),
  created_at              timestamptz not null default now(),
  unique (kind, stripe_ref),
  constraint royalty_receipts_original check ((kind in ('sale','membership')) = (original_receipt_id is null))
);
create index royalty_receipts_pi_idx on public.royalty_receipts(payment_intent_id);
create index royalty_receipts_txn_idx on public.royalty_receipts(balance_txn_id);
create index royalty_receipts_original_idx on public.royalty_receipts(original_receipt_id);
create index royalty_receipts_purchase_idx on public.royalty_receipts(purchase_id);
create index royalty_receipts_pool_idx on public.royalty_receipts(source, period, currency, livemode, tenant_id);
create index royalty_receipts_occurred_idx on public.royalty_receipts(occurred_at);

-- ---------------------------------------------------------------------------
-- 4. Pool periods and usage (D3). One period per tenant, month, currency and
-- livemode. usage is per subscriber per workbook: a salted hash, never the id.
-- ---------------------------------------------------------------------------
create table public.pool_periods (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id),
  period            text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  currency          char(3) not null check (currency ~ '^[A-Z]{3}$'),
  livemode          boolean not null,
  net_receipts_minor bigint not null,
  share_rate        numeric(5,4) not null,
  pool_minor        bigint not null,
  allocated_minor   bigint not null,
  unallocated_minor bigint not null,
  subscribers       int not null,
  active_subscribers int not null,
  step_cap          int not null,
  activity_floor    int not null,
  fee_treatment     text not null,
  is_placeholder    boolean not null,
  closed_at         timestamptz not null default now(),
  unique (tenant_id, period, currency, livemode)
);

create table public.pool_usage (
  period_id      uuid not null references public.pool_periods(id) on delete cascade,
  user_hash      text not null check (user_hash ~ '^[0-9a-f]{64}$'),
  workbook_id    uuid not null references public.workbooks(id),
  steps_capped   int not null check (steps_capped > 0),
  net_share_minor bigint not null,
  allocated_minor bigint not null,
  primary key (period_id, user_hash, workbook_id)
);
create index pool_usage_workbook_idx on public.pool_usage(workbook_id);

-- ---------------------------------------------------------------------------
-- 5. Statements (F-101) and the ledger (F-100).
-- ---------------------------------------------------------------------------
create table public.statements (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organisations(id),
  period             text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  currency           char(3) not null check (currency ~ '^[A-Z]{3}$'),
  livemode           boolean not null,
  opening_minor      bigint not null,
  sales_minor        bigint not null,
  refunds_minor      bigint not null,
  pool_minor         bigint not null,
  adjustments_minor  bigint not null,
  payouts_minor      bigint not null,
  closing_minor      bigint not null,
  units              int not null,
  line_count         int not null,
  is_placeholder_rate boolean not null,
  closed_at          timestamptz not null default now(),
  unique (org_id, period, currency, livemode)
);
create index statements_period_idx on public.statements(period);

create table public.payout_runs (
  id           uuid primary key default gen_random_uuid(),
  livemode     boolean not null,
  trigger      text not null check (trigger in ('cron','staff')),
  started_by   uuid references auth.users(id) on delete set null,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  summary      jsonb not null default '{}'::jsonb
);

create table public.payouts (
  id                 uuid primary key default gen_random_uuid(),
  run_id             uuid references public.payout_runs(id),
  org_id             uuid not null references public.organisations(id),
  currency           char(3) not null check (currency ~ '^[A-Z]{3}$'),
  livemode           boolean not null,
  amount_minor       bigint not null check (amount_minor > 0),
  status             text not null check (status in ('awaiting_approval','pending','paid','failed','cancelled')),
  stripe_destination text check (stripe_destination is null or stripe_destination ~ '^acct_[A-Za-z0-9]+$'),
  stripe_transfer_id text unique check (stripe_transfer_id is null or stripe_transfer_id ~ '^tr_[A-Za-z0-9]+$'),
  reversed_minor     bigint not null default 0 check (reversed_minor >= 0),
  approved_by        uuid references auth.users(id) on delete set null,
  approved_at        timestamptz,
  failure_code       text check (failure_code is null or char_length(failure_code) <= 80),
  created_at         timestamptz not null default now(),
  paid_at            timestamptz,
  constraint payouts_reversed_le_amount check (reversed_minor <= amount_minor)
);
create index payouts_org_idx on public.payouts(org_id, currency, livemode);
create index payouts_run_idx on public.payouts(run_id);
create unique index payouts_one_open_idx on public.payouts(org_id, currency, livemode)
  where status in ('awaiting_approval','pending');

create table public.royalty_lines (
  id                 uuid primary key default gen_random_uuid(),
  seq                bigint generated always as identity unique,
  org_id             uuid not null references public.organisations(id),
  workbook_id        uuid references public.workbooks(id),
  tenant_id          uuid references public.tenants(id),
  kind               text not null check (kind in ('sale','refund','dispute','dispute_reversal','pool','fee_correction','adjustment','payout','payout_reversal','withholding')),
  period             text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  currency           char(3) not null check (currency ~ '^[A-Z]{3}$'),
  livemode           boolean not null,
  units              int not null default 0,
  gross_minor        bigint not null default 0,
  tax_minor          bigint not null default 0,
  fee_minor          bigint not null default 0,
  net_base_minor     bigint not null default 0,
  rate               numeric(5,4),
  author_minor       bigint not null,
  akana_minor        bigint not null default 0,
  is_placeholder_rate boolean not null default false,
  receipt_id         uuid references public.royalty_receipts(id),
  pool_period_id     uuid references public.pool_periods(id),
  payout_id          uuid references public.payouts(id),
  reverses_line_id   uuid references public.royalty_lines(id),
  idem_key           text not null unique check (char_length(idem_key) between 3 and 300),
  note               text check (note is null or char_length(note) <= 300),
  created_by         uuid references auth.users(id) on delete set null,
  occurred_at        timestamptz not null,
  created_at         timestamptz not null default now()
);
create index royalty_lines_org_idx on public.royalty_lines(org_id, currency, livemode, period);
create index royalty_lines_workbook_idx on public.royalty_lines(workbook_id, period);
create index royalty_lines_receipt_idx on public.royalty_lines(receipt_id);
create index royalty_lines_reverses_idx on public.royalty_lines(reverses_line_id);
create index royalty_lines_payout_idx on public.royalty_lines(payout_id);
create index royalty_lines_pool_idx on public.royalty_lines(pool_period_id);

create table public.payout_holds (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organisations(id),
  reason       text not null check (char_length(btrim(reason)) between 3 and 500),
  placed_by    uuid references auth.users(id) on delete set null,
  placed_at    timestamptz not null default now(),
  released_by  uuid references auth.users(id) on delete set null,
  released_at  timestamptz,
  release_note text check (release_note is null or char_length(release_note) <= 500)
);
create index payout_holds_org_idx on public.payout_holds(org_id) where released_at is null;

create table public.reconciliation_runs (
  id           uuid primary key default gen_random_uuid(),
  livemode     boolean not null,
  window_from  timestamptz not null,
  window_to    timestamptz not null,
  stripe_txns  int not null,
  matched      int not null,
  corrected    int not null,
  issues       int not null,
  ran_at       timestamptz not null default now()
);
create index reconciliation_runs_at_idx on public.reconciliation_runs(ran_at desc);

create table public.reconciliation_items (
  id             uuid primary key default gen_random_uuid(),
  run_id         uuid not null references public.reconciliation_runs(id) on delete cascade,
  kind           text not null check (kind in ('missing_in_ledger','missing_in_stripe','amount_mismatch','fee_mismatch','fee_corrected','currency_mismatch','unmatched_type')),
  stripe_ref     text check (stripe_ref is null or char_length(stripe_ref) <= 255),
  balance_txn_id text check (balance_txn_id is null or char_length(balance_txn_id) <= 255),
  receipt_id     uuid references public.royalty_receipts(id),
  currency       char(3),
  expected_minor bigint,
  actual_minor   bigint,
  note           text check (note is null or char_length(note) <= 300),
  resolved_at    timestamptz,
  resolved_by    uuid references auth.users(id) on delete set null,
  resolution     text check (resolution is null or char_length(resolution) <= 500)
);
create index reconciliation_items_open_idx on public.reconciliation_items(run_id) where resolved_at is null;

-- ---------------------------------------------------------------------------
-- 6. Append-only, and lines find their month.
-- ---------------------------------------------------------------------------
create or replace function app.refuse_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception '% is append-only: add a correcting row instead', tg_table_name using errcode = 'insufficient_privilege';
end $$;
create trigger royalty_lines_append_only before update or delete on public.royalty_lines
  for each row execute function app.refuse_change();
create trigger royalty_receipts_append_only before update or delete on public.royalty_receipts
  for each row execute function app.refuse_change();
create trigger royalty_config_append_only before update or delete on public.royalty_config
  for each row execute function app.refuse_change();
create trigger statements_append_only before update or delete on public.statements
  for each row execute function app.refuse_change();

-- A line's month is the month it happened, moved forward past any month that
-- already has a closed statement for that organisation, currency and
-- livemode. The organisation row is locked so a statement cannot close in
-- between.
create or replace function app.royalty_line_period() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_period text := app.money_month(new.occurred_at);
begin
  perform 1 from public.organisations where id = new.org_id for update;
  while exists (select 1 from public.statements s
                 where s.org_id = new.org_id and s.period = v_period and s.currency = new.currency and s.livemode = new.livemode) loop
    v_period := app.month_after(v_period);
  end loop;
  new.period := v_period;
  return new;
end $$;
create trigger royalty_lines_period before insert on public.royalty_lines
  for each row execute function app.royalty_line_period();

-- Membership money counts in the pool month it arrived, or the next open one.
create or replace function app.royalty_receipt_period() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_period text := app.money_month(new.occurred_at);
begin
  if new.source = 'membership' then
    while exists (select 1 from public.pool_periods p
                   where p.tenant_id = new.tenant_id and p.period = v_period and p.currency = new.currency and p.livemode = new.livemode) loop
      v_period := app.month_after(v_period);
    end loop;
  end if;
  new.period := v_period;
  return new;
end $$;
create trigger royalty_receipts_period before insert on public.royalty_receipts
  for each row execute function app.royalty_receipt_period();

-- The share base for one receipt: gross less VAT, less the fee when fees
-- are deducted.
create or replace function app.royalty_base(p_gross bigint, p_tax bigint, p_fee bigint, p_treatment text) returns bigint
language sql immutable set search_path = '' as $$
  select greatest(0, p_gross - p_tax - case when p_treatment = 'deduct' then coalesce(p_fee, 0) else 0 end)
$$;

-- Does this organisation earn royalties? Akana house and demo organisations do not.
create or replace function app.org_earns(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.organisations o where o.id = p_org and o.kind <> 'akana_house' and not o.is_demo)
$$;

-- ---------------------------------------------------------------------------
-- 7. Money in from the webhook (service role).
-- ---------------------------------------------------------------------------

-- A paid single-workbook purchase. Idempotent. Writes the receipt, then one
-- sale line for the workbook's organisation at the configured rate. Returns
-- 'recorded', 'recorded_no_royalty' (Akana house, demo), 'unchanged',
-- 'not_paid' or 'membership_via_invoice'.
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
  v_author bigint;
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
  v_base := app.royalty_base(p.amount_minor, p.tax_minor, p_fee_minor, cfg.fee_treatment);
  v_author := floor(v_base * cfg.sale_rate_author);
  insert into public.royalty_lines (org_id, workbook_id, tenant_id, kind, period, currency, livemode, units, gross_minor, tax_minor,
    fee_minor, net_base_minor, rate, author_minor, akana_minor, is_placeholder_rate, receipt_id, idem_key, occurred_at)
  values (w.org_id, w.id, p.tenant_id, 'sale', app.money_month(v_at), upper(p.currency), coalesce(p_livemode, false), 1,
    p.amount_minor, p.tax_minor, coalesce(p_fee_minor, 0), v_base, cfg.sale_rate_author, v_author, v_base - v_author,
    cfg.is_placeholder, v_rid, 'sale:' || v_rid::text, v_at)
  on conflict (idem_key) do nothing;
  return 'recorded';
end $$;

-- A paid membership invoice (already recorded by app.record_subscription_invoice).
-- No lines: the money waits in the pool month. Returns 'recorded',
-- 'unchanged', 'unlinked' (no invoice row yet) or 'not_paid'.
create or replace function app.record_membership_receipt(p_invoice text, p_livemode boolean, p_payment_intent text default null,
  p_balance_txn text default null, p_fee_minor int default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  i     public.subscription_invoices%rowtype;
  v_rid uuid;
  v_at  timestamptz;
begin
  if not (app.is_service_role() or app.is_money_staff()) then
    raise exception 'only the service role records receipts' using errcode = 'insufficient_privilege';
  end if;
  select * into i from public.subscription_invoices where stripe_invoice_id = p_invoice;
  if not found then return 'unlinked'; end if;
  if i.status <> 'paid' then return 'not_paid'; end if;
  if i.amount_minor <= 0 then return 'unchanged'; end if;
  v_at := coalesce(i.paid_at, now());
  insert into public.royalty_receipts (kind, source, tenant_id, user_id, subscription_invoice_id, stripe_ref, payment_intent_id,
    balance_txn_id, currency, gross_minor, tax_minor, fee_minor, livemode, period, occurred_at)
  values ('membership', 'membership', i.tenant_id, i.user_id, i.id, i.stripe_invoice_id, p_payment_intent,
    p_balance_txn, upper(i.currency), i.amount_minor, i.tax_minor, p_fee_minor, coalesce(p_livemode, false), app.money_month(v_at), v_at)
  on conflict (kind, stripe_ref) do nothing
  returning id into v_rid;
  return case when v_rid is null then 'unchanged' else 'recorded' end;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Money back out: refunds, disputes and disputes won (F-102). Called by
-- the webhook (service role) and by the refund console (owner or finance
-- staff). Idempotent on the Stripe id (re_, du_ or dp_). The amount is
-- capped at what is left of the payment. For a sale, the author's share is
-- reversed in proportion; the refund that takes the payment to nothing
-- reverses whatever is left, so rounding never strands a penny. A full
-- refund of a single purchase also revokes its entitlement, like
-- app.revoke_purchase_entitlement, so the reader loses access at once.
-- Returns 'recorded', 'unchanged', 'no_receipt' or 'nothing_left'.
-- ---------------------------------------------------------------------------
create or replace function app.record_refund(
  p_kind text, p_ref text, p_payment_intent text, p_amount_minor int, p_currency text,
  p_livemode boolean, p_occurred_at timestamptz default null, p_reason text default null
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  r        public.royalty_receipts%rowtype;
  l        public.royalty_lines%rowtype;
  v_sign   int := case when p_kind = 'dispute_reversal' then 1 else -1 end;
  v_taken  bigint;
  v_after  bigint;
  v_amount bigint := p_amount_minor;
  v_tax    bigint;
  v_rid    uuid;
  v_at     timestamptz := coalesce(p_occurred_at, now());
  v_left   bigint;
  v_share  bigint;
  v_author bigint;
  v_base   bigint;
  v_full   boolean;
  n        int;
begin
  if not (app.is_service_role() or app.is_money_staff()) then
    raise exception 'only the service role or owner and finance staff record refunds' using errcode = 'insufficient_privilege';
  end if;
  if p_kind is null or p_kind not in ('refund','dispute','dispute_reversal') then
    raise exception 'refund kind must be refund, dispute or dispute_reversal' using errcode = 'check_violation';
  end if;
  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'refund amount must be positive' using errcode = 'check_violation';
  end if;
  if p_ref is null or char_length(p_ref) < 3 then
    raise exception 'refund reference is required' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.royalty_receipts x where x.kind = p_kind and x.stripe_ref = p_ref) then return 'unchanged'; end if;

  select * into r from public.royalty_receipts x
   where x.payment_intent_id = p_payment_intent and x.kind in ('sale','membership')
   order by x.created_at limit 1
   for update;
  if not found then return 'no_receipt'; end if;
  if upper(coalesce(p_currency, r.currency)) <> r.currency then
    raise exception 'refund currency % does not match the payment currency %', p_currency, r.currency using errcode = 'check_violation';
  end if;

  -- What has already gone back: refunds and disputes, less disputes won.
  select coalesce(-sum(x.gross_minor), 0) into v_taken from public.royalty_receipts x
   where x.original_receipt_id = r.id and x.kind in ('refund','dispute','dispute_reversal');
  if v_sign < 0 then
    v_amount := least(v_amount, r.gross_minor - v_taken);
    if v_amount <= 0 then return 'nothing_left'; end if;
  else
    v_amount := least(v_amount, v_taken);
    if v_amount <= 0 then return 'nothing_left'; end if;
  end if;
  v_after := v_taken - v_sign * v_amount;
  v_full := v_sign < 0 and v_after >= r.gross_minor;
  v_tax := case when r.gross_minor > 0 then round(r.tax_minor::numeric * v_amount / r.gross_minor) else 0 end;

  insert into public.royalty_receipts (kind, source, tenant_id, user_id, purchase_id, subscription_invoice_id, workbook_id,
    original_receipt_id, stripe_ref, payment_intent_id, currency, gross_minor, tax_minor, fee_minor, livemode, period, occurred_at, reason)
  values (p_kind, r.source, r.tenant_id, r.user_id, r.purchase_id, r.subscription_invoice_id, r.workbook_id,
    r.id, p_ref, r.payment_intent_id, r.currency, v_sign * v_amount, v_sign * v_tax, 0, coalesce(p_livemode, r.livemode),
    app.money_month(v_at), v_at, left(p_reason, 200))
  returning id into v_rid;

  if r.source = 'purchase' then
    select * into l from public.royalty_lines x where x.receipt_id = r.id and x.kind = 'sale';
    if found then
      -- the author's whole share of this sale after fee corrections, and
      -- what they still hold of it after refunds and disputes
      select l.author_minor + coalesce(sum(x.author_minor) filter (where x.kind = 'fee_correction'), 0),
             l.author_minor + coalesce(sum(x.author_minor), 0)
        into v_share, v_left
        from public.royalty_lines x
       where x.reverses_line_id = l.id and x.kind in ('refund','dispute','dispute_reversal','fee_correction');
      if v_sign < 0 then
        v_author := case when v_full then v_left else least(v_left, floor(v_share::numeric * v_amount / r.gross_minor)) end;
        v_author := -greatest(v_author, 0);
      else
        v_author := least(v_share - v_left, floor(v_share::numeric * v_amount / r.gross_minor));
        v_author := greatest(v_author, 0);
      end if;
      v_base := v_sign * floor(l.net_base_minor::numeric * v_amount / r.gross_minor);
      insert into public.royalty_lines (org_id, workbook_id, tenant_id, kind, period, currency, livemode, units, gross_minor, tax_minor,
        fee_minor, net_base_minor, rate, author_minor, akana_minor, is_placeholder_rate, receipt_id, reverses_line_id, idem_key,
        note, created_by, occurred_at)
      values (l.org_id, l.workbook_id, l.tenant_id, p_kind, app.money_month(v_at), l.currency, l.livemode,
        case when v_full then -1 when p_kind = 'dispute_reversal' and v_after = 0 and v_taken >= r.gross_minor then 1 else 0 end,
        v_sign * v_amount, v_sign * v_tax, 0, v_base, l.rate, v_author, v_base - v_author, l.is_placeholder_rate, v_rid, l.id,
        p_kind || ':' || p_ref, left(p_reason, 300), app.uid(), v_at);
    end if;

    if v_full and p_kind = 'refund' and r.purchase_id is not null then
      update public.entitlements set status = 'revoked' where purchase_id = r.purchase_id and status <> 'revoked';
      get diagnostics n = row_count;
      update public.purchases set status = 'refunded', refunded_at = coalesce(refunded_at, now())
       where id = r.purchase_id and status <> 'refunded';
      if n > 0 or found then
        perform app.audit('commerce.revoke_entitlement', 'purchase:' || r.purchase_id::text, 'refund', r.tenant_id, null,
          null, jsonb_build_object('status', 'refunded', 'entitlements_revoked', n));
      end if;
    end if;
  end if;

  perform app.audit('money.' || p_kind || '_recorded', 'receipt:' || r.id::text, left(p_reason, 200), r.tenant_id, l.org_id, null,
    jsonb_build_object('stripe_ref', p_ref, 'amount_minor', v_amount, 'currency', r.currency, 'full', v_full));
  return 'recorded';
end $$;

-- ---------------------------------------------------------------------------
-- 9. Fee learned later (daily reconciliation). Records the difference
-- between the fee Stripe charged and the fee known so far, dated with the
-- original payment so it lands in the same month if that month is open. For a sale with
-- fees deducted, the author's share moves by the rate times the difference.
-- Returns 'corrected', 'unchanged' or 'no_receipt'.
-- ---------------------------------------------------------------------------
create or replace function app.record_fee_correction(p_receipt uuid, p_fee_minor int, p_balance_txn text default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  r      public.royalty_receipts%rowtype;
  l      public.royalty_lines%rowtype;
  cfg    public.royalty_config;
  v_known bigint;
  v_delta bigint;
  v_rid  uuid;
  v_adj  bigint;
begin
  if not (app.is_service_role() or app.is_money_staff()) then
    raise exception 'only the service role corrects fees' using errcode = 'insufficient_privilege';
  end if;
  if p_fee_minor is null or p_fee_minor < 0 then
    raise exception 'fee must be zero or more' using errcode = 'check_violation';
  end if;
  select * into r from public.royalty_receipts where id = p_receipt and kind in ('sale','membership') for update;
  if not found then return 'no_receipt'; end if;
  select coalesce(r.fee_minor, 0) + coalesce(sum(x.fee_minor), 0) into v_known from public.royalty_receipts x
   where x.original_receipt_id = r.id and x.kind = 'fee_correction';
  v_delta := p_fee_minor - v_known;
  if v_delta = 0 then return 'unchanged'; end if;

  insert into public.royalty_receipts (kind, source, tenant_id, user_id, purchase_id, subscription_invoice_id, workbook_id,
    original_receipt_id, stripe_ref, payment_intent_id, balance_txn_id, currency, gross_minor, tax_minor, fee_minor, livemode, period, occurred_at)
  values ('fee_correction', r.source, r.tenant_id, r.user_id, r.purchase_id, r.subscription_invoice_id, r.workbook_id,
    r.id, 'fee:' || r.id::text || ':' || p_fee_minor::text, r.payment_intent_id, coalesce(p_balance_txn, r.balance_txn_id), r.currency,
    0, 0, v_delta, r.livemode, app.money_month(r.occurred_at), r.occurred_at)
  on conflict (kind, stripe_ref) do nothing
  returning id into v_rid;
  if v_rid is null then return 'unchanged'; end if;

  if r.source = 'purchase' then
    cfg := app.royalty_config();
    select * into l from public.royalty_lines x where x.receipt_id = r.id and x.kind = 'sale';
    if found and cfg.fee_treatment = 'deduct' then
      v_adj := case when v_delta > 0 then -1 else 1 end * floor(abs(v_delta) * l.rate);
      insert into public.royalty_lines (org_id, workbook_id, tenant_id, kind, period, currency, livemode, fee_minor, net_base_minor,
        rate, author_minor, akana_minor, is_placeholder_rate, receipt_id, reverses_line_id, idem_key, note, occurred_at)
      values (l.org_id, l.workbook_id, l.tenant_id, 'fee_correction', app.money_month(r.occurred_at), l.currency, l.livemode, v_delta, -v_delta,
        l.rate, v_adj, -v_delta - v_adj, l.is_placeholder_rate, v_rid, l.id, 'fee_correction:' || v_rid::text,
        'Stripe fee confirmed by reconciliation', r.occurred_at);
    end if;
  end if;
  return 'corrected';
end $$;

-- ---------------------------------------------------------------------------
-- 10. Close a pool month (D3). Idempotent: a closed month returns its id.
-- Refuses to close a month before it has ended plus the refund window.
-- ---------------------------------------------------------------------------
create or replace function app.close_pool_period(p_tenant uuid, p_period text, p_currency text, p_livemode boolean)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  cfg      public.royalty_config := app.royalty_config();
  v_id     uuid;
  v_cur    text := upper(p_currency);
  v_from   timestamptz;
  v_to     timestamptz;
  v_net    bigint;
  v_pool   bigint;
  v_alloc  bigint;
  v_subs   int;
  v_active int;
begin
  if not (app.is_service_role() or app.is_money_staff()) then
    raise exception 'only the service role or owner and finance staff close the pool' using errcode = 'insufficient_privilege';
  end if;
  if p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'period must be YYYY-MM' using errcode = 'check_violation';
  end if;
  select id into v_id from public.pool_periods
   where tenant_id = p_tenant and period = p_period and currency = v_cur and livemode = p_livemode;
  if v_id is not null then return v_id; end if;
  v_from := app.month_start(p_period);
  v_to := app.month_start(app.month_after(p_period));
  if now() < v_to + make_interval(days => cfg.refund_window_days) then
    raise exception 'the pool for % closes after the refund window', p_period using errcode = 'object_not_in_prerequisite_state';
  end if;

  create temp table if not exists pg_temp.pool_net (user_id uuid, net bigint) on commit drop;
  create temp table if not exists pg_temp.pool_steps (user_id uuid, workbook_id uuid, steps int) on commit drop;
  truncate pg_temp.pool_net, pg_temp.pool_steps;

  -- Each subscriber's own net receipts in this pool month (refunds and fee
  -- corrections in the month included). Deleted readers drop out: their
  -- money stays unallocated.
  insert into pg_temp.pool_net (user_id, net)
  select x.user_id, sum(x.gross_minor - x.tax_minor - case when cfg.fee_treatment = 'deduct' then coalesce(x.fee_minor, 0) else 0 end)
    from public.royalty_receipts x
   where x.source = 'membership' and x.tenant_id = p_tenant and x.period = p_period and x.currency = v_cur and x.livemode = p_livemode
   group by x.user_id;
  select coalesce(sum(greatest(net, 0)), 0) into v_net from pg_temp.pool_net;
  v_pool := floor(v_net * cfg.pool_share_author);

  -- Completed steps per subscriber per membership workbook, capped.
  insert into pg_temp.pool_steps (user_id, workbook_id, steps)
  select e.user_id, e.workbook_id, least(count(distinct pe.ref), cfg.pool_step_cap)::int
    from public.progress_events pe
    join public.enrolments e on e.id = pe.enrolment_id
    join public.workbooks w on w.id = e.workbook_id
   where pe.kind = 'step_done' and pe.ref is not null and pe.at >= v_from and pe.at < v_to
     and e.tenant_id = p_tenant and w.in_membership and not w.is_demo
     and e.user_id in (select n.user_id from pg_temp.pool_net n where n.user_id is not null and n.net > 0)
   group by e.user_id, e.workbook_id;

  select count(*) into v_subs from pg_temp.pool_net where user_id is not null and net > 0;
  select count(*) into v_active from (
    select s.user_id from pg_temp.pool_steps s group by s.user_id having sum(s.steps) >= greatest(cfg.pool_activity_floor, 1)) a;

  insert into public.pool_periods (tenant_id, period, currency, livemode, net_receipts_minor, share_rate, pool_minor, allocated_minor,
    unallocated_minor, subscribers, active_subscribers, step_cap, activity_floor, fee_treatment, is_placeholder)
  values (p_tenant, p_period, v_cur, p_livemode, v_net, cfg.pool_share_author, v_pool, 0, v_pool, v_subs, v_active,
    cfg.pool_step_cap, cfg.pool_activity_floor, cfg.fee_treatment, cfg.is_placeholder)
  returning id into v_id;

  insert into public.pool_usage (period_id, user_hash, workbook_id, steps_capped, net_share_minor, allocated_minor)
  select v_id, encode(sha256(convert_to(s.user_id::text || ':' || v_id::text, 'UTF8')), 'hex'), s.workbook_id, s.steps,
         floor(n.net::numeric * s.steps / t.total),
         floor(floor(n.net * cfg.pool_share_author) * s.steps / t.total)
    from pg_temp.pool_steps s
    join pg_temp.pool_net n on n.user_id = s.user_id
    join (select user_id, sum(steps) as total from pg_temp.pool_steps group by user_id) t on t.user_id = s.user_id
   where t.total >= greatest(cfg.pool_activity_floor, 1);

  -- One pool line per workbook for organisations that earn.
  insert into public.royalty_lines (org_id, workbook_id, tenant_id, kind, period, currency, livemode, net_base_minor, rate,
    author_minor, akana_minor, is_placeholder_rate, pool_period_id, idem_key, note, occurred_at)
  select w.org_id, u.workbook_id, p_tenant, 'pool', p_period, v_cur, p_livemode, sum(u.net_share_minor), cfg.pool_share_author,
         sum(u.allocated_minor), sum(u.net_share_minor) - sum(u.allocated_minor), cfg.is_placeholder, v_id,
         'pool:' || v_id::text || ':' || u.workbook_id::text, 'Membership pool, ' || sum(u.steps_capped)::text || ' capped steps', v_to - interval '1 second'
    from public.pool_usage u
    join public.workbooks w on w.id = u.workbook_id
   where u.period_id = v_id and app.org_earns(w.org_id)
   group by w.org_id, u.workbook_id
  having sum(u.allocated_minor) > 0;

  select coalesce(sum(author_minor), 0) into v_alloc from public.royalty_lines where pool_period_id = v_id;
  -- pool_periods is a record of the close; this is the one update it gets.
  update public.pool_periods set allocated_minor = v_alloc, unallocated_minor = v_pool - v_alloc where id = v_id;

  perform app.audit('money.pool_closed', 'pool_period:' || v_id::text, null, p_tenant, null, null,
    jsonb_build_object('period', p_period, 'currency', v_cur, 'livemode', p_livemode, 'pool_minor', v_pool, 'allocated_minor', v_alloc));
  return v_id;
end $$;

-- Every pool month that is due and has membership money, oldest first.
create or replace function app.close_due_pools(p_livemode boolean) returns int
language plpgsql security definer set search_path = '' as $$
declare
  cfg public.royalty_config := app.royalty_config();
  k   record;
  n   int := 0;
begin
  if not (app.is_service_role() or app.is_money_staff()) then
    raise exception 'only the service role or owner and finance staff close the pool' using errcode = 'insufficient_privilege';
  end if;
  for k in
    select distinct x.tenant_id, x.period, x.currency from public.royalty_receipts x
     where x.source = 'membership' and x.livemode = p_livemode
       and now() >= app.month_start(app.month_after(x.period)) + make_interval(days => cfg.refund_window_days)
       and not exists (select 1 from public.pool_periods p where p.tenant_id = x.tenant_id and p.period = x.period
                        and p.currency = x.currency and p.livemode = p_livemode)
     order by x.period
  loop
    perform app.close_pool_period(k.tenant_id, k.period, k.currency, p_livemode);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- 11. Statements (F-101). A month closes for an organisation once it has
-- ended plus the refund window. Oldest first, so each opening balance is the
-- previous closing balance. Idempotent. Returns how many it closed.
-- ---------------------------------------------------------------------------
create or replace function app.close_due_statements(p_livemode boolean) returns int
language plpgsql security definer set search_path = '' as $$
declare
  cfg  public.royalty_config := app.royalty_config();
  k    record;
  n    int := 0;
  v_open bigint;
begin
  if not (app.is_service_role() or app.is_money_staff()) then
    raise exception 'only the service role or owner and finance staff close statements' using errcode = 'insufficient_privilege';
  end if;
  for k in
    select l.org_id, l.period, l.currency from public.royalty_lines l
     where l.livemode = p_livemode
       and now() >= app.month_start(app.month_after(l.period)) + make_interval(days => cfg.refund_window_days)
       and not exists (select 1 from public.statements s where s.org_id = l.org_id and s.period = l.period
                        and s.currency = l.currency and s.livemode = p_livemode)
     group by l.org_id, l.period, l.currency
     order by l.period, l.org_id, l.currency
  loop
    perform 1 from public.organisations where id = k.org_id for update;
    select coalesce((select s.closing_minor from public.statements s
                      where s.org_id = k.org_id and s.currency = k.currency and s.livemode = p_livemode and s.period < k.period
                      order by s.period desc limit 1), 0) into v_open;
    insert into public.statements (org_id, period, currency, livemode, opening_minor, sales_minor, refunds_minor, pool_minor,
      adjustments_minor, payouts_minor, closing_minor, units, line_count, is_placeholder_rate)
    select k.org_id, k.period, k.currency, p_livemode, v_open,
           coalesce(sum(l.author_minor) filter (where l.kind = 'sale'), 0),
           coalesce(sum(l.author_minor) filter (where l.kind in ('refund','dispute','dispute_reversal')), 0),
           coalesce(sum(l.author_minor) filter (where l.kind = 'pool'), 0),
           coalesce(sum(l.author_minor) filter (where l.kind in ('fee_correction','adjustment','withholding')), 0),
           coalesce(sum(l.author_minor) filter (where l.kind in ('payout','payout_reversal')), 0),
           v_open + coalesce(sum(l.author_minor), 0),
           coalesce(sum(l.units), 0), count(*), coalesce(bool_or(l.is_placeholder_rate), false)
      from public.royalty_lines l
     where l.org_id = k.org_id and l.period = k.period and l.currency = k.currency and l.livemode = p_livemode;
    n := n + 1;
  end loop;
  if n > 0 then
    perform app.audit('money.statements_closed', 'statements', null, null, null, null,
      jsonb_build_object('count', n, 'livemode', p_livemode));
  end if;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- 12. Manual adjustments. Owner staff only, with a reason. A withholding
-- line is an adjustment with kind withholding (D8, once the accountant
-- confirms the rule).
-- ---------------------------------------------------------------------------
create or replace function public.add_royalty_adjustment(p_org uuid, p_currency text, p_livemode boolean, p_amount_minor bigint,
  p_kind text, p_reason text, p_workbook uuid default null)
returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not app.is_platform(array['owner']) then
    raise exception 'only platform owners add ledger adjustments' using errcode = 'insufficient_privilege';
  end if;
  if p_kind not in ('adjustment','withholding') or p_amount_minor is null or p_amount_minor = 0
     or p_currency !~ '^[A-Za-z]{3}$' or char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'adjustment_invalid' using errcode = 'check_violation';
  end if;
  insert into public.royalty_lines (org_id, workbook_id, kind, period, currency, livemode, author_minor, akana_minor, idem_key, note,
    created_by, occurred_at)
  values (p_org, p_workbook, p_kind, app.money_month(now()), upper(p_currency), p_livemode, p_amount_minor, -p_amount_minor,
    'adj:' || gen_random_uuid()::text, left(btrim(p_reason), 300), app.uid(), now())
  returning id into v_id;
  perform app.audit('money.adjustment', 'royalty_line:' || v_id::text, left(p_reason, 200), null, p_org, null,
    jsonb_build_object('amount_minor', p_amount_minor, 'currency', upper(p_currency), 'kind', p_kind));
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 13. Balances.
--   balance  every line
--   settled  lines in months with a closed statement, plus payouts and
--            payout reversals whenever they happened
--   payable  the smaller of the two, less payouts already waiting
-- ---------------------------------------------------------------------------
create or replace view public.royalty_balances with (security_invoker = true) as
select l.org_id, l.currency, l.livemode,
       sum(l.author_minor)::bigint as balance_minor,
       coalesce(sum(l.author_minor) filter (where l.kind in ('payout','payout_reversal') or s.id is not null), 0)::bigint as settled_minor,
       coalesce((select sum(p.amount_minor) from public.payouts p
                  where p.org_id = l.org_id and p.currency = l.currency and p.livemode = l.livemode
                    and p.status in ('awaiting_approval','pending')), 0)::bigint as pending_payout_minor,
       greatest(0, least(sum(l.author_minor),
         coalesce(sum(l.author_minor) filter (where l.kind in ('payout','payout_reversal') or s.id is not null), 0))
         - coalesce((select sum(p.amount_minor) from public.payouts p
                  where p.org_id = l.org_id and p.currency = l.currency and p.livemode = l.livemode
                    and p.status in ('awaiting_approval','pending')), 0))::bigint as payable_minor,
       max(s.period) as last_closed_period,
       bool_or(l.is_placeholder_rate) as has_placeholder_rate
  from public.royalty_lines l
  left join public.statements s
    on s.org_id = l.org_id and s.period = l.period and s.currency = l.currency and s.livemode = l.livemode
 group by l.org_id, l.currency, l.livemode;

create or replace view public.royalty_title_months with (security_invoker = true) as
select l.org_id, l.workbook_id, l.period, l.currency, l.livemode,
       sum(l.units)::int as units,
       coalesce(sum(l.gross_minor) filter (where l.kind = 'sale'), 0)::bigint as gross_minor,
       coalesce(sum(l.tax_minor) filter (where l.kind = 'sale'), 0)::bigint as tax_minor,
       coalesce(sum(l.fee_minor) filter (where l.kind in ('sale','fee_correction')), 0)::bigint as fee_minor,
       coalesce(-sum(l.gross_minor) filter (where l.kind in ('refund','dispute','dispute_reversal')), 0)::bigint as refunded_gross_minor,
       coalesce(sum(l.author_minor) filter (where l.kind = 'sale'), 0)::bigint as sales_author_minor,
       coalesce(sum(l.author_minor) filter (where l.kind in ('refund','dispute','dispute_reversal')), 0)::bigint as refunds_author_minor,
       coalesce(sum(l.author_minor) filter (where l.kind = 'pool'), 0)::bigint as pool_author_minor,
       sum(l.author_minor)::bigint as author_minor,
       max(l.rate) filter (where l.kind = 'sale') as sale_rate,
       bool_or(l.is_placeholder_rate) as has_placeholder_rate
  from public.royalty_lines l
 where l.workbook_id is not null
 group by l.org_id, l.workbook_id, l.period, l.currency, l.livemode;

-- ---------------------------------------------------------------------------
-- 14. Payout holds (F-103). Owner and finance staff, with a reason. Audited.
-- ---------------------------------------------------------------------------
create or replace function public.place_payout_hold(p_org uuid, p_reason text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not app.is_money_staff() then
    raise exception 'only owner and finance staff hold payouts' using errcode = 'insufficient_privilege';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'hold_invalid: reason' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.organisations where id = p_org) then
    raise exception 'organisation not found' using errcode = 'no_data_found';
  end if;
  insert into public.payout_holds (org_id, reason, placed_by) values (p_org, btrim(p_reason), app.uid()) returning id into v_id;
  -- a payout waiting for approval is cancelled; the hold decides
  update public.payouts set status = 'cancelled', failure_code = 'held'
   where org_id = p_org and status in ('awaiting_approval','pending') and stripe_transfer_id is null;
  perform app.audit('money.payout_hold_placed', 'organisation:' || p_org::text, left(p_reason, 200), null, p_org, null,
    jsonb_build_object('hold_id', v_id));
  return v_id;
end $$;

create or replace function public.release_payout_hold(p_hold uuid, p_note text default null) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare h public.payout_holds%rowtype;
begin
  if not app.is_money_staff() then
    raise exception 'only owner and finance staff release payout holds' using errcode = 'insufficient_privilege';
  end if;
  update public.payout_holds set released_at = now(), released_by = app.uid(), release_note = left(nullif(btrim(coalesce(p_note, '')), ''), 500)
   where id = p_hold and released_at is null
   returning * into h;
  if not found then return false; end if;
  perform app.audit('money.payout_hold_released', 'organisation:' || h.org_id::text, left(p_note, 200), null, h.org_id, null,
    jsonb_build_object('hold_id', h.id));
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- 15. Payout decisions and the run (F-103).
-- decision: pay, approve (waits for a person) or skip, with a plain reason.
-- ---------------------------------------------------------------------------
create or replace function app.payout_candidates(p_livemode boolean)
returns table (org_id uuid, org_name text, currency text, balance_minor bigint, payable_minor bigint, decision text, reason text)
language plpgsql stable security definer set search_path = '' as $$
declare
  cfg   public.royalty_config := app.royalty_config();
  b     record;
  o     public.organisations%rowtype;
  v_min bigint;
  v_cap bigint;
  v_first timestamptz;
begin
  if not (app.is_service_role() or app.is_money_staff()) then
    raise exception 'only the service role or owner and finance staff read payout decisions' using errcode = 'insufficient_privilege';
  end if;
  for b in select * from public.royalty_balances x where x.livemode = p_livemode order by x.org_id, x.currency loop
    select * into o from public.organisations where id = b.org_id;
    org_id := b.org_id; org_name := o.display_name; currency := b.currency;
    balance_minor := b.balance_minor; payable_minor := b.payable_minor;
    v_min := nullif(cfg.min_payout_minor ->> b.currency, '')::bigint;
    v_cap := nullif(cfg.approval_above_minor ->> b.currency, '')::bigint;
    select min(l.occurred_at) into v_first from public.royalty_lines l
     where l.org_id = b.org_id and l.kind in ('sale','pool') and l.livemode = p_livemode;
    decision := 'skip';
    reason := case
      when o.kind = 'akana_house' or o.is_demo then 'not_paid_out'
      when exists (select 1 from public.payout_holds h where h.org_id = b.org_id and h.released_at is null) then 'held'
      when o.connect_status = 'held' then 'held'
      when o.stripe_connect_id is null or o.connect_status <> 'verified' then 'unverified'
      when o.tax_residence is null then 'tax_details_missing'
      when not app.payout_country_supported(coalesce(o.country::text, '')) then 'manual_review_country'
      when b.pending_payout_minor > 0 then 'in_progress'
      when b.payable_minor <= 0 then 'nothing_due'
      when v_min is null then 'currency_not_set'
      when b.payable_minor < v_min then 'below_minimum'
      when p_livemode and cfg.is_placeholder then 'rates_placeholder'
      when not exists (select 1 from public.payouts p where p.org_id = b.org_id and p.status = 'paid' and p.livemode = p_livemode)
           and (v_first is null or v_first > now() - make_interval(days => cfg.first_payout_hold_days)) then 'first_payout_hold'
      else null end;
    if reason is null then
      if v_cap is not null and b.payable_minor > v_cap then
        decision := 'approve'; reason := 'above_approval_threshold';
      else
        decision := 'pay'; reason := 'ok';
      end if;
    end if;
    return next;
  end loop;
end $$;

-- Start a run: one payout row per organisation and currency to pay (pending)
-- or to approve (awaiting_approval). The caller then makes the transfers.
create or replace function app.start_payout_run(p_livemode boolean, p_trigger text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_run uuid;
  c     record;
  v_sum jsonb := '{}'::jsonb;
begin
  if not (app.is_service_role() or app.is_money_staff()) then
    raise exception 'only the service role or owner and finance staff start a payout run' using errcode = 'insufficient_privilege';
  end if;
  if p_trigger not in ('cron','staff') then
    raise exception 'trigger must be cron or staff' using errcode = 'check_violation';
  end if;
  insert into public.payout_runs (livemode, trigger, started_by) values (p_livemode, p_trigger, app.uid()) returning id into v_run;
  for c in select * from app.payout_candidates(p_livemode) loop
    v_sum := jsonb_set(v_sum, array[c.reason], to_jsonb(coalesce((v_sum ->> c.reason)::int, 0) + 1));
    if c.decision in ('pay','approve') then
      insert into public.payouts (run_id, org_id, currency, livemode, amount_minor, status, stripe_destination)
      select v_run, c.org_id, c.currency, p_livemode, c.payable_minor,
             case c.decision when 'pay' then 'pending' else 'awaiting_approval' end, o.stripe_connect_id
        from public.organisations o where o.id = c.org_id
      on conflict do nothing;
    end if;
  end loop;
  update public.payout_runs set summary = v_sum where id = v_run;
  perform app.audit('money.payout_run_started', 'payout_run:' || v_run::text, null, null, null, null,
    jsonb_build_object('livemode', p_livemode, 'trigger', p_trigger, 'summary', v_sum));
  return v_run;
end $$;

-- Approve a payout above the threshold. It becomes pending; the caller then
-- makes the transfer.
create or replace function public.approve_payout(p_payout uuid) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare p public.payouts%rowtype;
begin
  if not app.is_money_staff() then
    raise exception 'only owner and finance staff approve payouts' using errcode = 'insufficient_privilege';
  end if;
  update public.payouts set status = 'pending', approved_by = app.uid(), approved_at = now()
   where id = p_payout and status = 'awaiting_approval'
   returning * into p;
  if not found then
    raise exception 'that payout is not waiting for approval' using errcode = 'object_not_in_prerequisite_state';
  end if;
  perform app.audit('money.payout_approved', 'payout:' || p.id::text, null, null, p.org_id, null,
    jsonb_build_object('amount_minor', p.amount_minor, 'currency', p.currency));
  return true;
end $$;

-- The transfer went through: mark paid and post the payout line. Idempotent.
create or replace function app.complete_payout(p_payout uuid, p_transfer text) returns text
language plpgsql security definer set search_path = '' as $$
declare p public.payouts%rowtype;
begin
  if not (app.is_service_role() or app.is_money_staff()) then
    raise exception 'only the service role or owner and finance staff complete payouts' using errcode = 'insufficient_privilege';
  end if;
  if p_transfer is null or p_transfer !~ '^tr_[A-Za-z0-9]+$' then
    raise exception 'payout_invalid: transfer' using errcode = 'check_violation';
  end if;
  select * into p from public.payouts where id = p_payout for update;
  if not found then
    raise exception 'payout not found' using errcode = 'no_data_found';
  end if;
  if p.status = 'paid' then return 'unchanged'; end if;
  if p.status <> 'pending' then
    raise exception 'payout is %', p.status using errcode = 'object_not_in_prerequisite_state';
  end if;
  update public.payouts set status = 'paid', stripe_transfer_id = p_transfer, paid_at = now(), failure_code = null where id = p.id;
  insert into public.royalty_lines (org_id, kind, period, currency, livemode, author_minor, payout_id, idem_key, note, created_by, occurred_at)
  values (p.org_id, 'payout', app.money_month(now()), p.currency, p.livemode, -p.amount_minor, p.id, 'payout:' || p.id::text,
    'Paid to your Stripe account', app.uid(), now())
  on conflict (idem_key) do nothing;
  perform app.audit('money.payout_paid', 'payout:' || p.id::text, null, null, p.org_id, null,
    jsonb_build_object('amount_minor', p.amount_minor, 'currency', p.currency, 'livemode', p.livemode));
  return 'paid';
end $$;

create or replace function app.fail_payout(p_payout uuid, p_code text) returns text
language plpgsql security definer set search_path = '' as $$
declare p public.payouts%rowtype;
begin
  if not (app.is_service_role() or app.is_money_staff()) then
    raise exception 'only the service role or owner and finance staff record payout failures' using errcode = 'insufficient_privilege';
  end if;
  update public.payouts set status = 'failed', failure_code = left(coalesce(p_code, 'unknown'), 80)
   where id = p_payout and status = 'pending'
   returning * into p;
  if not found then return 'unchanged'; end if;
  perform app.audit('money.payout_failed', 'payout:' || p.id::text, left(p_code, 80), null, p.org_id, null,
    jsonb_build_object('amount_minor', p.amount_minor, 'currency', p.currency));
  return 'failed';
end $$;

-- Close a run with its outcome counts.
create or replace function app.finish_payout_run(p_run uuid, p_outcome jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (app.is_service_role() or app.is_money_staff()) then
    raise exception 'only the service role or owner and finance staff finish a payout run' using errcode = 'insufficient_privilege';
  end if;
  update public.payout_runs set finished_at = now(), summary = summary || jsonb_build_object('outcome', coalesce(p_outcome, '{}'::jsonb))
   where id = p_run and finished_at is null;
end $$;

-- Money reclaimed from a paid transfer (a transfer reversal, F-102). Raises
-- the organisation's balance by what came back. Idempotent on the reversal id.
create or replace function app.record_transfer_reversal(p_payout uuid, p_reversal text, p_amount_minor bigint, p_reason text default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare p public.payouts%rowtype;
begin
  if not (app.is_service_role() or app.is_money_staff()) then
    raise exception 'only the service role or owner and finance staff record transfer reversals' using errcode = 'insufficient_privilege';
  end if;
  if p_reversal is null or p_reversal !~ '^trr_[A-Za-z0-9]+$' or p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'reversal_invalid' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.royalty_lines where idem_key = 'payout_reversal:' || p_reversal) then return 'unchanged'; end if;
  select * into p from public.payouts where id = p_payout for update;
  if not found or p.status <> 'paid' then
    raise exception 'only a paid payout can be reversed' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if p.reversed_minor + p_amount_minor > p.amount_minor then
    raise exception 'that is more than is left on the transfer' using errcode = 'check_violation';
  end if;
  update public.payouts set reversed_minor = reversed_minor + p_amount_minor where id = p.id;
  insert into public.royalty_lines (org_id, kind, period, currency, livemode, author_minor, payout_id, idem_key, note, created_by, occurred_at)
  values (p.org_id, 'payout_reversal', app.money_month(now()), p.currency, p.livemode, p_amount_minor, p.id,
    'payout_reversal:' || p_reversal, coalesce(left(p_reason, 300), 'Reclaimed from an earlier payout after a refund'), app.uid(), now());
  perform app.audit('money.transfer_reversed', 'payout:' || p.id::text, left(p_reason, 200), null, p.org_id, null,
    jsonb_build_object('amount_minor', p_amount_minor, 'reversal', p_reversal));
  return 'recorded';
end $$;

-- ---------------------------------------------------------------------------
-- 16. Daily reconciliation (F-100). The job compares Stripe balance
-- transactions with receipts and hands the result here. Items are kept
-- until a person marks them resolved.
-- ---------------------------------------------------------------------------
create or replace function app.record_reconciliation(p_livemode boolean, p_from timestamptz, p_to timestamptz,
  p_stripe_txns int, p_matched int, p_corrected int, p_items jsonb)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_issues int;
begin
  if not app.is_service_role() then
    raise exception 'only the service role records reconciliation' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception 'items must be an array' using errcode = 'check_violation';
  end if;
  select count(*) into v_issues from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e where e ->> 'kind' <> 'fee_corrected';
  insert into public.reconciliation_runs (livemode, window_from, window_to, stripe_txns, matched, corrected, issues)
  values (p_livemode, p_from, p_to, coalesce(p_stripe_txns, 0), coalesce(p_matched, 0), coalesce(p_corrected, 0), v_issues)
  returning id into v_id;
  insert into public.reconciliation_items (run_id, kind, stripe_ref, balance_txn_id, receipt_id, currency, expected_minor, actual_minor, note,
    resolved_at)
  select v_id, e ->> 'kind', left(e ->> 'stripe_ref', 255), left(e ->> 'balance_txn_id', 255), nullif(e ->> 'receipt_id', '')::uuid,
         upper(left(e ->> 'currency', 3)), (e ->> 'expected_minor')::bigint, (e ->> 'actual_minor')::bigint, left(e ->> 'note', 300),
         case when e ->> 'kind' = 'fee_corrected' then now() end
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e;
  return v_id;
end $$;

create or replace function public.resolve_reconciliation_item(p_item uuid, p_resolution text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not app.is_money_staff() then
    raise exception 'only owner and finance staff resolve reconciliation items' using errcode = 'insufficient_privilege';
  end if;
  if char_length(btrim(coalesce(p_resolution, ''))) not between 3 and 500 then
    raise exception 'resolution_invalid' using errcode = 'check_violation';
  end if;
  update public.reconciliation_items set resolved_at = now(), resolved_by = app.uid(), resolution = btrim(p_resolution)
   where id = p_item and resolved_at is null;
  if not found then return false; end if;
  perform app.audit('money.reconciliation_resolved', 'reconciliation_item:' || p_item::text, left(p_resolution, 200));
  return true;
end $$;

-- Receipts in a window, for the reconciliation job.
create or replace function app.receipts_for_reconciliation(p_livemode boolean, p_from timestamptz, p_to timestamptz)
returns table (id uuid, kind text, stripe_ref text, payment_intent_id text, balance_txn_id text, currency text,
  gross_minor int, fee_minor bigint, occurred_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_service_role() then
    raise exception 'only the service role reads receipts for reconciliation' using errcode = 'insufficient_privilege';
  end if;
  return query
    select r.id, r.kind, r.stripe_ref, r.payment_intent_id, r.balance_txn_id, r.currency::text, r.gross_minor,
           (case when r.kind in ('sale','membership') then
              (select case when r.fee_minor is null and count(x.id) = 0 then null
                           else coalesce(r.fee_minor, 0) + coalesce(sum(x.fee_minor), 0) end
                 from public.royalty_receipts x where x.original_receipt_id = r.id and x.kind = 'fee_correction')
            else r.fee_minor end)::bigint,
           r.occurred_at
      from public.royalty_receipts r
     where r.livemode = p_livemode and r.kind <> 'fee_correction' and r.occurred_at >= p_from and r.occurred_at < p_to
     order by r.occurred_at;
end $$;

-- ---------------------------------------------------------------------------
-- 17. RPC wrappers for the service role (PostgREST exposes public only).
-- The app functions do the checks; staff may call the ones they are allowed.
-- ---------------------------------------------------------------------------
create or replace function public.record_sale_receipt(p_purchase uuid, p_livemode boolean, p_balance_txn text default null, p_fee_minor int default null)
returns text language sql security invoker set search_path = '' as $$
  select app.record_sale_receipt(p_purchase, p_livemode, p_balance_txn, p_fee_minor)
$$;
create or replace function public.record_membership_receipt(p_invoice text, p_livemode boolean, p_payment_intent text default null,
  p_balance_txn text default null, p_fee_minor int default null)
returns text language sql security invoker set search_path = '' as $$
  select app.record_membership_receipt(p_invoice, p_livemode, p_payment_intent, p_balance_txn, p_fee_minor)
$$;
create or replace function public.record_refund(p_kind text, p_ref text, p_payment_intent text, p_amount_minor int, p_currency text,
  p_livemode boolean, p_occurred_at timestamptz default null, p_reason text default null)
returns text language sql security invoker set search_path = '' as $$
  select app.record_refund(p_kind, p_ref, p_payment_intent, p_amount_minor, p_currency, p_livemode, p_occurred_at, p_reason)
$$;
create or replace function public.record_fee_correction(p_receipt uuid, p_fee_minor int, p_balance_txn text default null)
returns text language sql security invoker set search_path = '' as $$
  select app.record_fee_correction(p_receipt, p_fee_minor, p_balance_txn)
$$;
create or replace function public.close_due_pools(p_livemode boolean)
returns int language sql security invoker set search_path = '' as $$
  select app.close_due_pools(p_livemode)
$$;
create or replace function public.close_due_statements(p_livemode boolean)
returns int language sql security invoker set search_path = '' as $$
  select app.close_due_statements(p_livemode)
$$;
create or replace function public.payout_candidates(p_livemode boolean)
returns table (org_id uuid, org_name text, currency text, balance_minor bigint, payable_minor bigint, decision text, reason text)
language sql security invoker set search_path = '' as $$
  select * from app.payout_candidates(p_livemode)
$$;
create or replace function public.start_payout_run(p_livemode boolean, p_trigger text)
returns uuid language sql security invoker set search_path = '' as $$
  select app.start_payout_run(p_livemode, p_trigger)
$$;
create or replace function public.complete_payout(p_payout uuid, p_transfer text)
returns text language sql security invoker set search_path = '' as $$
  select app.complete_payout(p_payout, p_transfer)
$$;
create or replace function public.fail_payout(p_payout uuid, p_code text)
returns text language sql security invoker set search_path = '' as $$
  select app.fail_payout(p_payout, p_code)
$$;
create or replace function public.finish_payout_run(p_run uuid, p_outcome jsonb)
returns void language sql security invoker set search_path = '' as $$
  select app.finish_payout_run(p_run, p_outcome)
$$;
create or replace function public.record_transfer_reversal(p_payout uuid, p_reversal text, p_amount_minor bigint, p_reason text default null)
returns text language sql security invoker set search_path = '' as $$
  select app.record_transfer_reversal(p_payout, p_reversal, p_amount_minor, p_reason)
$$;
create or replace function public.record_reconciliation(p_livemode boolean, p_from timestamptz, p_to timestamptz,
  p_stripe_txns int, p_matched int, p_corrected int, p_items jsonb)
returns uuid language sql security invoker set search_path = '' as $$
  select app.record_reconciliation(p_livemode, p_from, p_to, p_stripe_txns, p_matched, p_corrected, p_items)
$$;
create or replace function public.receipts_for_reconciliation(p_livemode boolean, p_from timestamptz, p_to timestamptz)
returns table (id uuid, kind text, stripe_ref text, payment_intent_id text, balance_txn_id text, currency text,
  gross_minor int, fee_minor bigint, occurred_at timestamptz)
language sql security invoker set search_path = '' as $$
  select * from app.receipts_for_reconciliation(p_livemode, p_from, p_to)
$$;

-- Execute: app functions from nobody but their callers; public wrappers to
-- the service role, and to authenticated where staff use them (the app
-- function checks the role).
revoke execute on function
  app.money_month(timestamptz), app.month_after(text), app.month_start(text), app.is_money_staff(), app.royalty_config(),
  app.royalty_base(bigint, bigint, bigint, text), app.org_earns(uuid),
  app.record_sale_receipt(uuid, boolean, text, int), app.record_membership_receipt(text, boolean, text, text, int),
  app.record_refund(text, text, text, int, text, boolean, timestamptz, text), app.record_fee_correction(uuid, int, text),
  app.close_pool_period(uuid, text, text, boolean), app.close_due_pools(boolean), app.close_due_statements(boolean),
  app.payout_candidates(boolean), app.start_payout_run(boolean, text), app.complete_payout(uuid, text), app.fail_payout(uuid, text),
  app.finish_payout_run(uuid, jsonb), app.record_transfer_reversal(uuid, text, bigint, text),
  app.record_reconciliation(boolean, timestamptz, timestamptz, int, int, int, jsonb),
  app.receipts_for_reconciliation(boolean, timestamptz, timestamptz)
  from public;
grant execute on function
  app.money_month(timestamptz), app.month_after(text), app.month_start(text), app.is_money_staff(), app.royalty_config(),
  app.royalty_base(bigint, bigint, bigint, text), app.org_earns(uuid),
  app.record_sale_receipt(uuid, boolean, text, int), app.record_membership_receipt(text, boolean, text, text, int),
  app.record_refund(text, text, text, int, text, boolean, timestamptz, text), app.record_fee_correction(uuid, int, text),
  app.close_pool_period(uuid, text, text, boolean), app.close_due_pools(boolean), app.close_due_statements(boolean),
  app.payout_candidates(boolean), app.start_payout_run(boolean, text), app.complete_payout(uuid, text), app.fail_payout(uuid, text),
  app.finish_payout_run(uuid, jsonb), app.record_transfer_reversal(uuid, text, bigint, text),
  app.record_reconciliation(boolean, timestamptz, timestamptz, int, int, int, jsonb),
  app.receipts_for_reconciliation(boolean, timestamptz, timestamptz)
  to authenticated, service_role;

revoke execute on function
  public.record_sale_receipt(uuid, boolean, text, int), public.record_membership_receipt(text, boolean, text, text, int),
  public.record_refund(text, text, text, int, text, boolean, timestamptz, text), public.record_fee_correction(uuid, int, text),
  public.close_due_pools(boolean), public.close_due_statements(boolean), public.payout_candidates(boolean),
  public.start_payout_run(boolean, text), public.complete_payout(uuid, text), public.fail_payout(uuid, text),
  public.finish_payout_run(uuid, jsonb), public.record_transfer_reversal(uuid, text, bigint, text),
  public.record_reconciliation(boolean, timestamptz, timestamptz, int, int, int, jsonb),
  public.receipts_for_reconciliation(boolean, timestamptz, timestamptz),
  public.set_royalty_config(numeric, numeric, numeric, int, int, text, int, int, jsonb, jsonb, int, text, timestamptz),
  public.add_royalty_adjustment(uuid, text, boolean, bigint, text, text, uuid),
  public.place_payout_hold(uuid, text), public.release_payout_hold(uuid, text), public.approve_payout(uuid),
  public.resolve_reconciliation_item(uuid, text)
  from public, anon;
-- service role only
revoke execute on function
  public.record_sale_receipt(uuid, boolean, text, int), public.record_membership_receipt(text, boolean, text, text, int),
  public.record_fee_correction(uuid, int, text), public.record_reconciliation(boolean, timestamptz, timestamptz, int, int, int, jsonb),
  public.receipts_for_reconciliation(boolean, timestamptz, timestamptz)
  from authenticated;
grant execute on function
  public.record_sale_receipt(uuid, boolean, text, int), public.record_membership_receipt(text, boolean, text, text, int),
  public.record_fee_correction(uuid, int, text), public.record_reconciliation(boolean, timestamptz, timestamptz, int, int, int, jsonb),
  public.receipts_for_reconciliation(boolean, timestamptz, timestamptz)
  to service_role;
-- service role and money staff
grant execute on function
  public.record_refund(text, text, text, int, text, boolean, timestamptz, text),
  public.close_due_pools(boolean), public.close_due_statements(boolean), public.payout_candidates(boolean),
  public.start_payout_run(boolean, text), public.complete_payout(uuid, text), public.fail_payout(uuid, text),
  public.finish_payout_run(uuid, jsonb), public.record_transfer_reversal(uuid, text, bigint, text)
  to authenticated, service_role;
-- staff only
grant execute on function
  public.set_royalty_config(numeric, numeric, numeric, int, int, text, int, int, jsonb, jsonb, int, text, timestamptz),
  public.add_royalty_adjustment(uuid, text, boolean, bigint, text, text, uuid),
  public.place_payout_hold(uuid, text), public.release_payout_hold(uuid, text), public.approve_payout(uuid),
  public.resolve_reconciliation_item(uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 18. Row level security
-- ---------------------------------------------------------------------------
alter table public.royalty_config       enable row level security;
alter table public.royalty_receipts     enable row level security;
alter table public.pool_periods         enable row level security;
alter table public.pool_usage           enable row level security;
alter table public.statements           enable row level security;
alter table public.payout_runs          enable row level security;
alter table public.payouts              enable row level security;
alter table public.royalty_lines        enable row level security;
alter table public.payout_holds         enable row level security;
alter table public.reconciliation_runs  enable row level security;
alter table public.reconciliation_items enable row level security;

revoke all on public.royalty_config, public.royalty_receipts, public.pool_periods, public.pool_usage, public.statements,
  public.payout_runs, public.payouts, public.royalty_lines, public.payout_holds, public.reconciliation_runs,
  public.reconciliation_items, public.royalty_balances, public.royalty_title_months
  from anon, authenticated;

-- Staff with money roles read everything here. Writes go through the
-- functions above; no client has an insert, update or delete grant.
grant select on public.royalty_config, public.royalty_receipts, public.pool_periods, public.pool_usage, public.payout_runs,
  public.payout_holds, public.reconciliation_runs, public.reconciliation_items
  to authenticated;
create policy royalty_config_read on public.royalty_config for select to authenticated using ((select app.is_staff()));
create policy royalty_receipts_read on public.royalty_receipts for select to authenticated using ((select app.is_money_staff()));
create policy pool_periods_read on public.pool_periods for select to authenticated using ((select app.is_money_staff()));
create policy pool_usage_read on public.pool_usage for select to authenticated using ((select app.is_money_staff()));
create policy payout_runs_read on public.payout_runs for select to authenticated using ((select app.is_money_staff()));
create policy payout_holds_read on public.payout_holds for select to authenticated using ((select app.is_money_staff()));
create policy reconciliation_runs_read on public.reconciliation_runs for select to authenticated using ((select app.is_money_staff()));
create policy reconciliation_items_read on public.reconciliation_items for select to authenticated using ((select app.is_money_staff()));

-- The ledger, statements and payouts: money staff, and the organisation's
-- own members whose role may read statements (or payouts).
grant select on public.royalty_lines, public.statements, public.payouts, public.royalty_balances, public.royalty_title_months to authenticated;
create policy royalty_lines_read on public.royalty_lines for select to authenticated
  using ((select app.is_money_staff()) or (select app.org_can(org_id, 'statements', 'read')));
create policy statements_read on public.statements for select to authenticated
  using ((select app.is_money_staff()) or (select app.org_can(org_id, 'statements', 'read')));
create policy payouts_read on public.payouts for select to authenticated
  using ((select app.is_money_staff()) or (select app.org_can(org_id, 'payouts', 'read')));

-- The service role grant is what Supabase gives by default; plain Postgres
-- (the test harness) needs it said. No update or delete on the ledger.
grant select, insert on public.royalty_config, public.royalty_receipts, public.royalty_lines, public.statements to service_role;
grant select, insert, update on public.pool_periods, public.payout_runs, public.payouts, public.payout_holds,
  public.reconciliation_runs, public.reconciliation_items to service_role;
grant select, insert on public.pool_usage to service_role;
grant select on public.royalty_balances, public.royalty_title_months to service_role;
