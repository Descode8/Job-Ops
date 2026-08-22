-- Dedicated new-home creation for the Home Progress tab. Each home is backed by
-- an installation work order so the existing checklist, permissions, and status
-- rules remain the single source of truth.

create or replace function public.create_home_progress(
  p_home_name text,
  p_address_line_1 text,
  p_city text,
  p_state text,
  p_postal_code text,
  p_customer_phone text default null
)
returns table (work_order_id uuid, work_order_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator_id uuid := public.current_contractor_id();
  v_property_id uuid;
  v_work_order_id uuid;
  v_work_order_number text;
begin
  if v_creator_id is null then raise exception 'An active contractor account is required'; end if;
  if nullif(trim(p_home_name), '') is null
    or nullif(trim(p_address_line_1), '') is null
    or nullif(trim(p_city), '') is null
    or nullif(trim(p_state), '') is null
    or nullif(trim(p_postal_code), '') is null then
    raise exception 'Home name and complete address are required';
  end if;

  insert into public.properties (
    address_line_1, city, state, postal_code, customer_name, customer_phone
  ) values (
    trim(p_address_line_1), trim(p_city), upper(trim(p_state)), trim(p_postal_code),
    trim(p_home_name), nullif(trim(p_customer_phone), '')
  ) returning id into v_property_id;

  v_work_order_number := 'HOME-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.work_orders (
    work_order_number, property_id, title, description, kind, priority,
    created_by, recipient_email
  ) values (
    v_work_order_number, v_property_id, trim(p_home_name),
    'New home progress checklist for ' || trim(p_home_name), 'installation', 'medium',
    v_creator_id, 'jhumphries@shopmwhs.net'
  ) returning id into v_work_order_id;

  insert into public.work_order_assignments (work_order_id, contractor_id)
  values (v_work_order_id, v_creator_id);

  insert into public.work_order_checklist (work_order_id, checklist_item_id, is_complete)
  select v_work_order_id, id, false
  from public.home_checklist_items
  where is_active = true;

  return query select v_work_order_id, v_work_order_number;
end;
$$;

revoke all on function public.create_home_progress(text, text, text, text, text, text) from public;
grant execute on function public.create_home_progress(text, text, text, text, text, text) to authenticated;
