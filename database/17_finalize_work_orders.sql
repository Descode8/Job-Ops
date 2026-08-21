-- Explicit contractor finalization. A note is optional; all checklist items,
-- at least one supported job photo, and one PDF invoice are required.

create or replace function public.refresh_work_order_status(p_work_order_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_contractor_id uuid := public.current_contractor_id();
  v_has_activity boolean;
  v_current_status public.work_order_status;
begin
  if v_contractor_id is null then raise exception 'An active contractor account is required'; end if;
  if not exists (select 1 from public.work_order_assignments wa where wa.work_order_id = p_work_order_id and wa.contractor_id = v_contractor_id and wa.unassigned_at is null)
    and not public.is_office_user() then raise exception 'This work order is not assigned to you'; end if;
  select status into v_current_status from public.work_orders where id = p_work_order_id;
  if v_current_status = 'completed' then return v_current_status::text; end if;
  select exists (select 1 from public.work_order_checklist where work_order_id = p_work_order_id and is_complete)
    or exists (select 1 from public.work_order_files where work_order_id = p_work_order_id)
    or exists (select 1 from public.work_order_notes where work_order_id = p_work_order_id)
  into v_has_activity;
  v_current_status := case when v_has_activity then 'in_progress' else 'not_started' end;
  update public.work_orders set status = v_current_status where id = p_work_order_id;
  return v_current_status::text;
end;
$$;

create or replace function public.finalize_work_order(p_work_order_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_contractor_id uuid := public.current_contractor_id();
  v_active_items integer;
  v_completed_items integer;
  v_has_photo boolean;
  v_has_invoice boolean;
begin
  if v_contractor_id is null then raise exception 'An active contractor account is required'; end if;
  if not exists (select 1 from public.work_order_assignments wa where wa.work_order_id = p_work_order_id and wa.contractor_id = v_contractor_id and wa.unassigned_at is null)
    and not public.is_office_user() then raise exception 'This work order is not assigned to you'; end if;
  select count(*) into v_active_items from public.home_checklist_items where is_active;
  select count(*) into v_completed_items from public.work_order_checklist wc
    join public.home_checklist_items ci on ci.id = wc.checklist_item_id
    where wc.work_order_id = p_work_order_id and wc.is_complete and ci.is_active;
  select exists (select 1 from public.work_order_files where work_order_id = p_work_order_id
    and file_type in ('issue_photo', 'parts_photo', 'before_photo', 'after_photo', 'completion_photo')
    and lower(mime_type) in ('image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif', 'image/webp')) into v_has_photo;
  select exists (select 1 from public.work_order_files where work_order_id = p_work_order_id
    and file_type = 'invoice' and lower(mime_type) = 'application/pdf') into v_has_invoice;
  if v_active_items = 0 or v_completed_items <> v_active_items then raise exception 'Complete every checklist item before finalizing'; end if;
  if not v_has_photo then raise exception 'Upload at least one supported job photo before finalizing'; end if;
  if not v_has_invoice then raise exception 'Upload a PDF invoice before finalizing'; end if;
  update public.work_orders set status = 'completed' where id = p_work_order_id;
  return 'completed';
end;
$$;

revoke all on function public.finalize_work_order(uuid) from public;
grant execute on function public.finalize_work_order(uuid) to authenticated;
