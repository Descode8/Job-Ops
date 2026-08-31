import { ThemedAlert as Alert } from '@/components/themed-alert';
import { supabase } from '@/lib/supabase';
export type WorkOrderSmsEvent='assigned'|'photo_uploaded'|'video_uploaded'|'note_added'|'invoice_price_set'|'invoice_uploaded'|'media_deleted'|'invoice_deleted'|'note_deleted'|'accepted'|'rejected'|'completed';
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
  const random = Math.floor(Math.random() * 16);
  const value = character === 'x' ? random : (random & 0x3) | 0x8;
  return value.toString(16);
});
export async function sendWorkOrderSms(workOrderId:string,event:WorkOrderSmsEvent,requestId=uuid()){const {data,error}=await supabase.functions.invoke('send-work-order-sms',{body:{work_order_id:workOrderId,event,request_id:requestId}});return {result:error?{ok:false,error:{message:error.message}}:data,requestId};}
export function notifyWorkOrderSms(workOrderId:string,event:WorkOrderSmsEvent,requestId=uuid()){void sendWorkOrderSms(workOrderId,event,requestId).then(({result})=>{if(!result?.ok&&!result?.skipped){const message=result?.error?.message??'The text notification could not be sent.';Alert.alert('Work order saved; text not sent',message,[{text:'Not now',style:'cancel'},{text:'Retry text',onPress:()=>notifyWorkOrderSms(workOrderId,event,requestId)}]);}}).catch(()=>{});}
