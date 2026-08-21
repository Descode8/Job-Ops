-- Admin contractor management and sender notifications for offer responses.

alter table public.contractors add column if not exists is_admin boolean not null default false;

update public.contractors
set is_admin = true, role = 'admin'
where lower(email) in ('jaden.humphries@gmail.com', 'jaihump123@gmail.com');

create or replace function public.is_office_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.contractors
    where auth_user_id = auth.uid() and is_active and (is_admin or role in ('office_staff', 'admin'))
  );
$$;

create or replace function public.respond_to_work_order_offer(p_offer_id uuid, p_response text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_offer public.work_order_offers%rowtype;
  v_assignee_id uuid;
  v_work_order_number text;
  v_recipient_name text;
begin
  if p_response not in ('accepted', 'rejected') then raise exception 'Response must be accepted or rejected'; end if;
  select * into v_offer from public.work_order_offers where id = p_offer_id for update;
  if not found or v_offer.recipient_id <> public.current_contractor_id() then raise exception 'Work-order offer not found'; end if;
  if v_offer.status <> 'pending' then raise exception 'This work-order offer has already been answered'; end if;

  v_assignee_id := case when p_response = 'accepted' then v_offer.recipient_id else v_offer.sender_id end;
  update public.work_order_offers set status = p_response, responded_at = timezone('utc', now()) where id = p_offer_id;
  insert into public.work_order_assignments (work_order_id, contractor_id)
  values (v_offer.work_order_id, v_assignee_id)
  on conflict (work_order_id, contractor_id) do update set unassigned_at = null, assigned_at = timezone('utc', now());

  select work_order_number into v_work_order_number from public.work_orders where id = v_offer.work_order_id;
  select full_name into v_recipient_name from public.contractors where id = v_offer.recipient_id;
  insert into public.notifications (contractor_id, work_order_id, title, message)
  values (
    v_offer.sender_id,
    v_offer.work_order_id,
    'Work order ' || initcap(p_response),
    coalesce(v_recipient_name, 'The contractor') || ' ' || p_response || ' work order #' || v_work_order_number || '.'
  );
  insert into public.audit_events (actor_id, work_order_id, event_type, event_data)
  values (v_offer.recipient_id, v_offer.work_order_id, 'work_order_offer_' || p_response, jsonb_build_object('sender_id', v_offer.sender_id));
  return v_offer.work_order_id;
end;
$$;

create or replace function public.get_admin_contractor_overview()
returns table (contractor_id uuid, full_name text, email text, phone_number text, is_active boolean, is_admin boolean, work_order_id uuid, work_order_number text, work_order_title text, work_order_status text)
language sql stable security definer set search_path = public as $$
  select c.id, c.full_name, c.email, c.phone_number, c.is_active, c.is_admin,
    wo.id, wo.work_order_number, wo.title, wo.status::text
  from public.contractors c
  left join public.work_order_assignments wa on wa.contractor_id = c.id and wa.unassigned_at is null
  left join public.work_orders wo on wo.id = wa.work_order_id
  where public.is_office_user()
  order by c.is_admin desc, c.full_name, wo.created_at desc;
$$;

revoke all on function public.get_admin_contractor_overview() from public;
grant execute on function public.get_admin_contractor_overview() to authenticated;
