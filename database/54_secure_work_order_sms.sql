-- Consent preferences and an auditable, idempotent transactional SMS log.
alter table public.contractors
  add column if not exists sms_notifications_enabled boolean not null default true,
  add column if not exists sms_opted_out_at timestamptz;

create or replace function public.set_my_sms_consent(p_consent boolean)
returns table (sms_consent boolean, sms_consent_at timestamptz)
language plpgsql security definer set search_path = public
as $$
begin
  update public.contractors
  set sms_consent = p_consent,
      sms_consent_at = case when p_consent then timezone('utc', now()) else null end,
      sms_consent_source = case when p_consent then 'jobops_account' else null end,
      sms_consent_disclosure_version = case when p_consent then '2026-08-29' else null end,
      sms_notifications_enabled = p_consent,
      sms_opted_out_at = case when p_consent then null else timezone('utc', now()) end
  where auth_user_id = auth.uid() and is_active = true;
  if not found then raise exception 'Active contractor access required'; end if;
  return query select c.sms_consent, c.sms_consent_at from public.contractors c where c.auth_user_id = auth.uid();
end;
$$;
revoke all on function public.set_my_sms_consent(boolean) from public;
grant execute on function public.set_my_sms_consent(boolean) to authenticated;

create table if not exists public.sms_notification_log (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  recipient_contractor_id uuid not null references public.contractors(id) on delete cascade,
  requested_by uuid not null references public.contractors(id) on delete restrict,
  event_type text not null check (event_type in ('assigned', 'scheduled', 'status_updated')),
  idempotency_key text not null unique,
  twilio_message_sid text,
  delivery_status text not null default 'queued' check (delivery_status in ('queued', 'accepted', 'sent', 'delivered', 'undelivered', 'failed')),
  attempt_count integer not null default 1 check (attempt_count between 1 and 5),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists sms_notification_log_request_rate_idx on public.sms_notification_log (requested_by, created_at desc);
create index if not exists sms_notification_log_recipient_rate_idx on public.sms_notification_log (recipient_contractor_id, created_at desc);
alter table public.sms_notification_log enable row level security;
drop policy if exists sms_notification_log_read_admins on public.sms_notification_log;
create policy sms_notification_log_read_admins on public.sms_notification_log for select to authenticated
using (exists (
  select 1 from public.contractors c
  where c.auth_user_id = auth.uid() and c.is_active = true and (c.is_admin = true or c.role in ('admin', 'office_staff'))
));

drop trigger if exists sms_notification_log_set_updated_at on public.sms_notification_log;
create trigger sms_notification_log_set_updated_at before update on public.sms_notification_log
for each row execute function public.set_updated_at();
