import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type AppThemeColors, useAppTheme } from '@/contexts/theme-context';
import { AppText as Text, AppTextInput as TextInput } from '@/components/app-typography';
import { ThemedAlert as Alert } from '@/components/themed-alert';
import { supabase } from '@/lib/supabase';
import { notifyWorkOrderSms } from '@/lib/work-order-sms';
import { useWorkOrderRealtime } from '@/hooks/use-work-order-realtime';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { formatPhoneNumber, phoneNumberDigits } from '@/lib/phone-number';

type ChecklistItem = { id: number; label: string };
type HomeFinancingType = 'NFHA' | 'FHA';
type Home = {
  id: string;
  work_order_number: string;
  title: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  properties: { customer_name: string | null; address_line_1: string; city: string; state: string; postal_code: string } | null;
  work_order_checklist: { checklist_item_id: number; is_complete: boolean; notes: string | null }[];
};

const EMPTY_FORM = { name: '', phone: '', address: '', city: '', state: 'SC', postalCode: '', financingType: 'NFHA' as HomeFinancingType };
const PAPER = '#FFFFFF';
const YELLOW = '#1D4ED8';
const FHA_ORANGE = '#FF8A00';

export default function HomeProgressScreen() {
  const router = useRouter();
  const { themeMode, colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const groupStyles = useMemo(() => StyleSheet.create({
    container: { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: 10, marginBottom: 14, overflow: 'hidden' },
    header: { minHeight: 82, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { fontSize: 16, fontWeight: '900', letterSpacing: 1 },
    count: { color: colors.textMuted, fontSize: 9, fontWeight: '800', letterSpacing: 0.7, marginTop: 6 },
    list: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 2, borderTopWidth: 0.5, borderTopColor: colors.border },
    empty: { color: colors.textMuted, fontSize: 11, textAlign: 'center', paddingVertical: 24 },
  }), [colors]);
  const [allHomes, setHomes] = useState<Home[]>([]);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isFinancingOpen, setIsFinancingOpen] = useState(false);
  const [completingHomeId, setCompletingHomeId] = useState<string | null>(null);
  const [expandedChecklistIds, setExpandedChecklistIds] = useState<Set<string>>(() => new Set());
  const [form, setForm] = useState(EMPTY_FORM);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [homeSearch, setHomeSearch] = useState('');
  const [showHomeSuggestions, setShowHomeSuggestions] = useState(false);
  const [expandedHomeGroups, setExpandedHomeGroups] = useState<Set<HomeFinancingType>>(() => new Set());
  const [commentTarget, setCommentTarget] = useState<{ homeId: string; itemId: number; itemLabel: string } | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [isSavingComment, setIsSavingComment] = useState(false);

  const normalizedHomeSearch = homeSearch.trim().toLowerCase();
  const homeNames = useMemo(() => [...new Set(allHomes.map((home) => home.properties?.customer_name || home.title).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [allHomes]);
  const homeSuggestions = useMemo(() => normalizedHomeSearch ? homeNames.filter((name) => name.toLowerCase().includes(normalizedHomeSearch)).slice(0, 5) : [], [homeNames, normalizedHomeSearch]);
  const homes = useMemo(() => normalizedHomeSearch ? allHomes.filter((home) => (home.properties?.customer_name || home.title).toLowerCase().includes(normalizedHomeSearch)) : allHomes, [allHomes, normalizedHomeSearch]);
  const groupedHomes = useMemo(() => ({
    FHA: homes.filter((home) => home.work_order_number.startsWith('HOME-FHA-')),
    NFHA: homes.filter((home) => !home.work_order_number.startsWith('HOME-FHA-')),
  }), [homes]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    const [itemsResult, homesResult] = await Promise.all([
      supabase.from('home_checklist_items').select('id, label').eq('is_active', true).order('sort_order'),
      supabase.from('work_orders').select('id, work_order_number, title, status, created_at, completed_at, properties(customer_name, address_line_1, city, state, postal_code), work_order_checklist(checklist_item_id, is_complete, notes)').like('work_order_number', 'HOME-%').neq('status', 'completed').order('created_at', { ascending: false }),
    ]);
    if (itemsResult.error || homesResult.error) Alert.alert('Could not load home progress', itemsResult.error?.message ?? homesResult.error?.message);
    setItems((itemsResult.data ?? []) as ChecklistItem[]);
    setHomes((homesResult.data ?? []) as unknown as Home[]);
    setIsLoading(false);
  }, []);

  const { isRefreshing, onRefresh } = usePullToRefresh(load);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useWorkOrderRealtime(() => { void load(); });

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
      p_financing_type: form.financingType,
    });
    setIsSaving(false);
    if (error) { Alert.alert('Could not create home', `${error.message}\n\nApply database/26_home_progress.sql in Supabase if this feature has not been installed.`); return; }
    setForm(EMPTY_FORM); setIsFormOpen(false); await load();
  };

  const toggleItem = async (home: Home, itemId: number) => {
    const current = home.work_order_checklist.find((row) => row.checklist_item_id === itemId)?.is_complete ?? false;
    const nextRows = upsertChecklist(home.work_order_checklist, itemId, !current);
    setHomes((existing) => existing.map((entry) => entry.id === home.id ? { ...entry, work_order_checklist: nextRows } : entry));
    const { error } = await supabase.rpc('set_work_order_checklist_item', { p_work_order_id: home.id, p_checklist_item_id: itemId, p_is_complete: !current });
    if (error) { Alert.alert('Could not update checklist', error.message); await load(); return; }
  };

  const completeHome = async (home: Home) => {
    setCompletingHomeId(home.id);
    const { error } = await supabase.rpc('complete_home_progress', { p_work_order_id: home.id });
    if (error) { setCompletingHomeId(null); Alert.alert('Could not complete work order', error.message); return; }
    notifyWorkOrderSms(home.id, 'completed');
    const { error: emailError } = await supabase.functions.invoke('send-completion-email', { body: { workOrderId: home.id } });
    setCompletingHomeId(null);
    setHomes((existing) => existing.filter((entry) => entry.id !== home.id));
    Alert.alert(emailError ? 'Work order completed; email failed' : 'Work order completed', emailError ? `${home.properties?.customer_name || home.title} was completed, but the completion email could not be delivered.` : `${home.properties?.customer_name || home.title} was moved to completed work and a completion email was sent.`);
  };

  const openComment = (home: Home, item: ChecklistItem) => {
    const row = home.work_order_checklist.find((entry) => entry.checklist_item_id === item.id);
    setCommentDraft(row?.notes ?? '');
    setCommentTarget({ homeId: home.id, itemId: item.id, itemLabel: item.label });
  };

  const saveComment = async () => {
    if (!commentTarget) return;
    setIsSavingComment(true);
    const notes = commentDraft.trim() || null;
    const { error } = await supabase.from('work_order_checklist').update({ notes }).eq('work_order_id', commentTarget.homeId).eq('checklist_item_id', commentTarget.itemId);
    setIsSavingComment(false);
    if (error) { Alert.alert('Could not save comment', error.message); return; }
    setHomes((existing) => existing.map((home) => home.id !== commentTarget.homeId ? home : { ...home, work_order_checklist: home.work_order_checklist.map((row) => row.checklist_item_id === commentTarget.itemId ? { ...row, notes } : row) }));
    setCommentTarget(null);
  };

  const toggleChecklist = (homeId: string) => {
    setExpandedChecklistIds((current) => {
      const next = new Set(current);
      if (next.has(homeId)) next.delete(homeId);
      else next.add(homeId);
      return next;
    });
  };

  const toggleHomeGroup = (group: HomeFinancingType) => {
    setExpandedHomeGroups((current) => {
      const next = new Set(current);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const renderHomeCard = (home: Home) => {
    const completed = items.filter((item) => home.work_order_checklist.some((row) => row.checklist_item_id === item.id && row.is_complete)).length;
    const percent = items.length ? Math.round(completed / items.length * 100) : 0;
    const isFha = home.work_order_number.startsWith('HOME-FHA-');
    const isChecklistExpanded = expandedChecklistIds.has(home.id);
    return <View key={home.id} style={styles.homeCard}><Text style={styles.deliveryAge}>{formatDeliveryAge(home.created_at, currentTime)}</Text><View style={styles.homeTypeRow}><Text style={[styles.homeType, { color: isFha ? FHA_ORANGE : colors.text }]}>{isFha ? 'FHA' : 'NON-FHA'}</Text><Text style={[styles.homeNumber, { color: isFha ? FHA_ORANGE : colors.textMuted }]}>#{home.work_order_number}</Text></View><View style={styles.homeHeader}><View style={styles.homeHeading}><Text style={styles.homeName}>{home.properties?.customer_name || home.title}</Text><Text style={styles.address}>{formatAddress(home.properties)}</Text></View><Text style={styles.percent}>{percent}%</Text></View><View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${percent}%` }]} /></View><View style={styles.progressMeta}><Text style={styles.progressText}>{completed} of {items.length} completed</Text><TouchableOpacity onPress={() => router.push({ pathname: '/work-order/[id]', params: { id: home.id } })}><Text style={styles.detailsLink}>View full work order</Text></TouchableOpacity></View><Pressable style={({ pressed }) => [styles.checklistToggle, { minHeight: 28, paddingHorizontal: 0, borderWidth: 0, borderRadius: 0, backgroundColor: 'transparent', alignSelf: 'flex-start', justifyContent: 'flex-start', gap: 5 }, pressed && styles.checklistTogglePressed]} onPress={() => toggleChecklist(home.id)} accessibilityRole="button" accessibilityState={{ expanded: isChecklistExpanded }}><Text style={styles.checklistToggleTitle}>{isChecklistExpanded ? 'Hide Check List' : 'See Check List'}</Text><Ionicons name={isChecklistExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.primary} /></Pressable>{isChecklistExpanded && <><View style={styles.checklist}>{items.map((item, index) => { const row = home.work_order_checklist.find((entry) => entry.checklist_item_id === item.id); const checked = row?.is_complete ?? false; return <View key={item.id} style={[styles.checklistRow, index === 0 && styles.firstChecklistRow]}><Pressable style={styles.checklistMain} onPress={() => void toggleItem(home, item.id)} accessibilityRole="checkbox" accessibilityState={{ checked }}><View style={[styles.checkbox, checked && styles.checkboxChecked]}>{checked && <Ionicons name="checkmark" size={16} color={colors.primary} />}</View><View style={styles.checklistCopy}><Text style={[styles.checklistLabel, styles.centeredChecklistLabel, checked && styles.checklistLabelChecked]}>{item.label}</Text>{Boolean(row?.notes) && <Text style={styles.commentPreview} numberOfLines={1}>{row?.notes}</Text>}</View></Pressable><Pressable style={styles.commentButton} onPress={() => openComment(home, item)} accessibilityLabel={`Comment on ${item.label}`}><Ionicons name={row?.notes ? 'chatbubble' : 'chatbubble-outline'} size={14} color={colors.primary} /><Text style={styles.commentButtonText}>Comment</Text></Pressable></View>; })}</View>{items.length > 0 && completed === items.length && <Pressable style={({ pressed }) => [styles.completeButton, pressed && styles.buttonPressed, completingHomeId === home.id && styles.disabled]} disabled={Boolean(completingHomeId)} onPress={() => void completeHome(home)}><Ionicons name="checkmark-done" size={19} color={PAPER} /><Text style={styles.completeButtonText}>{completingHomeId === home.id ? 'Completing...' : 'Complete WO'}</Text></Pressable>}</>}</View>;
  };

  return <SafeAreaView style={styles.safe} edges={['top']}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}>
    <View style={styles.header}><View><Text style={styles.kicker}>JOBOPS · HOME TRACKING</Text><Text style={styles.title}>Home Progress</Text></View><Ionicons name="clipboard" size={29} color={themeMode === 'black' ? PAPER : YELLOW} /></View>
    <View style={styles.intro}><View style={styles.introCopy}><Text style={styles.introTitle}>16-step home checklist</Text><Text style={styles.introText}>Keep every new home, address, and completion milestone in one place.</Text></View><Pressable style={({ pressed }) => [styles.newButton, pressed && styles.buttonPressed]} onPress={() => setIsFormOpen(true)}><Ionicons name="add" size={20} color={PAPER} /><Text style={styles.newButtonText}>New Home</Text></Pressable></View>
    <View style={{ minHeight: 48, marginTop: 16, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 0.5, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface }}><Ionicons name="search" size={19} color={colors.textMuted} /><TextInput style={{ flex: 1, minHeight: 46, paddingVertical: 0, color: colors.text, fontSize: 13 }} value={homeSearch} onChangeText={(value) => { setHomeSearch(value); setShowHomeSuggestions(Boolean(value.trim())); }} onFocus={() => setShowHomeSuggestions(Boolean(homeSearch.trim()))} placeholder="Search by customer or home name" placeholderTextColor={colors.textMuted} autoCapitalize="words" autoCorrect={false} />{homeSearch.length > 0 && <TouchableOpacity onPress={() => { setHomeSearch(''); setShowHomeSuggestions(false); }} accessibilityLabel="Clear home search"><Ionicons name="close-circle" size={19} color={colors.textMuted} /></TouchableOpacity>}</View>
    {showHomeSuggestions && homeSuggestions.length > 0 && <View style={{ borderWidth: 0.5, borderTopWidth: 0, borderColor: colors.border, borderBottomLeftRadius: 7, borderBottomRightRadius: 7, backgroundColor: colors.surfaceElevated, overflow: 'hidden' }}>{homeSuggestions.map((name, index) => <TouchableOpacity key={name} style={{ minHeight: 44, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: index === 0 ? 0 : 0.5, borderTopColor: colors.border }} onPress={() => { setHomeSearch(name); setShowHomeSuggestions(false); }} accessibilityLabel={`Search for ${name}`}><Text style={{ flex: 1, color: colors.text, fontSize: 12, fontWeight: '800' }}>{name}</Text><Ionicons name="arrow-forward" size={16} color={colors.primary} /></TouchableOpacity>)}</View>}
    <Text style={styles.count}>{isLoading ? 'LOADING...' : `${homes.length} HOME${homes.length === 1 ? '' : 'S'} IN PROGRESS`}</Text>
    {!isLoading && homes.length === 0 && <View style={styles.empty}><Ionicons name={normalizedHomeSearch ? 'search' : 'home'} size={34} color={colors.primary} /><Text style={styles.emptyTitle}>{normalizedHomeSearch ? 'No matching homes' : 'No homes added yet'}</Text><Text style={styles.emptyText}>{normalizedHomeSearch ? `No active home matches “${homeSearch.trim()}”.` : 'Create a home to attach its name, address, and 16 checklist items.'}</Text></View>}
    {!isLoading && homes.length > 0 && (['FHA', 'NFHA'] as HomeFinancingType[]).map((group) => {
      const groupHomes = groupedHomes[group];
      const isExpanded = expandedHomeGroups.has(group);
      const label = group === 'FHA' ? 'FHA' : 'NON-FHA';
      return <View key={group} style={groupStyles.container}><Pressable style={({ pressed }) => [groupStyles.header, pressed && styles.checklistTogglePressed]} onPress={() => toggleHomeGroup(group)} accessibilityRole="button" accessibilityState={{ expanded: isExpanded }} accessibilityLabel={`${isExpanded ? 'Collapse' : 'Expand'} ${label} homes`}><View><Text style={[groupStyles.title, { color: group === 'FHA' ? FHA_ORANGE : colors.text }]}>{label}</Text><Text style={groupStyles.count}>{groupHomes.length} HOME{groupHomes.length === 1 ? '' : 'S'} IN PROGRESS</Text></View><Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={23} color={group === 'FHA' ? FHA_ORANGE : colors.text} /></Pressable>{isExpanded && <View style={groupStyles.list}>{groupHomes.length > 0 ? groupHomes.map(renderHomeCard) : <Text style={groupStyles.empty}>No {label} homes in progress.</Text>}</View>}</View>;
    })}
  </ScrollView>
  <Modal visible={Boolean(commentTarget)} transparent animationType="fade" onRequestClose={() => setCommentTarget(null)}><KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={20}><View style={styles.commentModal}><Pressable style={styles.commentCloseButton} onPress={() => setCommentTarget(null)} disabled={isSavingComment} accessibilityRole="button" accessibilityLabel="Close comment"><Ionicons name="close" size={22} color={colors.textMuted} /></Pressable><Text style={styles.modalKicker}>CHECKLIST COMMENT</Text><Text style={styles.modalTitle}>{commentTarget?.itemLabel}</Text><TextInput style={styles.commentInput} value={commentDraft} onChangeText={setCommentDraft} placeholder="Add a note for this checklist item" placeholderTextColor={colors.textMuted} multiline autoFocus /><View style={styles.commentActions}><Pressable style={styles.cancelButton} onPress={() => setCommentTarget(null)} disabled={isSavingComment}><Text style={styles.cancelButtonText}>Cancel</Text></Pressable><Pressable style={[styles.saveCommentButton, isSavingComment && styles.disabled]} onPress={() => void saveComment()} disabled={isSavingComment}><Text style={styles.saveButtonText}>{isSavingComment ? 'Saving...' : 'Save Comment'}</Text></Pressable></View></View></KeyboardAvoidingView></Modal>
  <Modal visible={isFormOpen} transparent animationType="fade" onRequestClose={() => setIsFormOpen(false)}><View style={styles.modalBackdrop}><View style={styles.formModal}><View style={styles.modalHeader}><View><Text style={styles.modalKicker}>HOME PROGRESS</Text><Text style={styles.modalTitle}>Add a New Home</Text></View><TouchableOpacity style={styles.closeButton} onPress={() => setIsFormOpen(false)} accessibilityLabel="Close new home form"><Ionicons name="close" size={24} color={colors.textMuted} /></TouchableOpacity></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.formContent}><View style={styles.field}><Text style={styles.label}>HOME TYPE</Text><Pressable style={styles.dropdown} onPress={() => setIsFinancingOpen((open) => !open)} accessibilityRole="button" accessibilityState={{ expanded: isFinancingOpen }}><Text style={styles.dropdownText}>{form.financingType === 'FHA' ? 'FHA' : 'Non-FHA'}</Text><Ionicons name={isFinancingOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} /></Pressable>{isFinancingOpen && <View style={styles.dropdownMenu}>{(['NFHA', 'FHA'] as HomeFinancingType[]).map((type) => <Pressable key={type} style={[styles.dropdownOption, form.financingType === type && styles.dropdownOptionSelected]} onPress={() => { setForm((value) => ({ ...value, financingType: type })); setIsFinancingOpen(false); }}><Text style={[styles.dropdownOptionText, { color: type === 'FHA' ? FHA_ORANGE : PAPER }]}>{type === 'FHA' ? 'FHA' : 'Non-FHA'}</Text>{form.financingType === type && <Ionicons name="checkmark" size={18} color={type === 'FHA' ? FHA_ORANGE : PAPER} />}</Pressable>)}</View>}</View><FormField label="HOME / CUSTOMER NAME" value={form.name} onChangeText={(name) => setForm((value) => ({ ...value, name }))} placeholder="Example: Smith Residence" /><FormField label="PHONE (OPTIONAL)" value={formatPhoneNumber(form.phone)} onChangeText={(phone) => setForm((value) => ({ ...value, phone: phoneNumberDigits(phone) }))} placeholder="(555) 555-5555" keyboardType="phone-pad" maxLength={14} /><FormField label="STREET ADDRESS" value={form.address} onChangeText={(address) => setForm((value) => ({ ...value, address }))} placeholder="123 Main Street" /><FormField label="CITY" value={form.city} onChangeText={(city) => setForm((value) => ({ ...value, city }))} placeholder="City" /><View style={styles.formRow}><View style={styles.stateField}><FormField label="STATE" value={form.state} onChangeText={(state) => setForm((value) => ({ ...value, state: state.toUpperCase().slice(0, 2) }))} placeholder="SC" /></View><View style={styles.zipField}><FormField label="ZIP CODE" value={form.postalCode} onChangeText={(postalCode) => setForm((value) => ({ ...value, postalCode }))} placeholder="29621" keyboardType="number-pad" /></View></View><View style={styles.formNotice}><Ionicons name="information-circle" size={20} color={colors.primary} /><Text style={styles.formNoticeText}>All 16 home-progress checklist items will be attached automatically.</Text></View><Pressable style={({ pressed }) => [styles.saveButton, pressed && styles.buttonPressed, isSaving && styles.disabled]} disabled={isSaving} onPress={() => void createHome()}><Text style={styles.saveButtonText}>{isSaving ? 'Creating Home...' : 'Create Home & Checklist'}</Text></Pressable></ScrollView></View></View></Modal>
  </SafeAreaView>;
}

function FormField({ label, value, onChangeText, placeholder, keyboardType = 'default', maxLength }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; keyboardType?: 'default' | 'phone-pad' | 'number-pad'; maxLength?: number }) { const { colors } = useAppTheme(); const styles = useMemo(() => createStyles(colors), [colors]); return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput style={styles.input} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.textMuted} keyboardType={keyboardType} maxLength={maxLength} /></View>; }
function upsertChecklist(rows: Home['work_order_checklist'], itemId: number, isComplete: boolean) { const found = rows.some((row) => row.checklist_item_id === itemId); return found ? rows.map((row) => row.checklist_item_id === itemId ? { ...row, is_complete: isComplete } : row) : [...rows, { checklist_item_id: itemId, is_complete: isComplete, notes: null }]; }
function formatAddress(property: Home['properties']) { return property ? `${property.address_line_1}, ${property.city}, ${property.state} ${property.postal_code}` : 'Address unavailable'; }
function formatDeliveryAge(createdAt: string, currentTime: number) { const createdTime = new Date(createdAt).getTime(); const totalDays = Number.isFinite(createdTime) ? Math.max(0, Math.floor((currentTime - createdTime) / 86_400_000)) : 0; const weeks = Math.floor(totalDays / 7); const days = totalDays % 7; if (weeks === 0) return `${totalDays} ${totalDays === 1 ? 'Day' : 'Days'} Since Delivery`; const weekText = `${weeks} ${weeks === 1 ? 'Week' : 'Weeks'}`; return `${weekText}${days ? ` ${days} ${days === 1 ? 'Day' : 'Days'}` : ''} Since Delivery`; }

const createStyles = (colors: AppThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 38, backgroundColor: colors.background }, header: { marginHorizontal: -20, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 25, backgroundColor: colors.header, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, kicker: { color: YELLOW, fontSize: 9, fontWeight: '900', letterSpacing: 1.3, marginBottom: 7 }, title: { color: PAPER, fontSize: 28, fontWeight: '900' }, intro: { marginTop: 20, padding: 16, backgroundColor: colors.surfaceMuted, borderRadius: 9, flexDirection: 'row', alignItems: 'center', gap: 12 }, introCopy: { flex: 1 }, introTitle: { color: colors.text, fontSize: 14, fontWeight: '900' }, introText: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 4 }, newButton: { minHeight: 52, backgroundColor: '#243B5C', paddingHorizontal: 12, borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 6 }, newButtonText: { color: PAPER, fontSize: 11, fontWeight: '900' }, buttonPressed: { backgroundColor: '#0E1F35' }, count: { color: colors.textMuted, fontSize: 9, fontWeight: '900', letterSpacing: 1.1, marginTop: 24, marginBottom: 11 }, empty: { alignItems: 'center', paddingVertical: 70, paddingHorizontal: 30 }, emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '900', marginTop: 13 }, emptyText: { color: colors.textMuted, fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 6 }, homeCard: { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: 10, padding: 17, marginBottom: 16 }, deliveryAge: { color: colors.primary, fontSize: 11, fontWeight: '900', textAlign: 'center', letterSpacing: 0.4, marginBottom: 12 }, homeTypeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 11 }, homeType: { fontSize: 10, fontWeight: '900', letterSpacing: 0.9 }, homeNumber: { fontSize: 9, fontWeight: '800' }, homeHeader: { flexDirection: 'row', alignItems: 'flex-start' }, homeHeading: { flex: 1 }, homeName: { color: colors.text, fontSize: 19, fontWeight: '900' }, address: { color: colors.textMuted, fontSize: 11, lineHeight: 17, marginTop: 5 }, percent: { color: colors.text, fontSize: 19, fontWeight: '900', marginLeft: 12 }, progressTrack: { height: 7, borderRadius: 5, backgroundColor: colors.surfaceMuted, overflow: 'hidden', marginTop: 16 }, progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 5 }, progressMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, marginBottom: 12 }, progressText: { color: colors.textMuted, fontSize: 9, fontWeight: '800' }, detailsLink: { color: colors.primary, fontSize: 9, fontWeight: '900' }, checklistToggle: { minHeight: 48, paddingHorizontal: 12, borderWidth: 0.5, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surfaceMuted, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, checklistTogglePressed: { opacity: 0.7 }, checklistToggleTitle: { color: colors.text, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 }, checklistToggleMeta: { color: colors.textMuted, fontSize: 9, fontWeight: '700', marginTop: 3 }, checklist: { borderTopWidth: 0.5, borderTopColor: colors.border, marginTop: 8 }, checklistRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', borderTopWidth: 0.5, borderTopColor: colors.border }, firstChecklistRow: { borderTopWidth: 0 }, checkbox: { width: 23, height: 23, borderRadius: 6, borderWidth: 0.5, borderColor: colors.border, backgroundColor: colors.input, alignItems: 'center', justifyContent: 'center' }, checkboxChecked: { backgroundColor: colors.input, borderColor: colors.primary, borderWidth: 1.5 }, checklistLabel: { flex: 1, color: colors.text, fontSize: 12, fontWeight: '700', marginLeft: 11 }, checklistLabelChecked: { color: colors.textMuted, textDecorationLine: 'line-through' }, stepNumber: { color: colors.textMuted, fontSize: 9, fontWeight: '900' }, completeButton: { minHeight: 52, marginTop: 16, paddingHorizontal: 12, borderRadius: 6, backgroundColor: '#243B5C', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, completeButtonText: { color: PAPER, fontSize: 12, fontWeight: '900' }, modalBackdrop: { flex: 1, backgroundColor: 'rgba(2, 8, 18, 0.76)', alignItems: 'center', justifyContent: 'center', padding: 18 }, formModal: { width: '100%', maxWidth: 560, maxHeight: '90%', borderRadius: 16, backgroundColor: colors.surfaceElevated, borderWidth: 0.5, borderColor: colors.border, overflow: 'hidden' }, modalHeader: { minHeight: 76, paddingLeft: 20, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 0.5, borderBottomColor: colors.border }, modalKicker: { color: colors.primary, fontSize: 8, fontWeight: '900', letterSpacing: 1.2 }, modalTitle: { color: colors.text, fontSize: 20, fontWeight: '900', marginTop: 4 }, closeButton: { width: 62, minHeight: 76, marginLeft: 'auto', alignItems: 'center', justifyContent: 'center' }, formContent: { padding: 20, paddingBottom: 26 }, field: { marginBottom: 14 }, label: { color: colors.text, fontSize: 9, fontWeight: '900', letterSpacing: 0.7, marginBottom: 7 }, input: { minHeight: 48, borderWidth: 0.5, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.input, color: colors.text, paddingHorizontal: 13, fontSize: 13 }, dropdown: { minHeight: 48, borderWidth: 0.5, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.input, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, dropdownText: { color: colors.text, fontSize: 13, fontWeight: '800' }, dropdownMenu: { marginTop: 5, borderWidth: 0.5, borderColor: colors.border, borderRadius: 7, overflow: 'hidden', backgroundColor: colors.header }, dropdownOption: { minHeight: 46, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, dropdownOptionSelected: { backgroundColor: '#0E1F35' }, dropdownOptionText: { fontSize: 12, fontWeight: '900' }, formRow: { flexDirection: 'row', gap: 10 }, stateField: { width: 95 }, zipField: { flex: 1 }, formNotice: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: colors.surfaceMuted, borderRadius: 7, padding: 12, marginTop: 3 }, formNoticeText: { flex: 1, color: colors.textMuted, fontSize: 10, lineHeight: 15 }, saveButton: { minHeight: 52, backgroundColor: '#243B5C', paddingHorizontal: 12, borderRadius: 6, alignItems: 'center', justifyContent: 'center', marginTop: 18 }, saveButtonText: { color: PAPER, fontSize: 12, fontWeight: '900' }, disabled: { opacity: 0.5 },
  checklistMain: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center' },
  checklistCopy: { flex: 1, minHeight: 48, marginLeft: 11, justifyContent: 'center' },
  centeredChecklistLabel: { flex: 0 },
  commentPreview: { color: colors.textMuted, fontSize: 9, marginTop: 3 },
  commentButton: { minHeight: 34, paddingHorizontal: 9, marginLeft: 8, borderWidth: 0.5, borderColor: colors.primary, borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 5 },
  commentButtonText: { color: colors.primary, fontSize: 9, fontWeight: '900' },
  commentModal: { width: '100%', maxWidth: 500, padding: 20, borderRadius: 12, backgroundColor: colors.surfaceElevated, borderWidth: 0.5, borderColor: colors.border },
  commentCloseButton: { position: 'absolute', top: 10, right: 10, zIndex: 1, width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19 },
  commentInput: { minHeight: 120, marginTop: 16, padding: 12, borderWidth: 0.5, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.input, color: colors.text, fontSize: 13, textAlignVertical: 'top' },
  commentActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16 },
  cancelButton: { minHeight: 46, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  cancelButtonText: { color: colors.textMuted, fontSize: 12, fontWeight: '900' },
  saveCommentButton: { minHeight: 46, paddingHorizontal: 16, borderRadius: 6, backgroundColor: '#243B5C', alignItems: 'center', justifyContent: 'center' },
});
