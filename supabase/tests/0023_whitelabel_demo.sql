-- White-label demo (0023): contrast and brand validation, the tenant write
-- guard, the tenant catalogue and listing prices, the demo reset and the
-- demo logins. Each block must raise or return the expected value; a
-- failure aborts the script and the CI step.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('a2300000-0000-0000-0000-000000000001', 'editor23@test'),
  ('a2300000-0000-0000-0000-000000000002', 'owner23@test'),
  ('a2300000-0000-0000-0000-000000000003', 'tenantowner23@test'),
  ('a2300000-0000-0000-0000-000000000004', 'reader23@test'),
  ('a2300000-0000-0000-0000-000000000005', 'demo-author@test'),
  ('a2300000-0000-0000-0000-000000000006', 'Demo-Publisher@test'),
  ('a2300000-0000-0000-0000-000000000007', 'realauthor23@test');
insert into public.platform_roles (user_id, role) values
  ('a2300000-0000-0000-0000-000000000001', 'editor'),
  ('a2300000-0000-0000-0000-000000000002', 'owner');

insert into public.organisations (id, code, kind, legal_name, display_name, slug, country) values
  ('a2300000-0000-0000-0000-0000000000a1', 'PB-TW001', 'publisher', 'Org W Ltd', 'Org W', 'org-w', 'GB'),
  ('a2300000-0000-0000-0000-0000000000a2', 'PB-TW002', 'publisher', 'Org X Ltd', 'Org X', 'org-x', 'GB');
insert into public.org_members (org_id, user_id, role) values
  ('a2300000-0000-0000-0000-0000000000a1', 'a2300000-0000-0000-0000-000000000003', 'owner'),
  ('a2300000-0000-0000-0000-0000000000a2', 'a2300000-0000-0000-0000-000000000007', 'owner');
insert into public.tenants (id, slug, kind, org_id, name, plan) values
  ('a2300000-0000-0000-0000-0000000000b1', 'org-w', 'white_label', 'a2300000-0000-0000-0000-0000000000a1', 'Org W Books', 'pro');

insert into public.books (id, org_id, slug, title) values
  ('a2300000-0000-0000-0000-0000000000c1', 'a2300000-0000-0000-0000-0000000000a1', 'book-w', 'Book W'),
  ('a2300000-0000-0000-0000-0000000000c2', 'a2300000-0000-0000-0000-0000000000a2', 'book-x', 'Book X');
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, depth, status, badge, is_demo) values
  ('a2300000-0000-0000-0000-0000000000d1', 'AK-TW001', 'a2300000-0000-0000-0000-0000000000c1', 'a2300000-0000-0000-0000-0000000000a1',
   'workbook-w', 'Workbook W', 'Card', 'productivity', 'full', 'live', 'official', false),
  ('a2300000-0000-0000-0000-0000000000d2', 'AK-TW002', 'a2300000-0000-0000-0000-0000000000c2', 'a2300000-0000-0000-0000-0000000000a2',
   'workbook-x', 'Workbook X', 'Card', 'productivity', 'full', 'live', 'official', false),
  ('a2300000-0000-0000-0000-0000000000d3', 'AK-TW003', 'a2300000-0000-0000-0000-0000000000c2', 'a2300000-0000-0000-0000-0000000000a2',
   'workbook-demo-x', 'Demo X', 'Card', 'productivity', 'listing', 'live', 'demo', true);

create or replace function pg_temp.as_anon() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "anon"}'::text, true);
  execute 'set local role anon';
end $$;

-- ---------------------------------------------------------------------------
-- 1. Contrast matches the app's figures (lib/tenant-brand.test.ts uses the same pairs).
-- ---------------------------------------------------------------------------
do $$ begin
  if abs(app.contrast_ratio('#777777', '#ffffff') - 4.4781) > 0.001 then raise exception 'grey on white should be 4.478'; end if;
  if abs(app.contrast_ratio('#1f4e5a', '#f7f5f0') - 8.3959) > 0.001 then raise exception 'house brand on canvas should be 8.396'; end if;
  if abs(app.contrast_ratio('#000000', '#ffffff') - 21) > 0.0001 then raise exception 'black on white should be 21'; end if;
  if app.best_ink('#6b2d5c') <> '#ffffff' or app.best_ink('#e4a9d3') <> '#16222b' then raise exception 'best ink wrong'; end if;
  if app.hex_luminance('red') is not null or app.hex_luminance('#FFFFFF') is not null then raise exception 'only lower-case #rrggbb is read'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Brand validation: the closed shape is the lock (F-068).
-- ---------------------------------------------------------------------------
do $$ declare p text[]; begin
  if cardinality(app.tenant_brand_problems('{}')) <> 0 then raise exception 'empty brand should pass'; end if;
  if cardinality(app.tenant_brand_problems(app.demo_brand('a'))) <> 0 then raise exception 'demo look a fails: %', app.tenant_brand_problems(app.demo_brand('a')); end if;
  if cardinality(app.tenant_brand_problems(app.demo_brand('b'))) <> 0 then raise exception 'demo look b fails: %', app.tenant_brand_problems(app.demo_brand('b')); end if;

  p := app.tenant_brand_problems('{"custom_css": "body{display:none}", "hide_help_now": true, "script": "x"}');
  if cardinality(p) <> 3 then raise exception 'unknown settings should each be refused, got %', p; end if;

  -- Grey that fails as text on the light canvas, and a pale accent that no house ink can sit on.
  p := app.tenant_brand_problems('{"colours": {"light": {"primary": "#8a8a8a", "accent": "#7a7a7a"}, "dark": {"primary": "#7fc2cf", "accent": "#173c45"}}}');
  if not ('contrast light primary_canvas 3.16' = any(p)) then raise exception 'low contrast not reported as expected: %', p; end if;
  if not exists (select 1 from unnest(p) x where x like 'contrast light accent_band %') then raise exception 'accent band not checked: %', p; end if;
  if exists (select 1 from unnest(p) x where x like 'contrast dark %') then raise exception 'dark theme should pass: %', p; end if;

  -- The light colour reused in the dark theme fails there.
  p := app.tenant_brand_problems('{"colours": {"light": {"primary": "#1f4e5a", "accent": "#1f4e5a"}, "dark": {"primary": "#1f4e5a", "accent": "#1f4e5a"}}}');
  if not exists (select 1 from unnest(p) x where x like 'contrast dark primary_canvas %') then raise exception 'dark theme not checked: %', p; end if;

  if cardinality(app.tenant_brand_problems('{"colours": {"light": {"primary": "#1F4E5A", "accent": "#1f4e5a"}, "dark": {"primary": "#7fc2cf", "accent": "#173c45"}}}')) = 0 then
    raise exception 'upper-case hex should be refused'; end if;
  if cardinality(app.tenant_brand_problems('{"logo": {"src": "javascript:alert(1)", "alt": "x"}}')) = 0 then raise exception 'script logo accepted'; end if;
  if cardinality(app.tenant_brand_problems('{"logo": {"src": "https://evil.example/logo.svg", "alt": "x"}}')) = 0 then raise exception 'outside logo accepted'; end if;
  if cardinality(app.tenant_brand_problems('{"logo": {"src": "/brand/demo/logo-a.svg", "alt": ""}}')) = 0 then raise exception 'logo without alt accepted'; end if;
  if cardinality(app.tenant_brand_problems('{"logo": {"src": "https://abc.supabase.co/storage/v1/object/public/brand/w/logo.png", "alt": "W"}}')) <> 0 then
    raise exception 'Supabase public logo refused'; end if;
  if cardinality(app.tenant_brand_problems('{"footer_links": [{"label": "Shop", "href": "http://example.com"}]}')) = 0 then raise exception 'http link accepted'; end if;
  if cardinality(app.tenant_brand_problems('{"footer_links": [{"label": "<b>x</b>", "href": "https://example.com"}]}')) = 0 then raise exception 'markup label accepted'; end if;
  if cardinality(app.tenant_brand_problems('{"footer_links": [{"label": "Shop", "href": "https://example.com/a?b=1"}]}')) <> 0 then raise exception 'good link refused'; end if;
  if cardinality(app.tenant_brand_problems('{"legal_links": [{"label":"a","href":"https://a.example"},{"label":"b","href":"https://a.example"},{"label":"c","href":"https://a.example"},{"label":"d","href":"https://a.example"},{"label":"e","href":"https://a.example"}]}')) = 0 then
    raise exception 'five legal links accepted'; end if;
  if cardinality(app.tenant_brand_problems('{"sender_name": "noreply@evil"}')) = 0 then raise exception 'sender with @ accepted'; end if;
  if cardinality(app.tenant_brand_problems('{"font": "comic"}')) = 0 then raise exception 'unknown font accepted'; end if;
  if cardinality(app.tenant_brand_problems('[]')) = 0 then raise exception 'array brand accepted'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Tenant writes: the tenant's owner changes name and brand only; every
-- brand must pass; changes are audited.
-- ---------------------------------------------------------------------------
savepoint s3;
select test_as('a2300000-0000-0000-0000-000000000003');
do $$ declare n int; begin
  update public.tenants set name = 'Org W Reading', brand = '{"font": "serif", "sender_name": "Org W"}'::jsonb
  where id = 'a2300000-0000-0000-0000-0000000000b1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'tenant owner could not change name and brand'; end if;
  begin
    update public.tenants set status = 'suspended' where id = 'a2300000-0000-0000-0000-0000000000b1';
    raise exception 'tenant owner changed status';
  exception when sqlstate 'AKW02' then null; end;
  begin
    update public.tenants set slug = 'org-w2' where id = 'a2300000-0000-0000-0000-0000000000b1';
    raise exception 'tenant owner changed slug';
  exception when sqlstate 'AKW02' then null; end;
  begin
    update public.tenants set is_demo = true where id = 'a2300000-0000-0000-0000-0000000000b1';
    raise exception 'tenant owner changed the demo flag';
  exception when sqlstate 'AKW02' then null; end;
  begin
    update public.tenants set brand = '{"colours": {"light": {"primary": "#dddddd", "accent": "#1f4e5a"}, "dark": {"primary": "#7fc2cf", "accent": "#173c45"}}}'
    where id = 'a2300000-0000-0000-0000-0000000000b1';
    raise exception 'low-contrast brand stored';
  exception when sqlstate 'AKW01' then null; end;
  begin
    update public.tenants set name = '<script>' where id = 'a2300000-0000-0000-0000-0000000000b1';
    raise exception 'markup name stored';
  exception when sqlstate 'AKW01' then null; end;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.audit_log where action = 'tenant.brand_changed' and target = 'tenant:a2300000-0000-0000-0000-0000000000b1') <> 1 then
    raise exception 'brand change not audited once';
  end if;
end $$;
-- Staff and server code are held to the same brand rules.
select test_as('a2300000-0000-0000-0000-000000000001', array['editor']);
do $$ begin
  update public.tenants set status = 'suspended' where id = 'a2300000-0000-0000-0000-0000000000b1';
  begin
    update public.tenants set brand = '{"custom_css": "x"}' where id = 'a2300000-0000-0000-0000-0000000000b1';
    raise exception 'editor stored an unknown setting';
  exception when sqlstate 'AKW01' then null; end;
end $$;
reset role;
do $$ begin
  begin
    update public.tenants set brand = '{"hide_help_now": true}' where id = '00000000-0000-0000-0000-00000000000a';
    raise exception 'server code stored an unknown setting';
  exception when sqlstate 'AKW01' then null; end;
end $$;
rollback to savepoint s3;

-- ---------------------------------------------------------------------------
-- 4. tenant_site: anyone can read what the site needs, never the plan.
-- ---------------------------------------------------------------------------
savepoint s4;
select pg_temp.as_anon();
do $$ declare r record; begin
  select * into r from public.tenant_site('a2300000-0000-0000-0000-0000000000b1');
  if r.slug <> 'org-w' or r.kind <> 'white_label' or not r.powered_by then raise exception 'tenant_site wrong: %', r; end if;
end $$;
reset role;
update public.app_config set value = '["pro"]' where key = 'powered_by_hidden_plans';
select pg_temp.as_anon();
do $$ begin
  if (select powered_by from public.tenant_site('a2300000-0000-0000-0000-0000000000b1')) then
    raise exception 'powered by should follow the plan list';
  end if;
end $$;
reset role;
rollback to savepoint s4;

-- ---------------------------------------------------------------------------
-- 5. Listings on a real tenant: own workbooks only, no demo titles, ladder
-- points only; the marketplace takes no listing price.
-- ---------------------------------------------------------------------------
savepoint s5;
select test_as('a2300000-0000-0000-0000-000000000003');
do $$ begin
  insert into public.tenant_listings (tenant_id, workbook_id, price_point_id)
  values ('a2300000-0000-0000-0000-0000000000b1', 'a2300000-0000-0000-0000-0000000000d1', 'p3');
  begin
    insert into public.tenant_listings (tenant_id, workbook_id) values ('a2300000-0000-0000-0000-0000000000b1', 'a2300000-0000-0000-0000-0000000000d2');
    raise exception 'listed another organisation''s workbook';
  exception when sqlstate 'AKW03' then null; end;
  begin
    update public.tenant_listings set price_point_id = 'member_month' where tenant_id = 'a2300000-0000-0000-0000-0000000000b1';
    raise exception 'membership point used as a listing price';
  exception when sqlstate 'AKW04' then null; end;
end $$;
reset role;
do $$ begin
  begin
    insert into public.tenant_listings (tenant_id, workbook_id) values ('a2300000-0000-0000-0000-0000000000b1', 'a2300000-0000-0000-0000-0000000000d3');
    raise exception 'demo workbook listed on a real tenant';
  exception when sqlstate 'AKW03' then null; end;
  begin
    insert into public.tenant_listings (tenant_id, workbook_id, price_point_id) values ('00000000-0000-0000-0000-00000000000a', 'a2300000-0000-0000-0000-0000000000d2', 'p2');
    raise exception 'marketplace listing took a price';
  exception when sqlstate 'AKW04' then null; end;
end $$;
select pg_temp.as_anon();
do $$ declare r record; begin
  select * into r from public.tenant_catalogue('a2300000-0000-0000-0000-0000000000b1');
  if r.code <> 'AK-TW001' or r.price_point_id <> 'p3' then raise exception 'tenant catalogue wrong: %', r; end if;
end $$;
reset role;
-- A suspended tenant shows nothing.
update public.tenants set status = 'suspended' where id = 'a2300000-0000-0000-0000-0000000000b1';
select pg_temp.as_anon();
do $$ begin
  if exists (select 1 from public.tenant_catalogue('a2300000-0000-0000-0000-0000000000b1')) then raise exception 'suspended tenant catalogue shown'; end if;
end $$;
reset role;
rollback to savepoint s5;

-- ---------------------------------------------------------------------------
-- 6. The demo reset: staff only, idempotent, every portal state, a demo-only
-- catalogue, nothing for sale.
-- ---------------------------------------------------------------------------
select test_as('a2300000-0000-0000-0000-000000000004');
do $$ begin
  begin
    perform public.reset_demo_state();
    raise exception 'a reader reset the demo';
  exception when insufficient_privilege then null; end;
  begin
    perform public.reset_demo_state_job();
    raise exception 'a reader ran the reset job';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select test_as('a2300000-0000-0000-0000-000000000001', array['editor']);
do $$ declare r jsonb; begin
  r := public.reset_demo_state();
  if r->>'look' <> 'a' or (r->>'workbooks')::int <> 4 then raise exception 'reset result wrong: %', r; end if;
  -- AK-TW003 is the one live demo title outside the demo publisher here.
  if (r->>'listed')::int <> 2 then raise exception 'expected 2 listings, got %', r; end if;
  r := public.reset_demo_state('b');
  if r->>'look' <> 'b' then raise exception 'look b not applied'; end if;
  begin
    perform public.reset_demo_state('c');
    raise exception 'unknown look accepted';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;

do $$ declare s text; begin
  select string_agg(code || ':' || status, ',' order by code) into s from public.workbooks where org_id = '00000000-0000-0000-0000-0000000000d0';
  if s <> 'AK-DEM01:live,AK-DEM02:paused,AK-DEM03:in_review,AK-DEM04:draft' then raise exception 'portal states wrong: %', s; end if;
  if exists (select 1 from public.workbooks where org_id = '00000000-0000-0000-0000-0000000000d0' and (not is_demo or badge <> 'demo' or in_membership)) then
    raise exception 'a demo publisher workbook is not labelled demo or is in the membership';
  end if;
  if (select count(*) from public.imprints where org_id = '00000000-0000-0000-0000-0000000000d0') <> 2 then raise exception 'two imprints expected'; end if;
  if (select count(*) from public.authors where org_id = '00000000-0000-0000-0000-0000000000d0' and is_demo) <> 2 then raise exception 'two demo authors expected'; end if;
  if (select brand->'colours'->'light'->>'primary' from public.tenants where id = '00000000-0000-0000-0000-0000000000d1') <> '#23395d' then
    raise exception 'tenant should carry look b';
  end if;
  if not (select is_demo and kind = 'white_label' and status = 'active' from public.tenants where id = '00000000-0000-0000-0000-0000000000d1') then
    raise exception 'demo tenant flags wrong';
  end if;
  if not (select is_demo from public.organisations where id = '00000000-0000-0000-0000-0000000000d0') then raise exception 'demo org not flagged'; end if;
  if (select count(*) from public.audit_log where action = 'demo.reset') <> 2 then raise exception 'each reset should be audited'; end if;
end $$;

-- A real workbook cannot reach the demo site, and a demo user's own workbook is retired by the next reset.
do $$ begin
  begin
    insert into public.tenant_listings (tenant_id, workbook_id) values ('00000000-0000-0000-0000-0000000000d1', 'a2300000-0000-0000-0000-0000000000d2');
    raise exception 'real workbook listed on the demo site';
  exception when sqlstate 'AKW03' then null; end;
end $$;
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, status, badge, is_demo) values
  ('a2300000-0000-0000-0000-0000000000d9', 'AK-TW009', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d0',
   'demo-user-added', 'Added in a demo', 'Card', 'productivity', 'draft', 'demo', true);
update public.workbooks set status = 'live' where code = 'AK-DEM04';
update public.tenants set name = 'Changed in a sales call' where id = '00000000-0000-0000-0000-0000000000d1';

select pg_temp.as_anon();
do $$ declare s text; begin
  select string_agg(code, ',' order by featured desc, sort) into s from public.tenant_catalogue('00000000-0000-0000-0000-0000000000d1');
  if s <> 'AK-DEM01,AK-TW003' then raise exception 'demo catalogue wrong: %', s; end if;
  if (select price_point_id from public.tenant_catalogue('00000000-0000-0000-0000-0000000000d1') where code = 'AK-DEM01') <> 'p2' then
    raise exception 'demo listing price not shown';
  end if;
end $$;
reset role;

-- The cron job runs as the service role.
set local role service_role;
do $$ declare r jsonb; begin
  r := public.reset_demo_state_job();
  if (r->>'retired')::int <> 1 then raise exception 'the demo user''s workbook should be retired: %', r; end if;
end $$;
reset role;
do $$ begin
  if (select status from public.workbooks where code = 'AK-DEM04') <> 'draft' then raise exception 'reset did not restore the draft'; end if;
  if (select status from public.workbooks where code = 'AK-TW009') <> 'retired' then raise exception 'added workbook not retired'; end if;
  if (select name from public.tenants where id = '00000000-0000-0000-0000-0000000000d1') <> 'Quillmoor Demo Press' then raise exception 'name not restored'; end if;
  -- The job keeps the last chosen look.
  if (select brand->>'font' from public.tenants where id = '00000000-0000-0000-0000-0000000000d1') <> 'humanist' then raise exception 'look b not kept'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Demo logins: owners register existing, non-staff, non-real accounts;
-- the reset makes them the only members.
-- ---------------------------------------------------------------------------
select test_as('a2300000-0000-0000-0000-000000000001', array['editor']);
do $$ begin
  begin
    perform public.add_demo_account('demo-author@test', 'author');
    raise exception 'an editor registered a demo login';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select test_as('a2300000-0000-0000-0000-000000000002', array['owner']);
do $$ begin
  begin perform public.add_demo_account('nobody@test', 'author'); raise exception 'unknown email accepted';
  exception when sqlstate 'AKW05' then null; end;
  begin perform public.add_demo_account('editor23@test', 'author'); raise exception 'staff account accepted';
  exception when sqlstate 'AKW05' then null; end;
  begin perform public.add_demo_account('realauthor23@test', 'author'); raise exception 'real organisation member accepted';
  exception when sqlstate 'AKW05' then null; end;
  begin perform public.add_demo_account('demo-author@test', 'reader'); raise exception 'unknown kind accepted';
  exception when sqlstate 'AKW05' then null; end;
  perform public.add_demo_account('demo-author@test', 'author');
  perform public.add_demo_account('demo-publisher@test', 'publisher'); -- case does not matter
end $$;
reset role;

-- Someone a demo user invited during a call.
insert into public.org_members (org_id, user_id, role) values ('00000000-0000-0000-0000-0000000000d0', 'a2300000-0000-0000-0000-000000000004', 'editor');

select test_as('a2300000-0000-0000-0000-000000000001', array['editor']);
do $$ declare r jsonb; n int; begin
  r := public.reset_demo_state();
  if not (r->>'publisher_login')::boolean or not (r->>'author_login')::boolean then raise exception 'logins not applied: %', r; end if;
  select count(*) into n from public.demo_account_list();
  if n <> 2 then raise exception 'editor should see two demo logins, saw %', n; end if;
end $$;
reset role;

do $$ declare s text; begin
  select string_agg(user_id::text || ':' || role, ',' order by role) into s from public.org_members where org_id = '00000000-0000-0000-0000-0000000000d0';
  if s <> 'a2300000-0000-0000-0000-000000000005:author,a2300000-0000-0000-0000-000000000006:owner' then raise exception 'demo members wrong: %', s; end if;
  if (select user_id from public.authors where id = '00000000-0000-0000-0000-0000000000d4') <> 'a2300000-0000-0000-0000-000000000005' then
    raise exception 'demo author profile not linked to the demo author login';
  end if;
  if (select role from public.tenant_members where tenant_id = '00000000-0000-0000-0000-0000000000d1' and user_id = 'a2300000-0000-0000-0000-000000000006') <> 'tenant_admin' then
    raise exception 'demo publisher is not the tenant admin';
  end if;
  if exists (select 1 from public.audit_log where action like 'demo.account%' and (coalesce(after::text, '') || coalesce(before::text, '')) like '%@%') then
    raise exception 'an email reached the audit log';
  end if;
end $$;

-- A reader cannot see the list or the table.
select test_as('a2300000-0000-0000-0000-000000000004');
do $$ begin
  if exists (select 1 from public.demo_accounts) then raise exception 'reader read demo accounts'; end if;
  if exists (select 1 from public.demo_account_list()) then raise exception 'reader read the demo login list'; end if;
end $$;
reset role;

select test_as('a2300000-0000-0000-0000-000000000002', array['owner']);
do $$ begin
  if not public.remove_demo_account('a2300000-0000-0000-0000-000000000005') then raise exception 'remove failed'; end if;
end $$;
reset role;
do $$ begin
  if exists (select 1 from public.org_members where org_id = '00000000-0000-0000-0000-0000000000d0' and user_id = 'a2300000-0000-0000-0000-000000000005') then
    raise exception 'removed demo author still a member';
  end if;
  if (select user_id from public.authors where id = '00000000-0000-0000-0000-0000000000d4') is not null then raise exception 'profile link not cleared'; end if;
end $$;

-- A demo title still cannot be bought (0004), on any tenant.
do $$ begin
  begin
    insert into public.purchases (user_id, tenant_id, kind, workbook_id, stripe_checkout_session_id, currency)
    values ('a2300000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000d1', 'workbook', '00000000-0000-0000-0000-0000000000f1', 'cs_demo_23', 'GBP');
    raise exception 'demo title bought';
  exception when others then
    if sqlerrm like 'demo title bought' then raise; end if;
  end;
end $$;

rollback;
