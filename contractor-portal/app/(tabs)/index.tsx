import { Ionicons } from '@expo/vector-icons';
import { Image, ImageBackground } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';

const YELLOW = '#FFF200';
const NAVY = '#003366';
const BLUE = '#1E67B2';
const PAPER = '#FFFFFF';
const INK = '#172033';
const MUTED = '#566273';

type ChecklistItem = { id: number; label: string };

export default function HomeScreen() {
  const router = useRouter();
  const [contractorName, setContractorName] = useState('');
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [pendingOffers, setPendingOffers] = useState<WorkOrderOffer[]>([]);
  const [respondingOfferId, setRespondingOfferId] = useState<string | null>(null);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [completedChecklist, setCompletedChecklist] = useState<number[]>([]);
  const [currentWorkOrderIndex, setCurrentWorkOrderIndex] = useState(0);
  const [contractorId, setContractorId] = useState('');
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
      const [{ data: assignments }, { data: offers, error: offersError }] = await Promise.all([
        supabase
          .from('work_order_assignments')
          .select('work_order:work_orders(id, work_order_number, title, description, status, priority, deadline_at, properties(customer_name, address_line_1, city, state))')
          .eq('contractor_id', contractor.id)
          .is('unassigned_at', null),
        supabase.rpc('get_pending_work_order_offers'),
      ]);

      const orders = (assignments ?? [])
        .map((assignment) => assignment.work_order)
        .filter(Boolean) as unknown as WorkOrder[];
      setWorkOrders(orders);
      if (!offersError) setPendingOffers((offers ?? []) as WorkOrderOffer[]);
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

  useEffect(() => {
    const loadChecklist = async () => {
      if (!currentWorkOrder) { setChecklistItems([]); setCompletedChecklist([]); return; }
      const [{ data: items }, { data: state }] = await Promise.all([
        supabase.from('home_checklist_items').select('id, label').eq('is_active', true).order('sort_order'),
        supabase.from('work_order_checklist').select('checklist_item_id, is_complete').eq('work_order_id', currentWorkOrder.id),
      ]);
      setChecklistItems((items ?? []) as ChecklistItem[]);
      setCompletedChecklist((state ?? []).filter((row) => row.is_complete).map((row) => row.checklist_item_id));
    };
    void loadChecklist();
  }, [currentWorkOrder]);

  const toggleChecklistItem = async (itemId: number) => {
    if (!currentWorkOrder || !contractorId) return;
    const isComplete = !completedChecklist.includes(itemId);
    setCompletedChecklist((current) => isComplete ? [...current, itemId] : current.filter((id) => id !== itemId));
    const { error } = await supabase.rpc('set_work_order_checklist_item', {
      p_work_order_id: currentWorkOrder.id,
      p_checklist_item_id: itemId,
      p_is_complete: isComplete,
    });
    if (error) {
      setCompletedChecklist((current) => isComplete ? current.filter((id) => id !== itemId) : [...current, itemId]);
      Alert.alert('Checklist was not saved', error.message);
    } else {
      const { data: nextStatus } = await supabase.rpc('refresh_work_order_status', { p_work_order_id: currentWorkOrder.id });
      if (nextStatus) setWorkOrders((orders) => orders.map((order) => order.id === currentWorkOrder.id ? { ...order, status: nextStatus } : order));
    }
  };

  const openDirections = async () => {
    if (!currentWorkOrder?.properties) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(formatAddress(currentWorkOrder.properties))}`;
    const supported = await Linking.canOpenURL(url);
    if (supported) await Linking.openURL(url);
    else Alert.alert('Could not open maps', 'No maps application is available on this device.');
  };

  const signOut = async () => {
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

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ImageBackground source={require('@/assets/images/dark-blue-particle-texture-background.jpg')} style={styles.topBar} contentFit="cover">
          <Image source={require('@/assets/images/Marty-Wright-Home-Sales_anderson.png')} style={styles.logo} contentFit="contain" />
          <TouchableOpacity style={styles.notificationButton} accessibilityLabel="Sign out" onPress={() => void signOut()}>
            <Ionicons name="log-out-outline" size={22} color={PAPER} />
          </TouchableOpacity>
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

        {currentWorkOrder && <View style={styles.checklistCard}>
          <View style={styles.checklistHeader}>
            <View>
              <Text style={styles.checklistEyebrow}>{formatAddress(currentWorkOrder.properties).toUpperCase()}</Text>
              <Text style={styles.checklistTitle}>Home Completion Checklist</Text>
            </View>
            <Text style={styles.checklistCount}>{completedChecklist.length}/{checklistItems.length}</Text>
          </View>
          <Text style={styles.checklistHelp}>Mark each item as it is verified at the home.</Text>
          <View style={styles.checklistGrid}>
            {checklistItems.map((item) => {
              const isComplete = completedChecklist.includes(item.id);
              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.checklistItem}
                  onPress={() => void toggleChecklistItem(item.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isComplete }}>
                  <View style={[styles.checkbox, isComplete && styles.checkboxComplete]}>
                    {isComplete && <Ionicons name="checkmark" size={14} color={PAPER} />}
                  </View>
                  <Text style={[styles.checklistLabel, isComplete && styles.checklistLabelComplete]}>{item.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>}

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Quick actions</Text>
        </View>
        <View style={styles.actionGrid}>
          <ActionButton icon="camera-outline" label="Upload Photos" onPress={() => currentWorkOrder && router.push({ pathname: '/work-order/[id]', params: { id: currentWorkOrder.id, action: 'photos' } })} disabled={!currentWorkOrder} />
          <ActionButton icon="document-text-outline" label="Add Job Note" onPress={() => currentWorkOrder && router.push({ pathname: '/work-order/[id]', params: { id: currentWorkOrder.id, action: 'note' } })} disabled={!currentWorkOrder} />
          <ActionButton icon="navigate-outline" label="Open Directions" onPress={() => void openDirections()} disabled={!currentWorkOrder} />
          <ActionButton icon="receipt-outline" label="Upload Invoice" onPress={() => currentWorkOrder && router.push({ pathname: '/work-order/[id]', params: { id: currentWorkOrder.id, action: 'invoice' } })} disabled={!currentWorkOrder} />
        </View>

        <View style={styles.tipCard}>
          <View style={styles.tipIcon}>
            <Ionicons name="checkmark" size={20} color={INK} />
          </View>
          <View style={styles.tipCopy}>
            <Text style={styles.tipTitle}>Keep your job updates current</Text>
            <Text style={styles.tipText}>A quick note or photo helps the office keep every project moving.</Text>
          </View>
        </View>
      </ScrollView>
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
  if (!deadline) return 'No deadline set';
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
  topBar: { height: 105, marginHorizontal: -20, paddingHorizontal: 20, paddingTop: 17, paddingBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logo: { width: 164, height: 76 },
  notificationButton: { width: 42, height: 42, backgroundColor: '#1E67B2', alignItems: 'center', justifyContent: 'center', position: 'relative', borderRadius: 6 },
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
  tipCard: { flexDirection: 'row', backgroundColor: '#EAF1F8', padding: 15, marginTop: 26, alignItems: 'center', borderRadius: 6 },
  tipIcon: { width: 36, height: 36, backgroundColor: YELLOW, alignItems: 'center', justifyContent: 'center', marginRight: 12, borderRadius: 6 },
  tipCopy: { flex: 1 },
  tipTitle: { color: INK, fontSize: 12, fontWeight: '800', marginBottom: 4 },
  tipText: { color: '#5E5E58', fontSize: 11, lineHeight: 16 },
  checklistCard: { backgroundColor: '#F4F8FC', borderWidth: 1, borderColor: '#D7E1EC', padding: 17, marginTop: 26, borderRadius: 6 },
  checklistHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  checklistEyebrow: { color: BLUE, fontSize: 9, fontWeight: '900', letterSpacing: 1, marginBottom: 6 },
  checklistTitle: { color: INK, fontSize: 17, fontWeight: '800' },
  checklistCount: { color: BLUE, fontSize: 16, fontWeight: '900' },
  checklistHelp: { color: MUTED, fontSize: 11, lineHeight: 16, marginTop: 8, marginBottom: 14 },
  checklistGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  checklistItem: { width: '47%', flexDirection: 'row', alignItems: 'center', minHeight: 28 },
  checkbox: { width: 20, height: 20, borderWidth: 1, borderColor: '#9FB3C8', alignItems: 'center', justifyContent: 'center', marginRight: 8, backgroundColor: PAPER, borderRadius: 6 },
  checkboxComplete: { backgroundColor: BLUE, borderColor: BLUE },
  checklistLabel: { color: INK, fontSize: 11, flex: 1 },
  checklistLabelComplete: { color: MUTED, textDecorationLine: 'line-through' },
});
