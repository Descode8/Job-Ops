import { Ionicons } from '@expo/vector-icons';
import { ImageBackground } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type AppThemeColors, useAppTheme } from '@/contexts/theme-context';
import { supabase } from '@/lib/supabase';

type ChecklistItem = { id: number; label: string };
type Home = {
  id: string;
  work_order_number: string;
  title: string;
  status: string;
  properties: { customer_name: string | null; address_line_1: string; city: string; state: string; postal_code: string } | null;
  work_order_checklist: { checklist_item_id: number; is_complete: boolean }[];
};

const EMPTY_FORM = { name: '', phone: '', address: '', city: '', state: 'SC', postalCode: '' };
const PAPER = '#FFFFFF';
const YELLOW = '#FFF200';

export default function HomeProgressScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [homes, setHomes] = useState<Home[]>([]);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = useCallback(async () => {
    setIsLoading(true);
    const [itemsResult, homesResult] = await Promise.all([
      supabase.from('home_checklist_items').select('id, label').eq('is_active', true).order('sort_order'),
      supabase.from('work_orders').select('id, work_order_number, title, status, created_at, properties(customer_name, address_line_1, city, state, postal_code), work_order_checklist(checklist_item_id, is_complete)').eq('kind', 'installation').order('created_at', { ascending: false }),
    ]);
    if (itemsResult.error || homesResult.error) Alert.alert('Could not load home progress', itemsResult.error?.message ?? homesResult.error?.message);
    setItems((itemsResult.data ?? []) as ChecklistItem[]);
    setHomes((homesResult.data ?? []) as unknown as Home[]);
    setIsLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const createHome = async () => {
    if (!form.name.trim() || !form.address.trim() || !form.city.trim() || !form.state.trim() || !form.postalCode.trim()) {
      Alert.alert('Complete the home details', 'Home name, street address, city, state, and ZIP code are required.');
      return;
    }
    setIsSaving(true);
    const { error } = await supabase.rpc('create_home_progress', {
      p_home_name: form.name.trim(), p_customer_phone: form.phone.trim() || null,
      p_address_line_1: form.address.trim(), p_city: form.city.trim(),
      p_state: form.state.trim(), p_postal_code: form.postalCode.trim(),
    });
    setIsSaving(false);
    if (error) { Alert.alert('Could not create home', `${error.message}\n\nApply database/26_home_progress.sql in Supabase if this feature has not been installed.`); return; }
    setForm(EMPTY_FORM); setIsFormOpen(false); await load();
  };

  const toggleItem = async (home: Home, itemId: number) => {
    const current = home.work_order_checklist.find((row) => row.checklist_item_id === itemId)?.is_complete ?? false;
    setHomes((existing) => existing.map((entry) => entry.id === home.id ? { ...entry, work_order_checklist: upsertChecklist(entry.work_order_checklist, itemId, !current) } : entry));
    const { error } = await supabase.rpc('set_work_order_checklist_item', { p_work_order_id: home.id, p_checklist_item_id: itemId, p_is_complete: !current });
    if (error) { Alert.alert('Could not update checklist', error.message); await load(); }
  };

  return <SafeAreaView style={styles.safe} edges={['top']}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <ImageBackground source={require('@/assets/images/dark-blue-particle-texture-background.jpg')} style={styles.header} contentFit="cover"><View><Text style={styles.kicker}>NEW HOME TRACKING</Text><Text style={styles.title}>Home Progress</Text></View><Ionicons name="clipboard-outline" size={29} color={YELLOW} /></ImageBackground>
    <View style={styles.intro}><View style={styles.introCopy}><Text style={styles.introTitle}>14-step home checklist</Text><Text style={styles.introText}>Keep every new home, address, and completion milestone in one place.</Text></View><Pressable style={({ pressed }) => [styles.newButton, pressed && styles.buttonPressed]} onPress={() => setIsFormOpen(true)}><Ionicons name="add" size={20} color={PAPER} /><Text style={styles.newButtonText}>New Home</Text></Pressable></View>
    <Text style={styles.count}>{isLoading ? 'LOADING...' : `${homes.length} HOME${homes.length === 1 ? '' : 'S'} IN PROGRESS`}</Text>
    {!isLoading && homes.length === 0 && <View style={styles.empty}><Ionicons name="home-outline" size={34} color={colors.primary} /><Text style={styles.emptyTitle}>No homes added yet</Text><Text style={styles.emptyText}>Create a home to attach its name, address, and 14 checklist items.</Text></View>}
    {homes.map((home) => {
      const completed = items.filter((item) => home.work_order_checklist.some((row) => row.checklist_item_id === item.id && row.is_complete)).length;
      const percent = items.length ? Math.round(completed / items.length * 100) : 0;
      return <View key={home.id} style={styles.homeCard}><View style={styles.homeHeader}><View style={styles.homeHeading}><Text style={styles.homeName}>{home.properties?.customer_name || home.title}</Text><Text style={styles.address}>{formatAddress(home.properties)}</Text></View><Text style={styles.percent}>{percent}%</Text></View><View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${percent}%` }]} /></View><View style={styles.progressMeta}><Text style={styles.progressText}>{completed} of {items.length} completed</Text><TouchableOpacity onPress={() => router.push({ pathname: '/work-order/[id]', params: { id: home.id } })}><Text style={styles.detailsLink}>View full work order</Text></TouchableOpacity></View><View style={styles.checklist}>{items.map((item, index) => { const checked = home.work_order_checklist.some((row) => row.checklist_item_id === item.id && row.is_complete); return <TouchableOpacity key={item.id} style={[styles.checklistRow, index === 0 && styles.firstChecklistRow]} onPress={() => void toggleItem(home, item.id)} accessibilityRole="checkbox" accessibilityState={{ checked }}><View style={[styles.checkbox, checked && styles.checkboxChecked]}>{checked && <Ionicons name="checkmark" size={15} color={PAPER} />}</View><Text style={[styles.checklistLabel, checked && styles.checklistLabelChecked]}>{item.label}</Text><Text style={styles.stepNumber}>{String(index + 1).padStart(2, '0')}</Text></TouchableOpacity>; })}</View></View>;
    })}
  </ScrollView>
  <Modal visible={isFormOpen} transparent animationType="fade" onRequestClose={() => setIsFormOpen(false)}><View style={styles.modalBackdrop}><View style={styles.formModal}><View style={styles.modalHeader}><View><Text style={styles.modalKicker}>HOME PROGRESS</Text><Text style={styles.modalTitle}>Add a New Home</Text></View><TouchableOpacity style={styles.closeButton} onPress={() => setIsFormOpen(false)} accessibilityLabel="Close new home form"><Ionicons name="close" size={24} color={colors.textMuted} /></TouchableOpacity></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.formContent}><FormField label="HOME / CUSTOMER NAME" value={form.name} onChangeText={(name) => setForm((value) => ({ ...value, name }))} placeholder="Example: Smith Residence" /><FormField label="PHONE (OPTIONAL)" value={form.phone} onChangeText={(phone) => setForm((value) => ({ ...value, phone }))} placeholder="10-digit phone number" keyboardType="phone-pad" /><FormField label="STREET ADDRESS" value={form.address} onChangeText={(address) => setForm((value) => ({ ...value, address }))} placeholder="123 Main Street" /><FormField label="CITY" value={form.city} onChangeText={(city) => setForm((value) => ({ ...value, city }))} placeholder="City" /><View style={styles.formRow}><View style={styles.stateField}><FormField label="STATE" value={form.state} onChangeText={(state) => setForm((value) => ({ ...value, state: state.toUpperCase().slice(0, 2) }))} placeholder="SC" /></View><View style={styles.zipField}><FormField label="ZIP CODE" value={form.postalCode} onChangeText={(postalCode) => setForm((value) => ({ ...value, postalCode }))} placeholder="29621" keyboardType="number-pad" /></View></View><View style={styles.formNotice}><Ionicons name="information-circle-outline" size={20} color={colors.primary} /><Text style={styles.formNoticeText}>All 14 home-progress checklist items will be attached automatically.</Text></View><Pressable style={({ pressed }) => [styles.saveButton, pressed && styles.buttonPressed, isSaving && styles.disabled]} disabled={isSaving} onPress={() => void createHome()}><Text style={styles.saveButtonText}>{isSaving ? 'Creating Home...' : 'Create Home & Checklist'}</Text></Pressable></ScrollView></View></View></Modal>
  </SafeAreaView>;
}

function FormField({ label, value, onChangeText, placeholder, keyboardType = 'default' }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; keyboardType?: 'default' | 'phone-pad' | 'number-pad' }) { const { colors } = useAppTheme(); const styles = useMemo(() => createStyles(colors), [colors]); return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput style={styles.input} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.textMuted} keyboardType={keyboardType} /></View>; }
function upsertChecklist(rows: Home['work_order_checklist'], itemId: number, isComplete: boolean) { const found = rows.some((row) => row.checklist_item_id === itemId); return found ? rows.map((row) => row.checklist_item_id === itemId ? { ...row, is_complete: isComplete } : row) : [...rows, { checklist_item_id: itemId, is_complete: isComplete }]; }
function formatAddress(property: Home['properties']) { return property ? `${property.address_line_1}, ${property.city}, ${property.state} ${property.postal_code}` : 'Address unavailable'; }

const createStyles = (colors: AppThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 38, backgroundColor: colors.background }, header: { marginHorizontal: -20, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 25, backgroundColor: colors.header, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, kicker: { color: YELLOW, fontSize: 9, fontWeight: '900', letterSpacing: 1.3, marginBottom: 7 }, title: { color: PAPER, fontSize: 28, fontWeight: '900' }, intro: { marginTop: 20, padding: 16, backgroundColor: colors.surfaceMuted, borderRadius: 9, flexDirection: 'row', alignItems: 'center', gap: 12 }, introCopy: { flex: 1 }, introTitle: { color: colors.text, fontSize: 14, fontWeight: '900' }, introText: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 4 }, newButton: { minHeight: 44, backgroundColor: '#2577BB', paddingHorizontal: 13, borderRadius: 7, flexDirection: 'row', alignItems: 'center', gap: 6 }, newButtonText: { color: PAPER, fontSize: 11, fontWeight: '900' }, buttonPressed: { backgroundColor: '#1C1C5C' }, count: { color: colors.textMuted, fontSize: 9, fontWeight: '900', letterSpacing: 1.1, marginTop: 24, marginBottom: 11 }, empty: { alignItems: 'center', paddingVertical: 70, paddingHorizontal: 30 }, emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '900', marginTop: 13 }, emptyText: { color: colors.textMuted, fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 6 }, homeCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 17, marginBottom: 16 }, homeHeader: { flexDirection: 'row', alignItems: 'flex-start' }, homeHeading: { flex: 1 }, homeName: { color: colors.text, fontSize: 19, fontWeight: '900' }, address: { color: colors.textMuted, fontSize: 11, lineHeight: 17, marginTop: 5 }, percent: { color: colors.primary, fontSize: 19, fontWeight: '900', marginLeft: 12 }, progressTrack: { height: 7, borderRadius: 5, backgroundColor: colors.surfaceMuted, overflow: 'hidden', marginTop: 16 }, progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 5 }, progressMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, marginBottom: 12 }, progressText: { color: colors.textMuted, fontSize: 9, fontWeight: '800' }, detailsLink: { color: colors.primary, fontSize: 9, fontWeight: '900' }, checklist: { borderTopWidth: 1, borderTopColor: colors.border }, checklistRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border }, firstChecklistRow: { borderTopWidth: 0 }, checkbox: { width: 23, height: 23, borderRadius: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input, alignItems: 'center', justifyContent: 'center' }, checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary }, checklistLabel: { flex: 1, color: colors.text, fontSize: 12, fontWeight: '700', marginLeft: 11 }, checklistLabelChecked: { color: colors.textMuted, textDecorationLine: 'line-through' }, stepNumber: { color: colors.textMuted, fontSize: 9, fontWeight: '900' }, modalBackdrop: { flex: 1, backgroundColor: 'rgba(2, 8, 18, 0.76)', alignItems: 'center', justifyContent: 'center', padding: 18 }, formModal: { width: '100%', maxWidth: 560, maxHeight: '90%', borderRadius: 16, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }, modalHeader: { minHeight: 76, paddingLeft: 20, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border }, modalKicker: { color: colors.primary, fontSize: 8, fontWeight: '900', letterSpacing: 1.2 }, modalTitle: { color: colors.text, fontSize: 20, fontWeight: '900', marginTop: 4 }, closeButton: { width: 62, minHeight: 76, marginLeft: 'auto', alignItems: 'center', justifyContent: 'center' }, formContent: { padding: 20, paddingBottom: 26 }, field: { marginBottom: 14 }, label: { color: colors.text, fontSize: 9, fontWeight: '900', letterSpacing: 0.7, marginBottom: 7 }, input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.input, color: colors.text, paddingHorizontal: 13, fontSize: 13 }, formRow: { flexDirection: 'row', gap: 10 }, stateField: { width: 95 }, zipField: { flex: 1 }, formNotice: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: colors.surfaceMuted, borderRadius: 7, padding: 12, marginTop: 3 }, formNoticeText: { flex: 1, color: colors.textMuted, fontSize: 10, lineHeight: 15 }, saveButton: { minHeight: 52, backgroundColor: '#2577BB', borderRadius: 7, alignItems: 'center', justifyContent: 'center', marginTop: 18 }, saveButtonText: { color: PAPER, fontSize: 12, fontWeight: '900' }, disabled: { opacity: 0.5 },
});
