import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { AppText as Text } from '@/components/app-typography';
import { ThemedAlert as Alert } from '@/components/themed-alert';
import { useAppTheme } from '@/contexts/theme-context';
import { supabase } from '@/lib/supabase';

type ResponseNotice = {
  id: string;
  workOrderId: string | null;
  title: string;
  message: string;
  accepted: boolean;
};

export function AdminResponseNotificationHost() {
  const { colors } = useAppTheme();
  const [notices, setNotices] = useState<ResponseNotice[]>([]);
  const notice = notices[0] ?? null;

  useEffect(() => {
    let disposed = false;
    let listenerVersion = 0;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const stopChannel = () => {
      if (channel) void supabase.removeChannel(channel);
      channel = null;
    };

    const listenForResponses = async (userId?: string) => {
      const version = ++listenerVersion;
      stopChannel();
      setNotices([]);
      if (!userId) return;
      const { data: admin } = await supabase.from('contractors').select('id, is_admin').eq('auth_user_id', userId).eq('is_active', true).maybeSingle();
      if (disposed || version !== listenerVersion || !admin?.is_admin) return;

      const loadUnreadResponses = async () => {
        const { data } = await supabase.from('notifications').select('id, work_order_id, title, message').eq('contractor_id', admin.id).is('read_at', null).in('title', ['Work order Accepted', 'Work Order Rejected']).order('created_at', { ascending: true });
        if (disposed || version !== listenerVersion) return;
        setNotices((data ?? []).map((row) => ({ id: row.id, workOrderId: row.work_order_id, title: row.title, message: row.message, accepted: row.title.toLowerCase() === 'work order accepted' })));
      };

      channel = supabase
        .channel(`admin-response-alert-${admin.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `contractor_id=eq.${admin.id}` }, (payload) => {
          const row = payload.new as { id?: string; work_order_id?: string | null; title?: string; message?: string };
          const normalizedTitle = row.title?.toLowerCase();
          if (!row.id || !row.title || !row.message || (normalizedTitle !== 'work order accepted' && normalizedTitle !== 'Work Order Rejected')) return;
          setNotices((current) => current.some((item) => item.id === row.id) ? current : [...current, { id: row.id!, workOrderId: row.work_order_id ?? null, title: row.title!, message: row.message!, accepted: normalizedTitle === 'work order accepted' }]);
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'work_order_offers' }, (payload) => {
          const offer = payload.new as { status?: string };
          if (offer.status === 'accepted' || offer.status === 'rejected') void loadUnreadResponses();
        })
        .subscribe((status) => { if (status === 'SUBSCRIBED') void loadUnreadResponses(); });
    };

    void supabase.auth.getUser().then(({ data }) => listenForResponses(data.user?.id));
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => { void listenForResponses(session?.user.id); });

    return () => {
      disposed = true;
      listenerVersion += 1;
      authListener.subscription.unsubscribe();
      stopChannel();
    };
  }, []);

  const acknowledgeNotice = async () => {
    if (!notice) return;
    const acknowledgedNotice = notice;
    setNotices((current) => current.slice(1));
    const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', notice.id);
    if (error) {
      setNotices((current) => current.some((item) => item.id === acknowledgedNotice.id) ? current : [acknowledgedNotice, ...current]);
      Alert.alert('Could not acknowledge notification', error.message);
    }
  };

  const accent = notice?.accepted ? '#35A767' : '#DC2626';
  return <Modal visible={Boolean(notice)} transparent animationType="fade" statusBarTranslucent onRequestClose={() => undefined}>
    <View style={styles.backdrop}>
      <View style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
        <View style={[styles.icon, { backgroundColor: accent }]}><Ionicons name={notice?.accepted ? 'checkmark' : 'close'} size={30} color="#FFFFFF" /></View>
        <Text style={[styles.kicker, { color: accent }]}>WORK ORDER RESPONSE</Text>
        <Text style={[styles.title, { color: colors.text }]}>{notice?.title}</Text>
        <Text style={[styles.message, { color: colors.textMuted }]}>{notice?.message}</Text>
        <Pressable style={({ pressed }) => [styles.openButton, pressed && styles.openButtonPressed]} onPress={() => void acknowledgeNotice()}><Text style={styles.openButtonText}>OK</Text></Pressable>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(2, 8, 18, 0.78)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 430, borderWidth: 1, borderRadius: 18, padding: 24, alignItems: 'center' },
  icon: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  kicker: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '900', textAlign: 'center', marginTop: 7 },
  message: { fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 12 },
  openButton: { width: '100%', minHeight: 52, borderRadius: 8, backgroundColor: '#2577BB', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 22 },
  openButtonPressed: { backgroundColor: '#1C1C5C' },
  openButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  dismissButton: { minHeight: 42, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', marginTop: 7 },
  dismissText: { fontSize: 11, fontWeight: '800' },
});
