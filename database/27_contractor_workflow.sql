-- Simplify contractor completion to performed-work evidence plus a priced PDF
-- invoice, and correct legacy recipient addresses.

alter table public.work_order_files
add column if not exists invoice_amount numeric(12, 2)
check (invoice_amount is null or invoice_amount > 0);

update public.work_orders
set recipient_email = 'jhumphries@shopmwhs.net'
where lower(recipient_email) <> 'jhumphries@shopmwhs.net';

update public.email_deliveries
set recipient_email = 'jhumphries@shopmwhs.net'
where status = 'queued' and lower(recipient_email) <> 'jhumphries@shopmwhs.net';

create or replace function public.finalize_work_order(p_work_order_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_contractor_id uuid := public.current_contractor_id();
  v_has_photo boolean;
  v_has_priced_invoice boolean;
begin
  if v_contractor_id is null then raise exception 'An active contractor account is required'; end if;
  if not exists (select 1 from public.work_order_assignments wa where wa.work_order_id = p_work_order_id and wa.contractor_id = v_contractor_id and wa.unassigned_at is null)
    and not public.is_office_user() then raise exception 'This work order is not assigned to you'; end if;

  select exists (select 1 from public.work_order_files where work_order_id = p_work_order_id
    and file_type in ('issue_photo', 'parts_photo', 'before_photo', 'after_photo', 'completion_photo')
    and lower(mime_type) in ('image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif', 'image/webp')) into v_has_photo;
  select exists (select 1 from public.work_order_files where work_order_id = p_work_order_id
    and file_type = 'invoice' and lower(mime_type) = 'application/pdf' and invoice_amount > 0) into v_has_priced_invoice;

  if not v_has_photo then raise exception 'Upload at least one photo of work performed before finalizing'; end if;
  if not v_has_priced_invoice then raise exception 'Upload a PDF invoice and enter its price before finalizing'; end if;

  update public.work_orders set status = 'completed' where id = p_work_order_id;
  return 'completed';
end;
$$;

revoke all on function public.finalize_work_order(uuid) from public;
grant execute on function public.finalize_work_order(uuid) to authenticated;
