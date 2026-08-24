-- Permit only one invoice attachment per work order.

create or replace function public.enforce_single_invoice_attachment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.file_type = 'invoice' and exists (
    select 1 from public.work_order_files wf
    where wf.work_order_id = new.work_order_id
      and wf.file_type = 'invoice'
      and wf.id <> new.id
  ) then
    raise exception 'Only one invoice attachment is allowed per work order';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_single_invoice_attachment on public.work_order_files;
create trigger enforce_single_invoice_attachment
before insert or update of work_order_id, file_type on public.work_order_files
for each row execute function public.enforce_single_invoice_attachment();
