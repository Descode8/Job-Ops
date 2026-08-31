-- Enable transactional SMS for existing JobOps contractors and make it
-- the database default for every contractor created in the future.
alter table public.contractors
  alter column sms_notifications_enabled set default true;

update public.contractors
set sms_notifications_enabled = true,
    sms_opted_out_at = null
where is_active = true;
