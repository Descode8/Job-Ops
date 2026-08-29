-- Expands Home Progress to 16 steps and backfills the new steps onto active homes.
-- Checklist comments use the existing work_order_checklist.notes column.

do $$
begin
  if not exists (select 1 from public.home_checklist_items where item_key = 'trimout_after_meter') then
    update public.home_checklist_items set sort_order = sort_order + 100 where sort_order >= 3;
    update public.home_checklist_items set sort_order = sort_order - 99 where sort_order >= 103;
  end if;
end;
$$;

insert into public.home_checklist_items (item_key, label, sort_order)
values ('trimout_after_meter', 'Trimout After Meter', 3), ('other', 'Other', 16)
on conflict (item_key) do update set label = excluded.label, sort_order = excluded.sort_order, is_active = true;

insert into public.work_order_checklist (work_order_id, checklist_item_id, is_complete)
select wo.id, ci.id, false
from public.work_orders wo cross join public.home_checklist_items ci
where wo.work_order_number like 'HOME-%' and wo.status <> 'completed'
  and ci.item_key in ('trimout_after_meter', 'other')
on conflict (work_order_id, checklist_item_id) do nothing;

create or replace function public.complete_home_progress(p_work_order_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_contractor_id uuid := public.current_contractor_id();
  v_active_items integer;
  v_completed_items integer;
begin
  if v_contractor_id is null then raise exception 'An active contractor account is required'; end if;
  if not exists (select 1 from public.work_order_assignments wa where wa.work_order_id = p_work_order_id and wa.contractor_id = v_contractor_id and wa.unassigned_at is null)
    and not public.is_office_user() then raise exception 'This work order is not assigned to you'; end if;
  if not exists (select 1 from public.work_orders wo where wo.id = p_work_order_id and wo.work_order_number like 'HOME-%')
    then raise exception 'This is not a Home Progress work order'; end if;

  select count(*) into v_active_items from public.home_checklist_items where is_active;
  select count(*) into v_completed_items from public.work_order_checklist wc
  join public.home_checklist_items ci on ci.id = wc.checklist_item_id
  where wc.work_order_id = p_work_order_id and wc.is_complete and ci.is_active;

  if v_active_items = 0 or v_completed_items <> v_active_items then
    raise exception 'Complete all Home Progress steps before completing the work order';
  end if;
  update public.work_orders set status = 'completed' where id = p_work_order_id;
  return 'completed';
end;
$$;

revoke all on function public.complete_home_progress(uuid) from public;
grant execute on function public.complete_home_progress(uuid) to authenticated;
