-- Customer-requested cleanup for databases created from an earlier schema.
-- Run this once in Supabase SQL Editor if contractors already exists.

alter table public.contractors
  drop column if exists contractor_number;
