import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authorization = request.headers.get('Authorization') ?? '';
    const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: { user } } = await callerClient.auth.getUser();
    if (!user) throw new Error('Authentication required');

    const adminClient = createClient(url, serviceKey);
    const { data: admin } = await adminClient.from('contractors').select('id, full_name, is_admin').eq('auth_user_id', user.id).eq('is_active', true).single();
    if (!admin?.is_admin) return json({ error: 'Admin access required' }, 403);

    const body = await request.json();
    if (body.action === 'create') {
      const email = String(body.email ?? '').trim().toLowerCase();
      const fullName = String(body.fullName ?? '').trim();
      const phoneNumber = String(body.phoneNumber ?? '').trim();
      const smsConsent = body.smsConsent === true;
      if (!email || !fullName || !phoneNumber) throw new Error('Name, email, and phone are required');
      const phoneDigits = phoneNumber.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
      if (phoneDigits.length !== 10) throw new Error('Enter a 10-digit US phone number');
      const authPhone = `+1${phoneDigits}`;

      const [{ data: phoneMatches, error: phoneLookupError }, { data: emailMatches, error: emailLookupError }] = await Promise.all([
        adminClient.from('contractors').select('id, auth_user_id, is_active, is_admin').eq('phone_number', authPhone),
        adminClient.from('contractors').select('id, auth_user_id, is_active, is_admin').eq('email', email),
      ]);
      if (phoneLookupError || emailLookupError) throw phoneLookupError ?? emailLookupError;

      const existingContractors = [...new Map([...(phoneMatches ?? []), ...(emailMatches ?? [])].map((contractor) => [contractor.id, contractor])).values()];
      for (const existing of existingContractors) {
        if (existing.is_admin || existing.is_active) throw new Error('An active contractor already uses that email address or phone number');
        const authUserId = await deleteContractorData(adminClient, existing.id) ?? existing.auth_user_id;
        if (authUserId) {
          const { error: staleAuthDeleteError } = await adminClient.auth.admin.deleteUser(authUserId);
          if (staleAuthDeleteError && !staleAuthDeleteError.message.toLowerCase().includes('not found')) throw staleAuthDeleteError;
        }
      }

      const temporaryPassword = createTemporaryPassword();
      const { data: created, error: createError } = await adminClient.auth.admin.createUser({ email, password: temporaryPassword, email_confirm: true, user_metadata: { display_name: fullName } });
      if (createError || !created.user) throw createError ?? new Error('Account creation failed');
      const { error: profileError } = await adminClient.from('contractors').insert({ auth_user_id: created.user.id, full_name: fullName, phone_number: authPhone, email, role: 'contractor', is_admin: false, is_active: true, must_change_password: true, sms_consent: smsConsent, sms_consent_at: smsConsent ? new Date().toISOString() : null, sms_consent_source: smsConsent ? 'contractor_onboarding_attestation' : null, sms_consent_disclosure_version: smsConsent ? '2026-08-29' : null });
      if (profileError) { await adminClient.auth.admin.deleteUser(created.user.id); throw profileError; }
      const smsResult = smsConsent
        ? await sendContractorInvitation(authPhone, `JobOps by Descode LLC: ${admin.full_name} has invited you to join JobOps. Your username is: ${email}. Your temporary password is: ${temporaryPassword}. Reply STOP to unsubscribe.`)
        : { smsSent: false, smsError: 'SMS consent was not recorded, so no invitation text was sent.' };
      return json({ message: 'Contractor created', username: email, phoneUsername: phoneDigits, temporaryPassword, ...smsResult });
    }

    if (body.action === 'delete') {
      const contractorId = String(body.contractorId ?? '');
      if (!contractorId) throw new Error('Contractor ID is required');
      const authUserId = await deleteContractorData(adminClient, contractorId);
      if (authUserId) {
        const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(authUserId);
        if (authDeleteError) throw authDeleteError;
      }
      return json({ message: 'Contractor permanently deleted' });
    }
    throw new Error('Unsupported action');
  } catch (error) {
    const message = error instanceof Error ? error.message : typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : JSON.stringify(error);
    return json({ error: message || 'Contractor management request failed' }, 400);
  }
});

function json(body: object, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }

function createTemporaryPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return `Mw!${Array.from(bytes, (value) => (value % 36).toString(36)).join('')}7`;
}

async function sendContractorInvitation(to: string, body: string) {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const fromNumber = Deno.env.get('TWILIO_FROM_NUMBER');
  if (!accountSid || !authToken || !fromNumber) return { smsSent: false, smsError: 'Twilio is not configured yet.' };
  try {
    const form = new URLSearchParams({ From: fromNumber, To: to, Body: body });
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Contractor invitation SMS failed:', response.status, errorBody);
      return { smsSent: false, smsError: 'Twilio could not deliver the invitation text.' };
    }
    return { smsSent: true, smsError: null };
  } catch (error) {
    console.error('Contractor invitation SMS failed:', error);
    return { smsSent: false, smsError: 'The invitation text could not be sent.' };
  }
}

async function deleteContractorData(adminClient: ReturnType<typeof createClient>, contractorId: string) {
  const { data: contractor, error: contractorError } = await adminClient.from('contractors').select('auth_user_id, is_admin').eq('id', contractorId).single();
  if (contractorError || !contractor) throw contractorError ?? new Error('Contractor not found');
  if (contractor.is_admin) throw new Error('Admin accounts cannot be deleted here');

  for (const table of ['work_order_offers', 'work_order_assignments', 'notifications']) {
    let query = adminClient.from(table).delete();
    query = table === 'work_order_offers'
      ? query.or(`sender_id.eq.${contractorId},recipient_id.eq.${contractorId}`)
      : query.eq(table === 'notifications' ? 'contractor_id' : 'contractor_id', contractorId);
    const { error } = await query;
    if (error) throw error;
  }

  const references = [
    ['work_orders', 'created_by'],
    ['work_order_files', 'uploaded_by'],
    ['work_order_notes', 'author_id'],
    ['work_order_materials', 'added_by'],
    ['work_order_checklist', 'completed_by'],
    ['work_order_reviews', 'reviewer_id'],
    ['email_deliveries', 'requested_by'],
    ['audit_events', 'actor_id'],
  ] as const;
  for (const [table, column] of references) {
    const { error } = await adminClient.from(table).update({ [column]: null }).eq(column, contractorId);
    if (error) throw error;
  }

  const { error: deleteError } = await adminClient.from('contractors').delete().eq('id', contractorId);
  if (deleteError) throw deleteError;
  const { data: remaining, error: verificationError } = await adminClient.from('contractors').select('id').eq('id', contractorId).maybeSingle();
  if (verificationError) throw verificationError;
  if (remaining) throw new Error('Contractor database row was not deleted');
  return contractor.auth_user_id as string | null;
}
