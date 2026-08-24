import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { AppText as Text } from '@/components/app-typography';
import { ThemedAlert as Alert } from '@/components/themed-alert';
import { useAppTheme } from '@/contexts/theme-context';
import { formatWorkOrderNumber } from '@/lib/work-order-number';
import { supabase } from '@/lib/supabase';

type PendingOffer = {
  offer_id: string;
  work_order_id: string;
  work_order_number: string;
  description: string;
  sender_name: string;
  customer_name: string;
  customer_address: string;
};

export function ContractorOfferNotificationHost() {
  const { colors } = useAppTheme();
  const [offers, setOffers] = useState<PendingOffer[]>([]);
  const [responding, setResponding] = useState(false);
  const offer = offers[0] ?? null;

  useEffect(() => {
    let disposed = false;
    let listenerVersion = 0;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const stopChannel = () => {
      if (channel) void supabase.removeChannel(channel);
      channel = null;
    };

    const loadOffers = async () => {
      const { data, error } = await supabase.rpc('get_pending_work_order_offers');
      if (!disposed && !error) setOffers((data ?? []) as PendingOffer[]);
    };

    const listenForOffers = async (userId?: string) => {
      const version = ++listenerVersion;
      stopChannel();
      setOffers([]);
      if (!userId) return;
      const { data: contractor } = await supabase.from('contractors').select('id, is_admin').eq('auth_user_id', userId).eq('is_active', true).maybeSingle();
      if (disposed || version !== listenerVersion || !contractor || contractor.is_admin) return;

      channel = supabase
        .channel(`contractor-offer-alert-${contractor.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'work_order_offers', filter: `recipient_id=eq.${contractor.id}` }, () => { void loadOffers(); })
        .subscribe((status) => { if (status === 'SUBSCRIBED') void loadOffers(); });
    };

    void supabase.auth.getUser().then(({ data }) => listenForOffers(data.user?.id));
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => { void listenForOffers(session?.user.id); });
    return () => {
      disposed = true;
      listenerVersion += 1;
      authListener.subscription.unsubscribe();
      stopChannel();
    };
  }, []);

  const respond = async (response: 'accepted' | 'rejected') => {
    if (!offer || responding) return;
    setResponding(true);
    const { error } = await supabase.rpc('respond_to_work_order_offer', { p_offer_id: offer.offer_id, p_response: response });
    setResponding(false);
    if (error) { Alert.alert('Could not respond', error.message); return; }
    setOffers((current) => current.filter((item) => item.offer_id !== offer.offer_id));
  };

  return <Modal visible={Boolean(offer)} transparent animationType="fade" statusBarTranslucent onRequestClose={() => undefined}>
    <View style={styles.backdrop}>
      <View style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
        <View style={[styles.icon, { backgroundColor: colors.primary }]}><Ionicons name="mail-unread" size={29} color="#FFFFFF" /></View>
        <Text style={[styles.kicker, { color: colors.primary }]}>WORK ORDER OFFER</Text>
        <Text style={[styles.title, { color: colors.text }]}>Accept or reject this assignment</Text>
        <Text style={[styles.number, { color: colors.primary }]}>{formatWorkOrderNumber(offer?.work_order_number)}</Text>
        <Text style={[styles.customer, { color: colors.text }]}>{offer?.customer_name}</Text>
        <Text style={[styles.address, { color: colors.textMuted }]}>{offer?.customer_address}</Text>
        <Text style={[styles.description, { color: colors.textMuted }]}>{offer?.description}</Text>
        <Text style={[styles.sender, { color: colors.textMuted }]}>Sent by {offer?.sender_name}</Text>
        <View style={styles.actions}>
          <Pressable style={({ pressed }) => [styles.rejectButton, pressed && styles.buttonPressed, responding && styles.disabled]} disabled={responding} onPress={() => void respond('rejected')}><Text style={styles.actionText}>Reject</Text></Pressable>
          <Pressable style={({ pressed }) => [styles.acceptButton, pressed && styles.buttonPressed, responding && styles.disabled]} disabled={responding} onPress={() => void respond('accepted')}><Text style={styles.actionText}>{responding ? 'Saving...' : 'Accept'}</Text></Pressable>
        </View>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(2, 8, 18, 0.82)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 440, borderWidth: 1, borderRadius: 18, padding: 24, alignItems: 'center' },
  icon: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  kicker: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  title: { fontSize: 21, lineHeight: 28, fontWeight: '900', textAlign: 'center', marginTop: 7 },
  number: { fontSize: 13, fontWeight: '900', marginTop: 17 },
  customer: { fontSize: 16, fontWeight: '900', textAlign: 'center', marginTop: 8 },
  address: { fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 5 },
  description: { fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 13 },
  sender: { fontSize: 9, fontWeight: '800', marginTop: 12 },
  actions: { width: '100%', flexDirection: 'row', gap: 10, marginTop: 22 },
  rejectButton: { flex: 1, minHeight: 52, borderRadius: 8, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center' },
  acceptButton: { flex: 1, minHeight: 52, borderRadius: 8, backgroundColor: '#35A767', alignItems: 'center', justifyContent: 'center' },
  buttonPressed: { opacity: 0.78 },
  disabled: { opacity: 0.5 },
  actionText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
});
