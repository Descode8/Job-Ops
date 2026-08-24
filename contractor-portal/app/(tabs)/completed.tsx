import { Ionicons } from '@expo/vector-icons';
import { ImageBackground } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { type AppThemeColors, useAppTheme } from '@/contexts/theme-context';
import { AppText as Text, AppTextInput as TextInput } from '@/components/app-typography';
import { supabase } from '@/lib/supabase';
import { WORK_ORDER_STATUS_COLORS, WORK_ORDER_STATUS_FONT } from '@/lib/work-order-status';
import { formatWorkOrderNumber } from '@/lib/work-order-number';
import { useWorkOrderRealtime } from '@/hooks/use-work-order-realtime';

const YELLOW = '#FFF200'; const PAPER = '#FFFFFF';
type CompletedOrder = { id: string; work_order_number: string; title: string; completed_at: string | null; properties: { customer_name: string | null; address_line_1: string; city: string; state: string } | null };

export default function CompletedScreen() {
  const { colors } = useAppTheme(); const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const [orders, setOrders] = useState<CompletedOrder[]>([]); const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [customerNames, setCustomerNames] = useState<string[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);
  const loadCompletedOrders = useCallback(async () => {
    setIsLoading(true); const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) { setOrders([]); setIsLoading(false); return; }
    const { data: contractor } = await supabase.from('contractors').select('id, is_admin').eq('auth_user_id', authData.user.id).eq('is_active', true).single();
    if (!contractor) { setOrders([]); setIsLoading(false); return; }
    setIsAdmin(Boolean(contractor.is_admin));
    let completedOrders: CompletedOrder[];
    if (contractor.is_admin) {
      const { data: completedRows } = await supabase.from('work_orders').select('id, work_order_number, title, completed_at, properties(customer_name, address_line_1, city, state)').eq('status', 'completed').order('completed_at', { ascending: false });
      completedOrders = (completedRows ?? []) as unknown as CompletedOrder[];
    } else {
      const { data: assignments } = await supabase.from('work_order_assignments').select('work_order:work_orders!inner(id, work_order_number, title, completed_at, status, properties(customer_name, address_line_1, city, state))').eq('contractor_id', contractor.id).is('unassigned_at', null).eq('work_order.status', 'completed');
      completedOrders = (assignments ?? []).map((assignment) => assignment.work_order).filter(Boolean) as unknown as CompletedOrder[];
      setCustomerNames([]);
      setCustomerSearch('');
    }
    const standardCompletedOrders = completedOrders.filter((order) => !order.work_order_number.startsWith('HOME-'));
    setOrders(standardCompletedOrders);
    if (contractor.is_admin) {
      const names = [...new Set(standardCompletedOrders.map((order) => order.properties?.customer_name?.trim()).filter((name): name is string => Boolean(name)))].sort((a, b) => a.localeCompare(b));
      setCustomerNames(names);
    }
    setIsLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { void loadCompletedOrders(); }, [loadCompletedOrders]));
  useWorkOrderRealtime(() => { void loadCompletedOrders(); });
  const normalizedSearch = customerSearch.trim().toLowerCase();
  const visibleOrders = normalizedSearch ? orders.filter((order) => customerLastName(order.properties?.customer_name).toLowerCase().startsWith(normalizedSearch)) : orders;
  const customerSuggestions = normalizedSearch ? customerNames.filter((name) => customerLastName(name).toLowerCase().startsWith(normalizedSearch)).slice(0, 5) : [];
  return <SafeAreaView style={styles.safeArea} edges={['top']}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <ImageBackground source={require('@/assets/images/dark-blue-particle-texture-background.jpg')} style={styles.header} contentFit="cover"><View><Text style={styles.kicker}>MARTY WRIGHT</Text><Text style={[styles.title, { fontWeight: '900' }]}>Complete Work Order</Text></View><View style={[styles.icon, { backgroundColor: 'transparent', borderRadius: 0 }]}><Ionicons name="checkmark-done" size={28} color={YELLOW} /></View></ImageBackground>
    <View style={styles.intro}><Ionicons name="archive" size={22} color={colors.primary} /><View style={styles.introCopy}><Text style={styles.introTitle}>Complete Work History</Text><Text style={styles.introText}>{isAdmin ? 'Search completed work orders by customer last name.' : 'Your complete work orders remain available here.'}</Text></View></View>
    {isAdmin && <View style={styles.customerFilter}><Text style={styles.filterLabel}>SEARCH BY LAST NAME</Text><View style={{ minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9 }}><Ionicons name="search" size={19} color={colors.textMuted} /><TextInput style={{ flex: 1, minHeight: 46, color: colors.text, fontSize: 13, paddingVertical: 0 }} value={customerSearch} onChangeText={(value) => { setCustomerSearch(value); setShowCustomerSuggestions(Boolean(value.trim())); }} onFocus={() => setShowCustomerSuggestions(Boolean(customerSearch.trim()))} placeholder="Enter customer last name" placeholderTextColor={colors.textMuted} autoCapitalize="words" autoCorrect={false} />{customerSearch.length > 0 && <TouchableOpacity onPress={() => { setCustomerSearch(''); setShowCustomerSuggestions(false); }} accessibilityLabel="Clear customer search"><Ionicons name="close-circle" size={19} color={colors.textMuted} /></TouchableOpacity>}</View>{showCustomerSuggestions && customerSuggestions.length > 0 && <View style={{ maxHeight: 230, borderWidth: 1, borderTopWidth: 0, borderColor: colors.border, borderBottomLeftRadius: 7, borderBottomRightRadius: 7, overflow: 'hidden', backgroundColor: colors.surfaceElevated }}>{customerSuggestions.map((name) => <TouchableOpacity key={name} style={{ minHeight: 52, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border }} onPress={() => { setCustomerSearch(customerLastName(name)); setShowCustomerSuggestions(false); }}><View><Text style={{ color: colors.text, fontSize: 12, fontWeight: '800' }}>{name}</Text><Text style={{ color: colors.textMuted, fontSize: 9, marginTop: 3 }}>Last name: {customerLastName(name)}</Text></View><Ionicons name="arrow-forward" size={17} color={colors.primary} /></TouchableOpacity>)}</View>}</View>}
    <Text style={styles.count}>{isLoading ? 'LOADING...' : `${visibleOrders.length} COMPLETE ORDER${visibleOrders.length === 1 ? '' : 'S'}`}</Text>
    {!isLoading && visibleOrders.length === 0 && <View style={styles.empty}><Ionicons name="checkmark-done" size={27} color={colors.primary} /><Text style={styles.emptyText}>{normalizedSearch ? `No completed work orders match “${customerSearch.trim()}”.` : 'No complete work orders yet.'}</Text></View>}
    {visibleOrders.map((order) => <TouchableOpacity key={order.id} style={styles.card} onPress={() => router.push({ pathname: '/work-order/[id]', params: { id: order.id } })}><View style={styles.cardTop}><Text style={[styles.status, { fontFamily: WORK_ORDER_STATUS_FONT }]}>COMPLETE</Text><Text style={styles.id}>{formatWorkOrderNumber(order.work_order_number)}</Text></View><Text style={[styles.orderTitle, { fontWeight: '900' }]}>{order.properties?.customer_name || order.title}</Text><Text style={styles.address}>{formatAddress(order.properties)}</Text><View style={styles.footer}><Text style={styles.footerLabel}>COMPLETE {order.completed_at ? new Date(order.completed_at).toLocaleDateString() : ''}</Text><Ionicons name="arrow-forward-circle" size={20} color={colors.primary} /></View></TouchableOpacity>)}
  </ScrollView></SafeAreaView>;
}
function formatAddress(property: CompletedOrder['properties']) { return property ? `${property.address_line_1}, ${property.city}, ${property.state}` : 'Address unavailable'; }
function customerLastName(customerName: string | null | undefined) { const parts = customerName?.trim().split(/\s+/).filter(Boolean) ?? []; return parts.at(-1) ?? ''; }
const createStyles = (colors: AppThemeColors) => StyleSheet.create({ safeArea: { flex: 1, backgroundColor: colors.background }, content: { flexGrow: 1, backgroundColor: colors.background, paddingHorizontal: 20, paddingBottom: 30 }, header: { backgroundColor: colors.header, marginHorizontal: -20, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 25, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, kicker: { color: YELLOW, fontSize: 10, fontWeight: '900', letterSpacing: 1.4, marginBottom: 8 }, title: { color: PAPER, fontSize: 28, fontWeight: '800' }, icon: { width: 42, height: 42, backgroundColor: colors.primary, borderRadius: 6, alignItems: 'center', justifyContent: 'center' }, intro: { backgroundColor: colors.surfaceMuted, padding: 16, marginTop: 22, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 6 }, introCopy: { flex: 1 }, introTitle: { color: colors.text, fontSize: 14, fontWeight: '800', marginBottom: 4 }, introText: { color: colors.textMuted, fontSize: 11 }, customerFilter: { marginTop: 18 }, filterLabel: { color: colors.text, fontSize: 9, fontWeight: '900', letterSpacing: 0.9, marginBottom: 7 }, dropdown: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, dropdownText: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '800' }, dropdownMenu: { borderWidth: 1, borderTopWidth: 0, borderColor: colors.border, borderBottomLeftRadius: 7, borderBottomRightRadius: 7, overflow: 'hidden', backgroundColor: colors.surfaceElevated }, dropdownMenuScroll: { maxHeight: 230 }, dropdownOption: { minHeight: 46, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border }, dropdownOptionSelected: { backgroundColor: colors.surfaceMuted }, dropdownOptionText: { flex: 1, color: colors.text, fontSize: 12, fontWeight: '700' }, count: { color: colors.textMuted, fontSize: 10, fontWeight: '900', letterSpacing: 1.2, marginTop: 26, marginBottom: 12 }, empty: { alignItems: 'center', paddingTop: 80 }, emptyText: { color: colors.textMuted, marginTop: 12 }, card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 17, marginBottom: 12, borderRadius: 6 }, cardTop: { flexDirection: 'row', justifyContent: 'space-between' }, status: { color: WORK_ORDER_STATUS_COLORS.completed, fontSize: 10, fontWeight: '900' }, id: { color: colors.textMuted, fontSize: 10 }, orderTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 15 }, address: { color: colors.textMuted, fontSize: 12, marginTop: 10 }, footer: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 16, paddingTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, footerLabel: { color: WORK_ORDER_STATUS_COLORS.completed, fontSize: 10, fontWeight: '800' }, });
