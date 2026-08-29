import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText as Text } from '@/components/app-typography';
import { ThemedAlert as Alert } from '@/components/themed-alert';
import { useAppTheme } from '@/contexts/theme-context';
import { formatWorkOrderNumber } from '@/lib/work-order-number';
import { supabase } from '@/lib/supabase';
import { MediaCarouselModal } from '@/components/media-carousel-modal';

type PendingOffer = {
  offer_id: string;
  work_order_id: string;
  work_order_number: string;
  description: string;
  sender_name: string;
  customer_name: string;
  customer_address: string;
};
type OfferMedia = { id: string; storage_path: string; original_file_name: string; mime_type: string; url?: string };

export function ContractorOfferNotificationHost() {
  const { colors } = useAppTheme();
  const segments = useSegments();
  const [offers, setOffers] = useState<PendingOffer[]>([]);
  const [responding, setResponding] = useState(false);
  const [isViewing, setIsViewing] = useState(false);
  const [media, setMedia] = useState<OfferMedia[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [activeMediaId, setActiveMediaId] = useState<string | null>(null);
  const offer = offers[0] ?? null;
  const isInsideAuthenticatedApp = segments[0] === '(tabs)' || segments[0] === 'work-order';

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
      setIsViewing(false);
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
    try {
      const { error } = await withTimeout(supabase.rpc('respond_to_work_order_offer', { p_offer_id: offer.offer_id, p_response: response }));
      if (error) throw error;
      setOffers((current) => current.filter((item) => item.offer_id !== offer.offer_id));
      setIsViewing(false);
      setMedia([]);
    } catch (error) {
      Alert.alert('Could not respond', error instanceof Error ? error.message : 'The response could not be saved. Please try again.');
    } finally {
      setResponding(false);
    }
  };

  const viewOffer = async () => {
    if (!offer) return;
    setIsViewing(true);
    setMedia([]);
    setLoadingMedia(true);
    try {
      const { data, error } = await withTimeout(supabase.rpc('get_pending_offer_media', { p_offer_id: offer.offer_id }));
      if (error) throw error;
      const signedMedia = await Promise.all(((data ?? []) as Omit<OfferMedia, 'url'>[]).map(async (file) => {
        const { data: signed, error: signError } = await supabase.storage.from('work-order-files').createSignedUrl(file.storage_path, 3600);
        return { ...file, url: signError ? undefined : signed?.signedUrl };
      }));
      setMedia(signedMedia);
    } catch (error) {
      Alert.alert('Could not load attachments', error instanceof Error ? error.message : 'The work-order attachments could not be loaded.');
    } finally {
      setLoadingMedia(false);
    }
  };

  return <><Modal visible={Boolean(offer) && isInsideAuthenticatedApp} transparent animationType="fade" statusBarTranslucent onRequestClose={() => { if (isViewing) setIsViewing(false); }}>
    <View style={styles.backdrop}>
      <View style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
        {isViewing ? <>
          <View style={styles.previewHeader}>
            <View style={styles.previewHeading}><Text style={[styles.kicker, { color: colors.primary }]}>WORK ORDER REQUEST FROM</Text><Text style={[styles.requestSender, { color: colors.text }]}>{offer?.sender_name || 'JobOps User'}</Text><Text style={[styles.number, { color: colors.primary }]}>{formatWorkOrderNumber(offer?.work_order_number)}</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close work order details" style={styles.closeButton} onPress={() => setIsViewing(false)}><Ionicons name="close" size={25} color={colors.text} /></Pressable>
          </View>
          <ScrollView style={styles.previewScroll} contentContainerStyle={styles.previewContent} showsVerticalScrollIndicator={false}>
            <Text style={[styles.detailLabel, { color: colors.textMuted }]}>CUSTOMER</Text>
            <Text style={[styles.detailValue, { color: colors.text }]}>{offer?.customer_name || 'Not provided'}</Text>
            <Text style={[styles.detailLabel, { color: colors.textMuted }]}>SERVICE ADDRESS</Text>
            <Text style={[styles.detailValue, { color: colors.text }]}>{offer?.customer_address || 'Not provided'}</Text>
            <Text style={[styles.detailLabel, { color: colors.textMuted }]}>WORK REQUESTED</Text>
            <Text style={[styles.detailDescription, { color: colors.text }]}>{offer?.description || 'No description provided.'}</Text>
            <Text style={[styles.detailLabel, { color: colors.textMuted }]}>CREATOR ATTACHMENTS</Text>
            {loadingMedia && <Text style={[styles.mediaEmpty, { color: colors.textMuted }]}>Loading pictures and videos...</Text>}
            {!loadingMedia && media.map((file) => file.mime_type.toLowerCase().startsWith('image/') && file.url
              ? <Pressable key={file.id} onPress={() => setActiveMediaId(file.id)}><Image source={{ uri: file.url }} style={styles.mediaImage} contentFit="cover" /><Text style={[styles.mediaName, { color: colors.textMuted }]}>{file.original_file_name}</Text></Pressable>
              : <Pressable key={file.id} disabled={!file.url} style={styles.mediaLink} onPress={() => setActiveMediaId(file.id)}><Ionicons name="play-circle" size={22} color="#FFFFFF" /><Text style={styles.mediaLinkText}>{file.original_file_name || 'Play video'}</Text><Ionicons name="chevron-forward" size={18} color="#FFFFFF" /></Pressable>)}
            {!loadingMedia && media.length === 0 && <Text style={[styles.mediaEmpty, { color: colors.textMuted }]}>No pictures or videos were attached by the creator.</Text>}
            <Text style={[styles.sender, { color: colors.textMuted }]}>Sent by {offer?.sender_name}</Text>
          </ScrollView>
          <Pressable style={({ pressed }) => [styles.cancelButton, pressed && styles.buttonPressed]} onPress={() => setIsViewing(false)}><Text style={styles.actionText}>Back to Offer</Text></Pressable>
        </> : <>
          <View style={[styles.icon, { backgroundColor: colors.primary }]}><Ionicons name="mail-unread" size={29} color="#FFFFFF" /></View>
          <Text style={[styles.kicker, { color: colors.primary }]}>WORK ORDER OFFER</Text>
          <Text style={[styles.title, { color: colors.text }]}>Review this assignment</Text>
          <Text style={[styles.number, { color: colors.primary }]}>{formatWorkOrderNumber(offer?.work_order_number)}</Text>
          <Text style={[styles.customer, { color: colors.text }]}>{offer?.customer_name}</Text>
          <Text style={[styles.address, { color: colors.textMuted }]}>{offer?.customer_address}</Text>
          <Text style={[styles.sender, { color: colors.textMuted }]}>Sent by {offer?.sender_name}</Text>
          <View style={styles.actions}>
            <Pressable style={({ pressed }) => [styles.viewButton, pressed && styles.buttonPressed]} disabled={responding} onPress={() => void viewOffer()}><Text style={styles.actionText}>View</Text></Pressable>
            <Pressable style={({ pressed }) => [styles.acceptButton, pressed && styles.buttonPressed, responding && styles.disabled]} disabled={responding} onPress={() => void respond('accepted')}><Text style={styles.actionText}>{responding ? 'Saving...' : 'Accept'}</Text></Pressable>
            <Pressable style={({ pressed }) => [styles.rejectButton, pressed && styles.buttonPressed, responding && styles.disabled]} disabled={responding} onPress={() => void respond('rejected')}><Text style={styles.actionText}>Reject</Text></Pressable>
          </View>
        </>}
      </View>
    </View>
  </Modal><MediaCarouselModal items={media} activeId={activeMediaId} onClose={() => setActiveMediaId(null)} /></>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(2, 8, 18, 0.82)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 440, maxHeight: '82%', borderWidth: 0.5, borderRadius: 18, padding: 24, alignItems: 'center' },
  icon: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  kicker: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  title: { fontSize: 21, lineHeight: 28, fontWeight: '900', textAlign: 'center', marginTop: 7 },
  number: { fontSize: 13, fontWeight: '900', marginTop: 17 },
  customer: { fontSize: 16, fontWeight: '900', textAlign: 'center', marginTop: 8 },
  address: { fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 5 },
  sender: { fontSize: 9, fontWeight: '800', marginTop: 12 },
  actions: { width: '100%', flexDirection: 'row', gap: 10, marginTop: 22 },
  viewButton: { flex: 1, minHeight: 52, borderRadius: 6, backgroundColor: '#243B5C', paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  rejectButton: { flex: 1, minHeight: 52, borderRadius: 6, backgroundColor: '#243B5C', paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  acceptButton: { flex: 1, minHeight: 52, borderRadius: 6, backgroundColor: '#243B5C', paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  buttonPressed: { backgroundColor: '#0E1F35' },
  disabled: { opacity: 0.5 },
  actionText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  previewHeader: { width: '100%', flexDirection: 'row', alignItems: 'center' },
  previewHeading: { flex: 1 },
  requestSender: { fontSize: 17, fontWeight: '900', marginTop: 4 },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  previewScroll: { width: '100%', marginTop: 12 },
  previewContent: { paddingBottom: 8 },
  detailLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1, marginTop: 17 },
  detailValue: { fontSize: 14, lineHeight: 21, fontWeight: '800', marginTop: 5 },
  detailDescription: { fontSize: 14, lineHeight: 22, marginTop: 5 },
  cancelButton: { width: '100%', minHeight: 52, borderRadius: 6, backgroundColor: '#243B5C', alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  mediaImage: { width: '100%', height: 190, borderRadius: 8, marginTop: 10, backgroundColor: '#09192D' },
  mediaName: { fontSize: 10, marginTop: 5 },
  mediaLink: { minHeight: 50, marginTop: 10, paddingHorizontal: 14, borderRadius: 6, backgroundColor: '#243B5C', flexDirection: 'row', alignItems: 'center', gap: 9 },
  mediaLinkText: { flex: 1, color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  mediaEmpty: { fontSize: 11, lineHeight: 17, marginTop: 8 },
});

function withTimeout<T>(operation: PromiseLike<T>, timeoutMs = 15_000): Promise<T> {
  return Promise.race([
    Promise.resolve(operation),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('The request timed out. Check your connection and try again.')), timeoutMs)),
  ]);
}
