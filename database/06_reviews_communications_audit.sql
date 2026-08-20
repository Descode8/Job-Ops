-- Reviews, email delivery, notifications, and traceability.

create table if not exists public.work_order_reviews (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  reviewer_id uuid references public.contractors(id) on delete set null,
  decision public.review_decision not null,
  feedback text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.email_deliveries (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid references public.work_orders(id) on delete set null,
  requested_by uuid references public.contractors(id) on delete set null,
  recipient_email text not null,
  subject text not null,
  email_type text not null check (email_type in ('work_order_created', 'completion_notice', 'check_request', 'export')),
  provider_message_id text,
  status public.delivery_status not null default 'queued',
  error_message text,
  queued_at timestamptz not null default timezone('utc', now()),
  sent_at timestamptz,
  delivered_at timestamptz
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid references public.contractors(id) on delete cascade,
  work_order_id uuid references public.work_orders(id) on delete cascade,
  title text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.contractors(id) on delete set null,
  work_order_id uuid references public.work_orders(id) on delete set null,
  event_type text not null,
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists email_deliveries_status_idx on public.email_deliveries (status, queued_at);
create index if not exists notifications_contractor_read_idx on public.notifications (contractor_id, read_at, created_at);
create index if not exists audit_events_order_created_idx on public.audit_events (work_order_id, created_at);
