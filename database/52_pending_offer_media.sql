-- Expose only image/video metadata to the pending recipient. Storage remains
-- private; migration 51 authorizes the corresponding signed URL.

create or replace function public.get_pending_offer_media(p_offer_id uuid)
returns table (
  id uuid,
  storage_path text,
  original_file_name text,
  mime_type text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select wf.id, wf.storage_path, wf.original_file_name, wf.mime_type, wf.created_at
  from public.work_order_offers offer
  join public.work_order_files wf on wf.work_order_id = offer.work_order_id
  where offer.id = p_offer_id
    and offer.recipient_id = public.current_contractor_id()
    and offer.status = 'pending'
    and (lower(wf.mime_type) like 'image/%' or lower(wf.mime_type) like 'video/%')
  order by wf.created_at asc;
$$;

revoke all on function public.get_pending_offer_media(uuid) from public;
grant execute on function public.get_pending_offer_media(uuid) to authenticated;
