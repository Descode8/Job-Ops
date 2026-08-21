-- Persist checklist changes and start a work order when work first begins.

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
begin
  if v_contractor_id is null then
    raise exception 'An active contractor account is required';
  end if;

  if not exists (
    select 1
    from public.work_order_assignments wa
    where wa.work_order_id = p_work_order_id
      and wa.contractor_id = v_contractor_id
      and wa.unassigned_at is null
  ) and not public.is_office_user() then
    raise exception 'This work order is not assigned to you';
  end if;

  if not exists (
    select 1 from public.home_checklist_items
    where id = p_checklist_item_id and is_active = true
  ) then
    raise exception 'Checklist item not found';
  end if;

  insert into public.work_order_checklist (
    work_order_id, checklist_item_id, is_complete, completed_by, completed_at
  ) values (
    p_work_order_id,
    p_checklist_item_id,
    p_is_complete,
    case when p_is_complete then v_contractor_id else null end,
    case when p_is_complete then timezone('utc', now()) else null end
  )
  on conflict (work_order_id, checklist_item_id) do update
  set
    is_complete = excluded.is_complete,
    completed_by = excluded.completed_by,
    completed_at = excluded.completed_at;

  if p_is_complete then
    update public.work_orders
    set status = 'in_progress'
    where id = p_work_order_id and status = 'not_started';
  end if;
end;
$$;

revoke all on function public.set_work_order_checklist_item(uuid, smallint, boolean) from public;
grant execute on function public.set_work_order_checklist_item(uuid, smallint, boolean) to authenticated;
