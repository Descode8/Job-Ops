import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const YELLOW = '#FFF200';
const NAVY = '#062C5B';
const BLUE = '#1E67B2';
const INK = '#172033';
const PAPER = '#FFFFFF';
const MUTED = '#566273';
const priorities = ['Low', 'Medium', 'High', 'Emergency'];

export default function WorkOrderScreen() {
  const [title, setTitle] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [contractor, setContractor] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [deadline, setDeadline] = useState('');
  const [priority, setPriority] = useState('Medium');

  const submitWorkOrder = () => {
    if (!title.trim() || !address.trim() || !description.trim() || !recipientEmail.trim()) {
      Alert.alert('Required information missing', 'Enter a title, address, description, and recipient email before submitting.');
      return;
    }

    const workOrderNumber = `MW-${Math.floor(1000 + Math.random() * 9000)}`;
    Alert.alert(
      'Work order created',
      `Work order #${workOrderNumber} is ready. An email will be sent to ${recipientEmail.trim()} when email delivery is connected.`,
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>MARTY WRIGHT</Text>
            <Text style={styles.title}>New work order</Text>
          </View>
          <View style={styles.headerIcon}>
            <Ionicons name="create-outline" size={22} color={NAVY} />
          </View>
        </View>

        <Text style={styles.intro}>Create an assignment and choose where the work-order email should go.</Text>

        <Field label="Work order title *" value={title} onChangeText={setTitle} placeholder="Example: Final home inspection" />
        <Field label="Property address *" value={address} onChangeText={setAddress} placeholder="Street, city, state" />
        <Field label="Work description *" value={description} onChangeText={setDescription} placeholder="Describe the work needed" multiline />
        <Field label="Assigned contractor" value={contractor} onChangeText={setContractor} placeholder="Name, ID, or phone number" />
        <Field label="Email work order to *" value={recipientEmail} onChangeText={setRecipientEmail} placeholder="office@example.com" keyboardType="email-address" autoCapitalize="none" />
        <Field label="Completion deadline" value={deadline} onChangeText={setDeadline} placeholder="Example: August 25, 2026" />

        <Text style={styles.label}>Priority</Text>
        <View style={styles.priorityRow}>
          {priorities.map((option) => (
            <TouchableOpacity
              key={option}
              style={[styles.priorityOption, priority === option && styles.priorityOptionSelected]}
              onPress={() => setPriority(option)}
              accessibilityRole="radio"
              accessibilityState={{ selected: priority === option }}>
              <Text style={[styles.priorityText, priority === option && styles.priorityTextSelected]}>{option}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.emailNotice}>
          <Ionicons name="mail-outline" size={20} color={BLUE} />
          <Text style={styles.emailNoticeText}>The submitted work-order details will be sent to the email above after the secure server email service is connected.</Text>
        </View>

        <TouchableOpacity style={styles.submitButton} onPress={submitWorkOrder} activeOpacity={0.85}>
          <Ionicons name="send-outline" size={20} color={NAVY} />
          <Text style={styles.submitText}>Create and submit work order</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, value, onChangeText, placeholder, multiline = false, keyboardType = 'default', autoCapitalize = 'sentences' }: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'email-address';
  autoCapitalize?: 'none' | 'sentences';
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.multilineInput]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8A98A8"
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: NAVY },
  content: { flexGrow: 1, backgroundColor: PAPER, paddingHorizontal: 20, paddingBottom: 35 },
  header: { backgroundColor: NAVY, marginHorizontal: -20, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 25, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kicker: { color: YELLOW, fontSize: 10, fontWeight: '900', letterSpacing: 1.4, marginBottom: 8 },
  title: { color: PAPER, fontSize: 27, fontWeight: '800' },
  headerIcon: { width: 42, height: 42, backgroundColor: YELLOW, alignItems: 'center', justifyContent: 'center' },
  intro: { color: MUTED, fontSize: 12, lineHeight: 18, marginTop: 21, marginBottom: 3 },
  fieldGroup: { marginTop: 17 },
  label: { color: INK, fontSize: 11, fontWeight: '800', marginBottom: 7 },
  input: { borderWidth: 1, borderColor: '#C9D7E5', backgroundColor: '#F8FAFC', minHeight: 47, paddingHorizontal: 13, color: INK, fontSize: 13 },
  multilineInput: { minHeight: 94, paddingTop: 13 },
  priorityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  priorityOption: { borderWidth: 1, borderColor: '#C9D7E5', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: PAPER },
  priorityOptionSelected: { backgroundColor: BLUE, borderColor: BLUE },
  priorityText: { color: MUTED, fontSize: 11, fontWeight: '700' },
  priorityTextSelected: { color: PAPER },
  emailNotice: { flexDirection: 'row', backgroundColor: '#EAF1F8', padding: 13, marginTop: 22, alignItems: 'flex-start' },
  emailNoticeText: { color: MUTED, fontSize: 11, lineHeight: 16, flex: 1, marginLeft: 9 },
  submitButton: { minHeight: 52, backgroundColor: YELLOW, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 18, paddingHorizontal: 12 },
  submitText: { color: NAVY, fontSize: 12, fontWeight: '900', marginLeft: 8 },
});
