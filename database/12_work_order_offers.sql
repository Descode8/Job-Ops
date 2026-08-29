-- Contractor-to-contractor work-order offers.

create table if not exists public.work_order_offers (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null unique references public.work_orders(id) on delete cascade,
  sender_id uuid not null references public.contractors(id) on delete restrict,
  recipient_id uuid not null references public.contractors(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  responded_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  check (sender_id <> recipient_id)
);

create index if not exists work_order_offers_recipient_status_idx
on public.work_order_offers (recipient_id, status, created_at desc);

alter table public.work_order_offers enable row level security;

create policy work_order_offers_read_participants on public.work_order_offers
for select to authenticated
using (
  public.is_office_user()
  or sender_id = public.current_contractor_id()
  or recipient_id = public.current_contractor_id()
);

create or replace function public.list_available_contractors()
returns table (id uuid, full_name text)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.full_name
  from public.contractors c
  where c.is_active = true
    and c.id <> public.current_contractor_id()
  order by c.full_name;
$$;

create or replace function public.create_work_order_offer(
  p_work_order_id uuid,
  p_recipient_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender_id uuid := public.current_contractor_id();
  v_offer_id uuid;
begin
  if v_sender_id is null then
    raise exception 'An active contractor account is required';
  end if;

  if p_recipient_id = v_sender_id or not exists (
    select 1 from public.contractors where id = p_recipient_id and is_active = true
  ) then
    raise exception 'Select another active contractor';
  end if;

  if not exists (
    select 1 from public.work_orders
    where id = p_work_order_id and created_by = v_sender_id
  ) then
    raise exception 'Only the work-order creator can send this offer';
  end if;

  insert into public.work_order_offers (work_order_id, sender_id, recipient_id)
  values (p_work_order_id, v_sender_id, p_recipient_id)
  returning id into v_offer_id;

  return v_offer_id;
end;
$$;

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
  if v_sender_id is null then
    raise exception 'An active contractor account is required';
  end if;

  if nullif(trim(p_customer_name), '') is null
    or nullif(trim(p_customer_phone), '') is null
    or nullif(trim(p_address_line_1), '') is null
    or nullif(trim(p_description), '') is null then
    raise exception 'Customer, phone, address, and description are required';
  end if;

  if not exists (
    select 1 from public.contractors where id = p_recipient_id and is_active = true
  ) then
    raise exception 'Select an active contractor';
  end if;

  insert into public.properties (
    address_line_1, city, state, postal_code, customer_name, customer_phone
  ) values (
    trim(p_address_line_1), coalesce(nullif(trim(p_city), ''), 'Unknown'),
    coalesce(nullif(trim(p_state), ''), 'SC'), '00000', trim(p_customer_name), trim(p_customer_phone)
  ) returning id into v_property_id;

  v_work_order_number := 'MW-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.work_orders (
    work_order_number, property_id, title, description, kind, priority,
    deadline_at, created_by, recipient_email
  ) values (
    v_work_order_number, v_property_id, 'Work Order Request from: ' || trim(p_customer_name),
    trim(p_description), 'other', 'medium', p_deadline_at, v_sender_id, 'jhumphries@shopmwhs.net'
  ) returning id into v_work_order_id;

  if p_recipient_id = v_sender_id then
    insert into public.work_order_assignments (work_order_id, contractor_id)
    values (v_work_order_id, v_sender_id);
  else
    insert into public.work_order_offers (work_order_id, sender_id, recipient_id)
    values (v_work_order_id, v_sender_id, p_recipient_id);
  end if;

  return query select v_work_order_id, v_work_order_number;
end;
$$;

create or replace function public.get_pending_work_order_offers()
returns table (
  offer_id uuid,
  work_order_id uuid,
  work_order_number text,
  title text,
  description text,
  sender_name text,
  customer_name text,
  customer_phone text,
  customer_address text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.id,
    wo.id,
    wo.work_order_number,
    wo.title,
    wo.description,
    sender.full_name,
    p.customer_name,
    p.customer_phone,
    concat_ws(', ', p.address_line_1, p.city, p.state),
    o.created_at
  from public.work_order_offers o
  join public.work_orders wo on wo.id = o.work_order_id
  join public.contractors sender on sender.id = o.sender_id
  join public.properties p on p.id = wo.property_id
  where o.recipient_id = public.current_contractor_id()
    and o.status = 'pending'
  order by o.created_at desc;
$$;

create or replace function public.respond_to_work_order_offer(
  p_offer_id uuid,
  p_response text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer public.work_order_offers%rowtype;
  v_assignee_id uuid;
begin
  if p_response not in ('accepted', 'rejected') then
    raise exception 'Response must be accepted or rejected';
  end if;

  select * into v_offer
  from public.work_order_offers
  where id = p_offer_id
  for update;

  if not found or v_offer.recipient_id <> public.current_contractor_id() then
    raise exception 'Work-order offer not found';
  end if;

  if v_offer.status <> 'pending' then
    raise exception 'This work-order offer has already been answered';
  end if;

  v_assignee_id := case when p_response = 'accepted' then v_offer.recipient_id else v_offer.sender_id end;

  update public.work_order_offers
  set status = p_response, responded_at = timezone('utc', now())
  where id = p_offer_id;

  insert into public.work_order_assignments (work_order_id, contractor_id)
  values (v_offer.work_order_id, v_assignee_id)
  on conflict (work_order_id, contractor_id) do update
    set unassigned_at = null, assigned_at = timezone('utc', now());

  return v_offer.work_order_id;
end;
$$;

revoke all on function public.list_available_contractors() from public;
revoke all on function public.create_work_order_offer(uuid, uuid) from public;
revoke all on function public.create_and_offer_work_order(text, text, text, text, text, text, timestamptz, uuid) from public;
revoke all on function public.get_pending_work_order_offers() from public;
revoke all on function public.respond_to_work_order_offer(uuid, text) from public;

grant execute on function public.list_available_contractors() to authenticated;
grant execute on function public.create_work_order_offer(uuid, uuid) to authenticated;
grant execute on function public.create_and_offer_work_order(text, text, text, text, text, text, timestamptz, uuid) to authenticated;
grant execute on function public.get_pending_work_order_offers() to authenticated;
grant execute on function public.respond_to_work_order_offer(uuid, text) to authenticated;
