-- Calling the customer or starting navigation counts as beginning assigned work.

create or replace function public.mark_work_order_started(p_work_order_id uuid, p_action text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_contractor_id uuid := public.current_contractor_id();
  v_status public.work_order_status;
begin
  if v_contractor_id is null then raise exception 'An active contractor account is required'; end if;
  if p_action not in ('customer_called', 'navigation_started') then raise exception 'Unsupported start action'; end if;
  if not exists (
    select 1 from public.work_order_assignments wa
    where wa.work_order_id = p_work_order_id
      and wa.contractor_id = v_contractor_id
      and wa.unassigned_at is null
  ) and not public.is_office_user() then raise exception 'This work order is not assigned to you'; end if;

  update public.work_orders
  set status = 'in_progress'
  where id = p_work_order_id and status = 'not_started'
  returning status into v_status;

  if v_status is null then
    select status into v_status from public.work_orders where id = p_work_order_id;
  end if;

  insert into public.audit_events (actor_id, work_order_id, event_type)
  values (v_contractor_id, p_work_order_id, 'work_order_' || p_action);

  return v_status::text;
end;
$$;

revoke all on function public.mark_work_order_started(uuid, text) from public;
grant execute on function public.mark_work_order_started(uuid, text) to authenticated;

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
    or exists (select 1 from public.audit_events where work_order_id = p_work_order_id and event_type in ('work_order_customer_called', 'work_order_navigation_started'))
  into v_has_activity;
  v_current_status := case when v_has_activity then 'in_progress' else 'not_started' end;
  update public.work_orders set status = v_current_status where id = p_work_order_id;
  return v_current_status::text;
end;
$$;

revoke all on function public.refresh_work_order_status(uuid) from public;
grant execute on function public.refresh_work_order_status(uuid) to authenticated;

