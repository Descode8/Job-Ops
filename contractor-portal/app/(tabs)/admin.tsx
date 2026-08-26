import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type AppThemeColors, useAppTheme } from '@/contexts/theme-context';
import { AppText as Text, AppTextInput as TextInput } from '@/components/app-typography';
import { ThemedAlert as Alert } from '@/components/themed-alert';
import { supabase } from '@/lib/supabase';
import { WORK_ORDER_STATUS_FONT, workOrderStatusColor } from '@/lib/work-order-status';
import { formatWorkOrderNumber } from '@/lib/work-order-number';
import { formatWorkOrderDeadline } from '@/lib/work-order-deadline';
import { compareWorkOrderPriority, workOrderPriorityColor as getWorkOrderPriorityColor } from '@/lib/work-order-priority';
import { useWorkOrderRealtime } from '@/hooks/use-work-order-realtime';
import { formatPhoneNumber, phoneNumberDigits } from '@/lib/phone-number';

const BLUE = '#1D4ED8'; const PAPER = '#FFFFFF'; const YELLOW = '#1D4ED8';
type Row = { contractor_id: string; full_name: string; email: string | null; phone_number: string; is_active: boolean; is_admin: boolean; work_order_id: string | null; work_order_number: string | null; work_order_title: string | null; work_order_status: string | null };
type ContractorView = Omit<Row, 'work_order_id' | 'work_order_number' | 'work_order_title' | 'work_order_status'> & { jobs: Pick<Row, 'work_order_id' | 'work_order_number' | 'work_order_title' | 'work_order_status'>[] };
type AdminWorkOrder = { id: string; work_order_number: string; title: string; description: string; status: string; priority: string; deadline_at: string | null; created_at: string; properties: { customer_name: string | null; address_line_1: string; city: string; state: string } | null };
type CreatedCredentials = { username: string; phoneUsername: string; temporaryPassword: string };

async function functionErrorMessage(error: unknown, data?: { error?: string } | null) {
  if (data?.error) return data.error;
  if (error instanceof FunctionsHttpError) {
    const body = await error.context.json().catch(() => null);
    return body?.error ?? body?.message ?? error.message;
  }
  return error instanceof Error ? error.message : 'The contractor-management function failed.';
}

export default function AdminScreen() {
  const { colorScheme, themeMode, colors } = useAppTheme(); const styles = useMemo(() => createStyles(colors), [colors]);
  const workOrderPriorityColor = (priority: string) => getWorkOrderPriorityColor(priority, colorScheme);
  const detailStyles = useMemo(() => createAdminDetailStyles(colors), [colors]);
  const router = useRouter();
  const [contractors, setContractors] = useState<ContractorView[]>([]); const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [workOrders, setWorkOrders] = useState<AdminWorkOrder[]>([]);
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  const [currentAdminId, setCurrentAdminId] = useState('');
  const [adminsExpanded, setAdminsExpanded] = useState(false);
  const [contractorsExpanded, setContractorsExpanded] = useState(false);
  const [homeServicesExpanded, setHomeServicesExpanded] = useState(false);
  const [workOrdersExpanded, setWorkOrdersExpanded] = useState(false);
  const [fullName, setFullName] = useState(''); const [email, setEmail] = useState(''); const [phone, setPhone] = useState(''); const [saving, setSaving] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<CreatedCredentials | null>(null);
  const [selectedContractor, setSelectedContractor] = useState<ContractorView | null>(null);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<AdminWorkOrder | null>(null);
  const [expandedAssignments, setExpandedAssignments] = useState<Set<string>>(new Set());
  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const { data: profile } = auth.user ? await supabase.from('contractors').select('id, is_admin').eq('auth_user_id', auth.user.id).single() : { data: null };
    if (!profile?.is_admin) { setAuthorized(false); return; }
    setAuthorized(true);
    setCurrentAdminId(profile.id);
    const [{ data, error }, { data: orderRows, error: orderError }, { data: avatarRows }] = await Promise.all([
      supabase.rpc('get_admin_contractor_overview'),
      supabase.from('work_orders').select('id, work_order_number, title, description, status, priority, deadline_at, created_at, properties(customer_name, address_line_1, city, state)'),
      supabase.from('contractors').select('id, avatar_path').eq('is_active', true),
    ]);
    if (error) { Alert.alert('Could not load admin data', error.message); return; }
    if (orderError) { Alert.alert('Could not load work orders', orderError.message); return; }
    const grouped = new Map<string, ContractorView>();
    for (const row of (data ?? []) as Row[]) {
      if (!row.is_active) continue;
      const item = grouped.get(row.contractor_id) ?? { contractor_id: row.contractor_id, full_name: row.full_name, email: row.email, phone_number: row.phone_number, is_active: row.is_active, is_admin: row.is_admin, jobs: [] };
      if (row.work_order_id && row.work_order_status !== 'completed') item.jobs.push({ work_order_id: row.work_order_id, work_order_number: row.work_order_number, work_order_title: row.work_order_title, work_order_status: row.work_order_status });
      grouped.set(row.contractor_id, item);
    }
    setContractors([...grouped.values()]);
    setWorkOrders(((orderRows ?? []) as unknown as AdminWorkOrder[]).sort(compareWorkOrders));
    const signedAvatars = await Promise.all(((avatarRows ?? []) as { id: string; avatar_path: string | null }[]).filter((row) => row.avatar_path).map(async (row) => {
      const { data: signed } = await supabase.storage.from('profile-images').createSignedUrl(row.avatar_path!, 3600);
      return [row.id, signed?.signedUrl] as const;
    }));
    setAvatarUrls(Object.fromEntries(signedAvatars.filter((entry): entry is readonly [string, string] => Boolean(entry[1]))));
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useWorkOrderRealtime(() => { void load(); });

  const createContractor = async () => {
    if (!fullName.trim() || !email.trim() || !phone.trim()) { Alert.alert('Missing information', 'Name, email, and phone are required.'); return; }
    setSaving(true);
    const { data, error } = await supabase.functions.invoke('manage-contractors', { body: { action: 'create', fullName, email, phoneNumber: phone } });
    setSaving(false);
    if (error || data?.error) { Alert.alert('Could not create contractor', await functionErrorMessage(error, data)); return; }
    setCreatedCredentials({ username: data.username, phoneUsername: data.phoneUsername, temporaryPassword: data.temporaryPassword });
    setFullName(''); setEmail(''); setPhone(''); Alert.alert('Contractor created', 'Give the contractor the temporary login details shown on the Admin screen.'); await load();
  };
  const removeContractor = (item: ContractorView) => Alert.alert('Permanently delete contractor?', `${item.full_name} will be deleted from Authentication and the contractor database. Their assignment and offer links will be removed. This cannot be undone.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete permanently', style: 'destructive', onPress: async () => { const { data, error } = await supabase.functions.invoke('manage-contractors', { body: { action: 'delete', contractorId: item.contractor_id } }); if (error || data?.error) Alert.alert('Could not delete contractor', await functionErrorMessage(error, data)); else { Alert.alert('Contractor permanently deleted'); await load(); } } }]);

  const openContactLink = async (url: string, unavailableMessage: string) => {
    try {
      if (!(await Linking.canOpenURL(url))) { Alert.alert('Contact unavailable', unavailableMessage); return; }
      await Linking.openURL(url);
    } catch { Alert.alert('Contact unavailable', unavailableMessage); }
  };

  const currentAdmin = contractors.find((item) => item.contractor_id === currentAdminId);
  const otherAdmins = contractors.filter((item) => item.is_admin && item.contractor_id !== currentAdminId);
  const contractorUsers = contractors.filter((item) => !item.is_admin);
  const homeServices = workOrders.filter((order) => order.work_order_number.startsWith('HOME-') && order.status !== 'completed');
  const standardWorkOrders = workOrders
    .filter((order) => !order.work_order_number.startsWith('HOME-') && order.status !== 'completed')
    .sort((a, b) => compareWorkOrderPriority(a, b) || compareWorkOrders(a, b));
  const toggleAssignments = (contractorId: string) => setExpandedAssignments((current) => { const next = new Set(current); if (next.has(contractorId)) next.delete(contractorId); else next.add(contractorId); return next; });

  const renderPersonCard = (item: ContractorView, isCurrent = false) => {
    const activeJobs = item.jobs.filter((job) => (workOrders.find((order) => order.id === job.work_order_id)?.status ?? job.work_order_status)?.toLowerCase() !== 'completed');
    return (
    <View key={item.contractor_id} style={styles.card}>
      <View style={styles.cardTop}>
        {avatarUrls[item.contractor_id] ? <Image source={{ uri: avatarUrls[item.contractor_id] }} style={styles.listAvatar} contentFit="cover" /> : <View style={styles.listAvatarFallback}><Text style={styles.listAvatarText}>{initials(item.full_name)}</Text></View>}
        <View style={styles.person}><Text style={styles.name}>{item.full_name}</Text><Text style={styles.meta}>{item.email} · {formatPhoneNumber(item.phone_number)}</Text></View>
        <View style={styles.cardActions}>
          <TouchableOpacity style={styles.viewButton} onPress={() => setSelectedContractor(item)} accessibilityLabel={`View ${item.full_name}`}><Ionicons name="eye" size={20} color={colors.primary} /></TouchableOpacity>
          <Text style={item.is_admin ? styles.adminBadge : styles.activeBadge}>{item.is_admin ? 'ADMINISTRATOR' : 'ACTIVE'}</Text>
        </View>
      </View>
      {!item.is_admin && <TouchableOpacity style={detailStyles.assignmentToggle} onPress={() => toggleAssignments(item.contractor_id)} accessibilityRole="button" accessibilityState={{ expanded: expandedAssignments.has(item.contractor_id) }}><Text style={styles.assignmentCount}>{activeJobs.length} Assigned Work Order{activeJobs.length === 1 ? '' : 's'}</Text><Ionicons name={expandedAssignments.has(item.contractor_id) ? 'chevron-up' : 'chevron-down'} size={19} color={colors.primary} /></TouchableOpacity>}
      {!item.is_admin && expandedAssignments.has(item.contractor_id) && <View style={detailStyles.assignmentList}>{activeJobs.length ? [...activeJobs].sort((a, b) => compareWorkOrderPriority(workOrders.find((order) => order.id === a.work_order_id) ?? { priority: 'low' }, workOrders.find((order) => order.id === b.work_order_id) ?? { priority: 'low' })).map((job) => { const assignedOrder = workOrders.find((order) => order.id === job.work_order_id); return <TouchableOpacity key={job.work_order_id!} style={detailStyles.assignmentRow} onPress={() => setSelectedWorkOrder(assignedOrder ?? null)}><View style={detailStyles.assignmentCopy}><Text style={detailStyles.assignmentNumber}>{formatWorkOrderNumber(job.work_order_number)}</Text><Text style={detailStyles.assignmentTitle}>{job.work_order_title}</Text>{assignedOrder && <Text style={detailStyles.assignmentDeadline}>{formatWorkOrderDeadline(assignedOrder.deadline_at)}</Text>}</View><View style={{ alignItems: 'flex-end' }}><Text style={[styles.jobStatus, { color: workOrderStatusColor(job.work_order_status ?? ''), fontFamily: WORK_ORDER_STATUS_FONT }]}>{job.work_order_status?.replaceAll('_', ' ').toUpperCase()}</Text>{assignedOrder && !assignedOrder.work_order_number.startsWith('HOME-') && <Text style={[detailStyles.priority, { color: workOrderPriorityColor(assignedOrder.priority), marginTop: 4 }]}>{assignedOrder.priority.toUpperCase()}</Text>}</View><Ionicons name="chevron-forward" size={18} color={colors.primary} /></TouchableOpacity>; }) : <Text style={detailStyles.assignmentEmpty}>No Assigned Work Orders.</Text>}</View>}
      {!item.is_admin && <TouchableOpacity style={styles.removeButton} onPress={() => removeContractor(item)}><Text style={styles.removeText}>Delete contractor</Text></TouchableOpacity>}
    </View>
    );
  };

  const renderWorkOrder = (order: AdminWorkOrder) => (
    <TouchableOpacity key={order.id} style={[styles.workOrderCard, { borderLeftWidth: 3, borderLeftColor: workOrderPriorityColor(order.priority) }]} activeOpacity={0.85} onPress={() => router.push({ pathname: '/work-order/[id]', params: { id: order.id } })}>
      <View style={styles.workOrderTop}><Text style={styles.workOrderNumber}>{formatWorkOrderNumber(order.work_order_number)}</Text><View style={{ alignItems: 'flex-end' }}><Text style={[styles.jobStatus, { color: workOrderStatusColor(order.status), fontFamily: WORK_ORDER_STATUS_FONT }]}>{order.status.replaceAll('_', ' ').toUpperCase()}</Text>{!order.work_order_number.startsWith('HOME-') && <Text style={[detailStyles.priority, { color: workOrderPriorityColor(order.priority), marginTop: 4 }]}>{order.priority.toUpperCase()}</Text>}</View></View>
      <Text style={styles.workOrderTitle}>{order.properties?.customer_name || order.title}</Text>
      <Text style={styles.workOrderAddress}>{formatAddress(order.properties)}</Text>
      <Text style={styles.workOrderDeadline}>{formatWorkOrderDeadline(order.deadline_at)}</Text>
    </TouchableOpacity>
  );

  if (authorized === false) return <SafeAreaView style={styles.safe}><View style={styles.denied}><Ionicons name="lock-closed" size={32} color={BLUE} /><Text style={styles.deniedTitle}>Admin access required</Text></View></SafeAreaView>;
  return <SafeAreaView style={styles.safe} edges={['top']}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><View style={styles.header}><View><Text style={styles.kicker}>JOBOPS · ADMIN</Text><Text style={[styles.title, { fontWeight: '900' }]}>Contractor Management</Text></View><Ionicons name="shield-checkmark" size={28} color={themeMode === 'black' ? PAPER : YELLOW} /></View>
    <View style={styles.form}><Text style={styles.section}>CREATE CONTRACTOR</Text><TextInput style={styles.input} value={fullName} onChangeText={setFullName} placeholder="Full name" placeholderTextColor="#8A98A8" /><TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Email address" placeholderTextColor="#8A98A8" keyboardType="email-address" autoCapitalize="none" /><TextInput style={styles.input} value={formatPhoneNumber(phone)} onChangeText={(value) => setPhone(phoneNumberDigits(value))} placeholder="(555) 555-5555" placeholderTextColor="#8A98A8" keyboardType="phone-pad" maxLength={14} /><Pressable style={({ pressed }) => [styles.createButton, pressed && !saving && styles.createButtonPressed, saving && styles.disabledButton]} onPress={() => void createContractor()} disabled={saving}><Text style={styles.createText}>{saving ? 'Creating Contractor...' : 'Create Contractor'}</Text></Pressable><Text style={styles.help}>No email is sent. Give the contractor their username, temporary password, and app link personally.</Text>{createdCredentials && <View style={styles.credentials}><Text style={styles.credentialsTitle}>NEW CONTRACTOR LOGIN — SAVE THIS NOW</Text><Text style={styles.credentialLabel}>EMAIL USERNAME</Text><Text selectable style={styles.credentialValue}>{createdCredentials.username}</Text><Text style={styles.credentialLabel}>PHONE USERNAME</Text><Text selectable style={styles.credentialValue}>{formatPhoneNumber(createdCredentials.phoneUsername)}</Text><Text style={styles.credentialLabel}>TEMPORARY PASSWORD</Text><Text selectable style={styles.credentialValue}>{createdCredentials.temporaryPassword}</Text><Text style={styles.credentialsHelp}>The contractor will be required to replace this password after signing in.</Text><TouchableOpacity onPress={() => setCreatedCredentials(null)}><Text style={styles.dismissCredentials}>I saved these details</Text></TouchableOpacity></View>}</View>
    <Text style={styles.listSection}>CONTRACTORS & ASSIGNED WORK</Text>
    <Text style={styles.groupLabel}>ADMIN</Text>
    {currentAdmin ? renderPersonCard(currentAdmin, true) : <Text style={styles.noJobs}>Current admin profile unavailable.</Text>}

    <CollapsibleHeader label="ADMINS" count={otherAdmins.length} expanded={adminsExpanded} onPress={() => setAdminsExpanded((value) => !value)} />
    {adminsExpanded && (otherAdmins.length ? otherAdmins.map((item) => renderPersonCard(item)) : <Text style={styles.emptyGroup}>No other admins.</Text>)}

    <CollapsibleHeader label="CONTRACTORS" count={contractorUsers.length} expanded={contractorsExpanded} onPress={() => setContractorsExpanded((value) => !value)} />
    {contractorsExpanded && (contractorUsers.length ? contractorUsers.map((item) => renderPersonCard(item)) : <Text style={styles.emptyGroup}>No contractors.</Text>)}

    <CollapsibleHeader label="HOME SERVICES" count={homeServices.length} expanded={homeServicesExpanded} onPress={() => setHomeServicesExpanded((value) => !value)} />
    {homeServicesExpanded && (homeServices.length ? homeServices.map(renderWorkOrder) : <Text style={styles.emptyGroup}>No Home Progress records.</Text>)}

    <CollapsibleHeader label="WORK ORDERS" count={standardWorkOrders.length} expanded={workOrdersExpanded} onPress={() => setWorkOrdersExpanded((value) => !value)} />
    {workOrdersExpanded && (standardWorkOrders.length ? standardWorkOrders.map(renderWorkOrder) : <Text style={styles.emptyGroup}>No work orders.</Text>)}
    </ScrollView>
    <Modal visible={Boolean(selectedContractor)} transparent animationType="fade" onRequestClose={() => setSelectedContractor(null)}><Pressable style={styles.modalBackdrop} onPress={() => setSelectedContractor(null)}><Pressable style={styles.contractorModal} onPress={(event) => event.stopPropagation()}><View style={styles.modalHeader}>{selectedContractor && avatarUrls[selectedContractor.contractor_id] ? <Image source={{ uri: avatarUrls[selectedContractor.contractor_id] }} style={styles.modalAvatarImage} contentFit="cover" /> : <View style={styles.modalAvatar}><Text style={styles.modalAvatarText}>{initials(selectedContractor?.full_name)}</Text></View>}<View style={styles.modalHeading}><Text style={styles.modalName}>{selectedContractor?.full_name}</Text><Text style={styles.modalRole}>{selectedContractor?.is_admin ? 'ADMINISTRATOR' : 'CONTRACTOR'}</Text></View><TouchableOpacity style={styles.modalClose} onPress={() => setSelectedContractor(null)} accessibilityLabel="Close contractor details"><Ionicons name="close" size={23} color={colors.textMuted} /></TouchableOpacity></View><View style={styles.contactDetails}><ContactRow icon="mail-outline" label="EMAIL" value={selectedContractor?.email || 'Not provided'} /><ContactRow icon="call-outline" label="PHONE" value={formatPhoneNumber(selectedContractor?.phone_number) || 'Not provided'} /><ContactRow icon="briefcase-outline" label="ASSIGNED WORK" value={`${selectedContractor?.jobs.length ?? 0} work order${selectedContractor?.jobs.length === 1 ? '' : 's'}`} /></View><View style={styles.contactActions}><Pressable style={({ pressed }) => [styles.contactButton, pressed && styles.contactButtonPressed, !selectedContractor?.phone_number && styles.disabledButton]} disabled={!selectedContractor?.phone_number} onPress={() => selectedContractor?.phone_number && void openContactLink(`tel:${selectedContractor.phone_number.replace(/[^\d+]/g, '')}`, 'This device cannot place phone calls.')}><Ionicons name="call" size={19} color={PAPER} /><Text style={styles.contactButtonText}>Call</Text></Pressable><Pressable style={({ pressed }) => [styles.contactButton, pressed && styles.contactButtonPressed, !selectedContractor?.email && styles.disabledButton]} disabled={!selectedContractor?.email} onPress={() => selectedContractor?.email && void openContactLink(`mailto:${selectedContractor.email}`, 'No email application is available.')}><Ionicons name="mail" size={19} color={PAPER} /><Text style={styles.contactButtonText}>Email</Text></Pressable></View></Pressable></Pressable></Modal>
    <Modal visible={Boolean(selectedWorkOrder)} transparent animationType="fade" onRequestClose={() => setSelectedWorkOrder(null)} statusBarTranslucent>
      <Pressable style={styles.modalBackdrop} onPress={() => setSelectedWorkOrder(null)}>
        <Pressable style={detailStyles.workOrderModal} onPress={(event) => event.stopPropagation()}>
          <View style={detailStyles.modalTop}><View style={detailStyles.modalHeading}><Text style={detailStyles.modalNumber}>WORK ORDER {formatWorkOrderNumber(selectedWorkOrder?.work_order_number)}</Text><Text style={detailStyles.modalCustomer}>{selectedWorkOrder?.properties?.customer_name || selectedWorkOrder?.title}</Text></View><TouchableOpacity style={styles.modalClose} onPress={() => setSelectedWorkOrder(null)} accessibilityLabel="Close work order details"><Ionicons name="close" size={23} color={colors.textMuted} /></TouchableOpacity></View>
          {selectedWorkOrder && <ScrollView contentContainerStyle={detailStyles.modalContent}><View style={detailStyles.statusRow}><Text style={[detailStyles.modalStatus, { color: workOrderStatusColor(selectedWorkOrder.status), fontFamily: WORK_ORDER_STATUS_FONT }]}>{selectedWorkOrder.status.replaceAll('_', ' ').toUpperCase()}</Text>{!selectedWorkOrder.work_order_number.startsWith('HOME-') && <Text style={[detailStyles.priority, { color: workOrderPriorityColor(selectedWorkOrder.priority) }]}>{selectedWorkOrder.priority.toUpperCase()}</Text>}</View><Text style={detailStyles.detailLabel}>WORK DESCRIPTION</Text><Text style={detailStyles.description}>{selectedWorkOrder.description}</Text><Text style={detailStyles.detailLabel}>LOCATION</Text><Text style={detailStyles.address}>{formatAddress(selectedWorkOrder.properties)}</Text><Text style={detailStyles.detailLabel}>DEADLINE</Text><Text style={detailStyles.deadline}>{formatWorkOrderDeadline(selectedWorkOrder.deadline_at)}</Text><Pressable style={({ pressed }) => [detailStyles.viewFullButton, pressed && detailStyles.viewFullPressed]} onPress={() => { const workOrderId = selectedWorkOrder.id; setSelectedWorkOrder(null); router.push({ pathname: '/work-order/[id]', params: { id: workOrderId } }); }}><Text style={detailStyles.viewFullText}>View Full Work Order</Text><Ionicons name="arrow-forward" size={18} color={PAPER} /></Pressable></ScrollView>}
        </Pressable>
      </Pressable>
    </Modal>
  </SafeAreaView>;
}

function initials(name?: string) { return name?.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?'; }

function CollapsibleHeader({ label, count, expanded, onPress }: { label: string; count: number; expanded: boolean; onPress: () => void }) {
  const { colors } = useAppTheme(); const styles = useMemo(() => createStyles(colors), [colors]);
  return <TouchableOpacity style={styles.collapsibleHeader} onPress={onPress} accessibilityRole="button" accessibilityState={{ expanded }}><View><Text style={styles.collapsibleTitle}>{label}</Text><Text style={styles.collapsibleCount}>{count} {count === 1 ? 'ITEM' : 'ITEMS'}</Text></View><Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={21} color={colors.primary} /></TouchableOpacity>;
}

function compareWorkOrders(a: AdminWorkOrder, b: AdminWorkOrder) {
  const rank: Record<string, number> = { in_progress: 0, not_started: 1, completed: 2 };
  const statusDifference = (rank[a.status] ?? 1) - (rank[b.status] ?? 1);
  return statusDifference || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

function formatAddress(property: AdminWorkOrder['properties']) {
  return property ? `${property.address_line_1}, ${property.city}, ${property.state}` : 'Address unavailable';
}

function ContactRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) { const { colors } = useAppTheme(); const styles = useMemo(() => createStyles(colors), [colors]); const filledIcon = icon.replace('-outline', '') as keyof typeof Ionicons.glyphMap; return <View style={styles.contactRow}><View style={styles.contactIcon}><Ionicons name={filledIcon} size={19} color={colors.primary} /></View><View style={styles.contactCopy}><Text style={styles.contactLabel}>{label}</Text><Text style={styles.contactValue}>{value}</Text></View></View>; }

const createStyles = (colors: AppThemeColors) => StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, content: { flexGrow: 1, backgroundColor: colors.background, padding: 20, paddingBottom: 40 }, header: { backgroundColor: colors.header, marginHorizontal: -20, marginTop: -20, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 25, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, kicker: { color: YELLOW, fontSize: 10, fontWeight: '900', letterSpacing: 1.4, marginBottom: 8 }, title: { color: PAPER, fontSize: 27, fontWeight: '800' }, form: { backgroundColor: colors.surface, marginHorizontal: -20, paddingHorizontal: 20, paddingTop: 21, paddingBottom: 25, marginBottom: 24 }, section: { color: colors.text, fontSize: 10, fontWeight: '900', letterSpacing: 1.1, marginBottom: 8 }, listSection: { color: colors.text, fontSize: 10, fontWeight: '900', letterSpacing: 1.1, marginBottom: 10 }, input: { minHeight: 47, borderWidth: 0.5, borderColor: colors.border, backgroundColor: colors.input, borderRadius: 6, paddingHorizontal: 13, marginTop: 9, color: colors.text, fontSize: 13 }, createButton: { minHeight: 52, backgroundColor: '#243B5C', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 18, paddingHorizontal: 12, borderRadius: 6 }, createButtonPressed: { backgroundColor: '#0E1F35' }, disabledButton: { opacity: 0.45 }, createText: { color: PAPER, fontSize: 12, fontWeight: '900', marginLeft: 8 }, help: { color: colors.textMuted, fontSize: 10, lineHeight: 15, marginTop: 9 }, credentials: { backgroundColor: colors.surfaceMuted, borderWidth: 0.5, borderColor: colors.accent, borderRadius: 6, padding: 13, marginTop: 14 }, credentialsTitle: { color: colors.text, fontSize: 9, fontWeight: '900', marginBottom: 8 }, credentialLabel: { color: colors.textMuted, fontSize: 7, fontWeight: '900', marginTop: 7 }, credentialValue: { color: colors.text, fontSize: 13, fontWeight: '900', marginTop: 2 }, credentialsHelp: { color: colors.textMuted, fontSize: 9, lineHeight: 14, marginTop: 10 }, dismissCredentials: { color: colors.primary, fontSize: 10, fontWeight: '900', textAlign: 'center', marginTop: 12, textDecorationLine: 'underline' }, card: { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: 7, padding: 15, marginBottom: 11 }, inactive: { opacity: 0.55 }, cardTop: { flexDirection: 'row', alignItems: 'flex-start' }, person: { flex: 1 }, cardActions: { alignItems: 'center', marginLeft: 10 }, name: { color: colors.text, fontSize: 15, fontWeight: '900' }, meta: { color: colors.textMuted, fontSize: 10, marginTop: 4 }, viewButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted, marginBottom: 7 }, adminBadge: { color: PAPER, backgroundColor: YELLOW, fontSize: 8, fontWeight: '900', padding: 6 }, activeBadge: { color: PAPER, fontSize: 8, fontWeight: '900' }, job: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 0.5, borderTopColor: colors.border, paddingTop: 9, marginTop: 10 }, jobNumber: { color: colors.primary, fontSize: 9, fontWeight: '900' }, jobTitle: { flex: 1, color: colors.text, fontSize: 10, marginHorizontal: 8 }, jobStatus: { color: colors.textMuted, fontSize: 8, fontWeight: '900' }, noJobs: { color: colors.textMuted, fontSize: 10, marginTop: 12 }, removeButton: { borderTopWidth: 0.5, borderTopColor: colors.border, marginTop: 12, paddingTop: 11 }, removeText: { color: colors.danger, fontSize: 10, fontWeight: '900' }, denied: { flex: 1, alignItems: 'center', justifyContent: 'center' }, deniedTitle: { color: colors.text, fontSize: 16, fontWeight: '900', marginTop: 12 }, modalBackdrop: { flex: 1, backgroundColor: 'rgba(2, 8, 18, 0.72)', alignItems: 'center', justifyContent: 'center', padding: 20 }, contractorModal: { width: '100%', maxWidth: 470, backgroundColor: colors.surfaceElevated, borderWidth: 0.5, borderColor: colors.border, borderRadius: 18, padding: 20, shadowColor: '#000000', shadowOpacity: 0.28, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 12 }, modalHeader: { flexDirection: 'row', alignItems: 'center' }, modalAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, modalAvatarImage: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'transparent' }, modalAvatarText: { color: PAPER, fontSize: 17, fontWeight: '900' }, modalHeading: { flex: 1, marginLeft: 13 }, modalName: { color: colors.text, fontSize: 20, fontWeight: '900' }, modalRole: { color: colors.primary, fontSize: 9, fontWeight: '900', letterSpacing: 1, marginTop: 4 }, modalClose: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }, contactDetails: { marginTop: 22, borderTopWidth: 0.5, borderTopColor: colors.border }, contactRow: { minHeight: 65, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 0.5, borderBottomColor: colors.border }, contactIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' }, contactCopy: { flex: 1, marginLeft: 12 }, contactLabel: { color: colors.textMuted, fontSize: 8, fontWeight: '900', letterSpacing: 0.8 }, contactValue: { color: colors.text, fontSize: 13, fontWeight: '700', marginTop: 4 }, contactActions: { flexDirection: 'row', gap: 10, marginTop: 22 }, contactButton: { flex: 1, minHeight: 52, borderRadius: 6, backgroundColor: '#243B5C', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, contactButtonPressed: { backgroundColor: '#0E1F35' }, contactButtonText: { color: PAPER, fontSize: 12, fontWeight: '900' }, groupLabel: { color: colors.textMuted, fontSize: 8, fontWeight: '900', letterSpacing: 1, marginBottom: 8 }, collapsibleHeader: { minHeight: 58, borderWidth: 0.5, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surfaceMuted, paddingHorizontal: 15, marginTop: 12, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, collapsibleTitle: { color: colors.text, fontSize: 13, fontWeight: '900', letterSpacing: 0.8 }, collapsibleCount: { color: colors.textMuted, fontSize: 8, fontWeight: '800', marginTop: 3 }, emptyGroup: { color: colors.textMuted, fontSize: 11, textAlign: 'center', paddingVertical: 18 }, assignmentCount: { color: colors.textMuted, fontSize: 10, marginTop: 12 }, workOrderCard: { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: 7, padding: 15, marginBottom: 10 }, workOrderTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, workOrderNumber: { color: colors.primary, fontSize: 10, fontWeight: '900' }, workOrderTitle: { color: colors.text, fontSize: 15, fontWeight: '900', marginTop: 11 }, workOrderAddress: { color: colors.textMuted, fontSize: 10, marginTop: 6 }, workOrderDeadline: { color: colors.primary, fontSize: 10, fontWeight: '900', marginTop: 9 }, listAvatar: { width: 46, height: 46, borderRadius: 23, marginRight: 12 }, listAvatarFallback: { width: 46, height: 46, borderRadius: 23, marginRight: 12, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' }, listAvatarText: { color: colors.primary, fontSize: 13, fontWeight: '900' } });

const createAdminDetailStyles = (colors: AppThemeColors) => StyleSheet.create({
  assignmentToggle: { minHeight: 42, borderTopWidth: 0.5, borderTopColor: colors.border, marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  assignmentList: { borderWidth: 0.5, borderColor: colors.border, borderRadius: 7, overflow: 'hidden', marginBottom: 4 },
  assignmentRow: { minHeight: 62, paddingHorizontal: 11, paddingVertical: 9, borderTopWidth: 0.5, borderTopColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: colors.surfaceMuted },
  assignmentCopy: { flex: 1 },
  assignmentNumber: { color: colors.primary, fontSize: 9, fontWeight: '900' },
  assignmentTitle: { color: colors.text, fontSize: 11, fontWeight: '900', marginTop: 4 },
  assignmentDeadline: { color: colors.primary, fontSize: 9, fontWeight: '900', marginTop: 4 },
  assignmentEmpty: { color: colors.textMuted, fontSize: 10, textAlign: 'center', padding: 16 },
  workOrderModal: { width: '100%', maxWidth: 560, maxHeight: '86%', backgroundColor: colors.surfaceElevated, borderWidth: 0.5, borderColor: colors.border, borderRadius: 16, overflow: 'hidden' },
  modalTop: { minHeight: 78, paddingLeft: 18, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 0.5, borderBottomColor: colors.border },
  modalHeading: { flex: 1 },
  modalNumber: { color: colors.primary, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  modalCustomer: { color: colors.text, fontSize: 19, fontWeight: '900', marginTop: 5 },
  modalContent: { padding: 19, paddingBottom: 24 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  modalStatus: { fontSize: 10, fontWeight: '900' },
  priority: { color: colors.textMuted, fontSize: 9, fontWeight: '900' },
  detailLabel: { color: colors.primary, fontSize: 8, fontWeight: '900', letterSpacing: 0.9, marginTop: 12, marginBottom: 6 },
  description: { color: colors.text, fontSize: 13, lineHeight: 20 },
  address: { color: colors.text, fontSize: 12, lineHeight: 18 },
  deadline: { color: colors.text, fontSize: 12, fontWeight: '900' },
  viewFullButton: { minHeight: 52, backgroundColor: '#243B5C', borderRadius: 6, paddingHorizontal: 12, marginTop: 23, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  viewFullPressed: { backgroundColor: '#0E1F35' },
  viewFullText: { color: PAPER, fontSize: 12, fontWeight: '900' },
});
