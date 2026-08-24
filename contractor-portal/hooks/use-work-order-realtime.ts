import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

import { supabase } from '@/lib/supabase';

export function useWorkOrderRealtime(onChange: () => void) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useFocusEffect(useCallback(() => {
    const channel = supabase
      .channel(`work-order-updates-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, () => onChangeRef.current())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_order_assignments' }, () => onChangeRef.current())
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, []));
}
