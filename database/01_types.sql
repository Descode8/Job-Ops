-- Shared domain types.

do $$
begin
  create type public.user_role as enum ('contractor', 'office_staff', 'admin');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.work_order_priority as enum ('low', 'medium', 'high', 'emergency');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.work_order_status as enum ('not_started', 'in_progress', 'submitted', 'approved', 'rejected', 'completed');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.work_order_kind as enum ('installation', 'service', 'inspection', 'repair', 'other');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.file_type as enum ('issue_photo', 'parts_photo', 'before_photo', 'after_photo', 'completion_photo', 'invoice', 'quote', 'material_list', 'receipt', 'other');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.review_decision as enum ('approved', 'rejected');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.delivery_status as enum ('queued', 'sent', 'delivered', 'failed');
exception when duplicate_object then null;
end $$;
