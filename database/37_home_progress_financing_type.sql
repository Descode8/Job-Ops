-- Adds FHA/Non-FHA classification to Home Progress numbers.
-- New numbers use HOME-FHA-XXXXX or HOME-NFHA-XXXXX.

drop function if exists public.create_home_progress(text, text, text, text, text, text);

create or replace function public.create_home_progress(
  p_home_name text,
  p_address_line_1 text,
  p_city text,
  p_state text,
  p_postal_code text,
  p_financing_type text default 'NFHA',
  p_customer_phone text default null
)
returns table (work_order_id uuid, work_order_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator_id uuid := public.current_contractor_id();
  v_creator_email text;
  v_property_id uuid;
  v_work_order_id uuid;
  v_work_order_number text;
  v_financing_type text := upper(trim(coalesce(p_financing_type, '')));
  v_random_part text;
  v_characters constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  v_index integer;
begin
  if v_creator_id is null then raise exception 'An active contractor account is required'; end if;
  select coalesce(nullif(trim(c.email), ''), nullif(auth.jwt() ->> 'email', ''))
  into v_creator_email
  from public.contractors c
  where c.id = v_creator_id and c.is_active = true;
  if v_creator_email is null then raise exception 'The creating admin must have an email address'; end if;
  if v_financing_type not in ('FHA', 'NFHA') then
    raise exception 'Home type must be FHA or Non-FHA';
  end if;
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

  loop
    v_random_part := '';
    for v_index in 1..5 loop
      v_random_part := v_random_part || substr(v_characters, floor(random() * length(v_characters))::integer + 1, 1);
    end loop;
    v_work_order_number := 'HOME-' || v_financing_type || '-' || v_random_part;
    exit when not exists (
      select 1 from public.work_orders where work_orders.work_order_number = v_work_order_number
    );
  end loop;

  insert into public.work_orders (
    work_order_number, property_id, title, description, kind, priority,
    created_by, recipient_email
  ) values (
    v_work_order_number, v_property_id, trim(p_home_name),
    'New home progress checklist for ' || trim(p_home_name), 'installation', 'medium',
    v_creator_id, v_creator_email
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

revoke all on function public.create_home_progress(text, text, text, text, text, text, text) from public;
grant execute on function public.create_home_progress(text, text, text, text, text, text, text) to authenticated;
