-- 0047 Foreign key indexes: each index named in the migration exists on the
-- right table and column. Each block must raise or return the expected value;
-- a failure aborts the script.
\set ON_ERROR_STOP on

begin;

do $$
declare
  want text[][] := array[
    ['collections', 'collections_cover_genre_idx', 'cover_genre'],
    ['funnel_visitors', 'funnel_visitors_tenant_id_idx', 'tenant_id'],
    ['funnel_visitors', 'funnel_visitors_workbook_id_idx', 'workbook_id'],
    ['membership_seats', 'membership_seats_tenant_id_idx', 'tenant_id'],
    ['reminder_log', 'reminder_log_user_id_idx', 'user_id'],
    ['shelves', 'shelves_featured_workbook_id_idx', 'featured_workbook_id']
  ];
  i int;
begin
  for i in 1 .. array_length(want, 1) loop
    if not exists (
      select 1 from pg_indexes
      where schemaname = 'public'
        and tablename = want[i][1]
        and indexname = want[i][2]
        and indexdef like '%(' || want[i][3] || ')'
    ) then
      raise exception 'index % on %(%) is missing', want[i][2], want[i][1], want[i][3];
    end if;
  end loop;
end $$;

rollback;
