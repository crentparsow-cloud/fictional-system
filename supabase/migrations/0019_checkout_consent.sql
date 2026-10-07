-- 0019 Immediate-access consent at checkout (F-096, F-097).
--
-- Depends on 0001 to 0012 only (auth.users, public.tenants,
-- public.workbooks, app.uid). Same rules as before: RLS on every table,
-- grants to anon and authenticated revoked and given back narrowly, helpers
-- security definer with search_path pinned, thin public wrappers that run as
-- the caller.
--
-- Why: under the Consumer Contracts Regulations 2013 a reader has 14 days to
-- cancel a purchase of digital content, unless they asked for access to start
-- straight away and acknowledged that this ends the right to cancel. The
-- refund policy (docs/legal/refund-policy.md, section 1) quotes the two
-- wordings Akana asks for before payment:
--   * a single workbook: access starts now and the 14-day right to cancel
--     ends once it does;
--   * membership: access starts now, and cancelling within 14 days gives a
--     refund minus a proportionate amount for the days used.
-- The policy says "we record which wording you agreed to, and when". This
-- migration is that record.
--
-- The shape of trust here:
--   * checkout_consent_wordings is the register of every wording shown at
--     checkout, word for word, by kind and version. It is public: a reader is
--     entitled to see what they agreed to. A new wording is a new row, added
--     by a migration; rows are never edited or deleted.
--   * checkout_consents is append only. One row each time a reader ticks the
--     box and starts a checkout, written only by app.record_checkout_consent
--     for app.uid(), before Stripe is called. The checkout route then links
--     the row to the Stripe Checkout Session it opened, once, through
--     app.link_checkout_consent; the purchase is found from that session id
--     (public.purchases.stripe_checkout_session_id). Nothing else about a row
--     ever changes. A reader reads their own rows.
--   * Rows go with the account when it is deleted (on delete cascade), as
--     terms acceptances do (0018).
--
-- Error codes, for the server to map:
--   AKC01  not allowed (not signed in, or not the reader's own row)
--   AKC02  unknown wording (kind and version not in the register)
--   AKC03  a field failed validation (the message names the field)
--   AKC29  rate limited: more than 30 consents in an hour

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.checkout_consent_wordings (
  kind          text not null check (kind in ('workbook','membership')),
  version       text not null check (version ~ '^[a-z0-9][a-z0-9._-]{0,47}$'),
  wording       text not null check (char_length(wording) between 20 and 1000),
  published_at  timestamptz not null default now(),
  primary key (kind, version)
);

create table public.checkout_consents (
  id                          bigint generated always as identity primary key,
  user_id                     uuid not null references auth.users(id) on delete cascade,
  kind                        text not null,
  version                     text not null,
  tenant_id                   uuid references public.tenants(id) on delete set null,
  workbook_id                 uuid references public.workbooks(id) on delete set null,
  plan                        text check (plan is null or plan in ('member_month','member_year')),
  stripe_checkout_session_id  text unique check (stripe_checkout_session_id is null or stripe_checkout_session_id ~ '^cs_[A-Za-z0-9_]{1,250}$'),
  consented_at                timestamptz not null default now(),
  linked_at                   timestamptz,
  constraint checkout_consents_wording_fk foreign key (kind, version) references public.checkout_consent_wordings (kind, version),
  constraint checkout_consents_plan check ((kind = 'membership') = (plan is not null)),
  constraint checkout_consents_linked check ((stripe_checkout_session_id is null) = (linked_at is null))
);
create index checkout_consents_user_idx on public.checkout_consents (user_id, consented_at desc);

-- The register is never edited. A consent changes once only: when its
-- Checkout Session is linked. The foreign keys may also clear tenant_id or
-- workbook_id when those rows are deleted. Anything else is refused.
create or replace function app.checkout_wordings_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception '% is append only', tg_table_name using errcode = 'insufficient_privilege';
end $$;
create trigger checkout_consent_wordings_append_only before update or delete on public.checkout_consent_wordings
  for each row execute function app.checkout_wordings_append_only();

create or replace function app.checkout_consents_guard() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_old jsonb := to_jsonb(old) - array['stripe_checkout_session_id','linked_at','tenant_id','workbook_id'];
  v_new jsonb := to_jsonb(new) - array['stripe_checkout_session_id','linked_at','tenant_id','workbook_id'];
begin
  if v_old <> v_new
     or (new.tenant_id is distinct from old.tenant_id and new.tenant_id is not null)
     or (new.workbook_id is distinct from old.workbook_id and new.workbook_id is not null)
     or (old.stripe_checkout_session_id is not null
         and (new.stripe_checkout_session_id is distinct from old.stripe_checkout_session_id
              or new.linked_at is distinct from old.linked_at)) then
    raise exception 'checkout_consents is append only' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger checkout_consents_guard before update on public.checkout_consents
  for each row execute function app.checkout_consents_guard();

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------
alter table public.checkout_consent_wordings enable row level security;
alter table public.checkout_consents enable row level security;
revoke all on public.checkout_consent_wordings, public.checkout_consents from anon, authenticated;

grant select (kind, version, wording, published_at) on public.checkout_consent_wordings to anon, authenticated;
create policy checkout_consent_wordings_read on public.checkout_consent_wordings for select to anon, authenticated using (true);

grant select (id, kind, version, tenant_id, workbook_id, plan, stripe_checkout_session_id, consented_at, linked_at)
  on public.checkout_consents to authenticated;
create policy checkout_consents_own on public.checkout_consents for select to authenticated
  using (user_id = (select app.uid()));

-- ---------------------------------------------------------------------------
-- Record a consent, for the signed-in reader only, before payment starts.
-- The wording must be in the register. A workbook consent names the
-- workbook; a membership consent names the plan. Returns the row id, which
-- the checkout route puts in the Stripe session metadata and then links.
-- ---------------------------------------------------------------------------
create or replace function app.record_checkout_consent(
  p_kind text, p_version text, p_tenant uuid default null, p_workbook uuid default null, p_plan text default null
) returns bigint
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid   uuid := app.uid();
  v_at    timestamptz := now();
  v_count int;
  v_id    bigint;
begin
  if v_uid is null then
    raise exception 'sign in to start checkout' using errcode = 'AKC01';
  end if;
  if p_kind is null or p_kind not in ('workbook','membership') then
    raise exception 'consent_invalid: kind' using errcode = 'AKC03';
  end if;
  if not exists (select 1 from public.checkout_consent_wordings w where w.kind = p_kind and w.version = p_version) then
    raise exception 'unknown checkout consent wording' using errcode = 'AKC02';
  end if;
  if p_kind = 'workbook' then
    if p_plan is not null then
      raise exception 'consent_invalid: plan' using errcode = 'AKC03';
    end if;
    if p_workbook is null or not exists (select 1 from public.workbooks w where w.id = p_workbook) then
      raise exception 'consent_invalid: workbook' using errcode = 'AKC03';
    end if;
  else
    if p_plan is null or p_plan not in ('member_month','member_year') then
      raise exception 'consent_invalid: plan' using errcode = 'AKC03';
    end if;
    if p_workbook is not null then
      raise exception 'consent_invalid: workbook' using errcode = 'AKC03';
    end if;
  end if;
  if p_tenant is not null and not exists (select 1 from public.tenants t where t.id = p_tenant) then
    raise exception 'consent_invalid: tenant' using errcode = 'AKC03';
  end if;

  select count(*) into v_count from public.checkout_consents c
   where c.user_id = v_uid and c.consented_at > v_at - interval '1 hour';
  if v_count >= 30 then
    raise exception 'too many checkouts, try again later' using errcode = 'AKC29';
  end if;

  insert into public.checkout_consents (user_id, kind, version, tenant_id, workbook_id, plan, consented_at)
  values (v_uid, p_kind, p_version, p_tenant, p_workbook, p_plan, v_at)
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Link a consent to the Checkout Session it led to. Own rows only, once,
-- and only within the hour the consent was given. Returns true when linked.
-- ---------------------------------------------------------------------------
create or replace function app.link_checkout_consent(p_id bigint, p_session text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := app.uid();
begin
  if v_uid is null then
    raise exception 'sign in to start checkout' using errcode = 'AKC01';
  end if;
  if p_session is null or p_session !~ '^cs_[A-Za-z0-9_]{1,250}$' then
    raise exception 'consent_invalid: session' using errcode = 'AKC03';
  end if;
  update public.checkout_consents c
     set stripe_checkout_session_id = p_session, linked_at = now()
   where c.id = p_id
     and c.user_id = v_uid
     and c.stripe_checkout_session_id is null
     and c.consented_at > now() - interval '1 hour';
  if not found then
    raise exception 'no open consent to link' using errcode = 'AKC01';
  end if;
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- RPC wrappers. Security invoker: the app functions do the checks.
-- ---------------------------------------------------------------------------
create or replace function public.record_checkout_consent(
  p_kind text, p_version text, p_tenant uuid default null, p_workbook uuid default null, p_plan text default null
) returns bigint
language sql volatile security invoker set search_path = '' as $$
  select app.record_checkout_consent(p_kind, p_version, p_tenant, p_workbook, p_plan)
$$;
create or replace function public.link_checkout_consent(p_id bigint, p_session text) returns boolean
language sql volatile security invoker set search_path = '' as $$
  select app.link_checkout_consent(p_id, p_session)
$$;

revoke execute on function app.record_checkout_consent(text, text, uuid, uuid, text), app.link_checkout_consent(bigint, text),
  app.checkout_wordings_append_only(), app.checkout_consents_guard() from public, anon;
revoke execute on function public.record_checkout_consent(text, text, uuid, uuid, text), public.link_checkout_consent(bigint, text)
  from public, anon;
grant execute on function app.record_checkout_consent(text, text, uuid, uuid, text), public.record_checkout_consent(text, text, uuid, uuid, text),
  app.link_checkout_consent(bigint, text), public.link_checkout_consent(bigint, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- The two wordings in use, word for word from the refund policy, section 1.
-- Keep in step with CHECKOUT_CONSENTS in apps/web/lib/checkout-consent.ts
-- (a unit test compares them).
-- ---------------------------------------------------------------------------
insert into public.checkout_consent_wordings (kind, version, wording, published_at) values
  ('workbook', 'immediate-access-2026-10',
   'I want access to start right now. I understand that once access starts, I lose my 14-day right to cancel and get a refund.',
   '2026-10-07 00:00:00+00'),
  ('membership', 'membership-refund-2026-10',
   'I want access to start right now. I understand that if I cancel within 14 days, I will get a refund minus a proportionate amount for the days I have had access.',
   '2026-10-07 00:00:00+00');
