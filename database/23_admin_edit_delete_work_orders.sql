-- Admin-only work-order editing and permanent deletion.

create or replace function public.admin_update_work_order(
  p_work_order_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_address_line_1 text,
  p_city text,
  p_state text,
  p_description text,
  p_priority public.work_order_priority,
  p_deadline_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := public.current_contractor_id();
  v_property_id uuid;
begin
  if not exists (
    select 1 from public.contractors
    where id = v_admin_id and is_active and is_admin
  ) then
    raise exception 'Admin access required';
  end if;

  if nullif(trim(p_customer_name), '') is null
    or nullif(trim(p_customer_phone), '') is null
    or nullif(trim(p_address_line_1), '') is null
    or nullif(trim(p_city), '') is null
    or nullif(trim(p_state), '') is null
    or nullif(trim(p_description), '') is null then
    raise exception 'Customer, phone, address, city, state, and description are required';
  end if;

  select property_id into v_property_id
  from public.work_orders
  where id = p_work_order_id;

  if v_property_id is null then
    raise exception 'Work order not found';
  end if;

  update public.properties
  set customer_name = trim(p_customer_name),
      customer_phone = trim(p_customer_phone),
      address_line_1 = trim(p_address_line_1),
      city = trim(p_city),
      state = upper(trim(p_state))
  where id = v_property_id;

  update public.work_orders
  set title = 'Work Order Request from: ' || trim(p_customer_name),
      description = trim(p_description),
      priority = p_priority,
      deadline_at = p_deadline_at
  where id = p_work_order_id;

  insert into public.audit_events (actor_id, work_order_id, event_type, event_data)
  values (v_admin_id, p_work_order_id, 'work_order_updated', jsonb_build_object('priority', p_priority, 'deadline_at', p_deadline_at));

end;
$$;

create or replace function public.admin_delete_work_order(p_work_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := public.current_contractor_id();
  v_property_id uuid;
begin
  if not exists (
    select 1 from public.contractors
    where id = v_admin_id and is_active and is_admin
  ) then
    raise exception 'Admin access required';
  end if;

  select property_id into v_property_id
  from public.work_orders
  where id = p_work_order_id
  for update;

  if v_property_id is null then
    raise exception 'Work order not found';
  end if;

  delete from public.work_orders where id = p_work_order_id;

  if not exists (select 1 from public.work_orders where property_id = v_property_id) then
    delete from public.properties where id = v_property_id;
  end if;
end;
$$;

revoke all on function public.admin_update_work_order(uuid, text, text, text, text, text, text, public.work_order_priority, timestamptz) from public;
revoke all on function public.admin_delete_work_order(uuid) from public;
grant execute on function public.admin_update_work_order(uuid, text, text, text, text, text, text, public.work_order_priority, timestamptz) to authenticated;
grant execute on function public.admin_delete_work_order(uuid) to authenticated;

drop policy if exists work_order_storage_delete_admin on storage.objects;
create policy work_order_storage_delete_admin
on storage.objects for delete to authenticated
using (
  bucket_id = 'work-order-files'
  and exists (
    select 1 from public.contractors
    where auth_user_id = auth.uid() and is_active and is_admin
  )
);
