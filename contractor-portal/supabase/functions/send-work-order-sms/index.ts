import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {ADMIN_EVENTS,buildMessage,canReceiveSms,isOffice,isSmsEvent,isUuid,normalizeUsPhone,twilioErrorMessage} from './core.ts';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return json({ok:false,error:{code:'method_not_allowed',message:'POST is required.'}},405);
 const url=Deno.env.get('SUPABASE_URL'),anon=Deno.env.get('SUPABASE_ANON_KEY'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),sid=Deno.env.get('TWILIO_ACCOUNT_SID'),token=Deno.env.get('TWILIO_AUTH_TOKEN'),messagingSid=Deno.env.get('TWILIO_MESSAGING_SERVICE_SID');
 if(!url||!anon||!service||!sid||!token||!messagingSid)return json({ok:false,error:{code:'server_config',message:'SMS configuration is incomplete.'}},503);
 try{
  const authorization=req.headers.get('Authorization')??''; if(!authorization.toLowerCase().startsWith('bearer '))return json({ok:false,error:{code:'unauthorized',message:'Authentication is required.'}},401);
  const caller=createClient(url,anon,{global:{headers:{Authorization:authorization}}}),admin=createClient(url,service);
  const {data:{user}}=await caller.auth.getUser(); if(!user)return json({ok:false,error:{code:'unauthorized',message:'A valid session is required.'}},401);
  const body=await req.json().catch(()=>({})); const workOrderId=body.work_order_id,event=body.event,requestId=body.request_id;
  if(!isUuid(workOrderId)||!isSmsEvent(event)||!isUuid(requestId)||Object.keys(body).some(k=>!['work_order_id','event','request_id'].includes(k)))return json({ok:false,error:{code:'invalid_input',message:'Invalid SMS event request.'}},400);
  const {data:actor}=await admin.from('contractors').select('id,full_name,role,is_admin,is_active').eq('auth_user_id',user.id).eq('is_active',true).maybeSingle();
  if(!actor)return json({ok:false,error:{code:'forbidden',message:'Active JobOps access is required.'}},403);
  if(event==='assigned'&&!isOffice(actor))return json({ok:false,error:{code:'forbidden',message:'Admin access is required for assignment messages.'}},403);
  const {data:order}=await admin.from('work_orders').select('id,work_order_number,completed_at').eq('id',workOrderId).maybeSingle(); if(!order)return json({ok:false,error:{code:'not_found',message:'Work order not found.'}},404);
  let recipients:any[]=[];
  if(event==='assigned'){
   const {data:a}=await admin.from('work_order_assignments').select('contractor_id').eq('work_order_id',workOrderId).is('unassigned_at',null).order('assigned_at',{ascending:false}).limit(1).maybeSingle();
   let id=a?.contractor_id; if(!id){const {data:o}=await admin.from('work_order_offers').select('recipient_id').eq('work_order_id',workOrderId).eq('status','pending').order('created_at',{ascending:false}).limit(1).maybeSingle();id=o?.recipient_id;}
   if(id){const {data:r}=await admin.from('contractors').select('id,phone_number,is_active,sms_notifications_enabled,sms_opted_out_at').eq('id',id).maybeSingle();if(r)recipients=[r];}
  }else if(ADMIN_EVENTS.includes(event)){
   const {data:r}=await admin.from('contractors').select('id,phone_number,is_active,sms_notifications_enabled,sms_opted_out_at').eq('is_active',true).or('is_admin.eq.true,role.in.(admin,office_staff)'); recipients=r??[];
  }
  recipients=recipients.filter(canReceiveSms); if(!recipients.length)return json({ok:false,skipped:true,message:'No eligible SMS recipients were found.'});
  const message=buildMessage(event,order.work_order_number,actor.full_name,order.completed_at); const results=[];
  for(const recipient of recipients){
   const phone=normalizeUsPhone(recipient.phone_number);if(!phone){results.push({recipient_id:recipient.id,ok:false,error:'invalid_phone'});continue;}
   const key=`${workOrderId}:${event}:${requestId}:${recipient.id}`; const {data:existing}=await admin.from('sms_notification_log').select('id,delivery_status,twilio_message_sid').eq('idempotency_key',key).maybeSingle();
   if(existing&&existing.delivery_status!=='failed'){results.push({recipient_id:recipient.id,ok:true,duplicate:true,status:existing.delivery_status});continue;}
   let logId=existing?.id; if(existing)await admin.from('sms_notification_log').update({delivery_status:'queued',last_error:null}).eq('id',logId);else{const {data:created,error:e}=await admin.from('sms_notification_log').insert({work_order_id:workOrderId,recipient_contractor_id:recipient.id,requested_by:actor.id,event_type:event,idempotency_key:key}).select('id').single();if(e){results.push({recipient_id:recipient.id,ok:false,error:e.message});continue;}logId=created.id;}
   const form=new URLSearchParams({To:phone,MessagingServiceSid:messagingSid,Body:message});const response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,{method:'POST',headers:{Authorization:`Basic ${btoa(`${sid}:${token}`)}`,'Content-Type':'application/x-www-form-urlencoded'},body:form.toString()});const twilio:any=await response.json().catch(()=>({}));
   if(!response.ok){const error=twilioErrorMessage(twilio).slice(0,500);await admin.from('sms_notification_log').update({delivery_status:'failed',last_error:error}).eq('id',logId);results.push({recipient_id:recipient.id,ok:false,error});continue;}
   await admin.from('sms_notification_log').update({twilio_message_sid:twilio.sid??null,delivery_status:twilio.status??'accepted',sent_at:new Date().toISOString(),last_error:null}).eq('id',logId);results.push({recipient_id:recipient.id,ok:true,message_sid:twilio.sid,status:twilio.status??'accepted'});
  }
  return json({ok:results.some(r=>r.ok),event,results},results.some(r=>r.ok)?200:502);
 }catch(error){console.error(error);return json({ok:false,error:{code:'internal_error',message:error instanceof Error?error.message:'SMS request failed.'}},500);}
});
function json(body:object,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});}
