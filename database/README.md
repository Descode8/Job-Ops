# Marty Wright Contractor Portal Database

This folder contains the proposed PostgreSQL schema for **Marty Wright Contractor Portal**. The scripts are ordered so they can be applied as migrations:

These files define the database structure; they do not create a hosted or connected database by themselves. Run them in a Supabase SQL Editor or PostgreSQL migration after creating the project.

1. `00_extensions_and_functions.sql` - UUID support and shared timestamp trigger.
2. `01_types.sql` - roles, work-order statuses, priorities, file types, and delivery states.
3. `02_people_and_properties.sql` - portal users and home/property addresses.
4. `03_work_orders.sql` - work orders and contractor assignments.
5. `04_work_order_records.sql` - photos, documents, notes, and materials.
6. `05_checklists.sql` - the required home completion checklist and per-order state.
7. `06_reviews_communications_audit.sql` - reviews, email delivery, notifications, and audit history.

The schema assumes Supabase PostgreSQL because `contractors.auth_user_id` references `auth.users`. If this is run outside Supabase, replace that foreign key with the project's authentication table.

## Work-order email flow

The mobile app should create a work order through a protected server endpoint. The server should create an `email_deliveries` row, send the email through Resend or Postmark, update the delivery status, and append an `audit_events` row. Email API keys must remain server-side.

## Future migration work

Before production, add Row Level Security policies so contractors can only read assigned work orders and related files, while office staff can manage assignments, reviews, exports, and email workflows.
