import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { escapeHtml, jobOpsEmail, jobOpsSender } from '../_shared/jobops-email.ts';

const RECIPIENT_EMAIL = 'jhumphries@shopmwhs.net';
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
    if (!workOrderId) return json({ error: 'Work order ID is required' }, 400);
    const { data: contractor } = await admin.from('contractors').select('id, full_name, is_admin').eq('auth_user_id', user.id).eq('is_active', true).single();
    if (!contractor) return json({ error: 'Active contractor access required' }, 403);

    const { data: order, error: orderError } = await admin.from('work_orders').select('id, work_order_number, title, description, status, priority, completed_at, invoice_amount, properties(customer_name, address_line_1, city, state)').eq('id', workOrderId).single();
    if (orderError || !order) throw orderError ?? new Error('Work order not found');
    const { data: assignment } = await admin.from('work_order_assignments').select('id').eq('work_order_id', workOrderId).eq('contractor_id', contractor.id).is('unassigned_at', null).maybeSingle();
    if (!contractor.is_admin && !assignment) return json({ error: 'You are not assigned to this work order' }, 403);
    if (order.status !== 'completed') return json({ error: 'The work order is not complete' }, 409);

    const { data: existing } = await admin.from('email_deliveries').select('id').eq('work_order_id', workOrderId).eq('email_type', 'completion_notice').eq('status', 'sent').maybeSingle();
    if (existing) return json({ message: 'Completion email already sent' });

    const subject = 'JobOps Service Completion';
    const { data: delivery, error: deliveryError } = await admin.from('email_deliveries').insert({ work_order_id: workOrderId, requested_by: contractor.id, recipient_email: RECIPIENT_EMAIL, subject, email_type: 'completion_notice', status: 'queued' }).select('id').single();
    if (deliveryError) throw deliveryError;

    const property = Array.isArray(order.properties) ? order.properties[0] : order.properties;
    const customer = property?.customer_name || order.title;
    const address = property ? `${property.address_line_1}, ${property.city}, ${property.state}` : 'Address unavailable';
    const completedAt = order.completed_at ? new Date(order.completed_at).toLocaleString('en-US') : new Date().toLocaleString('en-US');
    const [{ data: noteRows, error: notesError }, { data: fileRows, error: filesError }] = await Promise.all([
      admin.from('work_order_notes').select('note, created_at, author:contractors!work_order_notes_author_id_fkey(full_name)').eq('work_order_id', workOrderId).order('created_at', { ascending: true }),
      admin.from('work_order_files').select('storage_path, original_file_name, mime_type, file_type, file_size_bytes, invoice_amount, created_at').eq('work_order_id', workOrderId).order('created_at', { ascending: true }),
    ]);
    // Completion notices are more important than optional enrichment. If either
    // query fails, send the base email instead of aborting the notification.
    const notes = notesError ? [] : (noteRows ?? []);
    const files = filesError ? [] : (fileRows ?? []);
    const emailFiles = (files ?? []).filter((file) => file.file_type === 'invoice' || file.mime_type?.startsWith('image/') || file.mime_type?.startsWith('video/'));
    const signedFiles = await Promise.all(emailFiles.map(async (file) => {
      const { data } = await admin.storage.from('work-order-files').createSignedUrl(file.storage_path, 60 * 60 * 24 * 7);
      return { ...file, url: data?.signedUrl ?? null };
    }));
    const orderedFiles = [...signedFiles].sort((left, right) => Number(right.file_type === 'invoice') - Number(left.file_type === 'invoice'));
    const attachments: { filename: string; path: string }[] = [];
    const attachedPaths = new Set<string>();
    let attachmentBytes = 0;
    const safeRawAttachmentLimit = 28 * 1024 * 1024;
    for (const file of orderedFiles) {
      const size = Number(file.file_size_bytes ?? 0);
      if (!file.url || !size || attachmentBytes + size > safeRawAttachmentLimit) continue;
      attachments.push({ filename: file.original_file_name, path: file.url });
      attachedPaths.add(file.storage_path);
      attachmentBytes += size;
    }
    const notesHtml = notes?.length
      ? `<h3>Job notes</h3><ul>${notes.map((note) => {
          const author = Array.isArray(note.author) ? note.author[0] : note.author;
          return `<li><strong>${escapeHtml(author?.full_name ?? 'JobOps user')} · ${escapeHtml(new Date(note.created_at).toLocaleString('en-US'))}</strong><br>${escapeHtml(note.note).replace(/\n/g, '<br>')}</li>`;
        }).join('')}</ul>`
      : '<h3>Job notes</h3><p>No job notes were submitted.</p>';
    const invoiceFile = signedFiles.find((file) => file.file_type === 'invoice');
    const invoiceAmount = invoiceFile?.invoice_amount ?? order.invoice_amount;
    const invoiceHtml = `<h3>Invoice</h3><p><strong>Amount:</strong> ${invoiceAmount == null ? 'Not provided' : escapeHtml(formatCurrency(Number(invoiceAmount)))}<br><strong>Invoice attachment:</strong> ${invoiceFile ? escapeHtml(invoiceFile.original_file_name) : 'None'}</p>`;
    const linkedOnlyCount = signedFiles.filter((file) => !attachedPaths.has(file.storage_path)).length;
    const overflowNotice = linkedOnlyCount
      ? `<div style="margin:18px 0;padding:14px 16px;border-left:4px solid #1d4ed8;background:#e8f1fa"><strong>${linkedOnlyCount} media file${linkedOnlyCount === 1 ? '' : 's'} available by secure download</strong><br><span style="color:#405c78">To keep this email within delivery limits, larger files are linked below instead of attached. Links remain active for 7 days.</span></div>`
      : '';
    const filesHtml = signedFiles.length
      ? `${overflowNotice}<h3>Photos, videos, and invoice files</h3><ul style="padding-left:20px">${signedFiles.map((file) => `<li style="margin-bottom:8px">${file.url ? `<a href="${escapeHtml(file.url)}" style="color:#1d4ed8;font-weight:700">${escapeHtml(file.original_file_name)}</a>` : escapeHtml(file.original_file_name)} — ${escapeHtml(fileLabel(file))}${attachedPaths.has(file.storage_path) ? ' (attached)' : file.url ? ' (secure download · expires in 7 days)' : ' (link unavailable)'}</li>`).join('')}</ul>`
      : '<h3>Attachments</h3><p>No photos, videos, or invoice files were submitted.</p>';
    const emailPayload = {
        from: jobOpsSender(),
        to: [RECIPIENT_EMAIL],
        subject,
        html: jobOpsEmail(`<h1 style="margin:0 0 18px;font-size:24px">Work order complete</h1><p><strong>${escapeHtml(order.work_order_number)}</strong> has been marked complete.</p><p><strong>Customer:</strong> ${escapeHtml(customer)}<br><strong>Address:</strong> ${escapeHtml(address)}<br><strong>Priority:</strong> ${escapeHtml(order.priority)}<br><strong>Completed by:</strong> ${escapeHtml(contractor.full_name)}<br><strong>Completed:</strong> ${escapeHtml(completedAt)}</p><p><strong>Work description:</strong><br>${escapeHtml(order.description).replace(/\n/g, '<br>')}</p>${notesHtml}${invoiceHtml}${filesHtml}`, `${order.work_order_number} has been completed in JobOps.`),
        attachments,
    };
    let resendResponse = await sendEmail(emailPayload);
    let resendBody = await resendResponse.json().catch(() => ({}));
    if (!resendResponse.ok && attachments.length) {
      // Remote media fetching, encoding, or an individual attachment can fail.
      // Retry the notification without binaries; secure links remain in the HTML.
      resendResponse = await sendEmail({ ...emailPayload, attachments: [] });
      resendBody = await resendResponse.json().catch(() => ({}));
    }
    if (!resendResponse.ok) {
      await admin.from('email_deliveries').update({ status: 'failed', error_message: resendBody.message ?? 'Email provider rejected the request' }).eq('id', delivery.id);
      return json({ error: resendBody.message ?? 'Completion email failed' }, 502);
    }
    await admin.from('email_deliveries').update({ status: 'sent', provider_message_id: resendBody.id ?? null, sent_at: new Date().toISOString() }).eq('id', delivery.id);
    return json({ message: 'Completion email sent' });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Completion email failed' }, 400);
  }
});

function formatCurrency(amount: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount); }
function fileLabel(file: { file_type: string; mime_type: string }) { return file.file_type === 'invoice' ? 'Invoice' : file.mime_type.startsWith('video/') ? 'Video' : 'Photo'; }
function sendEmail(payload: object) { return fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); }
function json(body: object, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
