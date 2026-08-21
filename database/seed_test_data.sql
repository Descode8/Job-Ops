-- Test data for Jaden Humphries.
-- Run after schema.sql has been applied and the Auth user exists.

insert into public.contractors (
  auth_user_id,
  full_name,
  phone_number,
  email,
  role,
  is_active
)
values (
  '5f589e05-48a2-4775-9dae-3e0320524e63',
  'Jaden Humphries',
  '+18646428634',
  'jaden.humphries@gmail.com',
  'contractor',
  true
)
on conflict (auth_user_id) do update
set
  full_name = excluded.full_name,
  phone_number = excluded.phone_number,
  email = excluded.email,
  is_active = true;

insert into public.properties (
  address_line_1,
  city,
  state,
  postal_code,
  customer_name
)
values (
  '6829 S De Soto St-C',
  'Tampa',
  'FL',
  '33616',
  'Test Customer'
);
