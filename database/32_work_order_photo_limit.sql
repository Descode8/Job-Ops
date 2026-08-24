-- Enforce the same 10-photo limit used by the app for every work order,
-- including Home Progress records.

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
    ) >= 10 then
    raise exception 'A work order can hold no more than 10 photos';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_work_order_photo_limit on public.work_order_files;
create trigger enforce_work_order_photo_limit
before insert or update of work_order_id, file_type on public.work_order_files
for each row execute function public.enforce_work_order_photo_limit();
