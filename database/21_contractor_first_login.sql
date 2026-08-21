-- Contractors created without email delivery must change their temporary password.

alter table public.contractors add column if not exists must_change_password boolean not null default false;

create or replace function public.complete_contractor_password_setup()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.contractors set must_change_password = false
  where auth_user_id = auth.uid() and is_active;
  if not found then raise exception 'Active contractor account not found'; end if;
end;
$$;

revoke all on function public.complete_contractor_password_setup() from public;
grant execute on function public.complete_contractor_password_setup() to authenticated;
