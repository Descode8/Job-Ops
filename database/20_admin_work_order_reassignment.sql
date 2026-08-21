-- Admin-only work-order reassignment with notifications and audit history.

create or replace function public.admin_reassign_work_order(p_work_order_id uuid, p_contractor_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_admin_id uuid := public.current_contractor_id();
  v_work_order_number text;
begin
  if not public.is_office_user() then raise exception 'Admin access required'; end if;
  if not exists (select 1 from public.contractors where id = p_contractor_id and is_active) then raise exception 'Select an active contractor'; end if;
  select work_order_number into v_work_order_number from public.work_orders where id = p_work_order_id and status <> 'completed';
  if v_work_order_number is null then raise exception 'Only active work orders can be reassigned'; end if;

  update public.work_order_assignments set unassigned_at = timezone('utc', now())
  where work_order_id = p_work_order_id and unassigned_at is null and contractor_id <> p_contractor_id;
  insert into public.work_order_assignments (work_order_id, contractor_id, assigned_at, unassigned_at)
  values (p_work_order_id, p_contractor_id, timezone('utc', now()), null)
  on conflict (work_order_id, contractor_id) do update
  set assigned_at = timezone('utc', now()), unassigned_at = null;
  update public.work_order_offers set status = 'rejected', responded_at = timezone('utc', now())
  where work_order_id = p_work_order_id and status = 'pending';
  insert into public.notifications (contractor_id, work_order_id, title, message)
  values (p_contractor_id, p_work_order_id, 'Work order assigned', 'An admin assigned work order #' || v_work_order_number || ' to you.');
  insert into public.audit_events (actor_id, work_order_id, event_type, event_data)
  values (v_admin_id, p_work_order_id, 'work_order_reassigned', jsonb_build_object('contractor_id', p_contractor_id));
end;
$$;

revoke all on function public.admin_reassign_work_order(uuid, uuid) from public;
grant execute on function public.admin_reassign_work_order(uuid, uuid) to authenticated;
