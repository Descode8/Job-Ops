import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { ImageBackground } from 'expo-image';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type AppThemeColors, useAppTheme } from '@/contexts/theme-context';
import { AppText as Text, AppTextInput as TextInput } from '@/components/app-typography';
import { ThemedAlert as Alert } from '@/components/themed-alert';
import { supabase } from '@/lib/supabase';
import { formatWorkOrderNumber } from '@/lib/work-order-number';
import { workOrderPriorityColor as getWorkOrderPriorityColor } from '@/lib/work-order-priority';

const YELLOW = '#FFF200';
const NAVY = '#003366';
const BLUE = '#1E67B2';
const PAPER = '#FFFFFF';
const MUTED = '#566273';
const WORK_ORDER_RECIPIENT = 'jhumphries@shopmwhs.net';

type ContractorOption = { id: string; full_name: string };
type Priority = 'low' | 'medium' | 'high' | 'emergency';

export default function WorkOrderScreen() {
  const { colorScheme, colors } = useAppTheme(); const styles = useMemo(() => createStyles(colors), [colors]);
  const workOrderPriorityColor = (priority: string) => getWorkOrderPriorityColor(priority, colorScheme);
  const [priority, setPriority] = useState<Priority>('medium');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [hasDeadline, setHasDeadline] = useState(false);
  const [deadline, setDeadline] = useState(() => { const date = new Date(); date.setDate(date.getDate() + 7); return date; });
  const [showCalendar, setShowCalendar] = useState(false);
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
      p_priority: priority,
      p_deadline_at: hasDeadline ? deadline.toISOString() : null,
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
      ? await supabase.functions.invoke('send-work-order', { body: { workOrderId, recipientEmail: WORK_ORDER_RECIPIENT } })
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
        ? `${formatWorkOrderNumber(workOrderNumber)} was ${isAssignedToMe ? 'assigned' : 'offered'} to ${assigneeName}, but the email could not be delivered: ${emailErrorMessage}`
        : `${formatWorkOrderNumber(workOrderNumber)} was ${isAssignedToMe ? 'assigned' : 'offered'} to ${assigneeName} and emailed to ${WORK_ORDER_RECIPIENT}.`,
    );
    setCustomerName('');
    setCustomerPhone('');
    setAddress('');
    setDescription('');
    setPriority('medium');
    setHasDeadline(false);
    setShowCalendar(false);
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
            <Text style={styles.title}>Create New Work Order</Text>
          </View>
          <View style={styles.headerIcon}>
            <Ionicons name="create" size={28} color={YELLOW} />
          </View>
        </ImageBackground>

        <Text style={styles.intro}>Enter the customer and work-order details below.</Text>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Priority</Text>
          <View style={styles.priorityOptions}>{(['low', 'medium', 'high', 'emergency'] as Priority[]).map((option) => <TouchableOpacity key={option} style={[styles.priorityOption, priority === option && styles.priorityOptionSelected]} onPress={() => setPriority(option)} accessibilityRole="radio" accessibilityState={{ checked: priority === option }}><Text style={[styles.priorityOptionText, priority === option && styles.priorityOptionTextSelected, { color: workOrderPriorityColor(option) }]}>{option.toUpperCase()}</Text></TouchableOpacity>)}</View>
        </View>

        <Field label="Customer *" value={customerName} onChangeText={setCustomerName} placeholder="Customer name" />
        <Field label="Customer Phone Number *" value={customerPhone} onChangeText={setCustomerPhone} placeholder="(555) 555-5555" keyboardType="phone-pad" />
        <Field label="Customer Address *" value={address} onChangeText={setAddress} placeholder="Street, city, state" />
        <Field label="Work Order Description *" value={description} onChangeText={setDescription} placeholder="Describe the work needed" multiline />

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Completion Deadline</Text>
          <View style={styles.deadlineOptions}>
            <TouchableOpacity style={[styles.deadlineOption, !hasDeadline && styles.deadlineOptionSelected]} onPress={() => { setHasDeadline(false); setShowCalendar(false); }} accessibilityRole="radio" accessibilityState={{ checked: !hasDeadline }}><Ionicons name={!hasDeadline ? 'radio-button-on' : 'radio-button-off'} size={18} color={!hasDeadline ? BLUE : MUTED} /><Text style={[styles.deadlineOptionText, !hasDeadline && styles.deadlineOptionTextSelected]}>No Deadline</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.deadlineOption, hasDeadline && styles.deadlineOptionSelected]} onPress={() => { setHasDeadline(true); setShowCalendar(true); }} accessibilityRole="radio" accessibilityState={{ checked: hasDeadline }}><Ionicons name={hasDeadline ? 'radio-button-on' : 'radio-button-off'} size={18} color={hasDeadline ? BLUE : MUTED} /><Text style={[styles.deadlineOptionText, hasDeadline && styles.deadlineOptionTextSelected]}>Set Deadline</Text></TouchableOpacity>
          </View>
          {hasDeadline && <TouchableOpacity style={styles.calendarButton} onPress={() => setShowCalendar((isOpen) => !isOpen)}><Ionicons name="calendar" size={20} color={BLUE} /><View style={styles.calendarDateCopy}><Text style={styles.calendarLabel}>DEADLINE DATE</Text><Text style={styles.calendarDate}>{deadline.toLocaleDateString(undefined, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}</Text></View><Ionicons name={showCalendar ? 'chevron-up' : 'chevron-down'} size={18} color={NAVY} /></TouchableOpacity>}
          {hasDeadline && showCalendar && <View style={styles.datePickerSurface}><DateTimePicker value={deadline} mode="date" minimumDate={new Date()} display={Platform.OS === 'ios' ? 'inline' : 'calendar'} themeVariant={colorScheme} accentColor={colors.primary} style={styles.datePicker} onChange={(event: DateTimePickerEvent, selectedDate?: Date) => { if (Platform.OS === 'android') setShowCalendar(false); if (event.type === 'set' && selectedDate) setDeadline(selectedDate); }} />{Platform.OS === 'ios' && <TouchableOpacity style={styles.calendarDone} onPress={() => setShowCalendar(false)}><Text style={styles.calendarDoneText}>Done</Text></TouchableOpacity>}</View>}
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Assign to Contractor</Text>
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
          <Ionicons name="mail" size={20} color={BLUE} />
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
  const { colors } = useAppTheme(); const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.multilineInput]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

const createStyles = (colors: AppThemeColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  keyboardAvoidingView: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, backgroundColor: colors.background, paddingHorizontal: 20, paddingBottom: 35 },
  header: { backgroundColor: NAVY, marginHorizontal: -20, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 25, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kicker: { color: YELLOW, fontSize: 10, fontWeight: '900', letterSpacing: 1.4, marginBottom: 8 },
  title: { color: PAPER, fontSize: 27, fontWeight: '900' },
  headerIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  intro: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 21, marginBottom: 3 },
  fieldGroup: { marginTop: 17 },
  label: { color: colors.text, fontSize: 11, fontWeight: '800', marginBottom: 7 },
  input: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input, minHeight: 47, paddingHorizontal: 13, color: colors.text, fontSize: 13, borderRadius: 6 },
  multilineInput: { minHeight: 94, paddingTop: 13 },
  priorityOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  priorityOption: { minHeight: 40, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  priorityOptionSelected: { borderColor: colors.primary, backgroundColor: colors.surfaceMuted },
  priorityOptionText: { color: colors.textMuted, fontSize: 9, fontWeight: '900' },
  priorityOptionTextSelected: { color: colors.primaryStrong },
  deadlineOptions: { flexDirection: 'row', gap: 9 },
  deadlineOption: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input, borderRadius: 6 },
  deadlineOptionSelected: { borderColor: colors.primary, backgroundColor: colors.surfaceMuted },
  deadlineOptionText: { color: colors.textMuted, fontSize: 11, fontWeight: '800' },
  deadlineOptionTextSelected: { color: colors.primaryStrong },
  calendarButton: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 13, marginTop: 9, borderRadius: 6 },
  calendarDateCopy: { flex: 1, alignSelf: 'stretch', justifyContent: 'center' },
  calendarLabel: { color: colors.textMuted, fontSize: 8, fontWeight: '900' },
  calendarDate: { color: colors.text, fontSize: 12, fontWeight: '800', marginTop: 3 },
  datePickerSurface: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, marginTop: 9, overflow: 'hidden' },
  datePicker: { backgroundColor: colors.surface, alignSelf: 'stretch' },
  calendarDone: { minHeight: 42, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderTopColor: colors.border },
  calendarDoneText: { color: BLUE, fontSize: 12, fontWeight: '900' },
  dropdownButton: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input, minHeight: 47, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 6 },
  dropdownText: { color: colors.text, fontSize: 13 },
  dropdownPlaceholder: { color: colors.textMuted },
  dropdownList: { borderWidth: 1, borderTopWidth: 0, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 6 },
  dropdownOption: { minHeight: 47, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, borderRadius: 6 },
  dropdownOptionText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  emptyDropdownText: { color: colors.textMuted, fontSize: 12, padding: 13 },
  emailNotice: { flexDirection: 'row', backgroundColor: colors.surfaceMuted, padding: 13, marginTop: 22, alignItems: 'flex-start', borderRadius: 6 },
  emailNoticeText: { color: colors.textMuted, fontSize: 11, lineHeight: 16, flex: 1, marginLeft: 9 },
  emailAddress: { color: colors.text, fontWeight: '900' },
  submitButton: { minHeight: 52, backgroundColor: '#2577BB', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 18, paddingHorizontal: 12, borderRadius: 6 },
  submitButtonPressed: { backgroundColor: '#1C1C5C' },
  submitText: { color: PAPER, fontSize: 12, fontWeight: '900', marginLeft: 8 },
});
