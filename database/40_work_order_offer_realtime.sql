-- Publish offer inserts and responses for persistent global offer prompts.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'work_order_offers'
  ) then
    alter publication supabase_realtime add table public.work_order_offers;
  end if;
end;
$$;
