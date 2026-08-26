import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { escapeHtml, jobOpsEmail, jobOpsSender } from '../_shared/jobops-email.ts';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authorization = request.headers.get('Authorization') ?? '';
    const url = Deno.env.get('SUPABASE_URL')!;
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } });
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: 'Authentication required' }, 401);
    const workOrderId = String((await request.json()).workOrderId ?? '');
    const { data: sender } = await admin.from('contractors').select('id, full_name, is_admin').eq('auth_user_id', user.id).eq('is_active', true).single();
    if (!sender?.is_admin) return json({ error: 'Administrator access required' }, 403);
    const { data: order, error } = await admin.from('work_orders').select('id, work_order_number, title, description, priority, deadline_at, recipient_email, properties(customer_name, customer_phone, address_line_1, city, state)').eq('id', workOrderId).single();
    if (error || !order) throw error ?? new Error('Work order not found');
    const { data: assignment } = await admin.from('work_order_assignments').select('contractor:contractors!work_order_assignments_contractor_id_fkey(full_name)').eq('work_order_id', workOrderId).is('unassigned_at', null).maybeSingle();
    const property = Array.isArray(order.properties) ? order.properties[0] : order.properties;
    const assignee = Array.isArray(assignment?.contractor) ? assignment?.contractor[0] : assignment?.contractor;
    const recipient = order.recipient_email || 'jhumphries@shopmwhs.net';
    const subject = `JobOps Work Order ${order.work_order_number}`;
    const content = `<h1 style="margin:0 0 18px;font-size:24px">New work order</h1><p><strong>${escapeHtml(order.work_order_number)}</strong> has been created in JobOps.</p><p><strong>Customer:</strong> ${escapeHtml(property?.customer_name || order.title)}<br><strong>Phone:</strong> ${escapeHtml(property?.customer_phone || 'Not provided')}<br><strong>Address:</strong> ${escapeHtml(property ? `${property.address_line_1}, ${property.city}, ${property.state}` : 'Address unavailable')}<br><strong>Priority:</strong> ${escapeHtml(order.priority)}<br><strong>Deadline:</strong> ${escapeHtml(order.deadline_at ? new Date(order.deadline_at).toLocaleDateString('en-US') : 'No deadline')}<br><strong>Assigned to:</strong> ${escapeHtml(assignee?.full_name ?? 'Pending acceptance')}<br><strong>Created by:</strong> ${escapeHtml(sender.full_name)}</p><p><strong>Work description:</strong><br>${escapeHtml(order.description).replace(/\n/g, '<br>')}</p>`;
    const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: jobOpsSender(), to: [recipient], subject, html: jobOpsEmail(content, `${order.work_order_number} was created in JobOps.`) }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return json({ error: body.message ?? 'Email provider rejected the request' }, 502);
    await admin.from('email_deliveries').insert({ work_order_id: workOrderId, requested_by: sender.id, recipient_email: recipient, subject, email_type: 'work_order_created', status: 'sent', provider_message_id: body.id ?? null, sent_at: new Date().toISOString() });
    return json({ message: 'Work-order email sent' });
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Work-order email failed' }, 400); }
});

function json(body: object, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
