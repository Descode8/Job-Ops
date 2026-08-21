-- Derive work-order status consistently from contractor activity.
-- Completed requires every active checklist item, a photo, an invoice, and a note.

create or replace function public.refresh_work_order_status(p_work_order_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contractor_id uuid := public.current_contractor_id();
  v_active_items integer;
  v_completed_items integer;
  v_has_photo boolean;
  v_has_invoice boolean;
  v_has_note boolean;
  v_status public.work_order_status;
begin
  if v_contractor_id is null then
    raise exception 'An active contractor account is required';
  end if;

  if not exists (
    select 1 from public.work_order_assignments wa
    where wa.work_order_id = p_work_order_id
      and wa.contractor_id = v_contractor_id
      and wa.unassigned_at is null
  ) and not public.is_office_user() then
    raise exception 'This work order is not assigned to you';
  end if;

  select count(*) into v_active_items
  from public.home_checklist_items where is_active = true;

  select count(*) into v_completed_items
  from public.work_order_checklist wc
  join public.home_checklist_items ci on ci.id = wc.checklist_item_id
  where wc.work_order_id = p_work_order_id and wc.is_complete = true and ci.is_active = true;

  select exists (
    select 1 from public.work_order_files
    where work_order_id = p_work_order_id
      and file_type in ('issue_photo', 'parts_photo', 'before_photo', 'after_photo', 'completion_photo')
  ) into v_has_photo;

  select exists (
    select 1 from public.work_order_files
    where work_order_id = p_work_order_id and file_type = 'invoice'
  ) into v_has_invoice;

  select exists (
    select 1 from public.work_order_notes where work_order_id = p_work_order_id
  ) into v_has_note;

  v_status := case
    when v_active_items > 0 and v_completed_items = v_active_items
      and v_has_photo and v_has_invoice and v_has_note then 'completed'
    when v_completed_items > 0 or v_has_photo or v_has_invoice or v_has_note then 'in_progress'
    else 'not_started'
  end;

  update public.work_orders set status = v_status where id = p_work_order_id;
  return v_status::text;
end;
$$;

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
  if v_contractor_id is null then raise exception 'An active contractor account is required'; end if;
  if not exists (
    select 1 from public.work_order_assignments wa
    where wa.work_order_id = p_work_order_id
      and wa.contractor_id = v_contractor_id and wa.unassigned_at is null
  ) and not public.is_office_user() then raise exception 'This work order is not assigned to you'; end if;
  if not exists (select 1 from public.home_checklist_items where id = p_checklist_item_id and is_active = true)
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

  perform public.refresh_work_order_status(p_work_order_id);
end;
$$;

revoke all on function public.refresh_work_order_status(uuid) from public;
grant execute on function public.refresh_work_order_status(uuid) to authenticated;

-- Correct existing active records when this migration is first applied.
with checklist_totals as (
  select count(*)::integer as active_items from public.home_checklist_items where is_active = true
), activity as (
  select wo.id,
    (select count(*) from public.work_order_checklist wc join public.home_checklist_items ci on ci.id = wc.checklist_item_id where wc.work_order_id = wo.id and wc.is_complete and ci.is_active) as completed_items,
    exists (select 1 from public.work_order_files wf where wf.work_order_id = wo.id and wf.file_type in ('issue_photo', 'parts_photo', 'before_photo', 'after_photo', 'completion_photo')) as has_photo,
    exists (select 1 from public.work_order_files wf where wf.work_order_id = wo.id and wf.file_type = 'invoice') as has_invoice,
    exists (select 1 from public.work_order_notes wn where wn.work_order_id = wo.id) as has_note
  from public.work_orders wo
)
update public.work_orders wo
set status = case
  when ct.active_items > 0 and a.completed_items = ct.active_items and a.has_photo and a.has_invoice and a.has_note then 'completed'::public.work_order_status
  when a.completed_items > 0 or a.has_photo or a.has_invoice or a.has_note then 'in_progress'::public.work_order_status
  else 'not_started'::public.work_order_status
end
from activity a cross join checklist_totals ct
where wo.id = a.id and wo.status in ('not_started', 'in_progress', 'completed');
