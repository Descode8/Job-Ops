import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const YELLOW = '#FFF200';
const NAVY = '#062C5B';
const BLUE = '#1E67B2';
const INK = '#172033';
const PAPER = '#FFFFFF';
const MUTED = '#566273';

const serviceRequests = [
  { id: 'SR-208', title: 'Water heater inspection', address: '42 Laurel Ridge Road, Anderson, SC', priority: 'High', due: 'Due today' },
  { id: 'SR-211', title: 'HVAC service call', address: '9 Mill Creek Way, Pendleton, SC', priority: 'Medium', due: 'Due Friday' },
];

export default function ServiceScreen() {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>MARTY WRIGHT</Text>
            <Text style={styles.title}>Service</Text>
          </View>
          <TouchableOpacity style={styles.addButton} accessibilityLabel="Add service note">
            <Ionicons name="add" size={24} color={NAVY} />
          </TouchableOpacity>
        </View>

        <View style={styles.intro}>
          <View style={styles.introIcon}>
            <Ionicons name="construct-outline" size={23} color={NAVY} />
          </View>
          <View style={styles.introCopy}>
            <Text style={styles.introTitle}>Service work in one place</Text>
            <Text style={styles.introText}>Track repairs, parts needed, photos, and notes by home address.</Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Open service requests</Text>
          <Text style={styles.count}>2 OPEN</Text>
        </View>
        {serviceRequests.map((request) => (
          <TouchableOpacity key={request.id} style={styles.requestCard} activeOpacity={0.85}>
            <View style={styles.requestHeader}>
              <View style={styles.priorityPill}>
                <View style={styles.priorityDot} />
                <Text style={styles.priorityText}>{request.priority.toUpperCase()} PRIORITY</Text>
              </View>
              <Text style={styles.requestId}>{request.id}</Text>
            </View>
            <Text style={styles.requestTitle}>{request.title}</Text>
            <View style={styles.addressRow}>
              <Ionicons name="location-outline" size={17} color={MUTED} />
              <Text style={styles.address}>{request.address}</Text>
            </View>
            <View style={styles.requestFooter}>
              <Text style={styles.due}>{request.due}</Text>
              <Ionicons name="arrow-forward" size={18} color={BLUE} />
            </View>
          </TouchableOpacity>
        ))}

        <TouchableOpacity style={styles.uploadButton} activeOpacity={0.8}>
          <Ionicons name="camera-outline" size={20} color={PAPER} />
          <Text style={styles.uploadText}>Add issue or parts-needed photos</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: NAVY },
  content: { flexGrow: 1, backgroundColor: PAPER, paddingHorizontal: 20, paddingBottom: 30 },
  header: { backgroundColor: NAVY, marginHorizontal: -20, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 25, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kicker: { color: YELLOW, fontSize: 10, fontWeight: '900', letterSpacing: 1.4, marginBottom: 8 },
  title: { color: PAPER, fontSize: 28, fontWeight: '800' },
  addButton: { height: 42, width: 42, backgroundColor: YELLOW, alignItems: 'center', justifyContent: 'center' },
  intro: { backgroundColor: '#EAF1F8', padding: 16, marginTop: 22, flexDirection: 'row', alignItems: 'center' },
  introIcon: { width: 42, height: 42, backgroundColor: YELLOW, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  introCopy: { flex: 1 },
  introTitle: { color: INK, fontSize: 14, fontWeight: '800', marginBottom: 4 },
  introText: { color: MUTED, fontSize: 11, lineHeight: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 28, marginBottom: 13 },
  sectionTitle: { color: INK, fontSize: 18, fontWeight: '800' },
  count: { color: BLUE, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  requestCard: { backgroundColor: PAPER, borderWidth: 1, borderColor: '#D7E1EC', padding: 17, marginBottom: 12 },
  requestHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  priorityPill: { backgroundColor: '#FFFBE0', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6 },
  priorityDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: YELLOW, marginRight: 6 },
  priorityText: { color: INK, fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  requestId: { color: '#8B97A5', fontSize: 10, fontWeight: '700' },
  requestTitle: { color: INK, fontSize: 18, fontWeight: '800', marginTop: 16 },
  addressRow: { flexDirection: 'row', alignItems: 'center', marginTop: 11 },
  address: { color: MUTED, fontSize: 12, marginLeft: 7, flex: 1 },
  requestFooter: { borderTopWidth: 1, borderTopColor: '#E2EAF2', marginTop: 17, paddingTop: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  due: { color: INK, fontSize: 11, fontWeight: '800' },
  uploadButton: { backgroundColor: BLUE, minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, marginTop: 14 },
  uploadText: { color: PAPER, fontSize: 12, fontWeight: '800', marginLeft: 8 },
});
