import { Ionicons } from '@expo/vector-icons';
import { ImageBackground } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';

const YELLOW = '#FFF200'; const NAVY = '#003366'; const BLUE = '#1E67B2'; const INK = '#172033'; const PAPER = '#FFFFFF'; const MUTED = '#566273';
type Filter = 'active' | 'parts' | 'urgent';
type ServiceOrder = { id: string; work_order_number: string; title: string; description: string; status: string; priority: string; requested_at: string; deadline_at: string | null; properties: { customer_name: string | null; address_line_1: string; city: string; state: string } | null; work_order_files: { file_type: string }[] };

export default function ServiceScreen() {
  const router = useRouter();
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [filter, setFilter] = useState<Filter>('active');
  const [isLoading, setIsLoading] = useState(true);

  const loadServiceOrders = useCallback(async () => {
    setIsLoading(true);
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) { setOrders([]); setIsLoading(false); return; }
    const { data: contractor } = await supabase.from('contractors').select('id').eq('auth_user_id', authData.user.id).eq('is_active', true).single();
    if (!contractor) { setOrders([]); setIsLoading(false); return; }
    const { data: assignments } = await supabase.from('work_order_assignments')
      .select('work_order:work_orders!inner(id, work_order_number, title, description, status, priority, requested_at, deadline_at, kind, properties(customer_name, address_line_1, city, state), work_order_files(file_type))')
      .eq('contractor_id', contractor.id).is('unassigned_at', null).eq('work_order.kind', 'service').neq('work_order.status', 'completed');
    const serviceOrders = (assignments ?? []).map((assignment) => assignment.work_order).filter(Boolean) as unknown as ServiceOrder[];
    serviceOrders.sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority) || deadlineRank(a.deadline_at) - deadlineRank(b.deadline_at));
    setOrders(serviceOrders); setIsLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { void loadServiceOrders(); }, [loadServiceOrders]));

  const visibleOrders = useMemo(() => orders.filter((order) => filter === 'parts'
    ? order.work_order_files.some((file) => file.file_type === 'parts_photo')
    : filter === 'urgent' ? order.priority === 'high' || order.priority === 'emergency' : true), [filter, orders]);

  return <SafeAreaView style={styles.safeArea} edges={['top']}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <ImageBackground source={require('@/assets/images/dark-blue-particle-texture-background.jpg')} style={styles.header} contentFit="cover"><View><Text style={styles.kicker}>MARTY WRIGHT</Text><Text style={styles.title}>Service</Text></View><Ionicons name="construct-outline" size={28} color={YELLOW} /></ImageBackground>
    <View style={styles.summaryRow}><Summary value={orders.length} label="ACTIVE" /><Summary value={orders.filter(isUrgent).length} label="URGENT" /><Summary value={orders.filter(needsParts).length} label="NEEDS PARTS" /></View>
    <View style={styles.filters}><FilterButton label="Active" selected={filter === 'active'} onPress={() => setFilter('active')} /><FilterButton label="Needs Parts" selected={filter === 'parts'} onPress={() => setFilter('parts')} /><FilterButton label="Urgent" selected={filter === 'urgent'} onPress={() => setFilter('urgent')} /></View>
    <Text style={styles.count}>{isLoading ? 'LOADING...' : `${visibleOrders.length} ${filter.toUpperCase()} SERVICE ORDER${visibleOrders.length === 1 ? '' : 'S'}`}</Text>
    {!isLoading && visibleOrders.length === 0 && <View style={styles.empty}><Ionicons name="construct-outline" size={30} color={BLUE} /><Text style={styles.emptyTitle}>No matching service orders</Text><Text style={styles.emptyText}>Assigned repair calls and service requests will appear here.</Text></View>}
    {visibleOrders.map((order) => <TouchableOpacity key={order.id} style={styles.card} activeOpacity={0.85} onPress={() => router.push({ pathname: '/work-order/[id]', params: { id: order.id } })}>
      <View style={styles.cardTop}><View style={styles.statusRow}><View style={[styles.statusDot, { backgroundColor: statusColor(order.status) }]} /><Text style={styles.status}>{order.status.replaceAll('_', ' ').toUpperCase()}</Text></View><Text style={[styles.priority, { color: priorityColor(order.priority) }]}>{order.priority.toUpperCase()}</Text><Text style={styles.id}>#{order.work_order_number}</Text></View>
      <Text style={styles.customer}>{order.properties?.customer_name || order.title}</Text><Text style={styles.description} numberOfLines={2}>{order.description}</Text>
      <View style={styles.infoRow}><Ionicons name="location-outline" size={17} color={BLUE} /><Text style={styles.infoText}>{formatAddress(order.properties)}</Text></View>
      <View style={styles.dates}><View><Text style={styles.dateLabel}>REQUESTED</Text><Text style={styles.dateValue}>{new Date(order.requested_at).toLocaleDateString()}</Text></View><View><Text style={styles.dateLabel}>DEADLINE</Text><Text style={styles.dateValue}>{order.deadline_at ? new Date(order.deadline_at).toLocaleDateString() : 'Not set'}</Text></View>{needsParts(order) && <View style={styles.partsBadge}><Ionicons name="build-outline" size={13} color={NAVY} /><Text style={styles.partsText}>NEEDS PARTS</Text></View>}<Ionicons name="arrow-forward-circle" size={23} color={BLUE} /></View>
    </TouchableOpacity>)}
  </ScrollView></SafeAreaView>;
}

function Summary({ value, label }: { value: number; label: string }) { return <View style={styles.summary}><Text style={styles.summaryValue}>{value}</Text><Text style={styles.summaryLabel}>{label}</Text></View>; }
function FilterButton({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) { return <TouchableOpacity style={[styles.filterButton, selected && styles.filterSelected]} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }}><Text style={[styles.filterText, selected && styles.filterTextSelected]}>{label}</Text></TouchableOpacity>; }
function needsParts(order: ServiceOrder) { return order.work_order_files.some((file) => file.file_type === 'parts_photo'); }
function isUrgent(order: ServiceOrder) { return order.priority === 'high' || order.priority === 'emergency'; }
function formatAddress(property: ServiceOrder['properties']) { return property ? `${property.address_line_1}, ${property.city}, ${property.state}` : 'Address unavailable'; }
function priorityRank(priority: string) { return ({ low: 1, medium: 2, high: 3, emergency: 4 } as Record<string, number>)[priority] ?? 0; }
function deadlineRank(deadline: string | null) { return deadline ? new Date(deadline).getTime() : Number.MAX_SAFE_INTEGER; }
function statusColor(status: string) { return status === 'in_progress' ? BLUE : '#8B97A5'; }
function priorityColor(priority: string) { if (priority === 'emergency') return '#C62828'; if (priority === 'high') return '#D66A00'; return MUTED; }

const styles = StyleSheet.create({ safeArea: { flex: 1, backgroundColor: 'transparent' }, content: { flexGrow: 1, backgroundColor: '#F4F7FA', paddingHorizontal: 20, paddingBottom: 32 }, header: { backgroundColor: NAVY, marginHorizontal: -20, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 25, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, kicker: { color: YELLOW, fontSize: 10, fontWeight: '900', letterSpacing: 1.4, marginBottom: 8 }, title: { color: PAPER, fontSize: 28, fontWeight: '800' }, summaryRow: { flexDirection: 'row', backgroundColor: NAVY, marginTop: 20, borderRadius: 7, overflow: 'hidden' }, summary: { flex: 1, alignItems: 'center', paddingVertical: 15, borderRightWidth: 1, borderRightColor: '#315B84' }, summaryValue: { color: YELLOW, fontSize: 20, fontWeight: '900' }, summaryLabel: { color: PAPER, fontSize: 8, fontWeight: '900', marginTop: 4 }, filters: { flexDirection: 'row', gap: 7, marginTop: 18 }, filterButton: { flex: 1, minHeight: 38, borderWidth: 1, borderColor: '#B9C9D9', backgroundColor: PAPER, alignItems: 'center', justifyContent: 'center', borderRadius: 6 }, filterSelected: { backgroundColor: BLUE, borderColor: BLUE }, filterText: { color: MUTED, fontSize: 10, fontWeight: '800' }, filterTextSelected: { color: PAPER }, count: { color: MUTED, fontSize: 10, fontWeight: '900', letterSpacing: 1.1, marginTop: 24, marginBottom: 12 }, empty: { alignItems: 'center', paddingVertical: 72 }, emptyTitle: { color: INK, fontSize: 15, fontWeight: '800', marginTop: 13 }, emptyText: { color: MUTED, fontSize: 11, marginTop: 6, textAlign: 'center' }, card: { backgroundColor: PAPER, borderWidth: 1, borderColor: '#D7E1EC', padding: 17, marginBottom: 12, borderRadius: 7 }, cardTop: { flexDirection: 'row', alignItems: 'center' }, statusRow: { flexDirection: 'row', alignItems: 'center' }, statusDot: { width: 7, height: 7, borderRadius: 4, marginRight: 6 }, status: { color: MUTED, fontSize: 9, fontWeight: '900' }, priority: { fontSize: 9, fontWeight: '900', marginLeft: 12 }, id: { color: BLUE, fontSize: 10, fontWeight: '800', marginLeft: 'auto' }, customer: { color: BLUE, fontSize: 18, fontWeight: '800', marginTop: 15 }, description: { color: MUTED, fontSize: 12, lineHeight: 18, marginTop: 7 }, infoRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 }, infoText: { color: INK, fontSize: 11, marginLeft: 7, flex: 1 }, dates: { borderTopWidth: 1, borderTopColor: '#E2EAF2', marginTop: 15, paddingTop: 12, flexDirection: 'row', alignItems: 'center', gap: 18 }, dateLabel: { color: MUTED, fontSize: 8, fontWeight: '900' }, dateValue: { color: INK, fontSize: 10, fontWeight: '800', marginTop: 3 }, partsBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF7CC', paddingHorizontal: 7, paddingVertical: 5, borderRadius: 4, gap: 4, marginLeft: 'auto' }, partsText: { color: NAVY, fontSize: 7, fontWeight: '900' } });
