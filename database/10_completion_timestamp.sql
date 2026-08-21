-- Adds automatic completion timestamps to an existing database.
-- Run once after the original schema has been applied.

create or replace function public.set_work_order_completion_date()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'completed' and (old.status is distinct from 'completed' or new.completed_at is null) then
    new.completed_at = coalesce(new.completed_at, timezone('utc', now()));
  end if;
  return new;
end;
$$;

drop trigger if exists work_orders_set_completion_date on public.work_orders;
create trigger work_orders_set_completion_date
before update on public.work_orders
for each row execute function public.set_work_order_completion_date();