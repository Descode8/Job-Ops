-- Persist an email outbox item in the transaction that completes a work order.
create or replace function public.queue_work_order_completion_email()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    insert into public.email_deliveries (work_order_id, recipient_email, subject, email_type, status)
    select new.id, 'jhumphries@shopmwhs.net', 'JobOps Service Completion', 'completion_notice', 'queued'
    where not exists (
      select 1 from public.email_deliveries delivery
      where delivery.work_order_id = new.id and delivery.email_type = 'completion_notice'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists work_orders_queue_completion_email on public.work_orders;
create trigger work_orders_queue_completion_email
after update of status on public.work_orders
for each row execute function public.queue_work_order_completion_email();
