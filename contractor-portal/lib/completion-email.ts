import { supabase } from '@/lib/supabase';

const RETRY_DELAYS_MS = [0, 800, 2400];

export async function ensureCompletionEmail(workOrderId: string, isUpdate = false) {
  let lastMessage = 'Completion email could not be delivered.';
  for (const delay of RETRY_DELAYS_MS) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    const { data, error } = await supabase.functions.invoke('send-completion-email', { body: { workOrderId, isUpdate } });
    if (!error && !data?.error) return { ok: true as const };
    lastMessage = data?.error || error?.message || lastMessage;
  }
  return { ok: false as const, message: lastMessage };
}
