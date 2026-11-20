-- Reader 1 has enrolments in tenant A, tenant B and the marketplace.
-- Reader 2 has one in tenant A.
insert into auth.users (id, email) values
  ('a7300000-0000-0000-0000-000000000001', 'reader73a@test'),
  ('a7300000-0000-0000-0000-000000000002', 'reader73b@test'),
  ('a7300000-0000-0000-0000-000000000003', 'owner73@test');
insert into public.profiles (user_id) values
  ('a7300000-0000-0000-0000-000000000001'), ('a7300000-0000-0000-0000-000000000002'), ('a7300000-0000-0000-0000-000000000003')
on conflict (user_id) do nothing;

insert into public.organisations (id, code, kind, legal_name, display_name, slug, country) values
  ('a7300000-0000-0000-0000-0000000000a1', 'PB-TS73A', 'publisher', 'Org 73A Ltd', 'Org 73A', 'org-73a', 'GB'),
  ('a7300000-0000-0000-0000-0000000000a2', 'PB-TS73B', 'publisher', 'Org 73B Ltd', 'Org 73B', 'org-73b', 'GB');
insert into public.org_members (org_id, user_id, role) values
  ('a7300000-0000-0000-0000-0000000000a1', 'a7300000-0000-0000-0000-000000000003', 'owner');
insert into public.tenants (id, slug, kind, org_id, name, plan) values
  ('a7300000-0000-0000-0000-0000000000b1', 'org-73a', 'white_label', 'a7300000-0000-0000-0000-0000000000a1', 'Org 73A Books', 'pro'),
  ('a7300000-0000-0000-0000-0000000000b2', 'org-73b', 'white_label', 'a7300000-0000-0000-0000-0000000000a2', 'Org 73B Books', 'pro');
insert into public.books (id, org_id, slug, title) values
  ('a7300000-0000-0000-0000-0000000000c1', 'a7300000-0000-0000-0000-0000000000a1', 'book-73a', 'Book 73A'),
  ('a7300000-0000-0000-0000-0000000000c2', 'a7300000-0000-0000-0000-0000000000a2', 'book-73b', 'Book 73B');
-- d1 and d3 belong to org A; d1 is listed by tenant A, d3 is not. d2 is org B's.
insert into public.workbooks (id, code, book_id, org_id, slug, title, card_line, genre_id, depth, status, badge, is_demo) values
  ('a7300000-0000-0000-0000-0000000000d1', 'AK-T73A1', 'a7300000-0000-0000-0000-0000000000c1', 'a7300000-0000-0000-0000-0000000000a1',
   'wb-73a', 'Workbook 73A', 'Card', 'productivity', 'full', 'live', 'official', false),
  ('a7300000-0000-0000-0000-0000000000d2', 'AK-T73B1', 'a7300000-0000-0000-0000-0000000000c2', 'a7300000-0000-0000-0000-0000000000a2',
   'wb-73b', 'Workbook 73B', 'Card', 'productivity', 'full', 'live', 'official', false),
  ('a7300000-0000-0000-0000-0000000000d3', 'AK-T73A3', 'a7300000-0000-0000-0000-0000000000c1', 'a7300000-0000-0000-0000-0000000000a1',
   'wb-73a3', 'Workbook 73A3', 'Card', 'productivity', 'full', 'live', 'official', false);
insert into public.workbook_versions (id, workbook_id, semver, content, content_hash) values
  ('a7300000-0000-0000-0000-0000000000e1', 'a7300000-0000-0000-0000-0000000000d1', '1.0.0', '{"structure":{"unit":"week","count":2}}'::jsonb, repeat('a', 64)),
  ('a7300000-0000-0000-0000-0000000000e2', 'a7300000-0000-0000-0000-0000000000d2', '1.0.0', '{"structure":{"unit":"week","count":2}}'::jsonb, repeat('b', 64)),
  ('a7300000-0000-0000-0000-0000000000e3', 'a7300000-0000-0000-0000-0000000000d3', '1.0.0', '{"structure":{"unit":"week","count":2}}'::jsonb, repeat('c', 64)),
  ('a7300000-0000-0000-0000-0000000000e4', 'a7300000-0000-0000-0000-0000000000d1', '0.9.0', '{"structure":{"unit":"week","count":2}}'::jsonb, repeat('d', 64));
update public.workbooks set current_version_id = 'a7300000-0000-0000-0000-0000000000e1' where id = 'a7300000-0000-0000-0000-0000000000d1';
update public.workbooks set current_version_id = 'a7300000-0000-0000-0000-0000000000e2' where id = 'a7300000-0000-0000-0000-0000000000d2';
update public.workbooks set current_version_id = 'a7300000-0000-0000-0000-0000000000e3' where id = 'a7300000-0000-0000-0000-0000000000d3';
insert into public.workbook_sections (version_id, kind, unit_number, body, free) values
  ('a7300000-0000-0000-0000-0000000000e1', 'listing', null, '{}'::jsonb, false),
  ('a7300000-0000-0000-0000-0000000000e1', 'unit', 1, '{}'::jsonb, true),
  ('a7300000-0000-0000-0000-0000000000e1', 'unit', 2, '{}'::jsonb, false),
  ('a7300000-0000-0000-0000-0000000000e2', 'listing', null, '{}'::jsonb, false),
  ('a7300000-0000-0000-0000-0000000000e2', 'unit', 1, '{}'::jsonb, true),
  ('a7300000-0000-0000-0000-0000000000e3', 'unit', 1, '{}'::jsonb, true);
insert into public.tenant_listings (tenant_id, workbook_id) values
  ('a7300000-0000-0000-0000-0000000000b1', 'a7300000-0000-0000-0000-0000000000d1'),
  ('a7300000-0000-0000-0000-0000000000b2', 'a7300000-0000-0000-0000-0000000000d2');

insert into public.enrolments (id, user_id, tenant_id, workbook_id, version_id) values
  -- reader 1, tenant B
  ('a7300000-0000-0000-0000-0000000000f2', 'a7300000-0000-0000-0000-000000000001', 'a7300000-0000-0000-0000-0000000000b2',
   'a7300000-0000-0000-0000-0000000000d2', 'a7300000-0000-0000-0000-0000000000e2'),
  -- reader 1, marketplace, the same workbook tenant A lists
  ('a7300000-0000-0000-0000-0000000000f3', 'a7300000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   'a7300000-0000-0000-0000-0000000000d1', 'a7300000-0000-0000-0000-0000000000e1'),
  -- reader 2, tenant A
  ('a7300000-0000-0000-0000-0000000000f4', 'a7300000-0000-0000-0000-000000000002', 'a7300000-0000-0000-0000-0000000000b1',
   'a7300000-0000-0000-0000-0000000000d1', 'a7300000-0000-0000-0000-0000000000e1');
insert into public.answers (enrolment_id, field, sealed, key_id) values
  ('a7300000-0000-0000-0000-0000000000f2', 'f1', 'v1.b', 'k1'),
  ('a7300000-0000-0000-0000-0000000000f3', 'f1', 'v1.m', 'k1'),
  ('a7300000-0000-0000-0000-0000000000f4', 'f1', 'v1.o', 'k1');
insert into public.progress_events (enrolment_id, kind, ref) values
  ('a7300000-0000-0000-0000-0000000000f2', 'unit_opened', '1'),
  ('a7300000-0000-0000-0000-0000000000f3', 'unit_opened', '1'),
  ('a7300000-0000-0000-0000-0000000000f4', 'unit_opened', '1');

insert into auth.sessions (id, user_id) values
  ('a7300000-0000-0000-0000-000000005e01', 'a7300000-0000-0000-0000-000000000001'),
  ('a7300000-0000-0000-0000-000000005e04', 'a7300000-0000-0000-0000-000000000002');
insert into public.feature_flags (key, scope, scope_id, enabled, reason) values
  ('tenant_sign_in', 'tenant', 'a7300000-0000-0000-0000-0000000000b1', true, 'test'),
  ('tenant_sign_in', 'tenant', 'a7300000-0000-0000-0000-0000000000b2', true, 'test');
-- reader 1 also has an enrolment in tenant A (f1) with an answer
insert into public.enrolments (id, user_id, tenant_id, workbook_id, version_id) values
  ('a7300000-0000-0000-0000-0000000000f1', 'a7300000-0000-0000-0000-000000000001', 'a7300000-0000-0000-0000-0000000000b1',
   'a7300000-0000-0000-0000-0000000000d1', 'a7300000-0000-0000-0000-0000000000e1');
insert into public.answers (enrolment_id, field, sealed, key_id) values ('a7300000-0000-0000-0000-0000000000f1', 'f1', 'v1.a', 'k1');
insert into public.tenant_domains (host, tenant_id, verified_at) values ('books.a73.example', 'a7300000-0000-0000-0000-0000000000b1', now());
select public.register_tenant_session('a7300000-0000-0000-0000-000000005e01', 'a7300000-0000-0000-0000-000000000001', 'a7300000-0000-0000-0000-0000000000b1', 'books.a73.example');
