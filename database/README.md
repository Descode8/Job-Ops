# JobOps Contractor Portal Database

This folder contains the proposed PostgreSQL schema for **JobOps Contractor Portal**. The scripts are ordered so they can be applied as migrations:

These files define the database structure; they do not create a hosted or connected database by themselves. Run them in a Supabase SQL Editor or PostgreSQL migration after creating the project.

## One-file setup

For a new Supabase project, use [`schema.sql`](schema.sql). Copy and paste the entire file into the SQL Editor and run it once. It combines the types, tables, checklist seed data, indexes, triggers, and RLS policies below.

For local testing, run [`seed_test_data.sql`](seed_test_data.sql) after the schema. It links the existing Supabase Auth user to a contractor record and adds the sample property. The Auth user UUID in that file must match a user in **Authentication > Users**.

1. `00_extensions_and_functions.sql` - UUID support and shared timestamp trigger.
2. `01_types.sql` - roles, work-order statuses, priorities, file types, and delivery states.
3. `02_people_and_properties.sql` - portal users and home/property addresses.
4. `03_work_orders.sql` - work orders and contractor assignments.
5. `04_work_order_records.sql` - photos, documents, notes, and materials.
6. `05_checklists.sql` - the required home completion checklist and per-order state.
7. `06_reviews_communications_audit.sql` - reviews, email delivery, notifications, and audit history.
8. `07_row_level_security.sql` - Supabase RLS policies for contractor and office access.
9. `08_remove_contractor_number.sql` - removes the deprecated contractor number from an existing database.
10. `09_remove_company_name.sql` - removes the shared company name from an existing database.
11. `10_completion_timestamp.sql` - records `completed_at` automatically when a work order is completed.
12. `11_contractor_work_order_permissions.sql` - allows an active contractor to create and self-assign a work order.
13. `12_work_order_offers.sql` - adds contractor selection and transactional Accept/Reject assignment offers.
14. `14_work_order_file_storage.sql` - creates the private work-order upload bucket and its access policies.
15. `15_checklist_starts_work_order.sql` - starts a work order when checklist activity begins.
16. `16_derived_work_order_status.sql` - derives in-progress state from contractor activity.
17. `17_finalize_work_orders.sql` - makes notes optional and adds explicit, validated contractor finalization.
18. `18_work_order_deadlines.sql` - adds optional deadlines to contractor-created work orders.
19. `19_admin_contractors_and_offer_notifications.sql` - adds admins, contractor oversight, and offer-response notifications.
20. `20_admin_work_order_reassignment.sql` - lets admins view and change active work-order assignments.
21. `21_contractor_first_login.sql` - requires contractors created without email delivery to replace a temporary password.
22. `22_hard_delete_contractors.sql` - permanently deletes non-admin contractors and removes or anonymizes their database references.
23. `23_admin_edit_delete_work_orders.sql` - lets admins edit and delete work orders.
24. `24_notification_history_and_admin_activity.sql` - adds notification history and admin activity notices.
25. `25_work_order_recipient_email.sql` - routes newly created work-order emails to `jhumphries@shopmwhs.net`.
26. `26_home_progress.sql` - creates new-home installation records with their complete 14-item progress checklist.
27. `27_contractor_workflow.sql` - limits contractor completion to work photos and a priced PDF invoice, and repairs legacy recipient emails.
28. `28_work_order_start_actions.sql` - marks accepted work orders in progress when the contractor calls the customer or starts navigation.
29. `29_contractor_profiles.sql` - adds self-service profile editing and private contractor profile-photo storage.
30. `30_admin_profile_images.sql` - lets admins securely display contractor profile photos in management lists.
31. `31_home_progress_checklist_completion.sql` - allows Home Progress records to be completed after all 14 checklist items are checked.
32. `32_work_order_photo_limit.sql` - limits Home Progress and standard work orders to 10 uploaded photos each.
33. `33_work_order_creation_priority.sql` - stores the priority selected when a standard work order is created.
34. `34_work_order_number_format.sql` - generates priority- and year-coded standard work-order numbers.
35. `35_work_order_completion_and_photo_limit.sql` - requires a note and two photos for standard completion, makes invoices optional, and raises the photo limit to 25.
36. `36_fix_work_order_number_ambiguity.sql` - qualifies the work-order number collision check so new coded work orders can be created.
37. `37_home_progress_financing_type.sql` - adds FHA/Non-FHA selection, coded five-character Home Progress numbers, and assigns each home to its creating admin.
38. `38_work_order_realtime.sql` - publishes work-order and assignment changes for live screen updates.
39. `39_notification_realtime.sql` - publishes persistent notification inserts for global in-app alerts.
40. `40_work_order_offer_realtime.sql` - publishes work-order offers and responses for persistent global prompts.
41. `41_work_order_photo_deletion.sql` - lets active assignees and admins remove individual or all work-order photos.
42. `42_completed_work_order_content_editing.sql` - lets active assignees and admins remove job notes after completion; completed work-order attachments and notes remain editable.
43. `43_reopen_incomplete_work_orders.sql` - returns a completed standard work order to In Progress if deleting content leaves it with fewer than one job note or two supported photos.
44. `44_invoice_price_editing.sql` - lets admins and active assignees update invoice prices, including after completion.
45. `45_work_order_invoice_price.sql` - stores an invoice price independently so a PDF attachment is optional.
46. `46_single_invoice_attachment.sql` - allows only one invoice image attachment per work order.
47. `47_clear_notification_history.sql` - reliably clears the signed-in user's notification history.
48. `48_work_order_completion_videos.sql` - supports completion video attachments.
49. `49_home_progress_options_and_comments.sql` - adds the two new Home Progress steps, backfills active homes, and enables the 16-step completion flow.
50. `50_home_progress_labels.sql` - updates Home Progress checklist labels.
51. `51_work_order_storage_assignment_access.sql` - permits authorized assignees and offer recipients to view work-order storage objects.
52. `52_pending_offer_media.sql` - exposes authorized media while a contractor reviews a pending offer.
53. `53_sms_consent.sql` - records optional transactional SMS consent and its timestamp for each contractor.
54. `54_secure_work_order_sms.sql` - adds SMS preferences, opt-out state, and an idempotent notification delivery log with admin-only visibility.

The schema assumes Supabase PostgreSQL because `contractors.auth_user_id` references `auth.users`. The app uses the contractor's Supabase Auth email as the username and a password for sign-in; `phone_number` remains a contractor contact field. If this is run outside Supabase, replace that foreign key with the project's authentication table.

## Work-order email flow

The mobile app should create a work order through a protected server endpoint. The server should create an `email_deliveries` row, send the email through Resend or Postmark, update the delivery status, and append an `audit_events` row. Email API keys must remain server-side.

## Future migration work

Run `07_row_level_security.sql` after the tables exist. It enables Row Level Security and adds policies so contractors can only read assigned work orders and related files, while office staff can manage assignments, reviews, exports, and email workflows. The policies require a matching authenticated Supabase user in `contractors.auth_user_id`.

If the database was already created before `contractor_number` was removed, run `08_remove_contractor_number.sql` once. This is a schema change and should only be run after confirming the field is not needed.

If the database was already created before `company_name` was removed, run `09_remove_company_name.sql` once. Contractors are assumed to belong to the same company.

If the database was already created before automatic completion timestamps were added, run `10_completion_timestamp.sql` once. Completed work orders remain in `work_orders` with `status = 'completed'`; they are never deleted.

If the contractor app should create work orders, run `11_contractor_work_order_permissions.sql` once. It allows an active contractor to create a property, create an order with themselves as `created_by`, and self-assign that order.

Run `12_work_order_offers.sql` once to enable contractor-to-contractor offers. A recipient who accepts becomes the assignee; a recipient who rejects assigns the work order back to its sender.

Run all migrations through `54_secure_work_order_sms.sql`. A standard work order can then be completed after it has at least one work-order note and two supported photos. Invoice prices and invoice image attachments are independently optional, with one invoice attachment allowed per work order. Home Progress records use their separate completion checklist with per-step comments. Assigned contractors and pending-offer recipients can open private work-order media uploaded by another authorized user, including creator attachments shown while reviewing an offer. Transactional SMS is sent only to active contractors whose consent is recorded and whose SMS notification preference is enabled.
