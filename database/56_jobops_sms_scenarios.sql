alter table public.sms_notification_log drop constraint if exists sms_notification_log_event_type_check;
alter table public.sms_notification_log add constraint sms_notification_log_event_type_check check (event_type in (
  'assigned','photo_uploaded','video_uploaded','note_added','invoice_price_set','invoice_uploaded',
  'media_deleted','invoice_deleted','note_deleted','accepted','rejected','completed'
));
