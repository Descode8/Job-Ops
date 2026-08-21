import { Ionicons } from '@expo/vector-icons';
import { ImageBackground } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';

const YELLOW = '#FFF200'; const NAVY = '#003366'; const BLUE = '#1E67B2'; const INK = '#172033'; const PAPER = '#FFFFFF'; const MUTED = '#566273';
type ServiceOrder = { id: string; work_order_number: string; title: string; status: string; deadline_at: string | null; properties: { address_line_1: string; city: string; state: string } | null };

export default function ServiceScreen() {
  const router = useRouter();
  const [orders, setOrders] = useState<ServiceOrder[]>([]); const [isLoading, setIsLoading] = useState(true);
  const loadServiceOrders = useCallback(async () => {
    setIsLoading(true); const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) { setOrders([]); setIsLoading(false); return; }
    const { data: contractor } = await supabase.from('contractors').select('id').eq('auth_user_id', authData.user.id).eq('is_active', true).single();
    if (!contractor) { setOrders([]); setIsLoading(false); return; }
    const { data: assignments } = await supabase.from('work_order_assignments').select('work_order:work_orders!inner(id, work_order_number, title, status, deadline_at, kind, properties(address_line_1, city, state))').eq('contractor_id', contractor.id).is('unassigned_at', null).eq('work_order.kind', 'service');
    setOrders((assignments ?? []).map((assignment) => assignment.work_order).filter(Boolean) as unknown as ServiceOrder[]); setIsLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { void loadServiceOrders(); }, [loadServiceOrders]));
  return <SafeAreaView style={styles.safeArea} edges={['top']}><ScrollView contentContainerStyle={styles.content}><ImageBackground source={require('@/assets/images/dark-blue-particle-texture-background.jpg')} style={styles.header} contentFit="cover"><View><Text style={styles.kicker}>MARTY WRIGHT</Text><Text style={styles.title}>Service</Text></View><TouchableOpacity style={styles.addButton} accessibilityLabel="Create service work order" onPress={() => router.push('/(tabs)/work-order')}><Ionicons name="add" size={24} color={PAPER} /></TouchableOpacity></ImageBackground><View style={styles.intro}><Ionicons name="construct-outline" size={23} color={NAVY} /><Text style={styles.introText}>Repair calls, parts-needed jobs, and service requests assigned to you.</Text></View><Text style={styles.count}>{isLoading ? 'LOADING...' : `${orders.length} SERVICE ORDER${orders.length === 1 ? '' : 'S'}`}</Text>{!isLoading && orders.length === 0 && <View style={styles.empty}><Ionicons name="construct-outline" size={27} color={BLUE} /><Text style={styles.emptyText}>No service work orders yet.</Text></View>}{orders.map((order) => <TouchableOpacity key={order.id} style={styles.card} onPress={() => router.push({ pathname: '/work-order/[id]', params: { id: order.id } })}><View style={styles.cardTop}><Text style={styles.status}>{order.status.replace('_', ' ').toUpperCase()}</Text><Text style={styles.id}>#{order.work_order_number}</Text></View><Text style={styles.titleText}>{order.title}</Text><Text style={styles.address}>{formatAddress(order.properties)}</Text><Text style={styles.due}>{order.deadline_at ? `Due ${new Date(order.deadline_at).toLocaleDateString()}` : 'No deadline set'}</Text></TouchableOpacity>)}</ScrollView></SafeAreaView>;
}
function formatAddress(property: ServiceOrder['properties']) { return property ? `${property.address_line_1}, ${property.city}, ${property.state}` : 'Address unavailable'; }
const styles = StyleSheet.create({ safeArea: { flex: 1, backgroundColor: 'transparent' }, content: { flexGrow: 1, backgroundColor: PAPER, paddingHorizontal: 20, paddingBottom: 30 }, header: { backgroundColor: NAVY, marginHorizontal: -20, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 25, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, kicker: { color: YELLOW, fontSize: 10, fontWeight: '900', letterSpacing: 1.4, marginBottom: 8 }, title: { color: PAPER, fontSize: 28, fontWeight: '800' }, addButton: { height: 42, width: 42, backgroundColor: '#1E67B2', borderRadius: 6, alignItems: 'center', justifyContent: 'center' }, intro: { backgroundColor: '#EAF1F8', padding: 16, marginTop: 22, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 6 }, introText: { color: MUTED, fontSize: 12, padding: 10 }, count: { color: MUTED, fontSize: 10, fontWeight: '900', letterSpacing: 1.2, marginTop: 26, marginBottom: 12 }, empty: { alignItems: 'center', paddingTop: 80 }, emptyText: { color: MUTED, marginTop: 12 }, card: { backgroundColor: PAPER, borderWidth: 1, borderColor: '#D7E1EC', padding: 17, marginBottom: 12, borderRadius: 6 }, cardTop: { flexDirection: 'row', justifyContent: 'space-between' }, status: { color: BLUE, fontSize: 10, fontWeight: '900' }, id: { color: MUTED, fontSize: 10 }, titleText: { color: INK, fontSize: 18, fontWeight: '800', marginTop: 15 }, address: { color: MUTED, fontSize: 12, marginTop: 10 }, due: { color: INK, fontSize: 11, fontWeight: '800', marginTop: 16 }, });
