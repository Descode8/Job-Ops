-- Self-service contractor/admin profiles and private profile photos.

alter table public.contractors add column if not exists avatar_path text;

create or replace function public.update_own_profile(
  p_full_name text,
  p_email text,
  p_phone_number text,
  p_avatar_path text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_contractor_id uuid := public.current_contractor_id();
begin
  if v_contractor_id is null then raise exception 'An active contractor account is required'; end if;
  if nullif(trim(p_full_name), '') is null or nullif(trim(p_phone_number), '') is null then
    raise exception 'Name and phone number are required';
  end if;
  update public.contractors set
    full_name = trim(p_full_name),
    email = nullif(lower(trim(p_email)), ''),
    phone_number = trim(p_phone_number),
    avatar_path = nullif(trim(p_avatar_path), '')
  where id = v_contractor_id;
end;
$$;

revoke all on function public.update_own_profile(text, text, text, text) from public;
grant execute on function public.update_own_profile(text, text, text, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-images', 'profile-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists profile_images_read_own on storage.objects;
create policy profile_images_read_own on storage.objects for select to authenticated
using (bucket_id = 'profile-images' and (storage.foldername(name))[1] = public.current_contractor_id()::text);

drop policy if exists profile_images_insert_own on storage.objects;
create policy profile_images_insert_own on storage.objects for insert to authenticated
with check (bucket_id = 'profile-images' and (storage.foldername(name))[1] = public.current_contractor_id()::text);

drop policy if exists profile_images_update_own on storage.objects;
create policy profile_images_update_own on storage.objects for update to authenticated
using (bucket_id = 'profile-images' and (storage.foldername(name))[1] = public.current_contractor_id()::text)
with check (bucket_id = 'profile-images' and (storage.foldername(name))[1] = public.current_contractor_id()::text);

