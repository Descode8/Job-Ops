import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { escapeHtml, jobOpsEmail, jobOpsSender } from '../_shared/jobops-email.ts';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const DOWNLOAD_LINK_SECONDS = 60 * 60 * 24 * 7;

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
    const { data: fileRows, error: filesError } = await admin.from('work_order_files').select('storage_path, original_file_name, mime_type').eq('work_order_id', workOrderId).order('created_at', { ascending: true });
    if (filesError) console.error('Could not load work-order files:', filesError);
    const signedFiles = await Promise.all((fileRows ?? []).map(async (file) => {
      const { data, error: signError } = await admin.storage.from('work-order-files').createSignedUrl(file.storage_path, DOWNLOAD_LINK_SECONDS);
      if (signError) console.error(`Could not sign ${file.storage_path}:`, signError);
      return { ...file, url: signError ? null : data?.signedUrl ?? null };
    }));
    const imageFiles = signedFiles.filter((file) => file.url && String(file.mime_type ?? '').toLowerCase().startsWith('image/'));
    const otherFiles = signedFiles.filter((file) => file.url && !String(file.mime_type ?? '').toLowerCase().startsWith('image/'));
    const mediaHtml = signedFiles.length
      ? `<h2 style="margin:28px 0 12px;font-size:18px;color:#09192d">Work-order pictures and files</h2>${imageFiles.map((file) => `<div style="margin:0 0 18px"><a href="${escapeHtml(file.url)}"><img src="${escapeHtml(file.url)}" alt="${escapeHtml(file.original_file_name || 'Work-order picture')}" width="560" style="display:block;width:100%;max-width:560px;height:auto;border:0;border-radius:8px"></a><div style="margin-top:6px;font-size:12px;color:#405c78">${escapeHtml(file.original_file_name || 'Work-order picture')}</div></div>`).join('')}${otherFiles.length ? `<ul style="padding-left:20px">${otherFiles.map((file) => `<li><a href="${escapeHtml(file.url)}" style="color:#1d4ed8;font-weight:700">${escapeHtml(file.original_file_name || 'Work-order file')}</a></li>`).join('')}</ul>` : ''}<p style="font-size:12px;color:#405c78">Secure file links remain active for seven days.</p>`
      : '<h2 style="margin:28px 0 12px;font-size:18px;color:#09192d">Work-order pictures</h2><p>No pictures were attached.</p>';
    const content = `<h1 style="margin:0 0 18px;font-size:24px;color:#09192d">New work order</h1><p><strong>${escapeHtml(order.work_order_number)}</strong> has been created in JobOps.</p><div style="margin:20px 0;padding:16px;background:#f3f7fc;border:1px solid #dceaf7;border-radius:8px"><strong>Customer:</strong> ${escapeHtml(property?.customer_name || order.title)}<br><strong>Phone:</strong> ${escapeHtml(property?.customer_phone || 'Not provided')}<br><strong>Address:</strong> ${escapeHtml(property ? `${property.address_line_1}, ${property.city}, ${property.state}` : 'Address unavailable')}<br><strong>Priority:</strong> ${escapeHtml(order.priority)}<br><strong>Deadline:</strong> ${escapeHtml(order.deadline_at ? new Date(order.deadline_at).toLocaleDateString('en-US') : 'No deadline')}<br><strong>Assigned to:</strong> ${escapeHtml(assignee?.full_name ?? 'Pending acceptance')}<br><strong>Created by:</strong> ${escapeHtml(sender.full_name)}</div><h2 style="margin:28px 0 12px;font-size:18px;color:#09192d">Work requested</h2><p>${escapeHtml(order.description).replace(/\n/g, '<br>')}</p>${mediaHtml}`;
    const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: jobOpsSender(), to: [recipient], subject, html: jobOpsEmail(content, `${order.work_order_number} was created in JobOps.`) }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return json({ error: body.message ?? 'Email provider rejected the request' }, 502);
    await admin.from('email_deliveries').insert({ work_order_id: workOrderId, requested_by: sender.id, recipient_email: recipient, subject, email_type: 'work_order_created', status: 'sent', provider_message_id: body.id ?? null, sent_at: new Date().toISOString() });
    return json({ message: 'Work-order email sent' });
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Work-order email failed' }, 400); }
});

function json(body: object, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
