export function jobOpsEmail(content: string, preheader: string) {
  const logoUrl = Deno.env.get('JOBOPS_LOGO_URL')?.trim();
  const brand = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" width="148" alt="JobOps" style="display:block;max-width:148px;height:auto;border:0">`
    : '<div style="font:900 30px Arial,sans-serif;letter-spacing:-1px;color:#ffffff">Job<span style="color:#60a5fa">Ops</span></div>';
  return `<!doctype html><html><body style="margin:0;background:#f3f7fc;font-family:Arial,sans-serif;color:#09192d"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(preheader)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f7fc"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #b9cce0;border-radius:12px;overflow:hidden"><tr><td style="background:#09192d;padding:22px 26px">${brand}<div style="margin-top:7px;font-size:10px;font-weight:700;letter-spacing:1.4px;color:#9fb7d5">WORK ORDER OPERATIONS</div></td></tr><tr><td style="padding:28px 26px;font-size:14px;line-height:1.55">${content}</td></tr><tr><td style="background:#e8f1fa;padding:16px 26px;color:#405c78;font-size:11px">Sent securely by JobOps.</td></tr></table></td></tr></table></body></html>`;
}

export function jobOpsSender() {
  const configured = Deno.env.get('RESEND_FROM_EMAIL')?.trim() || 'jobops@jobops.io';
  const address = configured.match(/<([^>]+)>/)?.[1] ?? configured;
  return `JobOps <${address}>`;
}

export function escapeHtml(value: unknown) { return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]!); }
