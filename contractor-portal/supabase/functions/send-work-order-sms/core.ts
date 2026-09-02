export const SMS_EVENTS = ['assigned','photo_uploaded','video_uploaded','note_added','invoice_price_set','invoice_uploaded','media_deleted','invoice_deleted','note_deleted','accepted','rejected','completed'] as const;
export type SmsEvent = typeof SMS_EVENTS[number];
export const ADMIN_EVENTS: SmsEvent[] = ['photo_uploaded','video_uploaded','note_added','invoice_price_set','invoice_uploaded','media_deleted','invoice_deleted','note_deleted','accepted','rejected','completed'];
export function isSmsEvent(v: unknown): v is SmsEvent { return typeof v === 'string' && SMS_EVENTS.includes(v as SmsEvent); }
export function isUuid(v: unknown): v is string { return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v); }
export function normalizeUsPhone(v: unknown) { const d=String(v??'').replace(/\D/g,''); const n=d.length===11&&d[0]==='1'?d.slice(1):d; return n.length===10&&!/^[01]/.test(n)?`+1${n}`:null; }
export function canReceiveSms(c: {is_active?:boolean;sms_opted_out_at?:string|null;sms_notifications_enabled?:boolean}|null) { return Boolean(c?.is_active&&!c.sms_opted_out_at&&c.sms_notifications_enabled!==false); }
export function isOffice(c:{is_admin?:boolean;role?:string}|null){return Boolean(c&&(c.is_admin||c.role==='admin'||c.role==='office_staff'));}
export function formatWorkOrderNumber(wo:string){return `WO#${wo.trim().replace(/^(?:WO#\s*)+/i,'')}`;}
export function buildMessage(event:SmsEvent,wo:string,actor:string,completedAt:string|null){
  const workOrderNumber=formatWorkOrderNumber(wo);
  if(event==='assigned') return 'Work Order has been created for you. Please Accept/Reject in the JobOps app';
  if(event==='accepted'||event==='rejected') return `${workOrderNumber} has been ${event==='accepted'?'Accepted':'Rejected'} by ${actor}`;
  if(event==='completed'){const d=new Date(completedAt??Date.now());return `${workOrderNumber} has been Completed by ${actor} on ${d.toLocaleDateString('en-US',{weekday:'long',timeZone:'America/New_York'})} ${d.toLocaleDateString('en-US',{timeZone:'America/New_York'})} at ${d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/New_York'})}`;}
  const changes:Record<string,string>={photo_uploaded:'a new photo was uploaded',video_uploaded:'a new video was uploaded',note_added:'a job note was added',invoice_price_set:'the invoice price was set or changed',invoice_uploaded:'an invoice image or file was uploaded',media_deleted:'a photo or video was deleted',invoice_deleted:'an invoice price, image, or file was deleted',note_deleted:'a job note was deleted'};
  return `Work Order ${workOrderNumber} has been modified by ${actor}: ${changes[event]}.`;
}
export function twilioErrorMessage(v:unknown){return typeof v==='object'&&v!==null&&'message'in v&&typeof v.message==='string'?v.message:'Twilio failed to send the message';}
