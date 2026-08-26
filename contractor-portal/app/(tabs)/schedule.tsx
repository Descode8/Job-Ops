import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText as Text } from '@/components/app-typography';
import { type AppThemeColors, useAppTheme } from '@/contexts/theme-context';
import { useWorkOrderRealtime } from '@/hooks/use-work-order-realtime';
import { formatWorkOrderNumber } from '@/lib/work-order-number';
import { workOrderPriorityColor } from '@/lib/work-order-priority';
import { supabase } from '@/lib/supabase';

const PAPER = '#FFFFFF';
const BLUE = '#1D4ED8';
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

type CalendarWorkOrder = {
  id: string; work_order_number: string; title: string; status: string; priority: string; deadline_at: string | null;
  assignee: { id: string; full_name: string } | null;
  properties: { customer_name: string | null; address_line_1: string; city: string; state: string } | null;
};

export default function ScheduleScreen() {
  const router = useRouter();
  const { colorScheme, themeMode, colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const today = useMemo(() => startOfDay(new Date()), []);
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(today);
  const [jobs, setJobs] = useState<CalendarWorkOrder[]>([]);
  const [completedJobs, setCompletedJobs] = useState<CalendarWorkOrder[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadSchedule = useCallback(async () => {
    setIsLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setJobs([]); setCompletedJobs([]); setIsLoading(false); return; }
    const { data: contractor } = await supabase.from('contractors').select('id, is_admin').eq('auth_user_id', auth.user.id).eq('is_active', true).single();
    if (!contractor) { setJobs([]); setCompletedJobs([]); setIsLoading(false); return; }
    setIsAdmin(Boolean(contractor.is_admin));
    let query = supabase.from('work_order_assignments').select('contractor_id, assignee:contractors!work_order_assignments_contractor_id_fkey(id, full_name), work_order:work_orders!inner(id, work_order_number, title, status, priority, deadline_at, properties(customer_name, address_line_1, city, state))').is('unassigned_at', null);
    if (!contractor.is_admin) query = query.eq('contractor_id', contractor.id);
    const { data } = await query;
    const allAssigned = (data ?? []).map((row) => row.work_order ? { ...row.work_order, assignee: row.assignee } : null).filter(Boolean) as unknown as CalendarWorkOrder[];
    const assigned = allAssigned.filter((job) => job.status !== 'completed');
    assigned.sort((a, b) => deadlineTime(a.deadline_at) - deadlineTime(b.deadline_at));
    setJobs(assigned); setCompletedJobs(allAssigned.filter((job) => job.status === 'completed')); setIsLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { void loadSchedule(); }, [loadSchedule]));
  useWorkOrderRealtime(() => { void loadSchedule(); });

  const calendarDays = useMemo(() => buildCalendarDays(month), [month]);
  const jobsByDate = useMemo(() => jobs.reduce<Record<string, CalendarWorkOrder[]>>((groups, job) => {
    if (job.deadline_at) (groups[dateKey(new Date(job.deadline_at))] ??= []).push(job);
    return groups;
  }, {}), [jobs]);
  const selectedJobs = jobsByDate[dateKey(selectedDate)] ?? [];
  const completedToday = sameDay(selectedDate, today) ? completedJobs.filter((job) => job.deadline_at && sameDay(new Date(job.deadline_at), today)).length : 0;
  const unscheduledJobs = jobs.filter((job) => !job.deadline_at && job.status !== 'completed');

  const changeMonth = (amount: number) => { const next = new Date(month.getFullYear(), month.getMonth() + amount, 1); setMonth(next); setSelectedDate(next); };
  const openJob = (id: string) => router.push({ pathname: '/work-order/[id]', params: { id } });

  return <SafeAreaView style={styles.safe} edges={['top']}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <View style={styles.header}><View><Text style={styles.kicker}>JOBOPS</Text><Text style={styles.title}>Scheduled Calendar</Text><Text style={styles.subtitle}>{isAdmin ? 'ALL ASSIGNED WORK' : 'YOUR ASSIGNED WORK'}</Text></View><View style={styles.headerIcon}><Ionicons name="calendar" size={28} color={themeMode === 'black' ? PAPER : BLUE} /></View></View>
    <View style={styles.calendarCard}>
      <View style={styles.monthHeader}><Pressable style={({ pressed }) => [styles.monthButton, pressed && styles.pressed]} onPress={() => changeMonth(-1)} accessibilityLabel="Previous month"><Ionicons name="chevron-back" size={21} color={PAPER} /></Pressable><Text style={styles.monthTitle}>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text><Pressable style={({ pressed }) => [styles.monthButton, pressed && styles.pressed]} onPress={() => changeMonth(1)} accessibilityLabel="Next month"><Ionicons name="chevron-forward" size={21} color={PAPER} /></Pressable></View>
      <View style={styles.weekRow}>{WEEKDAYS.map((day) => <Text key={day} style={styles.weekday}>{day}</Text>)}</View>
      <View style={styles.daysGrid}>{calendarDays.map((date, index) => {
        if (!date) return <View key={`empty-${index}`} style={styles.dayCell} />;
        const key = dateKey(date); const dayJobs = jobsByDate[key] ?? []; const selected = sameDay(date, selectedDate); const isToday = sameDay(date, today);
        return <Pressable key={key} onPress={() => setSelectedDate(date)} style={({ pressed }) => [styles.dayCell, isToday && styles.dayToday, selected && styles.daySelected, pressed && styles.dayPressed]} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`${date.toLocaleDateString()}, ${dayJobs.length} work orders`}><Text style={[styles.dayNumber, isToday && styles.todayNumber, selected && styles.selectedNumber]}>{date.getDate()}</Text><View style={styles.dotRow}>{dayJobs.slice(0, 3).map((job) => <View key={job.id} style={[styles.jobDot, { backgroundColor: workOrderPriorityColor(job.priority, colorScheme) }]} />)}{dayJobs.length > 3 && <Text style={styles.moreDots}>+</Text>}</View></Pressable>;
      })}</View>
      <View style={styles.legend}>{(['emergency', 'high', 'medium', 'low'] as const).map((priority) => <View key={priority} style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: workOrderPriorityColor(priority, colorScheme) }]} /><Text style={styles.legendText}>{priority[0].toUpperCase() + priority.slice(1)}</Text></View>)}</View>
    </View>
    <View style={styles.agendaHeader}><View><Text style={styles.sectionEyebrow}>SELECTED DAY</Text><Text style={styles.sectionTitle}>{selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</Text></View><Text style={styles.count}>{selectedJobs.length}</Text></View>
    {isLoading ? <ActivityIndicator color={BLUE} style={styles.loading} /> : selectedJobs.length ? selectedJobs.map((job) => <JobCard key={job.id} job={job} isAdmin={isAdmin} colors={colors} colorScheme={colorScheme} onPress={() => openJob(job.id)} />) : <View style={styles.empty}><Ionicons name={completedToday ? 'checkmark-done' : 'calendar-clear'} size={25} color={completedToday ? colors.success : colors.textMuted} /><Text style={styles.emptyText}>{completedToday ? `${completedToday} order${completedToday === 1 ? '' : 's'} completed for today. No other work is due today.` : 'No work scheduled for this day.'}</Text></View>}
    {!isLoading && unscheduledJobs.length > 0 && <><View style={styles.unscheduledHeader}><Text style={styles.sectionTitle}>No Deadline Set</Text><Text style={styles.count}>{unscheduledJobs.length}</Text></View>{unscheduledJobs.map((job) => <JobCard key={`unscheduled-${job.id}`} job={job} isAdmin={isAdmin} colors={colors} colorScheme={colorScheme} onPress={() => openJob(job.id)} />)}</>}
  </ScrollView></SafeAreaView>;
}

function JobCard({ job, isAdmin, colors, colorScheme, onPress }: { job: CalendarWorkOrder; isAdmin: boolean; colors: AppThemeColors; colorScheme: 'light' | 'dark'; onPress: () => void }) {
  const styles = useMemo(() => createStyles(colors), [colors]); const priorityColor = workOrderPriorityColor(job.priority, colorScheme);
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.jobCard, { borderLeftWidth: 3, borderLeftColor: priorityColor }, pressed && styles.jobCardPressed]}><View style={styles.jobTop}><Text style={[styles.priority, { color: priorityColor }]}>{job.priority.toUpperCase()}</Text><Text style={styles.jobNumber}>{formatWorkOrderNumber(job.work_order_number)}</Text></View><Text style={styles.jobTitle}>{job.properties?.customer_name || job.title}</Text><View style={styles.jobMeta}><Ionicons name="location" size={15} color={colors.textMuted} /><Text style={styles.jobAddress}>{formatAddress(job.properties)}</Text></View>{isAdmin && job.assignee && <View style={styles.jobMeta}><Ionicons name="person" size={15} color={BLUE} /><Text style={styles.assignee}>Assigned to {job.assignee.full_name}</Text></View>}<View style={styles.jobFooter}><Text style={styles.status}>{job.status.replaceAll('_', ' ').toUpperCase()}</Text><Ionicons name="chevron-forward" size={18} color={BLUE} /></View></Pressable>;
}

function startOfDay(date: Date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
function startOfMonth(date: Date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
function sameDay(a: Date, b: Date) { return dateKey(a) === dateKey(b); }
function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function deadlineTime(value: string | null) { return value ? new Date(value).getTime() : Number.MAX_SAFE_INTEGER; }
function buildCalendarDays(month: Date) { const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate(); return [...Array(month.getDay()).fill(null), ...Array.from({ length: count }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1))] as (Date | null)[]; }
function formatAddress(property: CalendarWorkOrder['properties']) { return property ? `${property.address_line_1}, ${property.city}, ${property.state}` : 'Address unavailable'; }

const createStyles = (colors: AppThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 40, backgroundColor: colors.background }, header: { backgroundColor: colors.header, marginHorizontal: -20, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 23, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, kicker: { color: BLUE, fontSize: 10, fontWeight: '900', letterSpacing: 1.4, marginBottom: 7 }, title: { color: PAPER, fontSize: 27, fontWeight: '900' }, subtitle: { color: '#9FB7D5', fontSize: 8, fontWeight: '900', letterSpacing: 1, marginTop: 5 }, headerIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  calendarCard: { marginTop: 20, padding: 13, backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: 10 }, monthHeader: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, monthButton: { width: 42, height: 42, borderRadius: 6, backgroundColor: '#243B5C', alignItems: 'center', justifyContent: 'center' }, pressed: { backgroundColor: '#0E1F35' }, monthTitle: { color: colors.text, fontSize: 17, fontWeight: '900', textAlign: 'center' }, weekRow: { flexDirection: 'row', marginTop: 12, paddingBottom: 7, borderBottomWidth: 0.5, borderBottomColor: colors.border }, weekday: { width: `${100 / 7}%`, color: colors.textMuted, fontSize: 8, fontWeight: '900', textAlign: 'center' }, daysGrid: { flexDirection: 'row', flexWrap: 'wrap' }, dayCell: { width: `${100 / 7}%`, height: 52, paddingTop: 7, alignItems: 'center', borderRadius: 7 }, dayToday: { borderWidth: 1, borderColor: BLUE }, daySelected: { backgroundColor: '#243B5C' }, dayPressed: { backgroundColor: '#0E1F35' }, dayNumber: { color: colors.text, fontSize: 12, fontWeight: '800' }, todayNumber: { color: BLUE, fontWeight: '900' }, selectedNumber: { color: PAPER }, dotRow: { height: 10, flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 5 }, jobDot: { width: 5, height: 5, borderRadius: 3 }, moreDots: { color: PAPER, fontSize: 8, fontWeight: '900' }, legend: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 15, paddingTop: 13, borderTopWidth: 0.5, borderTopColor: colors.border }, legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 }, legendDot: { width: 8, height: 8, borderRadius: 4 }, legendText: { color: colors.textMuted, fontSize: 11, fontWeight: '800' },
  agendaHeader: { marginTop: 26, marginBottom: 12, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }, sectionEyebrow: { color: BLUE, fontSize: 8, fontWeight: '900', letterSpacing: 1.1, marginBottom: 4 }, sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '900' }, count: { minWidth: 29, height: 29, paddingHorizontal: 8, borderRadius: 6, backgroundColor: '#243B5C', color: PAPER, fontSize: 11, fontWeight: '900', textAlign: 'center', lineHeight: 29 }, loading: { marginVertical: 35 }, empty: { minHeight: 92, backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, emptyText: { color: colors.textMuted, fontSize: 11, marginTop: 8 },
  jobCard: { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderLeftWidth: 3, borderRadius: 8, padding: 15, marginBottom: 10 }, jobCardPressed: { backgroundColor: colors.surfaceMuted }, jobTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, priority: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8 }, jobNumber: { color: colors.textMuted, fontSize: 9, fontWeight: '900' }, jobTitle: { color: colors.text, fontSize: 16, fontWeight: '900', marginTop: 10 }, jobMeta: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 8 }, jobAddress: { flex: 1, color: colors.textMuted, fontSize: 10 }, assignee: { color: colors.primary, fontSize: 10, fontWeight: '800' }, jobFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: colors.border, marginTop: 12, paddingTop: 10 }, status: { color: colors.textMuted, fontSize: 8, fontWeight: '900', letterSpacing: 0.6 }, unscheduledHeader: { marginTop: 28, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
