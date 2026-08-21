-- Send newly created work orders to the Marty Wright work-order inbox.

create or replace function public.create_and_offer_work_order(
  p_customer_name text,
  p_customer_phone text,
  p_address_line_1 text,
  p_city text,
  p_state text,
  p_description text,
  p_deadline_at timestamptz,
  p_recipient_id uuid
)
returns table (work_order_id uuid, work_order_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender_id uuid := public.current_contractor_id();
  v_property_id uuid;
  v_work_order_id uuid;
  v_work_order_number text;
begin
  if v_sender_id is null then raise exception 'An active contractor account is required'; end if;
  if nullif(trim(p_customer_name), '') is null
    or nullif(trim(p_customer_phone), '') is null
    or nullif(trim(p_address_line_1), '') is null
    or nullif(trim(p_description), '') is null then
    raise exception 'Customer, phone, address, and description are required';
  end if;
  if not exists (select 1 from public.contractors where id = p_recipient_id and is_active) then
    raise exception 'Select an active contractor';
  end if;
  if p_deadline_at is not null and p_deadline_at < timezone('utc', now()) then
    raise exception 'Deadline cannot be in the past';
  end if;

  insert into public.properties (address_line_1, city, state, postal_code, customer_name, customer_phone)
  values (trim(p_address_line_1), coalesce(nullif(trim(p_city), ''), 'Unknown'), coalesce(nullif(trim(p_state), ''), 'SC'), '00000', trim(p_customer_name), trim(p_customer_phone))
  returning id into v_property_id;

  v_work_order_number := 'MW-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.work_orders (work_order_number, property_id, title, description, kind, priority, deadline_at, created_by, recipient_email)
  values (v_work_order_number, v_property_id, 'Work order for ' || trim(p_customer_name), trim(p_description), 'other', 'medium', p_deadline_at, v_sender_id, 'jhumphries@shopmwhs.net')
  returning id into v_work_order_id;

  if p_recipient_id = v_sender_id then
    insert into public.work_order_assignments (work_order_id, contractor_id) values (v_work_order_id, v_sender_id);
  else
    insert into public.work_order_offers (work_order_id, sender_id, recipient_id) values (v_work_order_id, v_sender_id, p_recipient_id);
  end if;
  return query select v_work_order_id, v_work_order_number;
end;
$$;

revoke all on function public.create_and_offer_work_order(text, text, text, text, text, text, timestamptz, uuid) from public;
grant execute on function public.create_and_offer_work_order(text, text, text, text, text, text, timestamptz, uuid) to authenticated;
