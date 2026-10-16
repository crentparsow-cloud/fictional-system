-- 0047 Indexes for foreign keys the Supabase performance advisor reported as
-- unindexed (collections, funnel_visitors, membership_seats, reminder_log,
-- shelves). Parent deletes and joins on these columns no longer scan the table.
-- Nothing else changes. The migration editor runs this inside begin/commit, so
-- the indexes are not built concurrently.

create index if not exists collections_cover_genre_idx on public.collections (cover_genre);
create index if not exists funnel_visitors_tenant_id_idx on public.funnel_visitors (tenant_id);
create index if not exists funnel_visitors_workbook_id_idx on public.funnel_visitors (workbook_id);
create index if not exists membership_seats_tenant_id_idx on public.membership_seats (tenant_id);
create index if not exists reminder_log_user_id_idx on public.reminder_log (user_id);
create index if not exists shelves_featured_workbook_id_idx on public.shelves (featured_workbook_id);
