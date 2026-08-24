-- Publish work-order and assignment changes so open app screens can refresh
-- immediately when statuses or assignees change.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'work_orders'
  ) then
    alter publication supabase_realtime add table public.work_orders;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'work_order_assignments'
  ) then
    alter publication supabase_realtime add table public.work_order_assignments;
  end if;
end;
$$;
