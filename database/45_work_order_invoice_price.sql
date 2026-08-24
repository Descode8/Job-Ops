-- Store an invoice price independently from an optional PDF attachment.

alter table public.work_orders
add column if not exists invoice_amount numeric(12, 2)
check (invoice_amount is null or invoice_amount >= 0);

update public.work_orders wo
set invoice_amount = (
  select wf.invoice_amount
  from public.work_order_files wf
  where wf.work_order_id = wo.id and wf.file_type = 'invoice' and wf.invoice_amount is not null
  order by wf.created_at desc
  limit 1
)
where wo.invoice_amount is null
  and exists (
    select 1 from public.work_order_files wf
    where wf.work_order_id = wo.id and wf.file_type = 'invoice' and wf.invoice_amount is not null
  );

create or replace function public.set_work_order_invoice_price(p_work_order_id uuid, p_invoice_amount numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contractor_id uuid := public.current_contractor_id();
begin
  if p_invoice_amount is null or p_invoice_amount < 0 then raise exception 'Invoice price must be $0 or more'; end if;
  if v_contractor_id is null then raise exception 'An active contractor account is required'; end if;
  if not public.is_office_user() and not exists (
    select 1 from public.work_order_assignments wa
    where wa.work_order_id = p_work_order_id
      and wa.contractor_id = v_contractor_id
      and wa.unassigned_at is null
  ) then raise exception 'This work order is not assigned to you'; end if;

  update public.work_orders set invoice_amount = p_invoice_amount where id = p_work_order_id;
  if not found then raise exception 'Work order not found'; end if;
  return p_invoice_amount;
end;
$$;

revoke all on function public.set_work_order_invoice_price(uuid, numeric) from public;
grant execute on function public.set_work_order_invoice_price(uuid, numeric) to authenticated;
