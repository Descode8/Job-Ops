-- Let office users view private contractor profile photos in management lists.

drop policy if exists profile_images_read_own on storage.objects;
drop policy if exists profile_images_read_own_or_office on storage.objects;
create policy profile_images_read_own_or_office on storage.objects for select to authenticated
using (
  bucket_id = 'profile-images'
  and (
    (storage.foldername(name))[1] = public.current_contractor_id()::text
    or public.is_office_user()
  )
);
