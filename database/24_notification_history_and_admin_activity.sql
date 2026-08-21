-- Persistent notification history and admin activity notifications.

alter table public.notifications
  drop constraint if exists notifications_work_order_id_fkey;

alter table public.notifications
  add constraint notifications_work_order_id_fkey
  foreign key (work_order_id) references public.work_orders(id) on delete set null;

create or replace function public.notify_active_admins(
  p_title text,
  p_message text,
  p_work_order_id uuid default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (contractor_id, work_order_id, title, message)
  select id, p_work_order_id, p_title, p_message
  from public.contractors
  where is_active and is_admin;
$$;

create or replace function public.notify_admins_after_contractor_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not new.is_admin then
    perform public.notify_active_admins(
      'New contractor created',
      new.full_name || ' (' || coalesce(new.email, new.phone_number) || ') was added.'
    );
  end if;
  return new;
end;
$$;

create or replace function public.notify_admins_before_contractor_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not old.is_admin then
    perform public.notify_active_admins(
      'Contractor deleted',
      old.full_name || ' (' || coalesce(old.email, old.phone_number) || ') was permanently deleted.'
    );
  end if;
  return old;
end;
$$;

create or replace function public.notify_admins_after_work_order_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify_active_admins(
    'New work order created',
    'Work order #' || new.work_order_number || ' was created.',
    new.id
  );
  return new;
end;
$$;

create or replace function public.notify_admins_after_work_order_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify_active_admins(
    'Work order edited',
    'Work order #' || new.work_order_number || ' was edited.',
    new.id
  );
  return new;
end;
$$;

create or replace function public.notify_admins_before_work_order_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify_active_admins(
    'Work order deleted',
    'Work order #' || old.work_order_number || ' was permanently deleted.'
  );
  return old;
end;
$$;

create or replace function public.notify_admins_after_offer_response()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_work_order_number text;
  v_recipient_name text;
begin
  if old.status = 'pending' and new.status in ('accepted', 'rejected') then
    select work_order_number into v_work_order_number from public.work_orders where id = new.work_order_id;
    select full_name into v_recipient_name from public.contractors where id = new.recipient_id;

    insert into public.notifications (contractor_id, work_order_id, title, message)
    select
      id,
      new.work_order_id,
      'Work order ' || initcap(new.status::text),
      coalesce(v_recipient_name, 'The contractor') || ' ' || new.status::text || ' work order #' || v_work_order_number || '.'
    from public.contractors
    where is_active and is_admin and id <> new.sender_id;
  end if;
  return new;
end;
$$;

drop trigger if exists contractors_notify_admins_after_insert on public.contractors;
create trigger contractors_notify_admins_after_insert
after insert on public.contractors
for each row execute function public.notify_admins_after_contractor_insert();

drop trigger if exists contractors_notify_admins_before_delete on public.contractors;
create trigger contractors_notify_admins_before_delete
before delete on public.contractors
for each row execute function public.notify_admins_before_contractor_delete();

drop trigger if exists work_orders_notify_admins_after_insert on public.work_orders;
create trigger work_orders_notify_admins_after_insert
after insert on public.work_orders
for each row execute function public.notify_admins_after_work_order_insert();

drop trigger if exists work_orders_notify_admins_after_edit on public.work_orders;
create trigger work_orders_notify_admins_after_edit
after update of title, description, priority, deadline_at on public.work_orders
for each row
when (
  old.title is distinct from new.title
  or old.description is distinct from new.description
  or old.priority is distinct from new.priority
  or old.deadline_at is distinct from new.deadline_at
)
execute function public.notify_admins_after_work_order_edit();

drop trigger if exists work_orders_notify_admins_before_delete on public.work_orders;
create trigger work_orders_notify_admins_before_delete
before delete on public.work_orders
for each row execute function public.notify_admins_before_work_order_delete();

drop trigger if exists work_order_offers_notify_admins_after_response on public.work_order_offers;
create trigger work_order_offers_notify_admins_after_response
after update of status on public.work_order_offers
for each row execute function public.notify_admins_after_offer_response();

drop policy if exists notifications_delete_self_or_office on public.notifications;
create policy notifications_delete_self_or_office on public.notifications
for delete to authenticated
using (contractor_id = public.current_contractor_id());

revoke all on function public.notify_active_admins(text, text, uuid) from public;
