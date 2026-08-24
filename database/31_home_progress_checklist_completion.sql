-- Home Progress records can be completed after every active home checklist
-- item is checked. Regular work orders retain their existing completion flow.

create or replace function public.set_work_order_checklist_item(
  p_work_order_id uuid,
  p_checklist_item_id smallint,
  p_is_complete boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contractor_id uuid := public.current_contractor_id();
  v_is_home_progress boolean;
  v_completed_items integer;
begin
  if v_contractor_id is null then raise exception 'An active contractor account is required'; end if;
  if not exists (
    select 1 from public.work_order_assignments wa
    where wa.work_order_id = p_work_order_id
      and wa.contractor_id = v_contractor_id and wa.unassigned_at is null
  ) and not public.is_office_user() then raise exception 'This work order is not assigned to you'; end if;
  if not exists (select 1 from public.home_checklist_items where id = p_checklist_item_id and is_active)
    then raise exception 'Checklist item not found'; end if;

  insert into public.work_order_checklist (work_order_id, checklist_item_id, is_complete, completed_by, completed_at)
  values (
    p_work_order_id, p_checklist_item_id, p_is_complete,
    case when p_is_complete then v_contractor_id else null end,
    case when p_is_complete then timezone('utc', now()) else null end
  )
  on conflict (work_order_id, checklist_item_id) do update set
    is_complete = excluded.is_complete,
    completed_by = excluded.completed_by,
    completed_at = excluded.completed_at;

  select wo.work_order_number like 'HOME-%'
  into v_is_home_progress
  from public.work_orders wo
  where wo.id = p_work_order_id;

  if v_is_home_progress then
    select count(*) into v_completed_items
    from public.work_order_checklist wc
    join public.home_checklist_items ci on ci.id = wc.checklist_item_id
    where wc.work_order_id = p_work_order_id and wc.is_complete and ci.is_active;

    update public.work_orders
    set status = case
      when v_completed_items > 0 then 'in_progress'::public.work_order_status
      else 'not_started'::public.work_order_status
    end
    where id = p_work_order_id and status <> 'completed';
  else
    perform public.refresh_work_order_status(p_work_order_id);
  end if;
end;
$$;

revoke all on function public.set_work_order_checklist_item(uuid, smallint, boolean) from public;
grant execute on function public.set_work_order_checklist_item(uuid, smallint, boolean) to authenticated;

create or replace function public.complete_home_progress(p_work_order_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contractor_id uuid := public.current_contractor_id();
  v_active_items integer;
  v_completed_items integer;
begin
  if v_contractor_id is null then raise exception 'An active contractor account is required'; end if;
  if not exists (
    select 1 from public.work_order_assignments wa
    where wa.work_order_id = p_work_order_id
      and wa.contractor_id = v_contractor_id and wa.unassigned_at is null
  ) and not public.is_office_user() then raise exception 'This work order is not assigned to you'; end if;
  if not exists (
    select 1 from public.work_orders wo
    where wo.id = p_work_order_id and wo.work_order_number like 'HOME-%'
  ) then raise exception 'This is not a Home Progress work order'; end if;

  select count(*) into v_active_items from public.home_checklist_items where is_active;
  select count(*) into v_completed_items
  from public.work_order_checklist wc
  join public.home_checklist_items ci on ci.id = wc.checklist_item_id
  where wc.work_order_id = p_work_order_id and wc.is_complete and ci.is_active;

  if v_active_items <> 14 or v_completed_items <> 14 then
    raise exception 'Complete all 14 Home Progress steps before completing the work order';
  end if;

  update public.work_orders set status = 'completed' where id = p_work_order_id;
  return 'completed';
end;
$$;

revoke all on function public.complete_home_progress(uuid) from public;
grant execute on function public.complete_home_progress(uuid) to authenticated;
