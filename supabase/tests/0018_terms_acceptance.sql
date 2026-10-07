-- Versioned terms acceptance (F-122). Each block must raise or return the
-- expected result; a failure aborts the script and the CI step.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('a18a18a1-0000-0000-0000-0000000000a1', 'terms-a@test'),
  ('a18a18a1-0000-0000-0000-0000000000b1', 'terms-b@test'),
  ('a18a18a1-0000-0000-0000-0000000000c1', 'terms-owner@test');

insert into public.organisations (id, kind, legal_name, display_name, slug, country) values
  ('a18a18a1-0000-0000-0000-00000000f001', 'publisher', 'Terms Test Press Ltd', 'Terms Test Press', 'terms-test-press', 'GB');
insert into public.org_members (org_id, user_id, role) values
  ('a18a18a1-0000-0000-0000-00000000f001', 'a18a18a1-0000-0000-0000-0000000000c1', 'owner');

-- The seed version is public, in force and a draft.
set local role anon;
do $$ declare v text; d boolean; n int; begin
  select version, is_draft into v, d from public.current_terms('reader_terms');
  if v is distinct from 'reader-2026-10' or d is not true then raise exception 'seed reader terms not current: % %', v, d; end if;
  select count(*) into n from public.terms_versions;
  if n < 1 then raise exception 'anon cannot read the terms register'; end if;
  begin
    perform public.accept_terms('reader_terms', 'reader-2026-10', 'signup');
    raise exception 'anon accepted terms';
  exception when insufficient_privilege then null; end;
  begin
    perform public.terms_status('reader_terms');
    raise exception 'anon read terms status';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.terms_versions (doc, version, effective_at) values ('reader_terms', 'anon-1', now());
    raise exception 'anon wrote a terms version';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Reader A: needs acceptance, accepts at sign-up, then is asked again after a new version.
savepoint s1;
select test_as('a18a18a1-0000-0000-0000-0000000000a1');
do $$ declare r record; n int; begin
  select * into r from public.terms_status('reader_terms');
  if r.current_version <> 'reader-2026-10' or r.accepted_version is not null or r.needs_acceptance is not true then
    raise exception 'fresh reader status wrong: %', r;
  end if;

  perform public.accept_terms('reader_terms', 'reader-2026-10', 'signup');
  select * into r from public.terms_status('reader_terms');
  if r.accepted_version <> 'reader-2026-10' or r.needs_acceptance then raise exception 'acceptance not recorded: %', r; end if;

  -- accepting at checkout adds a row, it does not replace one
  perform public.accept_terms('reader_terms', 'reader-2026-10', 'checkout', '00000000-0000-0000-0000-00000000000a');
  select count(*) into n from public.terms_acceptances;
  if n <> 2 then raise exception 'reader A sees % acceptance rows, expected 2', n; end if;
  select count(*) into n from public.terms_acceptances where was_draft and context = 'checkout';
  if n <> 1 then raise exception 'draft flag or context not kept'; end if;

  -- unknown versions and bad fields are refused
  begin
    perform public.accept_terms('reader_terms', 'reader-1999-01', 'signup');
    raise exception 'an unknown version was accepted';
  exception when sqlstate 'AKT02' then null; end;
  begin
    perform public.accept_terms('reader_terms', 'reader-2026-10', 'sideways');
    raise exception 'an unknown context was accepted';
  exception when sqlstate 'AKT03' then null; end;
  begin
    perform public.accept_terms('reader_terms', 'reader-2026-10', 'business');
    raise exception 'reader terms accepted in a business context';
  exception when sqlstate 'AKT03' then null; end;
  begin
    perform public.accept_terms('reader_terms', 'reader-2026-10', 'signup', null, 'a18a18a1-0000-0000-0000-00000000f001');
    raise exception 'reader terms accepted for an organisation';
  exception when sqlstate 'AKT03' then null; end;

  -- a reader cannot publish, edit or delete
  begin
    perform public.publish_terms_version('reader_terms', 'reader-forged', now());
    raise exception 'a reader published terms';
  exception when sqlstate 'AKT01' then null; end;
  begin
    update public.terms_acceptances set version = 'reader-forged';
    raise exception 'a reader edited an acceptance';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.terms_acceptances;
    raise exception 'a reader deleted an acceptance';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.terms_acceptances (user_id, doc, version, context, was_draft)
    values ('a18a18a1-0000-0000-0000-0000000000a1', 'reader_terms', 'reader-2026-10', 'signup', false);
    raise exception 'a reader inserted an acceptance directly';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- A platform owner publishes a new reader version: A must be asked again.
select test_as('a18a18a1-0000-0000-0000-0000000000c1', array['owner']);
do $$ begin
  perform public.publish_terms_version('reader_terms', 'reader-2026-11', null, 'Test change', true);
end $$;
reset role;
select test_as('a18a18a1-0000-0000-0000-0000000000a1');
do $$ declare r record; begin
  select * into r from public.terms_status('reader_terms');
  if r.current_version <> 'reader-2026-11' or r.accepted_version <> 'reader-2026-10' or r.needs_acceptance is not true then
    raise exception 're-ask not triggered: %', r;
  end if;
  perform public.accept_terms('reader_terms', 'reader-2026-11', 'reask');
  select * into r from public.terms_status('reader_terms');
  if r.needs_acceptance then raise exception 're-ask acceptance not recorded: %', r; end if;
end $$;
reset role;

-- Versions are append only, even for the table owner path through a client role.
do $$ begin
  begin
    update public.terms_versions set summary = 'changed' where version = 'reader-2026-10';
    raise exception 'a terms version was edited';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.terms_versions where version = 'reader-2026-10';
    raise exception 'a terms version was deleted';
  exception when insufficient_privilege then null; end;
end $$;

-- Business documents need 15 days' notice and cannot be accepted as drafts or before they take effect.
do $$ begin
  begin
    insert into public.terms_versions (doc, version, published_at, effective_at)
    values ('publisher_terms', 'pub-short', now(), now() + interval '3 days');
    raise exception 'business terms with 3 days notice were added';
  exception when check_violation then null; end;
end $$;
insert into public.terms_versions (doc, version, is_draft, published_at, effective_at) values
  ('publisher_terms', 'pub-draft', true,  now() - interval '30 days', now() - interval '15 days'),
  ('publisher_terms', 'pub-future', false, now(), now() + interval '15 days'),
  ('publisher_terms', 'pub-final', false, now() - interval '20 days', now() - interval '5 days');

-- Reader B cannot act for the organisation, cannot see A's rows.
select test_as('a18a18a1-0000-0000-0000-0000000000b1');
do $$ declare n int; begin
  select count(*) into n from public.terms_acceptances;
  if n <> 0 then raise exception 'reader B sees % acceptance rows', n; end if;
  begin
    perform public.accept_terms('publisher_terms', 'pub-final', 'business', null, 'a18a18a1-0000-0000-0000-00000000f001');
    raise exception 'a non-member accepted for the organisation';
  exception when sqlstate 'AKT01' then null; end;
  begin
    perform public.terms_status('publisher_terms', 'a18a18a1-0000-0000-0000-00000000f001');
    raise exception 'a non-member read the organisation terms status';
  exception when sqlstate 'AKT01' then null; end;
end $$;
reset role;

-- The organisation owner accepts the final version only.
select test_as('a18a18a1-0000-0000-0000-0000000000c1');
do $$ declare r record; n int; begin
  begin
    perform public.accept_terms('publisher_terms', 'pub-draft', 'business', null, 'a18a18a1-0000-0000-0000-00000000f001');
    raise exception 'a business party accepted a draft';
  exception when sqlstate 'AKT02' then null; end;
  begin
    perform public.accept_terms('publisher_terms', 'pub-future', 'business', null, 'a18a18a1-0000-0000-0000-00000000f001');
    raise exception 'a version not yet in force was accepted';
  exception when sqlstate 'AKT02' then null; end;
  begin
    perform public.accept_terms('publisher_terms', 'pub-final', 'business');
    raise exception 'business terms accepted with no organisation';
  exception when sqlstate 'AKT01' then null; end;
  perform public.accept_terms('publisher_terms', 'pub-final', 'business', null, 'a18a18a1-0000-0000-0000-00000000f001');
  select * into r from public.terms_status('publisher_terms', 'a18a18a1-0000-0000-0000-00000000f001');
  if r.current_version <> 'pub-final' or r.needs_acceptance then raise exception 'organisation status wrong: %', r; end if;
  select count(*) into n from public.terms_acceptances where org_id = 'a18a18a1-0000-0000-0000-00000000f001';
  if n <> 1 then raise exception 'owner sees % organisation rows', n; end if;
end $$;
reset role;

-- The business acceptance is audited; a reader acceptance is not (it is its own record).
do $$ declare n int; begin
  select count(*) into n from public.audit_log where action = 'terms.accept' and target = 'publisher_terms:pub-final';
  if n <> 1 then raise exception 'business acceptance audit rows: %', n; end if;
  select count(*) into n from public.audit_log where action = 'terms.publish' and target = 'reader_terms:reader-2026-11';
  if n <> 1 then raise exception 'publish audit rows: %', n; end if;
end $$;

-- Rate limit: a 21st acceptance inside an hour is refused.
select test_as('a18a18a1-0000-0000-0000-0000000000b1');
do $$ begin
  for i in 1..20 loop
    perform public.accept_terms('reader_terms', 'reader-2026-11', 'signup');
  end loop;
  begin
    perform public.accept_terms('reader_terms', 'reader-2026-11', 'signup');
    raise exception 'the 21st acceptance in an hour went through';
  exception when sqlstate 'AKT29' then null; end;
end $$;
reset role;

-- Deleting the account removes its acceptances.
delete from auth.users where id = 'a18a18a1-0000-0000-0000-0000000000a1';
do $$ declare n int; begin
  select count(*) into n from public.terms_acceptances where user_id = 'a18a18a1-0000-0000-0000-0000000000a1';
  if n <> 0 then raise exception 'acceptances survived account deletion'; end if;
end $$;
rollback to savepoint s1;

rollback;
\echo PASS 0018_terms_acceptance
