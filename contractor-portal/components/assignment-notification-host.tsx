import { Ionicons } from '@expo/vector-icons';
import { useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { AppText as Text } from '@/components/app-typography';
import { useAppTheme } from '@/contexts/theme-context';
import { formatWorkOrderNumber } from '@/lib/work-order-number';
import { supabase } from '@/lib/supabase';

type AssignmentNotice = {
  workOrderId: string;
  workOrderNumber: string;
  customerName: string;
};

export function AssignmentNotificationHost() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const segments = useSegments();
  const [notice, setNotice] = useState<AssignmentNotice | null>(null);
  const canShowNotification = segments[0] === '(tabs)' || segments[0] === 'work-order';

  useEffect(() => {
    let disposed = false;
    let listenerVersion = 0;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const stopChannel = () => {
      if (channel) void supabase.removeChannel(channel);
      channel = null;
    };

    const listenForAssignments = async (userId?: string) => {
      const version = ++listenerVersion;
      stopChannel();
      if (!userId) { setNotice(null); return; }
      const { data: contractor } = await supabase.from('contractors').select('id, is_admin').eq('auth_user_id', userId).eq('is_active', true).maybeSingle();
      if (disposed || version !== listenerVersion || !contractor || contractor.is_admin) return;

      channel = supabase
        .channel(`assignment-alert-${contractor.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'work_order_assignments', filter: `contractor_id=eq.${contractor.id}` }, async (payload) => {
          const assignment = payload.new as { work_order_id?: string; contractor_id?: string; unassigned_at?: string | null };
          if (!assignment.work_order_id || assignment.contractor_id !== contractor.id || assignment.unassigned_at) return;
          const { data: acceptedOffer } = await supabase.from('work_order_offers').select('id').eq('work_order_id', assignment.work_order_id).eq('recipient_id', contractor.id).eq('status', 'accepted').maybeSingle();
          if (acceptedOffer) return;
          const { data: order } = await supabase.from('work_orders').select('id, work_order_number, title, properties(customer_name)').eq('id', assignment.work_order_id).maybeSingle();
          if (!order || disposed) return;
          const property = order.properties as unknown as { customer_name: string | null } | null;
          setNotice({ workOrderId: order.id, workOrderNumber: order.work_order_number, customerName: property?.customer_name || order.title });
        })
        .subscribe();
    };

    void supabase.auth.getUser().then(({ data }) => listenForAssignments(data.user?.id));
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => { void listenForAssignments(session?.user.id); });

    return () => {
      disposed = true;
      listenerVersion += 1;
      authListener.subscription.unsubscribe();
      stopChannel();
    };
  }, []);

  const openWorkOrder = () => {
    if (!notice) return;
    const workOrderId = notice.workOrderId;
    setNotice(null);
    router.push({ pathname: '/work-order/[id]', params: { id: workOrderId } });
  };

  return <Modal visible={Boolean(notice) && canShowNotification} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setNotice(null)}>
    <View style={styles.backdrop}>
      <View style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
        <View style={[styles.icon, { backgroundColor: colors.primary }]}><Ionicons name="briefcase" size={28} color="#FFFFFF" /></View>
        <Text style={[styles.kicker, { color: colors.primary }]}>NEW ASSIGNMENT</Text>
        <Text style={[styles.title, { color: colors.text }]}>A work order was assigned to you</Text>
        <Text style={[styles.number, { color: colors.primary }]}>{formatWorkOrderNumber(notice?.workOrderNumber)}</Text>
        <Text style={[styles.customer, { color: colors.textMuted }]}>{notice?.customerName}</Text>
        <Pressable style={({ pressed }) => [styles.openButton, pressed && styles.openButtonPressed]} onPress={openWorkOrder}><Text style={styles.openButtonText}>Open Work Order</Text><Ionicons name="arrow-forward" size={19} color="#FFFFFF" /></Pressable>
        <Pressable style={styles.dismissButton} onPress={() => setNotice(null)}><Text style={[styles.dismissText, { color: colors.textMuted }]}>Dismiss</Text></Pressable>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(2, 8, 18, 0.78)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 430, borderWidth: 0.5, borderRadius: 18, padding: 24, alignItems: 'center' },
  icon: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  kicker: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  title: { fontSize: 21, lineHeight: 28, fontWeight: '900', textAlign: 'center', marginTop: 7 },
  number: { fontSize: 13, fontWeight: '900', marginTop: 18 },
  customer: { fontSize: 13, textAlign: 'center', marginTop: 7 },
  openButton: { width: '100%', minHeight: 52, borderRadius: 6, backgroundColor: '#243B5C', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 22 },
  openButtonPressed: { backgroundColor: '#0E1F35' },
  openButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  dismissButton: { minHeight: 42, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', marginTop: 7 },
  dismissText: { fontSize: 11, fontWeight: '800' },
});
