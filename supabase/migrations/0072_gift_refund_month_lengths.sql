-- 0072 gift_refund: close the entitlement when no gift time is left.
-- 0068 took back "the last g.months before the gift's own end date" using
-- calendar months, but earlier refunds moved end dates by whole days. Month
-- lengths differ, so refunding the last remaining gift could leave a day or
-- two on the entitlement (for example a 6 month and a 1 month gift refunded
-- in November). Now, when the entitlement is a gift one and no other claimed
-- gift still has time after now(), the refund revokes it outright.
-- Only the function body below changes from 0068. Grants are kept.

create or replace function app.gift_refund(p_payment_intent text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  g public.gift_memberships%rowtype;
  e public.entitlements%rowtype;
  v_was_claimed boolean;
  v_cut interval := interval '0';
  v_end timestamptz;
begin
  if not app.is_service_role() then
    raise exception 'only the service role records gift refunds' using errcode = 'insufficient_privilege';
  end if;
  select * into g from public.gift_memberships where stripe_payment_intent_id = p_payment_intent for update;
  if not found then return jsonb_build_object('found', false); end if;
  if g.status = 'refunded' then return jsonb_build_object('found', true, 'changed', false, 'id', g.id); end if;
  v_was_claimed := g.status = 'claimed';
  if g.entitlement_id is not null and v_was_claimed and g.ends_at is not null then
    select * into e from public.entitlements where id = g.entitlement_id for update;
    if found and e.status = 'active' then
      -- This gift's slice is the last g.months before its own end date.
      v_cut := greatest(interval '0', g.ends_at - greatest(now(), g.ends_at - make_interval(months => g.months)));
      if v_cut > interval '0' then
        v_end := coalesce(e.ends_at, now()) - v_cut;
        if v_end <= now()
           or (e.source = 'gift' and not exists (
                 select 1 from public.gift_memberships o
                  where o.entitlement_id = e.id and o.id <> g.id and o.status = 'claimed' and o.ends_at > now())) then
          update public.entitlements set status = 'revoked', ends_at = now() where id = e.id;
        else
          update public.entitlements set ends_at = v_end where id = e.id;
        end if;
        update public.gift_memberships o set ends_at = o.ends_at - v_cut
         where o.entitlement_id = e.id and o.id <> g.id and o.status = 'claimed' and o.ends_at > g.ends_at;
      end if;
    end if;
  end if;
  update public.gift_memberships set status = 'refunded', claim_token = null, recipient_email = null where id = g.id;
  perform app.audit('commerce.gift_refunded', 'gift:' || g.id::text, null, g.tenant_id, null,
    jsonb_build_object('status', g.status), jsonb_build_object('status', 'refunded', 'days_taken_back', extract(epoch from v_cut) / 86400));
  return jsonb_build_object('found', true, 'changed', true, 'id', g.id, 'was_claimed', v_was_claimed);
end $$;
