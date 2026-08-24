-- Reliably clear notification history for the signed-in contractor or admin.

create or replace function public.clear_my_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contractor_id uuid := public.current_contractor_id();
  v_deleted integer;
begin
  if v_contractor_id is null then raise exception 'An active contractor account is required'; end if;

  delete from public.notifications
  where contractor_id = v_contractor_id;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.clear_my_notifications() from public;
grant execute on function public.clear_my_notifications() to authenticated;
