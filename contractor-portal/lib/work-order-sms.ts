import { supabase } from '@/lib/supabase';

export type WorkOrderSmsEvent = 'work_order_created' | 'work_order_modified' | 'offer_accepted' | 'offer_rejected' | 'work_order_completed';

export function notifyWorkOrderSms(workOrderId: string, event: WorkOrderSmsEvent, details?: string, recipientContractorId?: string) {
  void supabase.functions.invoke('send-work-order-sms', {
    body: { workOrderId, event, details, recipientContractorId },
  }).then(({ error }) => {
    if (error) console.warn('Work-order SMS was not sent:', error.message);
  }).catch((error) => console.warn('Work-order SMS was not sent:', error));
}
