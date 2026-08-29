-- Records optional contractor consent for recurring transactional SMS messages.
alter table public.contractors
  add column if not exists sms_consent boolean not null default false,
  add column if not exists sms_consent_at timestamptz,
  add column if not exists sms_consent_source text,
  add column if not exists sms_consent_disclosure_version text;

alter table public.contractors drop constraint if exists contractors_sms_consent_timestamp_check;
alter table public.contractors add constraint contractors_sms_consent_timestamp_check
  check (sms_consent = (sms_consent_at is not null)
    and sms_consent = (sms_consent_source is not null)
    and sms_consent = (sms_consent_disclosure_version is not null));

create or replace function public.set_my_sms_consent(p_consent boolean)
returns table (sms_consent boolean, sms_consent_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.contractors
  set sms_consent = p_consent,
      sms_consent_at = case when p_consent then timezone('utc', now()) else null end,
      sms_consent_source = case when p_consent then 'jobops_login' else null end,
      sms_consent_disclosure_version = case when p_consent then '2026-08-29' else null end
  where auth_user_id = auth.uid() and is_active = true;

  if not found then raise exception 'Active contractor access required'; end if;
  return query select c.sms_consent, c.sms_consent_at
  from public.contractors c where c.auth_user_id = auth.uid();
end;
$$;

revoke all on function public.set_my_sms_consent(boolean) from public;
grant execute on function public.set_my_sms_consent(boolean) to authenticated;
