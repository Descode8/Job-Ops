import { Ionicons } from '@expo/vector-icons';
import { Image, ImageBackground } from 'expo-image';
import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Alert, Linking, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';

const YELLOW = '#FFF200';
const NAVY = '#003366';
const BLUE = '#1E67B2';
const PAPER = '#FFFFFF';
const INK = '#172033';
const MUTED = '#566273';

export default function HomeScreen() {
  const router = useRouter();
  const [contractorName, setContractorName] = useState('');
  const [contractorId, setContractorId] = useState('');
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [pendingOffers, setPendingOffers] = useState<WorkOrderOffer[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationLog, setNotificationLog] = useState<AppNotification[]>([]);
  const [isNotificationLogOpen, setIsNotificationLogOpen] = useState(false);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const [respondingOfferId, setRespondingOfferId] = useState<string | null>(null);
  const [currentWorkOrderIndex, setCurrentWorkOrderIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        setIsLoading(false);
        return;
      }

      const { data: contractor } = await supabase
        .from('contractors')
        .select('id, full_name')
        .eq('auth_user_id', authData.user.id)
        .eq('is_active', true)
        .single();

      if (!contractor) {
        setIsLoading(false);
        return;
      }

      setContractorName(contractor.full_name);
      setContractorId(contractor.id);
      const [{ data: assignments }, { data: offers, error: offersError }, { data: notices }] = await Promise.all([
        supabase
          .from('work_order_assignments')
          .select('work_order:work_orders(id, work_order_number, title, description, status, priority, deadline_at, properties(customer_name, address_line_1, city, state))')
          .eq('contractor_id', contractor.id)
          .is('unassigned_at', null),
        supabase.rpc('get_pending_work_order_offers'),
        supabase.from('notifications').select('id, title, message, created_at, read_at').eq('contractor_id', contractor.id).is('read_at', null).order('created_at', { ascending: false }).limit(10),
      ]);

      const orders = (assignments ?? [])
        .map((assignment) => assignment.work_order)
        .filter(Boolean) as unknown as WorkOrder[];
      setWorkOrders(orders);
      if (!offersError) setPendingOffers((offers ?? []) as WorkOrderOffer[]);
      const unreadNotices = (notices ?? []) as AppNotification[];
      setNotifications(unreadNotices);
      if (unreadNotices.length) {
        await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', unreadNotices.map((notice) => notice.id));
      }
      setIsLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadDashboard();
    }, [loadDashboard]),
  );

  const activeWorkOrders = workOrders.filter((workOrder) => workOrder.status !== 'completed');
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const endOfToday = startOfToday + 24 * 60 * 60 * 1000;
  const dueToday = activeWorkOrders.filter((workOrder) => {
    if (!workOrder.deadline_at) return false;
    const deadline = new Date(workOrder.deadline_at).getTime();
    return deadline >= startOfToday && deadline < endOfToday;
  }).length;
  const needsUpdate = activeWorkOrders.filter((workOrder) => workOrder.status === 'not_started').length;
  const currentWorkOrder = activeWorkOrders[currentWorkOrderIndex % Math.max(activeWorkOrders.length, 1)];
  const firstName = contractorName.split(' ')[0] || 'Contractor';
  const avatarInitials = contractorName.split(' ').filter(Boolean).map((name) => name[0]).join('').slice(0, 2).toUpperCase() || 'CT';
  const greeting = new Date().getHours() < 12 ? 'Good Morning' : new Date().getHours() < 18 ? 'Good Afternoon' : 'Good Evening';

  const openDirections = async () => {
    if (!currentWorkOrder?.properties) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(formatAddress(currentWorkOrder.properties))}`;
    const supported = await Linking.canOpenURL(url);
    if (supported) await Linking.openURL(url);
    else Alert.alert('Could not open maps', 'No maps application is available on this device.');
  };

  const signOut = async () => {
    setIsHeaderMenuOpen(false);
    await supabase.auth.signOut();
    router.replace('/login');
  };

  const respondToOffer = async (offerId: string, response: 'accepted' | 'rejected') => {
    setRespondingOfferId(offerId);
    const { error } = await supabase.rpc('respond_to_work_order_offer', {
      p_offer_id: offerId,
      p_response: response,
    });
    setRespondingOfferId(null);

    if (error) {
      Alert.alert('Could not respond', error.message);
      return;
    }

    Alert.alert(
      response === 'accepted' ? 'Work order accepted' : 'Work order rejected',
      response === 'accepted'
        ? 'The work order is now assigned to you.'
        : 'The work order has been assigned back to the contractor who sent it.',
    );
    await loadDashboard();
  };

  const openNotificationLog = async () => {
    if (!contractorId) return;
    const { data, error } = await supabase.from('notifications').select('id, title, message, created_at, read_at').eq('contractor_id', contractorId).order('created_at', { ascending: false });
    if (error) { Alert.alert('Could not load notification history', error.message); return; }
    setNotificationLog((data ?? []) as AppNotification[]);
    setIsNotificationLogOpen(true);
  };

  const deleteNotification = async (notificationId: string) => {
    const { error } = await supabase.from('notifications').delete().eq('id', notificationId);
    if (error) { Alert.alert('Could not clear notification', error.message); return; }
    setNotificationLog((current) => current.filter((item) => item.id !== notificationId));
    setNotifications((current) => current.filter((item) => item.id !== notificationId));
  };

  const clearAllNotifications = () => {
    if (!contractorId || notificationLog.length === 0) return;
    Alert.alert('Clear notification history?', 'All of your notifications will be permanently removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear all', style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('notifications').delete().eq('contractor_id', contractorId);
        if (error) { Alert.alert('Could not clear notifications', error.message); return; }
        setNotificationLog([]);
        setNotifications([]);
      } },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ImageBackground source={require('@/assets/images/dark-blue-particle-texture-background.jpg')} style={styles.topBar} contentFit="cover">
          <Image source={require('@/assets/images/Marty-Wright-Home-Sales_anderson.png')} style={styles.logo} contentFit="contain" />
          <TouchableOpacity
            style={styles.notificationButton}
            accessibilityLabel="Open menu"
            accessibilityRole="button"
            accessibilityState={{ expanded: isHeaderMenuOpen }}
            onPress={(event) => {
              event.stopPropagation();
              setIsHeaderMenuOpen((isOpen) => !isOpen);
            }}>
            <Ionicons name="menu" size={28} color={YELLOW} />
          </TouchableOpacity>
          {isHeaderMenuOpen && (
            <View style={styles.headerMenu}>
              <TouchableOpacity style={styles.headerMenuItem} onPress={() => void signOut()} accessibilityRole="menuitem">
                <Ionicons name="log-out-outline" size={19} color={NAVY} />
                <Text style={styles.headerMenuText}>Logout</Text>
              </TouchableOpacity>
            </View>
          )}
        </ImageBackground>

        <View style={styles.greetingRow}>
          <View>
            <Text style={styles.eyebrow}>{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}</Text>
            <Text style={styles.greeting}>{greeting}, {firstName}</Text>
          </View>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{avatarInitials}</Text>
          </View>
        </View>

        {pendingOffers.length > 0 && (
          <View style={styles.offersSection}>
            <View style={styles.offerHeadingRow}>
              <Ionicons name="notifications" size={20} color={NAVY} />
              <Text style={styles.offerHeading}>WORK ORDERS WAITING FOR YOUR RESPONSE</Text>
            </View>
            {pendingOffers.map((offer) => (
              <View key={offer.offer_id} style={styles.offerCard}>
                <Text style={styles.offerNumber}>#{offer.work_order_number} · FROM {offer.sender_name.toUpperCase()}</Text>
                <Text style={styles.offerTitle}>{offer.title}</Text>
                <Text style={styles.offerMeta}>{offer.customer_name} · {offer.customer_phone}</Text>
                <Text style={styles.offerMeta}>{offer.customer_address}</Text>
                <Text style={styles.offerDescription}>{offer.description}</Text>
                <View style={styles.offerActions}>
                  <TouchableOpacity
                    style={[styles.offerButton, styles.rejectButton]}
                    disabled={respondingOfferId === offer.offer_id}
                    onPress={() => void respondToOffer(offer.offer_id, 'rejected')}>
                    <Text style={styles.rejectButtonText}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.offerButton, styles.acceptButton]}
                    disabled={respondingOfferId === offer.offer_id}
                    onPress={() => void respondToOffer(offer.offer_id, 'accepted')}>
                    <Text style={styles.acceptButtonText}>{respondingOfferId === offer.offer_id ? 'Saving...' : 'Accept'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <Text style={styles.summaryLabel}>YOUR DAY AT A GLANCE</Text>
            <Ionicons name="sunny-outline" size={21} color={PAPER} />
          </View>
          <View style={styles.summaryStats}>
            <View>
              <Text style={styles.summaryNumber}>{isLoading ? '--' : activeWorkOrders.length}</Text>
              <Text style={styles.summaryText}>Assigned Jobs</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View>
              <Text style={styles.summaryNumber}>{isLoading ? '--' : dueToday}</Text>
              <Text style={styles.summaryText}>Due Today</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View>
              <Text style={styles.summaryNumber}>{isLoading ? '--' : needsUpdate}</Text>
              <Text style={styles.summaryText}>Needs Update</Text>
            </View>
          </View>
        </View>

        {currentWorkOrder && <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Continue Working</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/explore')}>
            <Text style={styles.linkText}>View all</Text>
          </TouchableOpacity>
        </View>}

        {currentWorkOrder && <TouchableOpacity style={styles.jobCard} activeOpacity={0.88} onPress={() => router.push({ pathname: '/work-order/[id]', params: { id: currentWorkOrder.id } })}>
          <View style={styles.jobTopLine}>
            <View style={styles.statusPill}>
              <View style={[styles.statusDot, { backgroundColor: statusColor(currentWorkOrder.status) }]} />
              <Text style={styles.statusText}>{formatStatus(currentWorkOrder.status)}</Text>
            </View>
              <Text style={styles.jobId}>JOB #{currentWorkOrder.work_order_number}</Text>
          </View>
          <Text style={styles.jobTitle}>{currentWorkOrder.properties?.customer_name || currentWorkOrder.title}</Text>
          <View style={styles.addressRow}>
            <Ionicons name="location-outline" size={18} color={BLUE} />
            <Text style={styles.address}>{formatAddress(currentWorkOrder.properties)}</Text>
          </View>
          <View style={styles.jobFooter}>
            <Text style={styles.jobMeta}>{formatDeadline(currentWorkOrder.deadline_at)}</Text>
            <TouchableOpacity style={styles.arrowButton} onPress={(event) => { event.stopPropagation(); setCurrentWorkOrderIndex((index) => (index + 1) % activeWorkOrders.length); }} accessibilityLabel="Show next work order">
              <Ionicons name="arrow-forward" size={18} color={PAPER} />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>}

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Quick actions</Text>
        </View>
        <View style={styles.actionGrid}>
          <ActionButton icon="camera-outline" label="Upload Photos" onPress={() => currentWorkOrder && router.push({ pathname: '/work-order/[id]', params: { id: currentWorkOrder.id, action: 'photos' } })} disabled={!currentWorkOrder} />
          <ActionButton icon="document-text-outline" label="Add Job Note" onPress={() => currentWorkOrder && router.push({ pathname: '/work-order/[id]', params: { id: currentWorkOrder.id, action: 'note' } })} disabled={!currentWorkOrder} />
          <ActionButton icon="navigate-outline" label="Start Navigation" onPress={() => void openDirections()} disabled={!currentWorkOrder} />
          <ActionButton icon="receipt-outline" label="Upload Invoice" onPress={() => currentWorkOrder && router.push({ pathname: '/work-order/[id]', params: { id: currentWorkOrder.id, action: 'invoice' } })} disabled={!currentWorkOrder} />
        </View>

        <View style={styles.notificationHeading}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          <TouchableOpacity onPress={() => void openNotificationLog()}><Text style={styles.linkText}>View All</Text></TouchableOpacity>
        </View>
        {notifications.length > 0
          ? notifications.map((item) => <View key={item.id} style={[styles.noticeCard, styles.noticeUnread]}><Ionicons name="notifications" size={19} color={BLUE} /><View style={styles.noticeCopy}><Text style={styles.noticeTitle}>{item.title}</Text><Text style={styles.noticeMessage}>{item.message}</Text><Text style={styles.noticeDate}>{new Date(item.created_at).toLocaleString()}</Text></View></View>)
          : <View style={styles.noNotifications}><Ionicons name="notifications-off-outline" size={21} color={MUTED} /><Text style={styles.noNotificationsText}>No new notifications.</Text></View>}
      </ScrollView>
      <Modal visible={isNotificationLogOpen} transparent animationType="fade" onRequestClose={() => setIsNotificationLogOpen(false)} statusBarTranslucent>
        <View style={styles.modalBackdrop}>
          <View style={styles.notificationModal}>
            <View style={styles.modalHeader}><View><Text style={styles.modalTitle}>Notification Log</Text><Text style={styles.modalSubtitle}>NEWEST TO OLDEST</Text></View><TouchableOpacity style={styles.modalClose} onPress={() => setIsNotificationLogOpen(false)} accessibilityLabel="Close notification log"><Ionicons name="close" size={24} color={PAPER} /></TouchableOpacity></View>
            <View style={styles.logToolbar}><Text style={styles.logCount}>{notificationLog.length} NOTIFICATION{notificationLog.length === 1 ? '' : 'S'}</Text><TouchableOpacity onPress={clearAllNotifications} disabled={!notificationLog.length}><Text style={[styles.clearAllText, !notificationLog.length && styles.clearDisabled]}>Clear All</Text></TouchableOpacity></View>
            <ScrollView contentContainerStyle={styles.logContent}>
              {notificationLog.map((item) => <View key={item.id} style={styles.logItem}><View style={styles.logIcon}><Ionicons name="notifications-outline" size={19} color={BLUE} /></View><View style={styles.logCopy}><Text style={styles.logTitle}>{item.title}</Text><Text style={styles.logMessage}>{item.message}</Text><Text style={styles.logDate}>{new Date(item.created_at).toLocaleString()}</Text></View><TouchableOpacity style={styles.clearOneButton} onPress={() => void deleteNotification(item.id)} accessibilityLabel={`Clear ${item.title}`}><Ionicons name="trash-outline" size={18} color="#B3261E" /></TouchableOpacity></View>)}
              {notificationLog.length === 0 && <View style={styles.emptyLog}><Ionicons name="file-tray-outline" size={30} color={MUTED} /><Text style={styles.emptyLogText}>Notification history is empty.</Text></View>}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ActionButton({ icon, label, onPress, disabled }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity style={[styles.actionButton, disabled && { opacity: 0.45 }]} activeOpacity={0.8} onPress={onPress} disabled={disabled}>
      <Ionicons name={icon} size={24} color={BLUE} />
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

type WorkOrder = {
  id: string;
  work_order_number: string;
  title: string;
  description: string;
  status: string;
  deadline_at: string | null;
  properties: { customer_name: string | null; address_line_1: string; city: string; state: string } | null;
};
type AppNotification = { id: string; title: string; message: string; created_at: string; read_at: string | null };

type WorkOrderOffer = {
  offer_id: string;
  work_order_id: string;
  work_order_number: string;
  title: string;
  description: string;
  sender_name: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  created_at: string;
};

function formatAddress(property: WorkOrder['properties']) {
  if (!property) return 'Address unavailable';
  return `${property.address_line_1}, ${property.city}, ${property.state}`;
}

function formatDeadline(deadline: string | null) {
  if (!deadline) return 'No Deadline Set';
  return `Due ${new Date(deadline).toLocaleDateString()}`;
}

function formatStatus(status: string) { return status.replaceAll('_', ' ').toUpperCase(); }
function statusColor(status: string) {
  if (status === 'completed') return '#2E8B57';
  if (status === 'in_progress') return BLUE;
  return '#8B97A5';
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: 20, paddingBottom: 32, backgroundColor: PAPER },
  topBar: { height: 105, marginHorizontal: -20, paddingHorizontal: 20, paddingTop: 17, paddingBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 },
  logo: { width: 164, height: 76 },
  notificationButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  headerMenu: { position: 'absolute', right: 20, top: 78, minWidth: 150, backgroundColor: PAPER, borderWidth: 1, borderColor: '#D7E1EC', borderRadius: 6, zIndex: 10, elevation: 5, shadowColor: '#000000', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  headerMenuItem: { minHeight: 48, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerMenuText: { color: NAVY, fontSize: 13, fontWeight: '800' },
  notificationDot: { position: 'absolute', right: 9, top: 8, width: 6, height: 6, backgroundColor: YELLOW, borderRadius: 6 },
  offersSection: { marginBottom: 20 },
  offerHeadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  offerHeading: { color: NAVY, fontSize: 10, fontWeight: '900', letterSpacing: 0.7, flex: 1 },
  offerCard: { borderWidth: 2, borderColor: YELLOW, backgroundColor: '#FFFDE5', padding: 16, marginBottom: 10, borderRadius: 6 },
  offerNumber: { color: BLUE, fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  offerTitle: { color: INK, fontSize: 18, fontWeight: '800', marginTop: 8 },
  offerMeta: { color: MUTED, fontSize: 11, lineHeight: 17, marginTop: 3 },
  offerDescription: { color: INK, fontSize: 12, lineHeight: 18, marginTop: 10 },
  offerActions: { flexDirection: 'row', gap: 10, marginTop: 15 },
  offerButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  rejectButton: { borderWidth: 1, borderColor: NAVY, backgroundColor: PAPER },
  acceptButton: { backgroundColor: NAVY },
  rejectButtonText: { color: NAVY, fontSize: 12, fontWeight: '900' },
  acceptButtonText: { color: PAPER, fontSize: 12, fontWeight: '900' },
  greetingRow: { paddingTop: 27, paddingBottom: 21, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { color: MUTED, fontSize: 10, fontWeight: '700', letterSpacing: 1.3, marginBottom: 7 },
  greeting: { color: INK, fontSize: 25, fontWeight: '800' },
  noticesSection: { marginBottom: 20 },
  noticeCard: { flexDirection: 'row', backgroundColor: PAPER, borderWidth: 1, borderColor: '#D7E1EC', padding: 13, marginTop: 9, borderRadius: 6 },
  noticeUnread: { borderLeftWidth: 4, borderLeftColor: BLUE, backgroundColor: '#F4F9FE' },
  noticeCopy: { flex: 1, marginLeft: 10 }, noticeTitle: { color: INK, fontSize: 12, fontWeight: '900' }, noticeMessage: { color: MUTED, fontSize: 11, lineHeight: 16, marginTop: 3 }, noticeDate: { color: '#7C8997', fontSize: 8, marginTop: 5 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: YELLOW, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: INK, fontSize: 14, fontWeight: '800' },
  summaryCard: { backgroundColor: NAVY, padding: 18, minHeight: 135, borderRadius: 6 },
  summaryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { color: PAPER, fontSize: 10, fontWeight: '900', letterSpacing: 1.25 },
  summaryStats: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 21 },
  summaryNumber: { color: YELLOW, fontSize: 31, fontWeight: '900' },
  summaryText: { color: PAPER, fontSize: 10, fontWeight: '600', marginTop: 2 },
  summaryDivider: { height: 42, width: 1, backgroundColor: '#4775A7' },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 28, marginBottom: 13 },
  sectionTitle: { color: INK, fontSize: 18, fontWeight: '800' },
  linkText: { color: BLUE, fontSize: 12, fontWeight: '800' },
  jobCard: { backgroundColor: NAVY, padding: 18, borderRadius: 6 },
  jobTopLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#164B83', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 6 },
  statusDot: { width: 6, height: 6, borderRadius: 6, backgroundColor: YELLOW, marginRight: 6 },
  statusText: { color: PAPER, fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  jobId: { color: '#A6A6A0', fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  jobTitle: { color: PAPER, fontSize: 20, fontWeight: '800', marginTop: 22, maxWidth: '90%' },
  addressRow: { flexDirection: 'row', alignItems: 'center', marginTop: 15 },
  address: { color: '#C8C8C1', fontSize: 12, marginLeft: 8, flex: 1 },
  jobFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 22 },
  jobMeta: { color: '#A6A6A0', fontSize: 11, fontWeight: '600' },
  arrowButton: { backgroundColor: BLUE, width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionButton: { backgroundColor: '#FFFFFF', width: '48%', minHeight: 94, padding: 15, justifyContent: 'space-between', borderWidth: 1, borderColor: '#D7E1EC', borderRadius: 6 },
  actionLabel: { color: INK, fontSize: 12, fontWeight: '800', maxWidth: 100 },
  notificationHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 28, marginBottom: 4 },
  noNotifications: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: '#F4F7FA', borderWidth: 1, borderColor: '#D7E1EC', borderRadius: 6, marginTop: 9 },
  noNotificationsText: { color: MUTED, fontSize: 11, fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(8, 19, 34, 0.78)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  notificationModal: { width: '100%', maxWidth: 720, height: '82%', backgroundColor: PAPER, borderRadius: 10, overflow: 'hidden' },
  modalHeader: { minHeight: 68, paddingLeft: 17, backgroundColor: NAVY, flexDirection: 'row', alignItems: 'center' },
  modalTitle: { color: PAPER, fontSize: 18, fontWeight: '900' },
  modalSubtitle: { color: YELLOW, fontSize: 8, fontWeight: '900', letterSpacing: 1, marginTop: 4 },
  modalClose: { width: 62, minHeight: 68, marginLeft: 'auto', alignItems: 'center', justifyContent: 'center' },
  logToolbar: { minHeight: 50, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#D7E1EC', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  logCount: { color: MUTED, fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  clearAllText: { color: '#B3261E', fontSize: 11, fontWeight: '900' },
  clearDisabled: { opacity: 0.4 },
  logContent: { flexGrow: 1, padding: 16 },
  logItem: { minHeight: 76, flexDirection: 'row', alignItems: 'flex-start', borderBottomWidth: 1, borderBottomColor: '#E2EAF2', paddingVertical: 12 },
  logIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EAF3FB', alignItems: 'center', justifyContent: 'center' },
  logCopy: { flex: 1, marginLeft: 11 },
  logTitle: { color: INK, fontSize: 12, fontWeight: '900' },
  logMessage: { color: MUTED, fontSize: 11, lineHeight: 16, marginTop: 3 },
  logDate: { color: '#7C8997', fontSize: 8, marginTop: 5 },
  clearOneButton: { width: 42, minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  emptyLog: { flex: 1, minHeight: 260, alignItems: 'center', justifyContent: 'center' },
  emptyLogText: { color: MUTED, fontSize: 12, marginTop: 10 },
  tipCard: { flexDirection: 'row', backgroundColor: '#EAF1F8', padding: 15, marginTop: 26, alignItems: 'center', borderRadius: 6 },
  tipIcon: { width: 36, height: 36, backgroundColor: YELLOW, alignItems: 'center', justifyContent: 'center', marginRight: 12, borderRadius: 6 },
  tipCopy: { flex: 1 },
  tipTitle: { color: INK, fontSize: 12, fontWeight: '800', marginBottom: 4 },
  tipText: { color: '#5E5E58', fontSize: 11, lineHeight: 16 },
});
