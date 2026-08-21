import { Ionicons } from '@expo/vector-icons';
import { ImageBackground } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';

const YELLOW = '#FFF200';
const NAVY = '#003366';
const BLUE = '#1E67B2';
const INK = '#172033';
const PAPER = '#FFFFFF';
const MUTED = '#566273';

type WorkOrder = {
  id: string;
  work_order_number: string;
  title: string;
  status: string;
  deadline_at: string | null;
  properties: { customer_name: string | null; address_line_1: string; city: string; state: string } | null;
};

export default function JobsScreen() {
  const router = useRouter();
  const [jobs, setJobs] = useState<WorkOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);

  const loadJobs = useCallback(async () => {
    setIsLoading(true);
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) { setJobs([]); setIsLoading(false); return; }
    const { data: contractor } = await supabase.from('contractors').select('id').eq('auth_user_id', authData.user.id).eq('is_active', true).single();
    if (!contractor) { setJobs([]); setIsLoading(false); return; }
    const { data: assignments } = await supabase.from('work_order_assignments').select('work_order:work_orders!inner(id, work_order_number, title, status, deadline_at, kind, properties(customer_name, address_line_1, city, state))').eq('contractor_id', contractor.id).is('unassigned_at', null).neq('work_order.kind', 'service');
    setJobs((assignments ?? []).map((assignment) => assignment.work_order).filter(Boolean) as unknown as WorkOrder[]);
    setIsLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { void loadJobs(); }, [loadJobs]));

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ImageBackground source={require('@/assets/images/dark-blue-particle-texture-background.jpg')} style={styles.header} contentFit="cover"><View><Text style={styles.kicker}>MARTY WRIGHT</Text><Text style={styles.title}>Assigned Jobs</Text></View><TouchableOpacity style={[styles.filterButton, { backgroundColor: 'transparent', borderRadius: 0 }]} accessibilityLabel="Toggle completed jobs" onPress={() => setShowCompleted((value) => !value)}><Ionicons name={showCompleted ? 'checkmark-done' : 'options-outline'} size={28} color={YELLOW} /></TouchableOpacity></ImageBackground>
        <Text style={styles.resultCount}>{isLoading ? 'LOADING...' : `${jobs.filter((job) => showCompleted || job.status !== 'completed').length} ${showCompleted ? 'TOTAL' : 'ACTIVE'} JOB${jobs.length === 1 ? '' : 'S'}`}</Text>
        {!isLoading && jobs.length === 0 && <EmptyState message="No assigned work orders yet." />}
        {jobs.filter((job) => showCompleted || job.status !== 'completed').map((job) => <TouchableOpacity key={job.id} style={styles.jobCard} activeOpacity={0.85} onPress={() => router.push({ pathname: '/work-order/[id]', params: { id: job.id } })}><View style={styles.cardHeader}><View style={[styles.statusDot, { backgroundColor: statusColor(job.status) }]} /><Text style={styles.status}>{job.status.replaceAll('_', ' ').toUpperCase()}</Text><Text style={styles.jobId}>#{job.work_order_number}</Text></View><Text style={styles.jobTitle}>{job.properties?.customer_name || job.title}</Text><View style={styles.addressRow}><Ionicons name="location-outline" size={17} color={MUTED} /><Text style={styles.address}>{formatAddress(job.properties)}</Text></View><View style={styles.cardFooter}><Text style={styles.due}>{formatDeadline(job.deadline_at)}</Text><Ionicons name="arrow-forward" size={18} color={NAVY} /></View></TouchableOpacity>)}
      </ScrollView>
    </SafeAreaView>
  );
}

function EmptyState({ message }: { message: string }) { return <View style={styles.emptyState}><Ionicons name="briefcase-outline" size={27} color={BLUE} /><Text style={styles.emptyText}>{message}</Text></View>; }
function formatAddress(property: WorkOrder['properties']) { return property ? `${property.address_line_1}, ${property.city}, ${property.state}` : 'Address unavailable'; }
function formatDeadline(deadline: string | null) { return deadline ? `Due ${new Date(deadline).toLocaleDateString()}` : 'No Deadline Set'; }
function statusColor(status: string) { if (status === 'completed') return '#2E8B57'; if (status === 'in_progress') return BLUE; return '#8B97A5'; }

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: 'transparent' }, content: { flexGrow: 1, backgroundColor: PAPER, paddingHorizontal: 20, paddingBottom: 28 }, header: { backgroundColor: NAVY, marginHorizontal: -20, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 25, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, kicker: { color: YELLOW, fontSize: 10, fontWeight: '900', letterSpacing: 1.4, marginBottom: 8 }, title: { color: PAPER, fontSize: 28, fontWeight: '800' }, filterButton: { height: 42, width: 42, backgroundColor: '#1E67B2', borderRadius: 6, alignItems: 'center', justifyContent: 'center' }, resultCount: { color: MUTED, fontSize: 10, fontWeight: '900', letterSpacing: 1.3, marginTop: 23, marginBottom: 12 }, jobCard: { backgroundColor: PAPER, padding: 17, borderWidth: 1, borderColor: '#D7E1EC', marginBottom: 12, borderRadius: 6 }, cardHeader: { flexDirection: 'row', alignItems: 'center' }, statusDot: { height: 7, width: 7, borderRadius: 4, marginRight: 7 }, status: { color: MUTED, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 }, jobId: { color: '#1E67B2', fontSize: 10, fontWeight: '800', marginLeft: 'auto' }, jobTitle: { color: '#1E67B2', fontSize: 18, fontWeight: '800', marginTop: 16 }, addressRow: { flexDirection: 'row', alignItems: 'center', marginTop: 11 }, address: { color: MUTED, fontSize: 12, marginLeft: 7, flex: 1 }, cardFooter: { borderTopWidth: 1, borderTopColor: '#E2EAF2', marginTop: 17, paddingTop: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, due: { color: INK, fontSize: 11, fontWeight: '800' }, emptyState: { alignItems: 'center', paddingTop: 92 }, emptyText: { color: MUTED, fontSize: 13, marginTop: 12 },
});
