-- Completion videos are separate from admin reference attachments and capped at two per work order.

alter type public.file_type add value if not exists 'completion_video';

create or replace function public.enforce_work_order_video_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.work_order_id::text));
  if new.file_type::text = 'completion_video'
    and (
      select count(*)
      from public.work_order_files wf
      where wf.work_order_id = new.work_order_id
        and wf.file_type::text = 'completion_video'
        and (tg_op = 'INSERT' or wf.id <> new.id)
    ) >= 2 then
    raise exception 'A work order can hold no more than 2 completion videos';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_work_order_video_limit on public.work_order_files;
create trigger enforce_work_order_video_limit
before insert or update of work_order_id, file_type on public.work_order_files
for each row execute function public.enforce_work_order_video_limit();
