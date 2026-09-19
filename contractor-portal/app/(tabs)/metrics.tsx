import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText as Text } from '@/components/app-typography';
import { type AppThemeColors, useAppTheme } from '@/contexts/theme-context';
import { useWorkOrderRealtime } from '@/hooks/use-work-order-realtime';
import { formatWorkOrderNumber } from '@/lib/work-order-number';
import { supabase } from '@/lib/supabase';

type Period = 'Today' | 'This Week' | 'This Month';
type WorkView = 'All Work' | 'Homes' | 'Work Orders';
type Priority = 'All' | 'Emergency' | 'High' | 'Medium' | 'Low';
type CompletedOrder = { id: string; work_order_number: string; title: string; priority: string; created_at: string; completed_at: string; deadline_at: string | null; invoice_amount: number | null; properties: { customer_name: string | null } | null };
const periods: Period[] = ['Today', 'This Week', 'This Month'];
const views: WorkView[] = ['All Work', 'Homes', 'Work Orders'];
const priorities: Priority[] = ['All', 'Emergency', 'High', 'Medium', 'Low'];
const SERIES = [
  { label: 'Work Orders', color: '#66A9FF', matches: (number: string) => !number.startsWith('HOME-') },
  { label: 'FHA Homes', color: '#FF9B51', matches: (number: string) => number.startsWith('HOME-FHA-') },
  { label: 'Non-FHA Homes', color: '#71D6BD', matches: (number: string) => number.startsWith('HOME-') && !number.startsWith('HOME-FHA-') },
] as const;

function periodStart(period: Period) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  if (period === 'This Week') date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  if (period === 'This Month') date.setDate(1);
  return date;
}

function chartBuckets(period: Period) {
  const start = periodStart(period);
  if (period === 'Today') return Array.from({ length: 6 }, (_, index) => ({
    start: new Date(start.getFullYear(), start.getMonth(), start.getDate(), index * 4).getTime(),
    end: new Date(start.getFullYear(), start.getMonth(), start.getDate(), (index + 1) * 4).getTime(),
    label: `${index * 4 === 0 ? 12 : index * 4 > 12 ? index * 4 - 12 : index * 4}${index * 4 < 12 ? 'A' : 'P'}`,
  }));
  if (period === 'This Week') return Array.from({ length: 7 }, (_, index) => ({
    start: new Date(start.getFullYear(), start.getMonth(), start.getDate() + index).getTime(),
    end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + index + 1).getTime(),
    label: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'][index],
  }));
  const days = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  return Array.from({ length: Math.ceil(days / 5) }, (_, index) => ({
    start: new Date(start.getFullYear(), start.getMonth(), index * 5 + 1).getTime(),
    end: new Date(start.getFullYear(), start.getMonth(), Math.min((index + 1) * 5 + 1, days + 1)).getTime(),
    label: `${index * 5 + 1}–${Math.min((index + 1) * 5, days)}`,
  }));
}

function MetricsChart({ period, orders, view }: { period: Period; orders: CompletedOrder[]; view: WorkView }) {
  const [plotWidth, setPlotWidth] = useState(0);
  const buckets = chartBuckets(period);
  const visibleSeries = SERIES.filter((series) => view === 'All Work' || (view === 'Homes' ? series.label !== 'Work Orders' : series.label === 'Work Orders'));
  const values = visibleSeries.map((series) => buckets.map((bucket) => orders.filter((order) => {
    const time = new Date(order.completed_at).getTime();
    return time >= bucket.start && time < bucket.end && series.matches(order.work_order_number);
  }).length));
  const totals = buckets.map((_, index) => values.reduce((sum, series) => sum + series[index], 0));
  const maxValue = Math.max(1, ...totals);
  return <View style={chartStyles.panel}>
    <Text style={chartStyles.title}>WORK COMPLETED</Text>
    <Text style={chartStyles.subtitle}>Number completed in each interval</Text>
    <View style={chartStyles.legend}>{visibleSeries.map((series) => <View key={series.label} style={chartStyles.legendItem}><View style={[chartStyles.legendDot, { backgroundColor: series.color }]} /><Text style={chartStyles.legendText}>{series.label}</Text></View>)}</View>
    {view === 'All Work' ? <View style={chartStyles.linePlot} onLayout={(event) => setPlotWidth(event.nativeEvent.layout.width)}>
      {[0, 0.5, 1].map((fraction) => <View key={fraction} style={[chartStyles.gridLine, { top: 16 + fraction * 145 }]} />)}
      {plotWidth > 0 && values.map((points, seriesIndex) => points.map((value, index) => {
        const x = 18 + index * (plotWidth - 36) / Math.max(1, buckets.length - 1);
        const y = 16 + (1 - value / Math.max(1, ...values.flat())) * 145;
        const nextValue = points[index + 1];
        const nextX = 18 + (index + 1) * (plotWidth - 36) / Math.max(1, buckets.length - 1);
        const nextY = nextValue == null ? y : 16 + (1 - nextValue / Math.max(1, ...values.flat())) * 145;
        const dx = nextX - x; const dy = nextY - y;
        const length = Math.hypot(dx, dy);
        return <View key={`${seriesIndex}-${index}`}>
          {nextValue != null && <View style={{ position: 'absolute', left: x, top: y, width: length, height: 2.5, backgroundColor: visibleSeries[seriesIndex].color, transform: [{ translateX: (dx - length) / 2 }, { translateY: dy / 2 - 1.25 }, { rotate: `${Math.atan2(dy, dx)}rad` }] }} />}
          <View style={{ position: 'absolute', left: x - 4, top: y - 4, width: 8, height: 8, borderRadius: 4, backgroundColor: visibleSeries[seriesIndex].color, borderWidth: 1, borderColor: '#172A4C' }} />
        </View>;
      }))}
    </View> : <View style={chartStyles.plot}>
      {[0, 0.5, 1].map((fraction) => <View key={fraction} style={[chartStyles.gridLine, { bottom: `${fraction * 100}%` }]} />)}
      {buckets.map((bucket, index) => <View key={bucket.start} style={chartStyles.column}><Text style={chartStyles.value}>{totals[index] || ''}</Text><View style={chartStyles.barTrack}>{visibleSeries.map((series, seriesIndex) => <View key={series.label} style={{ height: `${values[seriesIndex][index] / maxValue * 100}%`, backgroundColor: series.color, width: '100%' }} />)}</View></View>)}
    </View>}
    <View style={chartStyles.labels}>{buckets.map((bucket) => <Text key={bucket.start} style={chartStyles.label} numberOfLines={1}>{bucket.label}</Text>)}</View>
    <Text style={chartStyles.footnote}>{period === 'Today' ? '4-hour intervals' : period === 'This Week' ? 'Daily totals, Monday through Sunday' : '5-day intervals'} · local time</Text>
  </View>;
}

const chartStyles = StyleSheet.create({
  panel: { backgroundColor: '#172A4C', borderRadius: 17, padding: 17, marginBottom: 15, overflow: 'hidden' },
  title: { color: '#FFFFFF', fontSize: 12, fontWeight: '900', letterSpacing: 0.8 }, subtitle: { color: '#B7C9E8', fontSize: 10, marginTop: 4 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 15, marginBottom: 12 }, legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 }, legendDot: { width: 8, height: 8, borderRadius: 4 }, legendText: { color: '#DCE8FA', fontSize: 10, fontWeight: '700' },
  plot: { height: 185, position: 'relative', flexDirection: 'row', alignItems: 'flex-end', marginTop: 12 }, linePlot: { height: 185, position: 'relative', marginTop: 12 }, gridLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(230,240,255,0.18)' }, column: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center' }, value: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', height: 17 }, barTrack: { width: '65%', maxWidth: 35, height: 155, justifyContent: 'flex-end', overflow: 'hidden', borderTopLeftRadius: 5, borderTopRightRadius: 5 },
  labels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }, label: { flex: 1, textAlign: 'center', color: '#DCE8FA', fontSize: 9, fontWeight: '800' }, footnote: { color: '#9CB3D4', fontSize: 9, marginTop: 11 },
});

export default function MetricsScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const [period, setPeriod] = useState<Period>('Today');
  const [view, setView] = useState<WorkView>('All Work');
  const [priority, setPriority] = useState<Priority>('All');
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [createdCount, setCreatedCount] = useState(0);
  const [openCount, setOpenCount] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);
  const [completed, setCompleted] = useState<CompletedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(null);
    const { data: auth } = await supabase.auth.getUser();
    const { data: profile } = auth.user
      ? await supabase.from('contractors').select('is_admin').eq('auth_user_id', auth.user.id).eq('is_active', true).single()
      : { data: null };
    if (currentRequest !== requestId.current) return;
    if (!profile?.is_admin) { setAuthorized(false); setLoading(false); return; }
    setAuthorized(true);
    const from = periodStart(period).toISOString();
    const countOrders = (kind: 'created' | 'open' | 'overdue') => {
      let query = supabase.from('work_orders').select('id', { count: 'exact', head: true });
      if (kind === 'created') query = query.gte('created_at', from);
      else query = query.neq('status', 'completed');
      if (kind === 'overdue') query = query.lt('deadline_at', new Date().toISOString());
      if (view === 'Homes') query = query.like('work_order_number', 'HOME-%');
      else if (view === 'Work Orders') {
        query = query.not('work_order_number', 'like', 'HOME-%');
        if (priority !== 'All') query = query.eq('priority', priority.toLowerCase());
      }
      return query;
    };
    const [{ count, error: countError }, { count: activeCount, error: activeError }, { count: lateCount, error: lateError }, completedResult] = await Promise.all([
      countOrders('created'),
      countOrders('open'),
      countOrders('overdue'),
      supabase.from('work_orders').select('id, work_order_number, title, priority, created_at, completed_at, deadline_at, invoice_amount, properties(customer_name)')
        .eq('status', 'completed').gte('completed_at', from).order('completed_at', { ascending: false }).range(0, 999),
    ]);
    if (currentRequest !== requestId.current) return;
    let rows = (completedResult.data ?? []) as unknown as CompletedOrder[];
    let pageError = completedResult.error;
    while (!pageError && rows.length > 0 && rows.length % 1000 === 0) {
      const next = await supabase.from('work_orders').select('id, work_order_number, title, priority, created_at, completed_at, deadline_at, invoice_amount, properties(customer_name)')
        .eq('status', 'completed').gte('completed_at', from).order('completed_at', { ascending: false }).range(rows.length, rows.length + 999);
      if (currentRequest !== requestId.current) return;
      pageError = next.error;
      rows = rows.concat((next.data ?? []) as unknown as CompletedOrder[]);
      if ((next.data ?? []).length < 1000) break;
    }
    if (countError || activeError || lateError || pageError) {
      setError(countError?.message ?? activeError?.message ?? lateError?.message ?? pageError?.message ?? 'Could not load metrics.');
    } else {
      setCreatedCount(count ?? 0);
      setOpenCount(activeCount ?? 0);
      setOverdueCount(lateCount ?? 0);
      setCompleted(rows);
    }
    setLoading(false);
  }, [period, view, priority]);

  useFocusEffect(useCallback(() => {
    setPeriod('Today');
    setView('All Work');
    setPriority('All');
  }, []));
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useWorkOrderRealtime(() => { void load(); });

  const visibleCompleted = completed.filter((order) => {
    const isHome = order.work_order_number.startsWith('HOME-');
    return (view === 'All Work' || (view === 'Homes' ? isHome : !isHome)) && (view !== 'Work Orders' || priority === 'All' || order.priority === priority.toLowerCase());
  });
  const total = visibleCompleted.reduce((sum, order) => sum + (Number(order.invoice_amount) || 0), 0);
  const priced = visibleCompleted.filter((order) => order.invoice_amount != null).length;
  const standardCompleted = visibleCompleted.filter((order) => !order.work_order_number.startsWith('HOME-')).length;
  const withDeadline = visibleCompleted.filter((order) => order.deadline_at);
  const onTime = withDeadline.filter((order) => new Date(order.completed_at).getTime() <= new Date(order.deadline_at!).getTime()).length;
  const turnaroundHours = visibleCompleted.length ? visibleCompleted.reduce((sum, order) => sum + Math.max(0, new Date(order.completed_at).getTime() - new Date(order.created_at).getTime()), 0) / visibleCompleted.length / 3600000 : null;
  const turnaroundLabel = turnaroundHours == null ? '—' : turnaroundHours < 24 ? `${Math.round(turnaroundHours)}h` : `${(turnaroundHours / 24).toFixed(1)}d`;
  const rangeLabel = period === 'Today' ? 'TODAY SO FAR' : period === 'This Week' ? 'MONDAY TO TODAY' : 'MONTH TO DATE';

  if (authorized === false) return <SafeAreaView style={styles.safe}><View style={styles.center}><Ionicons name="lock-closed" size={32} color={colors.primary} /><Text style={styles.centerText}>Admin access required</Text></View></SafeAreaView>;
  return <SafeAreaView style={styles.safe} edges={['top']}>
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading && authorized === true} onRefresh={() => void load()} tintColor={colors.primary} />}>
      <View style={styles.header}><Text style={styles.kicker}>JOBOPS · ADMIN</Text><Text style={styles.title}>Metrics</Text><Text style={styles.subtitle}>A clear view of work getting done.</Text></View>
      <Text style={styles.filterLabel}>TIME-FRAME</Text>
      <View style={styles.periods}>{periods.map((item) => <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: period === item }} onPress={() => setPeriod(item)} style={[styles.periodButton, period === item && styles.periodActive]}><Text style={[styles.periodText, period === item && styles.periodTextActive]}>{item}</Text></Pressable>)}</View>
      <Text style={styles.filterLabel}>VIEW</Text>
      <View style={styles.periods}>{views.map((item) => <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: view === item }} onPress={() => setView(item)} style={[styles.periodButton, view === item && styles.periodActive]}><Text style={[styles.periodText, view === item && styles.periodTextActive]}>{item}</Text></Pressable>)}</View>
      {view === 'Work Orders' && <><Text style={styles.filterLabel}>WORK ORDER PRIORITY</Text><ScrollView horizontal style={styles.priorityScroller} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.priorityFilters}>{priorities.map((item) => <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: priority === item }} onPress={() => setPriority(item)} style={[styles.priorityChip, priority === item && styles.priorityChipActive]}><Text style={[styles.priorityText, priority === item && styles.priorityTextActive]}>{item}</Text></Pressable>)}</ScrollView></>}
      <Text style={styles.range}>{rangeLabel}</Text>
      {loading ? <ActivityIndicator style={styles.spinner} color={colors.primary} /> : error ? <View style={styles.message}><Text style={styles.messageText}>{error}</Text><Pressable onPress={() => void load()}><Text style={styles.retry}>Try again</Text></Pressable></View> : <>
        <MetricsChart period={period} orders={visibleCompleted} view={view} />
        <View style={styles.hero}><View style={styles.heroRow}><Text style={styles.heroNumber}>{visibleCompleted.length}</Text><Text style={styles.heroTitle}>Completed Work Orders</Text></View><Text style={styles.heroCaption}>{standardCompleted} standard · {visibleCompleted.length - standardCompleted} home service</Text></View>
        <View style={styles.cards}><View style={styles.card}><Ionicons name="add-circle-outline" size={22} color={colors.primary} /><Text style={styles.cardNumber}>{createdCount}</Text><Text style={styles.cardLabel}>Created</Text></View><View style={styles.card}><Ionicons name="cash-outline" size={22} color={colors.success} /><Text style={styles.cardNumber}>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(total)}</Text><Text style={styles.cardLabel}>Invoiced on completed work</Text></View></View>
        <Text style={styles.note}>Invoice total includes {priced} of {visibleCompleted.length} completed work orders with a price.</Text>
        <View style={styles.cards}><View style={styles.card}><Ionicons name="time-outline" size={22} color={colors.primary} /><Text style={styles.cardNumber}>{turnaroundLabel}</Text><Text style={styles.cardLabel}>Average time to finish</Text></View><View style={styles.card}><Ionicons name="flag-outline" size={22} color={colors.success} /><Text style={styles.cardNumber}>{withDeadline.length ? `${Math.round(onTime / withDeadline.length * 100)}%` : '—'}</Text><Text style={styles.cardLabel}>Finished by deadline</Text></View></View>
        <Text style={styles.note}>Measured from creation to completion. Deadline rate covers {withDeadline.length} completed work orders with a deadline.</Text>
        <View style={styles.backlog}><View><Text style={styles.backlogTitle}>OPEN WORK RIGHT NOW</Text><Text style={styles.backlogMeta}>{overdueCount} past deadline</Text></View><Text style={styles.backlogNumber}>{openCount}</Text></View>
        <View style={styles.listHeading}><Text style={styles.section}>RECENT COMPLETIONS</Text><Text style={styles.sectionCount}>{visibleCompleted.length}</Text></View>
        {visibleCompleted.length ? visibleCompleted.slice(0, 12).map((order) => <Pressable key={order.id} style={styles.order} onPress={() => router.push({ pathname: '/work-order/[id]', params: { id: order.id } })}><View style={styles.orderIcon}><Ionicons name="checkmark" size={18} color={colors.success} /></View><View style={styles.orderBody}><Text style={styles.orderTitle} numberOfLines={1}>{order.properties?.customer_name || order.title}</Text><Text style={styles.orderMeta}>{formatWorkOrderNumber(order.work_order_number)} · {new Date(order.completed_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</Text></View><Ionicons name="chevron-forward" size={17} color={colors.textMuted} /></Pressable>) : <Text style={styles.empty}>No work orders completed in this period.</Text>}
      </>}
    </ScrollView>
  </SafeAreaView>;
}

const createStyles = (colors: AppThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { flexGrow: 1, padding: 20, paddingBottom: 48 },
  header: { backgroundColor: colors.header, marginHorizontal: -20, marginTop: -20, padding: 20, paddingTop: 24, paddingBottom: 28 },
  kicker: { color: '#5B8BFF', fontSize: 10, fontWeight: '900', letterSpacing: 1.3 }, title: { color: '#FFFFFF', fontSize: 30, fontWeight: '900', marginTop: 8 }, subtitle: { color: '#B8C7DC', fontSize: 13, marginTop: 5 },
  periods: { flexDirection: 'row', gap: 6, padding: 5, backgroundColor: colors.surfaceMuted, borderRadius: 13, marginTop: 22 }, periodButton: { flex: 1, paddingVertical: 11, alignItems: 'center', borderRadius: 9 }, periodActive: { backgroundColor: colors.primary }, periodText: { color: colors.textMuted, fontSize: 12, fontWeight: '800' }, periodTextActive: { color: colors.background === '#000000' ? '#000000' : '#FFFFFF' },
  filterLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '900', letterSpacing: 1, marginTop: 18, marginBottom: -13 }, priorityScroller: { height: 56, flexGrow: 0, marginTop: 18 }, priorityFilters: { gap: 8, alignItems: 'center' }, priorityChip: { height: 36, justifyContent: 'center', backgroundColor: colors.surfaceMuted, borderColor: colors.border, borderWidth: 0.5, borderRadius: 20, paddingHorizontal: 15 }, priorityChipActive: { backgroundColor: colors.primary, borderColor: colors.primary }, priorityText: { color: colors.textMuted, fontSize: 11, fontWeight: '800' }, priorityTextActive: { color: colors.background === '#000000' ? '#000000' : '#FFFFFF' },
  range: { color: colors.textMuted, fontSize: 10, fontWeight: '900', letterSpacing: 1.2, marginTop: 25, marginBottom: 11 },
  hero: { borderRadius: 18, backgroundColor: colors.header, padding: 22 }, heroRow: { flexDirection: 'row', alignItems: 'center', gap: 16 }, heroNumber: { color: '#FFFFFF', fontSize: 43, fontWeight: '900' }, heroTitle: { flex: 1, color: '#FFFFFF', fontSize: 15, fontWeight: '800' }, heroCaption: { color: '#B8C7DC', fontSize: 11, marginTop: 9 },
  cards: { flexDirection: 'row', gap: 10, marginTop: 10 }, card: { flex: 1, minHeight: 121, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 0.5, borderRadius: 14, padding: 16 }, cardNumber: { color: colors.text, fontSize: 23, fontWeight: '900', marginTop: 9 }, cardLabel: { color: colors.textMuted, fontSize: 11, marginTop: 3 }, note: { color: colors.textMuted, fontSize: 10, lineHeight: 15, marginTop: 10 },
  backlog: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surfaceMuted, borderRadius: 14, padding: 18, marginTop: 15 }, backlogTitle: { color: colors.text, fontSize: 11, fontWeight: '900', letterSpacing: 0.8 }, backlogMeta: { color: colors.textMuted, fontSize: 11, marginTop: 5 }, backlogNumber: { color: colors.text, fontSize: 29, fontWeight: '900' },
  listHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 30, marginBottom: 10 }, section: { color: colors.text, fontSize: 11, fontWeight: '900', letterSpacing: 1 }, sectionCount: { color: colors.textMuted, fontSize: 11, fontWeight: '800' },
  order: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 0.5, borderRadius: 12, padding: 13, marginBottom: 8 }, orderIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center', marginRight: 11 }, orderBody: { flex: 1 }, orderTitle: { color: colors.text, fontSize: 13, fontWeight: '800' }, orderMeta: { color: colors.textMuted, fontSize: 10, marginTop: 4 }, empty: { color: colors.textMuted, fontSize: 12, textAlign: 'center', paddingVertical: 24 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' }, centerText: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 12 }, spinner: { marginTop: 50 }, message: { backgroundColor: colors.surface, borderRadius: 12, padding: 20 }, messageText: { color: colors.danger }, retry: { color: colors.primary, fontWeight: '800', marginTop: 12 },
});
