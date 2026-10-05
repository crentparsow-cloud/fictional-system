-- 007: product workbook ids now match the content ids used by the app and the answers function.
update public.products set workbook_ids = array(
  select case w when 'after-trauma' then 'aftertrauma' when 'low-mood' then 'lowmood'
                when 'food-and-mood' then 'food' when 'self-worth' then 'selfworth' else w end
  from unnest(workbook_ids) w)
where workbook_ids && array['after-trauma','low-mood','food-and-mood','self-worth'];
