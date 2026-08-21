-- Permanently remove a non-admin contractor and all database references to them.

create or replace function public.admin_delete_contractor(p_contractor_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_admin_id uuid := public.current_contractor_id();
  v_auth_user_id uuid;
begin
  if not exists (
    select 1 from public.contractors
    where id = v_admin_id and is_active and is_admin
  ) then raise exception 'Admin access required'; end if;

  select auth_user_id into v_auth_user_id from public.contractors
  where id = p_contractor_id and is_admin = false for update;
  if not found then raise exception 'Contractor not found or is an admin'; end if;

  delete from public.work_order_offers where sender_id = p_contractor_id or recipient_id = p_contractor_id;
  delete from public.work_order_assignments where contractor_id = p_contractor_id;
  delete from public.notifications where contractor_id = p_contractor_id;
  update public.work_orders set created_by = null where created_by = p_contractor_id;
  update public.work_order_files set uploaded_by = null where uploaded_by = p_contractor_id;
  update public.work_order_notes set author_id = null where author_id = p_contractor_id;
  update public.work_order_materials set added_by = null where added_by = p_contractor_id;
  update public.work_order_checklist set completed_by = null where completed_by = p_contractor_id;
  update public.work_order_reviews set reviewer_id = null where reviewer_id = p_contractor_id;
  update public.email_deliveries set requested_by = null where requested_by = p_contractor_id;
  update public.audit_events set actor_id = null where actor_id = p_contractor_id;
  delete from public.contractors where id = p_contractor_id;
  if found then return v_auth_user_id; end if;
  raise exception 'Contractor database row was not deleted';
end;
$$;

revoke all on function public.admin_delete_contractor(uuid) from public;
grant execute on function public.admin_delete_contractor(uuid) to authenticated;
