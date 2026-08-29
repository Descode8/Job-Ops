import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type AppThemeColors, useAppTheme } from '@/contexts/theme-context';
import { AppText as Text } from '@/components/app-typography';
import { supabase } from '@/lib/supabase';
import { WORK_ORDER_STATUS_FONT, workOrderStatusColor } from '@/lib/work-order-status';
import { formatWorkOrderNumber } from '@/lib/work-order-number';
import { formatWorkOrderDeadline } from '@/lib/work-order-deadline';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { compareWorkOrderPriority, workOrderPriorityColor as getWorkOrderPriorityColor } from '@/lib/work-order-priority';
import { useWorkOrderRealtime } from '@/hooks/use-work-order-realtime';

const YELLOW = '#1D4ED8';
const PAPER = '#FFFFFF';
const FHA_ORANGE = '#FF8A00';
type Filter = 'active' | 'parts' | 'urgent' | 'due_today' | 'needs_update';

type WorkOrder = {
  id: string;
  work_order_number: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  deadline_at: string | null;
  created_at: string;
  work_order_files: { file_type: string }[];
  assignee: { id: string; full_name: string } | null;
  properties: { customer_name: string | null; address_line_1: string; city: string; state: string } | null;
};

export default function ServicesScreen() {
  const { colorScheme, themeMode, colors } = useAppTheme(); const styles = useMemo(() => createStyles(colors), [colors]);
  const workOrderPriorityColor = (priority: string) => getWorkOrderPriorityColor(priority, colorScheme);
  const router = useRouter();
  const { filter: requestedFilter } = useLocalSearchParams<{ filter?: string }>();
  const [jobs, setJobs] = useState<WorkOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentContractorId, setCurrentContractorId] = useState('');
  const [myWorkExpanded, setMyWorkExpanded] = useState(true);
  const [otherWorkExpanded, setOtherWorkExpanded] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [filter, setFilter] = useState<Filter>('active');

  useFocusEffect(useCallback(() => {
    if (isFilter(requestedFilter)) setFilter(requestedFilter);
  }, [requestedFilter]));

  const loadJobs = useCallback(async () => {
    setIsLoading(true);
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) { setJobs([]); setIsLoading(false); return; }
    const { data: contractor } = await supabase.from('contractors').select('id, is_admin').eq('auth_user_id', authData.user.id).eq('is_active', true).single();
    if (!contractor) { setJobs([]); setIsLoading(false); return; }
    setIsAdmin(Boolean(contractor.is_admin));
    setCurrentContractorId(contractor.id);
    let assignmentsQuery = supabase
      .from('work_order_assignments')
      .select('contractor_id, assignee:contractors!work_order_assignments_contractor_id_fkey(id, full_name), work_order:work_orders!inner(id, work_order_number, title, description, status, priority, deadline_at, created_at, kind, properties(customer_name, address_line_1, city, state), work_order_files(file_type))')
      .is('unassigned_at', null);
    if (!contractor.is_admin) assignmentsQuery = assignmentsQuery.eq('contractor_id', contractor.id);
    const { data: assignments } = await assignmentsQuery;
    const visibleJobs = (assignments ?? [])
      .map((assignment) => assignment.work_order ? { ...assignment.work_order, assignee: assignment.assignee } : null)
      .filter(Boolean) as unknown as WorkOrder[];
    visibleJobs.sort((a, b) => {
      if (contractor.is_admin) {
        const aIsMine = a.assignee?.id === contractor.id;
        const bIsMine = b.assignee?.id === contractor.id;
        if (aIsMine !== bIsMine) return aIsMine ? -1 : 1;
      }
      return compareWorkOrderPriority(a, b) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    setJobs(visibleJobs);
    setIsLoading(false);
  }, []);

  const { isRefreshing, onRefresh } = usePullToRefresh(loadJobs);
  useFocusEffect(useCallback(() => { void loadJobs(); }, [loadJobs]));
  useWorkOrderRealtime(() => { void loadJobs(); });

  const serviceJobs = useMemo(() => jobs.filter((job) => !job.work_order_number.startsWith('HOME-')), [jobs]);
  const activeJobs = useMemo(() => serviceJobs.filter((job) => job.status !== 'completed'), [serviceJobs]);
  const displayedJobs = isAdmin && showCompleted ? serviceJobs : activeJobs;
  const visibleJobs = useMemo(() => displayedJobs.filter((job) => filter === 'parts'
    ? needsParts(job)
    : filter === 'urgent' ? isUrgent(job)
    : filter === 'due_today' ? isDueToday(job)
    : filter === 'needs_update' ? job.status === 'not_started'
    : true), [displayedJobs, filter]);
  const contractorWorkOrders = visibleJobs;
  const myWorkOrders = visibleJobs.filter((job) => job.assignee?.id === currentContractorId);
  const otherWorkOrders = visibleJobs.filter((job) => job.assignee?.id !== currentContractorId);
  const renderJob = (job: WorkOrder) => <TouchableOpacity key={job.id} style={[styles.jobCard, { borderLeftWidth: 3, borderLeftColor: workOrderPriorityColor(job.priority) }]} activeOpacity={0.85} onPress={() => router.push({ pathname: '/work-order/[id]', params: { id: job.id } })}><View style={styles.cardHeader}><View style={[styles.statusDot, { backgroundColor: workOrderStatusColor(job.status) }]} /><Text style={[styles.status, { color: workOrderStatusColor(job.status), fontFamily: WORK_ORDER_STATUS_FONT }]}>{job.status.replaceAll('_', ' ').toUpperCase()}</Text><View style={styles.jobCode}><Text style={[styles.jobId, job.work_order_number.startsWith('HOME-') && { color: job.work_order_number.startsWith('HOME-FHA-') ? FHA_ORANGE : PAPER }]}>{formatWorkOrderNumber(job.work_order_number)}</Text>{!job.work_order_number.startsWith('HOME-') && <Text style={[styles.jobPriority, { color: workOrderPriorityColor(job.priority) }]}>{job.priority.toUpperCase()}</Text>}</View></View><Text style={styles.jobTitle}>{job.properties?.customer_name || job.title}</Text>{isAdmin && job.assignee && !job.work_order_number.startsWith('HOME-') && <View style={styles.assigneeRow}><Ionicons name="person" size={16} color={colors.primary} /><Text style={styles.assignee}>Assigned to {job.assignee.full_name}</Text></View>}{!isAdmin && <View style={styles.jobBrief}><Text style={styles.jobBriefLabel}>WORK TYPE</Text><Text style={styles.jobBriefText}>{job.description?.trim() || job.title}</Text></View>}<View style={styles.addressRow}><Ionicons name="location" size={17} color={colors.textMuted} /><Text style={styles.address}>{formatAddress(job.properties)}</Text></View><View style={styles.cardFooter}><Text style={styles.due}>{formatDeadline(job.deadline_at)}</Text><Ionicons name="arrow-forward" size={18} color={colors.primary} /></View></TouchableOpacity>;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={[styles.content, { flexGrow: 0 }]} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}>
        <View style={styles.header}><View><Text style={styles.kicker}>JOBOPS</Text><Text style={styles.title}>Assigned Work Orders</Text></View>{isAdmin && <TouchableOpacity style={[styles.filterButton, { backgroundColor: 'transparent', borderRadius: 0 }]} accessibilityLabel="Toggle complete work orders" onPress={() => setShowCompleted((value) => !value)}><Ionicons name="checkmark-done" size={28} color={themeMode === 'black' ? PAPER : YELLOW} /></TouchableOpacity>}</View>
        <View style={styles.summaryRow}><Summary value={activeJobs.length} label="ACTIVE" /><Summary value={activeJobs.filter(isUrgent).length} label="URGENT" /><Summary value={activeJobs.filter(needsParts).length} label="NEEDS PARTS" /></View>
        <View style={styles.filters}><FilterButton label="Active" selected={filter === 'active'} onPress={() => setFilter('active')} /><FilterButton label="Needs Parts" selected={filter === 'parts'} onPress={() => setFilter('parts')} /><FilterButton label="Urgent" selected={filter === 'urgent'} onPress={() => setFilter('urgent')} /></View>
        <Text style={styles.resultCount}>{isLoading ? 'LOADING...' : `${contractorWorkOrders.length} ${filterLabel(filter).toUpperCase()} WORK ORDER${contractorWorkOrders.length === 1 ? '' : 'S'}`}</Text>
        {isAdmin ? <>
          <ServiceGroup title="My Work Orders" count={myWorkOrders.length} expanded={myWorkExpanded} onPress={() => setMyWorkExpanded((value) => !value)}>{myWorkOrders.length ? myWorkOrders.map(renderJob) : <GroupEmpty message="No matching work orders assigned to you." />}</ServiceGroup>
          <ServiceGroup title="Other Work Orders" count={otherWorkOrders.length} expanded={otherWorkExpanded} onPress={() => setOtherWorkExpanded((value) => !value)}>{otherWorkOrders.length ? otherWorkOrders.map(renderJob) : <GroupEmpty message="No matching work orders assigned to others." />}</ServiceGroup>
        </> : <>
          {!isLoading && contractorWorkOrders.length === 0 && <EmptyState message="No matching assigned work orders." />}
          {contractorWorkOrders.map(renderJob)}
        </>}
      </ScrollView>
    </SafeAreaView>
  );
}

function EmptyState({ message }: { message: string }) { const { colors } = useAppTheme(); const styles = useMemo(() => createStyles(colors), [colors]); return <View style={styles.emptyState}><Ionicons name="briefcase" size={27} color={colors.primary} /><Text style={styles.emptyText}>{message}</Text></View>; }
function GroupEmpty({ message }: { message: string }) { const { colors } = useAppTheme(); const styles = useMemo(() => createStyles(colors), [colors]); return <Text style={styles.groupEmpty}>{message}</Text>; }
function ServiceGroup({ title, count, expanded, onPress, children }: { title: string; count: number; expanded: boolean; onPress: () => void; children: React.ReactNode }) { const { colors } = useAppTheme(); const styles = useMemo(() => createStyles(colors), [colors]); return <View style={styles.serviceGroup}><TouchableOpacity style={styles.groupHeader} onPress={onPress} accessibilityRole="button" accessibilityState={{ expanded }}><View><Text style={styles.groupTitle}>{title}</Text><Text style={styles.groupCount}>{count} WORK ORDER{count === 1 ? '' : 'S'}</Text></View><Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={22} color={colors.primary} /></TouchableOpacity>{expanded && <View style={styles.groupBody}>{children}</View>}</View>; }
function Summary({ value, label }: { value: number; label: string }) { const { colors } = useAppTheme(); const styles = useMemo(() => createStyles(colors), [colors]); return <View style={styles.summary}><Text style={styles.summaryValue}>{value}</Text><Text style={styles.summaryLabel}>{label}</Text></View>; }
function FilterButton({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) { const { colors } = useAppTheme(); const styles = useMemo(() => createStyles(colors), [colors]); return <TouchableOpacity style={[styles.serviceFilter, selected && styles.serviceFilterSelected]} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }}><Text style={[styles.serviceFilterText, selected && styles.serviceFilterTextSelected]}>{label}</Text></TouchableOpacity>; }
function needsParts(order: WorkOrder) { return order.work_order_files.some((file) => file.file_type === 'parts_photo'); }
function isUrgent(order: WorkOrder) { return order.priority === 'high' || order.priority === 'emergency'; }
function isDueToday(order: WorkOrder) { if (!order.deadline_at) return false; const deadline = new Date(order.deadline_at); const today = new Date(); return deadline.getFullYear() === today.getFullYear() && deadline.getMonth() === today.getMonth() && deadline.getDate() === today.getDate(); }
function isFilter(value: string | undefined): value is Filter { return value === 'active' || value === 'parts' || value === 'urgent' || value === 'due_today' || value === 'needs_update'; }
function filterLabel(filter: Filter) { return filter === 'due_today' ? 'due today' : filter === 'needs_update' ? 'needs update' : filter; }
function formatAddress(property: WorkOrder['properties']) { return property ? `${property.address_line_1}, ${property.city}, ${property.state}` : 'Address unavailable'; }
function formatDeadline(deadline: string | null) { return formatWorkOrderDeadline(deadline); }

const createStyles = (colors: AppThemeColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background }, content: { flexGrow: 1, backgroundColor: colors.background, paddingHorizontal: 20, paddingBottom: 28 }, header: { backgroundColor: colors.header, marginHorizontal: -20, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 25, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, kicker: { color: YELLOW, fontSize: 10, fontWeight: '900', letterSpacing: 1.4, marginBottom: 8 }, title: { color: PAPER, fontSize: 28, fontWeight: '900' }, filterButton: { height: 42, width: 42, backgroundColor: '#243B5C', borderRadius: 6, alignItems: 'center', justifyContent: 'center' }, resultCount: { color: colors.textMuted, fontSize: 10, fontWeight: '900', letterSpacing: 1.3, marginTop: 23, marginBottom: 12 }, jobCard: { backgroundColor: colors.surface, padding: 17, borderWidth: 0.5, borderColor: colors.border, marginBottom: 12, borderRadius: 6 }, cardHeader: { flexDirection: 'row', alignItems: 'center' }, statusDot: { height: 7, width: 7, borderRadius: 4, marginRight: 7 }, status: { color: colors.textMuted, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 }, jobCode: { marginLeft: 'auto', alignItems: 'flex-end' }, jobId: { color: colors.primary, fontSize: 10, fontWeight: '900' }, jobPriority: { fontSize: 8, fontWeight: '900', letterSpacing: 0.7, marginTop: 4 }, jobTitle: { color: colors.primary, fontSize: 18, fontWeight: '900', marginTop: 16 }, addressRow: { flexDirection: 'row', alignItems: 'center', marginTop: 11 }, address: { color: colors.textMuted, fontSize: 12, marginLeft: 7, flex: 1 }, cardFooter: { borderTopWidth: 0.5, borderTopColor: colors.border, marginTop: 17, paddingTop: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, due: { color: colors.text, fontSize: 11, fontWeight: '900' }, emptyState: { alignItems: 'center', paddingTop: 92 }, emptyText: { color: colors.textMuted, fontSize: 13, marginTop: 12 },
  assigneeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 11 },
  assignee: { color: colors.primary, fontSize: 11, fontWeight: '800', marginLeft: 7 },
  jobBrief: { backgroundColor: colors.surfaceMuted, borderRadius: 6, padding: 11, marginTop: 11 },
  jobBriefLabel: { color: colors.primary, fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  jobBriefText: { color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: '800', marginTop: 4 },
  summaryRow: { flexDirection: 'row', backgroundColor: colors.header, marginTop: 20, borderRadius: 7, overflow: 'hidden' },
  summary: { flex: 1, alignItems: 'center', paddingVertical: 15, borderRightWidth: 0.5, borderRightColor: colors.border },
  summaryValue: { color: PAPER, fontSize: 20, fontWeight: '900' },
  summaryLabel: { color: PAPER, fontSize: 8, fontWeight: '900', marginTop: 4 },
  filters: { flexDirection: 'row', gap: 7, marginTop: 18 },
  serviceFilter: { flex: 1, minHeight: 38, borderWidth: 0.5, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  serviceFilterSelected: { backgroundColor: '#0E1F35', borderColor: '#0E1F35' },
  serviceFilterText: { color: colors.textMuted, fontSize: 10, fontWeight: '900' },
  serviceFilterTextSelected: { color: PAPER },
  serviceGroup: { marginBottom: 12 },
  groupHeader: { minHeight: 62, borderWidth: 0.5, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surfaceMuted, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  groupTitle: { color: colors.text, fontSize: 14, fontWeight: '900' },
  groupCount: { color: colors.textMuted, fontSize: 8, fontWeight: '800', letterSpacing: 0.7, marginTop: 4 },
  groupBody: { paddingTop: 10 },
  groupEmpty: { color: colors.textMuted, fontSize: 11, textAlign: 'center', paddingVertical: 22 },
});
