import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const allowedEvents = new Set(['work_order_created', 'work_order_modified', 'offer_accepted', 'offer_rejected', 'work_order_completed']);

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const fromNumber = Deno.env.get('TWILIO_FROM_NUMBER');
    if (!url || !anonKey || !serviceKey) return json({ error: 'Supabase environment variables are missing' }, 500);
    if (!accountSid || !authToken || !fromNumber) return json({ error: 'Twilio is not configured' }, 503);

    const authorization = request.headers.get('Authorization') ?? '';
    const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const admin = createClient(url, serviceKey);
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: 'Authentication required' }, 401);

    const body = await request.json().catch(() => ({}));
    const workOrderId = String(body.workOrderId ?? '').trim();
    const event = String(body.event ?? '').trim();
    const details = String(body.details ?? '').trim().slice(0, 500);
    const recipientContractorId = String(body.recipientContractorId ?? '').trim();
    if (!workOrderId || !allowedEvents.has(event)) return json({ error: 'A valid work order and event are required' }, 400);

    const { data: actor } = await admin.from('contractors').select('id, full_name, is_admin').eq('auth_user_id', user.id).eq('is_active', true).single();
    if (!actor) return json({ error: 'Active contractor access required' }, 403);
    const { data: order } = await admin.from('work_orders').select('id, work_order_number, status, created_by, completed_at').eq('id', workOrderId).single();
    if (!order) return json({ error: 'Work order not found' }, 404);

    const { data: assignment } = await admin.from('work_order_assignments').select('id').eq('work_order_id', workOrderId).eq('contractor_id', actor.id).is('unassigned_at', null).maybeSingle();
    const { data: offer } = await admin.from('work_order_offers').select('recipient_id, status').eq('work_order_id', workOrderId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    const involved = actor.is_admin || order.created_by === actor.id || Boolean(assignment) || offer?.recipient_id === actor.id;
    if (!involved) return json({ error: 'Work-order access required' }, 403);

    let recipients: Array<{ phone_number: string | null }> = [];
    let message = '';
    const number = formatNumber(order.work_order_number);
    if (event === 'work_order_created') {
      if (!recipientContractorId || (order.created_by !== actor.id && !actor.is_admin)) return json({ error: 'Only the creator can send a creation notice' }, 403);
      const { data } = await admin.from('contractors').select('phone_number').eq('id', recipientContractorId).eq('is_active', true).eq('sms_consent', true).maybeSingle();
      if (data) recipients = [data];
      message = 'Work Order has been created for you. Please Accept/Reject in the JobOps app.';
    } else {
      const { data } = await admin.from('contractors').select('phone_number').eq('is_active', true).eq('is_admin', true).eq('sms_consent', true);
      recipients = data ?? [];
      if (event === 'work_order_modified') message = `${number} has been modified by ${actor.full_name}.${details ? ` Changes: ${details}` : ''}`;
      if (event === 'offer_accepted' || event === 'offer_rejected') {
        const expected = event === 'offer_accepted' ? 'accepted' : 'rejected';
        if (offer?.recipient_id !== actor.id || offer.status !== expected) return json({ error: 'Offer response could not be verified' }, 409);
        message = `${number} has been ${expected === 'accepted' ? 'Accepted' : 'Rejected'} by ${actor.full_name}.`;
      }
      if (event === 'work_order_completed') {
        if (order.status !== 'completed') return json({ error: 'Completion could not be verified' }, 409);
        const completed = new Date(order.completed_at ?? Date.now());
        message = `${number} has been Completed by ${actor.full_name} on ${completed.toLocaleDateString('en-US', { weekday: 'long', month: '2-digit', day: '2-digit', year: 'numeric', timeZone: 'America/New_York' })} at ${completed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })}.`;
      }
    }

    message = `JobOps by Descode LLC: ${message} Reply STOP to unsubscribe.`;
    const toNumbers = [...new Set(recipients.map((item) => normalizePhone(item.phone_number)).filter((phone): phone is string => Boolean(phone)))];
    const results = await Promise.all(toNumbers.map((to) => sendTwilio(accountSid, authToken, fromNumber, to, message)));
    const failed = results.filter((result) => !result.ok);
    if (failed.length) console.error('Some Twilio messages failed:', await Promise.all(failed.map((response) => response.text())));
    return json({ sent: results.length - failed.length, failed: failed.length, recipients: toNumbers.length });
  } catch (error) {
    console.error('Work-order SMS error:', error);
    return json({ error: error instanceof Error ? error.message : 'SMS notification failed' }, 400);
  }
});

function sendTwilio(sid: string, token: string, from: string, to: string, body: string) {
  const form = new URLSearchParams({ From: from, To: to, Body: body });
  return fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, { method: 'POST', headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() });
}
function normalizePhone(value: unknown) { const digits = String(value ?? '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, ''); return digits.length === 10 ? `+1${digits}` : String(value ?? '').startsWith('+') && digits.length >= 11 ? `+${digits}` : null; }
function formatNumber(value: string) { return value.toUpperCase().startsWith('WO#') ? value : `WO# ${value}`; }
function json(body: object, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
