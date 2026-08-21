import { Ionicons } from '@expo/vector-icons';
import { ImageBackground } from 'expo-image';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';

const YELLOW = '#FFF200';
const NAVY = '#003366';
const BLUE = '#1E67B2';
const INK = '#172033';
const PAPER = '#FFFFFF';
const MUTED = '#566273';
const WORK_ORDER_RECIPIENT = 'jhumphries@shopmwhs.net';

type ContractorOption = { id: string; full_name: string };

export default function WorkOrderScreen() {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [contractors, setContractors] = useState<ContractorOption[]>([]);
  const [currentContractorId, setCurrentContractorId] = useState('');
  const [selectedContractorId, setSelectedContractorId] = useState('');
  const [isContractorListOpen, setIsContractorListOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const loadContractors = async () => {
      const [{ data, error }, { data: authData }] = await Promise.all([
        supabase.rpc('list_available_contractors'),
        supabase.auth.getUser(),
      ]);
      if (error) {
        Alert.alert('Could not load contractors', 'Apply database/12_work_order_offers.sql to Supabase, then try again.');
        return;
      }

      const { data: currentContractor } = authData.user
        ? await supabase
            .from('contractors')
            .select('id, full_name')
            .eq('auth_user_id', authData.user.id)
            .eq('is_active', true)
            .single()
        : { data: null };

      const availableContractors = (data ?? []) as ContractorOption[];
      setContractors(currentContractor ? [currentContractor, ...availableContractors] : availableContractors);
      if (currentContractor) {
        setCurrentContractorId(currentContractor.id);
        setSelectedContractorId(currentContractor.id);
      }
    };

    void loadContractors();
  }, []);

  const submitWorkOrder = async () => {
    if (!customerName.trim() || !customerPhone.trim() || !address.trim() || !description.trim()) {
      Alert.alert('Required information missing', 'Enter all required work-order details before submitting.');
      return;
    }

    const assigneeId = selectedContractorId || currentContractorId;
    if (!assigneeId) {
      Alert.alert('Could not identify contractor', 'Log in again, then retry creating the work order.');
      return;
    }

    setIsSubmitting(true);
    const addressParts = address.split(',').map((part) => part.trim()).filter(Boolean);
    const { data, error: offerError } = await supabase.rpc('create_and_offer_work_order', {
      p_customer_name: customerName.trim(),
      p_customer_phone: customerPhone.trim(),
      p_address_line_1: addressParts[0] ?? address.trim(),
      p_city: addressParts[1] ?? 'Unknown',
      p_state: addressParts[2] ?? 'SC',
      p_description: description.trim(),
      p_recipient_id: assigneeId,
    });

    setIsSubmitting(false);
    if (offerError) {
      Alert.alert('Could not Create Work Order', offerError.message);
      return;
    }

    const isAssignedToMe = assigneeId === currentContractorId;
    const selectedContractor = contractors.find((contractor) => contractor.id === assigneeId);
    const assigneeName = isAssignedToMe ? 'you' : (selectedContractor?.full_name ?? 'the selected contractor');
    const workOrderId = data?.[0]?.work_order_id;
    const workOrderNumber = data?.[0]?.work_order_number ?? 'New Work Order';
    const { error: emailError } = workOrderId
      ? await supabase.functions.invoke('send-work-order', { body: { workOrderId } })
      : { error: new Error('The database did not return a work-order ID.') };

    let emailErrorMessage = emailError?.message;
    if (emailError instanceof FunctionsHttpError) {
      const responseBody = await emailError.context.json().catch(() => null);
      emailErrorMessage = responseBody?.details?.message
        ?? responseBody?.error
        ?? emailError.message;
    }

    Alert.alert(
      emailError ? 'Work order saved; email failed' : 'Work order sent',
      emailError
        ? `#${workOrderNumber} was ${isAssignedToMe ? 'assigned' : 'offered'} to ${assigneeName}, but the email could not be delivered: ${emailErrorMessage}`
        : `#${workOrderNumber} was ${isAssignedToMe ? 'assigned' : 'offered'} to ${assigneeName} and emailed to ${WORK_ORDER_RECIPIENT}.`,
    );
    setCustomerName('');
    setCustomerPhone('');
    setAddress('');
    setDescription('');
    setSelectedContractorId(currentContractorId);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        contentInsetAdjustmentBehavior="automatic">
        <ImageBackground source={require('@/assets/images/dark-blue-particle-texture-background.jpg')} style={styles.header} contentFit="cover">
          <View>
            <Text style={styles.kicker}>MARTY WRIGHT</Text>
            <Text style={styles.title}>New Work Order</Text>
          </View>
          <View style={styles.headerIcon}>
            <Ionicons name="create-outline" size={22} color={PAPER} />
          </View>
        </ImageBackground>

        <Text style={styles.intro}>Enter the customer and work-order details below.</Text>

        <Field label="Customer *" value={customerName} onChangeText={setCustomerName} placeholder="Customer name" />
        <Field label="Customer phone number *" value={customerPhone} onChangeText={setCustomerPhone} placeholder="(555) 555-5555" keyboardType="phone-pad" />
        <Field label="Customer address *" value={address} onChangeText={setAddress} placeholder="Street, city, state" />
        <Field label="Work order description *" value={description} onChangeText={setDescription} placeholder="Describe the work needed" multiline />

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Assign to contractor</Text>
          <TouchableOpacity
            style={styles.dropdownButton}
            onPress={() => setIsContractorListOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityState={{ expanded: isContractorListOpen }}>
            <Text style={[styles.dropdownText, !selectedContractorId && styles.dropdownPlaceholder]}>
              {selectedContractorId === currentContractorId
                ? 'Me'
                : contractors.find((contractor) => contractor.id === selectedContractorId)?.full_name ?? 'Me'}
            </Text>
            <Ionicons name={isContractorListOpen ? 'chevron-up' : 'chevron-down'} size={18} color={NAVY} />
          </TouchableOpacity>
          {isContractorListOpen && (
            <View style={styles.dropdownList}>
              {contractors.length === 0 ? (
                <Text style={styles.emptyDropdownText}>No other active contractors found.</Text>
              ) : contractors.map((contractor) => (
                <TouchableOpacity
                  key={contractor.id}
                  style={styles.dropdownOption}
                  onPress={() => {
                    setSelectedContractorId(contractor.id);
                    setIsContractorListOpen(false);
                  }}>
                  <Text style={styles.dropdownOptionText}>{contractor.id === currentContractorId ? 'Me' : contractor.full_name}</Text>
                  {selectedContractorId === contractor.id && <Ionicons name="checkmark" size={18} color={BLUE} />}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={styles.emailNotice}>
          <Ionicons name="mail-outline" size={20} color={BLUE} />
          <Text style={styles.emailNoticeText}>Submitting automatically emails the work-order details to <Text style={styles.emailAddress}>{WORK_ORDER_RECIPIENT}</Text>.</Text>
        </View>

        <Pressable style={({ pressed }) => [styles.submitButton, pressed && styles.submitButtonPressed]} onPress={submitWorkOrder} disabled={isSubmitting}>
          <Text style={styles.submitText}>{isSubmitting ? 'Saving work order...' : 'Create Work Order'}</Text>
        </Pressable>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, value, onChangeText, placeholder, multiline = false, keyboardType = 'default', autoCapitalize = 'sentences' }: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
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
  safeArea: { flex: 1, backgroundColor: 'transparent' },
  keyboardAvoidingView: { flex: 1, backgroundColor: '#000000' },
  content: { flexGrow: 1, backgroundColor: PAPER, paddingHorizontal: 20, paddingBottom: 35 },
  header: { backgroundColor: NAVY, marginHorizontal: -20, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 25, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kicker: { color: YELLOW, fontSize: 10, fontWeight: '900', letterSpacing: 1.4, marginBottom: 8 },
  title: { color: PAPER, fontSize: 27, fontWeight: '800' },
  headerIcon: { width: 42, height: 42, backgroundColor: '#1E67B2', alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  intro: { color: MUTED, fontSize: 12, lineHeight: 18, marginTop: 21, marginBottom: 3 },
  fieldGroup: { marginTop: 17 },
  label: { color: INK, fontSize: 11, fontWeight: '800', marginBottom: 7 },
  input: { borderWidth: 1, borderColor: '#C9D7E5', backgroundColor: '#F8FAFC', minHeight: 47, paddingHorizontal: 13, color: INK, fontSize: 13, borderRadius: 6 },
  multilineInput: { minHeight: 94, paddingTop: 13 },
  dropdownButton: { borderWidth: 1, borderColor: '#C9D7E5', backgroundColor: '#F8FAFC', minHeight: 47, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 6 },
  dropdownText: { color: INK, fontSize: 13 },
  dropdownPlaceholder: { color: '#8A98A8' },
  dropdownList: { borderWidth: 1, borderTopWidth: 0, borderColor: '#C9D7E5', backgroundColor: PAPER, borderRadius: 6 },
  dropdownOption: { minHeight: 47, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#E4EBF2', borderRadius: 6 },
  dropdownOptionText: { color: INK, fontSize: 13, fontWeight: '600' },
  emptyDropdownText: { color: MUTED, fontSize: 12, padding: 13 },
  emailNotice: { flexDirection: 'row', backgroundColor: '#EAF1F8', padding: 13, marginTop: 22, alignItems: 'flex-start', borderRadius: 6 },
  emailNoticeText: { color: MUTED, fontSize: 11, lineHeight: 16, flex: 1, marginLeft: 9 },
  emailAddress: { color: INK, fontWeight: '900' },
  submitButton: { minHeight: 52, backgroundColor: '#2577BB', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 18, paddingHorizontal: 12, borderRadius: 6 },
  submitButtonPressed: { backgroundColor: '#1C1C5C' },
  submitText: { color: PAPER, fontSize: 12, fontWeight: '900', marginLeft: 8 },
});
