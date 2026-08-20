import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const YELLOW = '#FFF200';
const NAVY = '#062C5B';
const BLUE = '#1E67B2';
const INK = '#172033';
const PAPER = '#F4F3EE';
const MUTED = '#777772';

const jobs = [
  { id: 'MW-1048', title: 'Set-up and finish inspection', address: '214 Brookstone Drive, Anderson, SC', status: 'In progress', due: 'Today, 4:00 PM', color: YELLOW },
  { id: 'MW-1051', title: 'Replace bathroom fixtures', address: '88 Whitehall Road, Anderson, SC', status: 'Not started', due: 'Tomorrow, 9:00 AM', color: '#D7D6CB' },
  { id: 'MW-1039', title: 'Final walkthrough photos', address: '17 Maple Crest Lane, Belton, SC', status: 'Submitted', due: 'Review pending', color: '#D7D6CB' },
];

export default function JobsScreen() {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>MARTY WRIGHT</Text>
            <Text style={styles.title}>Assigned jobs</Text>
          </View>
          <TouchableOpacity style={styles.filterButton} accessibilityLabel="Filter jobs">
            <Ionicons name="options-outline" size={21} color={PAPER} />
          </TouchableOpacity>
        </View>

        <View style={styles.filterRow}>
          <View style={styles.activeFilter}><Text style={styles.activeFilterText}>All jobs</Text></View>
          <Text style={styles.inactiveFilter}>Today</Text>
          <Text style={styles.inactiveFilter}>Needs update</Text>
        </View>

        <Text style={styles.resultCount}>3 ASSIGNED JOBS</Text>
        {jobs.map((job) => (
          <TouchableOpacity key={job.id} style={styles.jobCard} activeOpacity={0.85}>
            <View style={styles.cardHeader}>
              <View style={[styles.statusDot, { backgroundColor: job.color }]} />
              <Text style={styles.status}>{job.status.toUpperCase()}</Text>
              <Text style={styles.jobId}>#{job.id}</Text>
            </View>
            <Text style={styles.jobTitle}>{job.title}</Text>
            <View style={styles.addressRow}>
              <Ionicons name="location-outline" size={17} color={MUTED} />
              <Text style={styles.address}>{job.address}</Text>
            </View>
            <View style={styles.cardFooter}>
              <Text style={styles.due}>{job.due}</Text>
              <Ionicons name="arrow-forward" size={18} color={NAVY} />
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: NAVY },
  content: { flexGrow: 1, backgroundColor: PAPER, paddingHorizontal: 20, paddingBottom: 28 },
  header: { backgroundColor: NAVY, marginHorizontal: -20, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 25, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kicker: { color: YELLOW, fontSize: 10, fontWeight: '900', letterSpacing: 1.4, marginBottom: 8 },
  title: { color: PAPER, fontSize: 28, fontWeight: '800' },
  filterButton: { height: 42, width: 42, borderWidth: 1, borderColor: '#4A4A46', alignItems: 'center', justifyContent: 'center' },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 20, paddingVertical: 21 },
  activeFilter: { backgroundColor: BLUE, paddingHorizontal: 13, paddingVertical: 8 },
  activeFilterText: { color: INK, fontSize: 11, fontWeight: '900' },
  inactiveFilter: { color: MUTED, fontSize: 11, fontWeight: '800' },
  resultCount: { color: MUTED, fontSize: 10, fontWeight: '900', letterSpacing: 1.3, marginBottom: 12 },
  jobCard: { backgroundColor: '#FFFFFF', padding: 17, borderWidth: 1, borderColor: '#D7E1EC', marginBottom: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  statusDot: { height: 7, width: 7, borderRadius: 4, marginRight: 7 },
  status: { color: MUTED, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  jobId: { color: '#A0A09A', fontSize: 10, fontWeight: '700', marginLeft: 'auto' },
  jobTitle: { color: INK, fontSize: 18, fontWeight: '800', marginTop: 16 },
  addressRow: { flexDirection: 'row', alignItems: 'center', marginTop: 11 },
  address: { color: MUTED, fontSize: 12, marginLeft: 7, flex: 1 },
  cardFooter: { borderTopWidth: 1, borderTopColor: '#E2EAF2', marginTop: 17, paddingTop: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  due: { color: INK, fontSize: 11, fontWeight: '800' },
});
