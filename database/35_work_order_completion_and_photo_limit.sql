-- Standard work orders require a note and at least two photos to complete.
-- Invoices are optional, and each work order may hold up to 25 photos.

create or replace function public.finalize_work_order(p_work_order_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contractor_id uuid := public.current_contractor_id();
  v_note_count integer;
  v_photo_count integer;
begin
  if v_contractor_id is null then raise exception 'An active contractor account is required'; end if;
  if not exists (
    select 1 from public.work_order_assignments wa
    where wa.work_order_id = p_work_order_id
      and wa.contractor_id = v_contractor_id
      and wa.unassigned_at is null
  ) and not public.is_office_user() then
    raise exception 'This work order is not assigned to you';
  end if;

  select count(*) into v_note_count
  from public.work_order_notes
  where work_order_id = p_work_order_id;

  select count(*) into v_photo_count
  from public.work_order_files
  where work_order_id = p_work_order_id
    and file_type in ('issue_photo', 'parts_photo', 'before_photo', 'after_photo', 'completion_photo')
    and lower(mime_type) in ('image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif', 'image/webp');

  if v_note_count < 1 then
    raise exception 'Add at least one work order note before completing the work order';
  end if;
  if v_photo_count < 2 then
    raise exception 'Upload at least two work order photos before completing the work order';
  end if;

  update public.work_orders set status = 'completed' where id = p_work_order_id;
  return 'completed';
end;
$$;

revoke all on function public.finalize_work_order(uuid) from public;
grant execute on function public.finalize_work_order(uuid) to authenticated;

create or replace function public.enforce_work_order_photo_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.work_order_id::text));
  if new.file_type in ('issue_photo', 'parts_photo', 'before_photo', 'after_photo', 'completion_photo')
    and (
      select count(*)
      from public.work_order_files wf
      where wf.work_order_id = new.work_order_id
        and wf.file_type in ('issue_photo', 'parts_photo', 'before_photo', 'after_photo', 'completion_photo')
        and (tg_op = 'INSERT' or wf.id <> new.id)
    ) >= 25 then
    raise exception 'A work order can hold no more than 25 photos';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_work_order_photo_limit on public.work_order_files;
create trigger enforce_work_order_photo_limit
before insert or update of work_order_id, file_type on public.work_order_files
for each row execute function public.enforce_work_order_photo_limit();
