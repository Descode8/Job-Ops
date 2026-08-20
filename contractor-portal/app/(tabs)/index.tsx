import { Ionicons } from '@expo/vector-icons';
import { Image, ImageBackground } from 'expo-image';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const YELLOW = '#FFF200';
const NAVY = '#062C5B';
const DEEP_NAVY = '#031A38';
const BLUE = '#1E67B2';
const PAPER = '#FFFFFF';
const INK = '#172033';
const MUTED = '#566273';

const checklistItems = [
  'Plumbing',
  'Meter',
  'HVAC',
  'Underpinning',
  'Steps / decks',
  'Well',
  'Septic',
  'Plumbing tie-in',
  'Waterline',
  'Backfill, seed and straw',
  'Driveway',
  'Get ready',
  'Meter install',
  'Final walk-through',
];

export default function HomeScreen() {
  const [completedChecklist, setCompletedChecklist] = useState<string[]>([]);

  const toggleChecklistItem = (item: string) => {
    setCompletedChecklist((current) =>
      current.includes(item) ? current.filter((entry) => entry !== item) : [...current, item],
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ImageBackground source={require('@/assets/images/dark-blue-particle-texture-background.jpg')} style={styles.topBar} contentFit="cover">
          <Image source={require('@/assets/images/Marty-Wright-Home-Sales_anderson.png')} style={styles.logo} contentFit="contain" />
          <TouchableOpacity style={styles.notificationButton} accessibilityLabel="Notifications">
            <Ionicons name="notifications-outline" size={22} color={PAPER} />
            <View style={styles.notificationDot} />
          </TouchableOpacity>
        </ImageBackground>

        <View style={styles.greetingRow}>
          <View>
            <Text style={styles.eyebrow}>THURSDAY, AUGUST 20</Text>
            <Text style={styles.greeting}>Good morning, James</Text>
          </View>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>JD</Text>
          </View>
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <Text style={styles.summaryLabel}>YOUR DAY AT A GLANCE</Text>
            <Ionicons name="sunny-outline" size={21} color={PAPER} />
          </View>
          <View style={styles.summaryStats}>
            <View>
              <Text style={styles.summaryNumber}>04</Text>
              <Text style={styles.summaryText}>Assigned jobs</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View>
              <Text style={styles.summaryNumber}>02</Text>
              <Text style={styles.summaryText}>Due today</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View>
              <Text style={styles.summaryNumber}>01</Text>
              <Text style={styles.summaryText}>Needs update</Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Continue working</Text>
          <TouchableOpacity>
            <Text style={styles.linkText}>View all</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.jobCard} activeOpacity={0.88}>
          <View style={styles.jobTopLine}>
            <View style={styles.statusPill}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>IN PROGRESS</Text>
            </View>
            <Text style={styles.jobId}>JOB #MW-1048</Text>
          </View>
          <Text style={styles.jobTitle}>Set-up and finish inspection</Text>
          <View style={styles.addressRow}>
            <Ionicons name="location-outline" size={18} color={BLUE} />
            <Text style={styles.address}>214 Brookstone Drive, Anderson, SC</Text>
          </View>
          <View style={styles.jobFooter}>
            <Text style={styles.jobMeta}>Due today, 4:00 PM</Text>
            <View style={styles.arrowButton}>
              <Ionicons name="arrow-forward" size={18} color={PAPER} />
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.checklistCard}>
          <View style={styles.checklistHeader}>
            <View>
              <Text style={styles.checklistEyebrow}>214 BROOKSTONE DRIVE</Text>
              <Text style={styles.checklistTitle}>Home completion checklist</Text>
            </View>
            <Text style={styles.checklistCount}>{completedChecklist.length}/{checklistItems.length}</Text>
          </View>
          <Text style={styles.checklistHelp}>Mark each item as it is verified at the home.</Text>
          <View style={styles.checklistGrid}>
            {checklistItems.map((item) => {
              const isComplete = completedChecklist.includes(item);
              return (
                <TouchableOpacity
                  key={item}
                  style={styles.checklistItem}
                  onPress={() => toggleChecklistItem(item)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isComplete }}>
                  <View style={[styles.checkbox, isComplete && styles.checkboxComplete]}>
                    {isComplete && <Ionicons name="checkmark" size={14} color={PAPER} />}
                  </View>
                  <Text style={[styles.checklistLabel, isComplete && styles.checklistLabelComplete]}>{item}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Quick actions</Text>
        </View>
        <View style={styles.actionGrid}>
          <ActionButton icon="camera-outline" label="Upload photos" />
          <ActionButton icon="document-text-outline" label="Add job note" />
          <ActionButton icon="navigate-outline" label="Open directions" />
          <ActionButton icon="receipt-outline" label="Upload invoice" />
        </View>

        <View style={styles.tipCard}>
          <View style={styles.tipIcon}>
            <Ionicons name="checkmark" size={20} color={INK} />
          </View>
          <View style={styles.tipCopy}>
            <Text style={styles.tipTitle}>Keep your job updates current</Text>
            <Text style={styles.tipText}>A quick note or photo helps the office keep every project moving.</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ActionButton({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <TouchableOpacity style={styles.actionButton} activeOpacity={0.8}>
      <Ionicons name={icon} size={24} color={BLUE} />
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: DEEP_NAVY },
  content: { paddingHorizontal: 20, paddingBottom: 32, backgroundColor: PAPER },
  topBar: { height: 105, marginHorizontal: -20, paddingHorizontal: 20, paddingTop: 17, paddingBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logo: { width: 164, height: 76 },
  notificationButton: { width: 42, height: 42, borderWidth: 1, borderColor: '#7798BC', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  notificationDot: { position: 'absolute', right: 9, top: 8, width: 6, height: 6, backgroundColor: YELLOW, borderRadius: 3 },
  greetingRow: { paddingTop: 27, paddingBottom: 21, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { color: MUTED, fontSize: 10, fontWeight: '700', letterSpacing: 1.3, marginBottom: 7 },
  greeting: { color: INK, fontSize: 25, fontWeight: '800' },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: YELLOW, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: INK, fontSize: 14, fontWeight: '800' },
  summaryCard: { backgroundColor: NAVY, padding: 18, minHeight: 135 },
  summaryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { color: PAPER, fontSize: 10, fontWeight: '900', letterSpacing: 1.25 },
  summaryStats: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 21 },
  summaryNumber: { color: YELLOW, fontSize: 31, fontWeight: '900' },
  summaryText: { color: PAPER, fontSize: 10, fontWeight: '600', marginTop: 2 },
  summaryDivider: { height: 42, width: 1, backgroundColor: '#4775A7' },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 28, marginBottom: 13 },
  sectionTitle: { color: INK, fontSize: 18, fontWeight: '800' },
  linkText: { color: BLUE, fontSize: 12, fontWeight: '800' },
  jobCard: { backgroundColor: NAVY, padding: 18 },
  jobTopLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#164B83', paddingHorizontal: 9, paddingVertical: 6 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: YELLOW, marginRight: 6 },
  statusText: { color: YELLOW, fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  jobId: { color: '#A6A6A0', fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  jobTitle: { color: PAPER, fontSize: 20, fontWeight: '800', marginTop: 22, maxWidth: '90%' },
  addressRow: { flexDirection: 'row', alignItems: 'center', marginTop: 15 },
  address: { color: '#C8C8C1', fontSize: 12, marginLeft: 8, flex: 1 },
  jobFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 22 },
  jobMeta: { color: '#A6A6A0', fontSize: 11, fontWeight: '600' },
  arrowButton: { backgroundColor: BLUE, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionButton: { backgroundColor: '#FFFFFF', width: '48%', minHeight: 94, padding: 15, justifyContent: 'space-between', borderWidth: 1, borderColor: '#D7E1EC' },
  actionLabel: { color: INK, fontSize: 12, fontWeight: '800', maxWidth: 100 },
  tipCard: { flexDirection: 'row', backgroundColor: '#EAF1F8', padding: 15, marginTop: 26, alignItems: 'center' },
  tipIcon: { width: 36, height: 36, backgroundColor: YELLOW, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  tipCopy: { flex: 1 },
  tipTitle: { color: INK, fontSize: 12, fontWeight: '800', marginBottom: 4 },
  tipText: { color: '#5E5E58', fontSize: 11, lineHeight: 16 },
  checklistCard: { backgroundColor: '#F4F8FC', borderWidth: 1, borderColor: '#D7E1EC', padding: 17, marginTop: 26 },
  checklistHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  checklistEyebrow: { color: BLUE, fontSize: 9, fontWeight: '900', letterSpacing: 1, marginBottom: 6 },
  checklistTitle: { color: INK, fontSize: 17, fontWeight: '800' },
  checklistCount: { color: BLUE, fontSize: 16, fontWeight: '900' },
  checklistHelp: { color: MUTED, fontSize: 11, lineHeight: 16, marginTop: 8, marginBottom: 14 },
  checklistGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  checklistItem: { width: '47%', flexDirection: 'row', alignItems: 'center', minHeight: 28 },
  checkbox: { width: 20, height: 20, borderWidth: 1, borderColor: '#9FB3C8', alignItems: 'center', justifyContent: 'center', marginRight: 8, backgroundColor: PAPER },
  checkboxComplete: { backgroundColor: BLUE, borderColor: BLUE },
  checklistLabel: { color: INK, fontSize: 11, flex: 1 },
  checklistLabelComplete: { color: MUTED, textDecorationLine: 'line-through' },
});
