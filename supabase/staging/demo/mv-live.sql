begin;
-- Maya Vaughn titles to live: 20 title(s). Run in the SQL editor (role postgres).
select set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"platform_roles":["owner"]}}', true);
do $mv$
declare r record; n int := 0;
begin
  for r in select w.id, w.code, w.current_version_id as vid from public.workbooks w
           where w.code = any(array['AK-XGZC2', 'AK-VSQQV', 'AK-3DDX9', 'AK-WNQSH', 'AK-Z6NF4', 'AK-SMZ6R', 'AK-EE7WH', 'AK-AEVGM', 'AK-8AQWW', 'AK-5J1Q7', 'AK-EM7F9', 'AK-DDF36', 'AK-6AJZ6', 'AK-NXD2Q', 'AK-TXFA9', 'AK-F536B', 'AK-M1AAC', 'AK-583T5', 'AK-ZMPGK', 'AK-VQ6SF']::text[]) and w.badge = 'official' and not w.is_demo
             and w.current_version_id is not null and w.status = 'in_review' for update
  loop
    if exists (select 1 from public.workbook_versions where id = r.vid and published_at is null) then
      perform app.publish_version(r.vid);
    end if;
    update public.workbooks set status = 'live' where id = r.id;
    n := n + 1;
  end loop;
  raise notice '% of 20 Maya Vaughn title(s) set live', n;
end $mv$;
select set_config('request.jwt.claims', '', true);
select w.code, w.status, v.published_at is not null as published, (select count(*) from public.workbook_sections s where s.version_id = w.current_version_id) as sections from public.workbooks w left join public.workbook_versions v on v.id = w.current_version_id where w.code = any(array['AK-XGZC2', 'AK-VSQQV', 'AK-3DDX9', 'AK-WNQSH', 'AK-Z6NF4', 'AK-SMZ6R', 'AK-EE7WH', 'AK-AEVGM', 'AK-8AQWW', 'AK-5J1Q7', 'AK-EM7F9', 'AK-DDF36', 'AK-6AJZ6', 'AK-NXD2Q', 'AK-TXFA9', 'AK-F536B', 'AK-M1AAC', 'AK-583T5', 'AK-ZMPGK', 'AK-VQ6SF']::text[]) order by w.code;
commit;
