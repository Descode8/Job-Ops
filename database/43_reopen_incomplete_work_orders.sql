-- Reopen a completed standard work order when required content is removed.
-- Standard completion requires at least one job note and two supported photos.

create or replace function public.reopen_incomplete_completed_work_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_work_order_id uuid := old.work_order_id;
  v_note_count integer;
  v_photo_count integer;
begin
  if not exists (
    select 1
    from public.work_orders wo
    where wo.id = v_work_order_id
      and wo.status = 'completed'
      and wo.work_order_number not like 'HOME-%'
  ) then
    return old;
  end if;

  select count(*) into v_note_count
  from public.work_order_notes
  where work_order_id = v_work_order_id;

  select count(*) into v_photo_count
  from public.work_order_files
  where work_order_id = v_work_order_id
    and file_type in ('issue_photo', 'parts_photo', 'before_photo', 'after_photo', 'completion_photo')
    and lower(mime_type) in ('image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif', 'image/webp');

  if v_note_count < 1 or v_photo_count < 2 then
    update public.work_orders
    set status = 'in_progress'
    where id = v_work_order_id and status = 'completed';
  end if;

  return old;
end;
$$;

drop trigger if exists reopen_work_order_after_file_delete on public.work_order_files;
create trigger reopen_work_order_after_file_delete
after delete on public.work_order_files
for each row execute function public.reopen_incomplete_completed_work_order();

drop trigger if exists reopen_work_order_after_note_delete on public.work_order_notes;
create trigger reopen_work_order_after_note_delete
after delete on public.work_order_notes
for each row execute function public.reopen_incomplete_completed_work_order();
