-- JobOps transactional SMS is enabled for active users by existing agreement.
-- Explicit STOP/opt-out records and disabled notification preferences remain honored.
update public.contractors
set sms_consent = true,
    sms_consent_at = coalesce(sms_consent_at, timezone('utc', now())),
    sms_consent_source = coalesce(sms_consent_source, 'existing_jobops_agreement'),
    sms_consent_disclosure_version = coalesce(sms_consent_disclosure_version, '2026-08-29'),
    sms_notifications_enabled = true
where is_active = true and sms_opted_out_at is null;
