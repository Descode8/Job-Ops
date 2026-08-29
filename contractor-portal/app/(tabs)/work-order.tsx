import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
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
import { formatPhoneNumber, phoneNumberDigits } from '@/lib/phone-number';
import { notifyWorkOrderSms } from '@/lib/work-order-sms';

const YELLOW = '#1D4ED8';
const BLUE = '#1D4ED8';
const PAPER = '#FFFFFF';
const MUTED = '#566273';
const WORK_ORDER_RECIPIENT = 'jhumphries@shopmwhs.net';
const MAX_PHOTO_ATTACHMENTS = 10;
const MAX_VIDEO_ATTACHMENTS = 2;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

type ContractorOption = { id: string; full_name: string; is_admin: boolean };
type Priority = 'low' | 'medium' | 'high' | 'emergency';
type PendingAttachment = { uri: string; name: string; mimeType: string; size?: number };

function defaultDeadline() { const date = new Date(); date.setDate(date.getDate() + 7); return date; }
function isVideoAttachment(attachment: PendingAttachment) { return attachment.mimeType.toLowerCase().startsWith('video/'); }

export default function WorkOrderScreen() {
  const { colorScheme, themeMode, colors } = useAppTheme(); const styles = useMemo(() => createStyles(colors), [colors]);
  const workOrderPriorityColor = (priority: string) => getWorkOrderPriorityColor(priority, colorScheme);
  const [priority, setPriority] = useState<Priority>('medium');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [hasDeadline, setHasDeadline] = useState(false);
  const [deadline, setDeadline] = useState(defaultDeadline);
  const [showCalendar, setShowCalendar] = useState(false);
  const [contractors, setContractors] = useState<ContractorOption[]>([]);
  const [currentContractorId, setCurrentContractorId] = useState('');
  const [selectedContractorId, setSelectedContractorId] = useState('');
  const [isContractorListOpen, setIsContractorListOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const photoAttachmentCount = attachments.filter((attachment) => !isVideoAttachment(attachment)).length;
  const videoAttachmentCount = attachments.filter(isVideoAttachment).length;

  useEffect(() => {
    const loadContractors = async () => {
      const [{ data, error }, { data: authData }] = await Promise.all([
        supabase.from('contractors').select('id, full_name, is_admin').eq('is_active', true).order('is_admin', { ascending: false }).order('full_name'),
        supabase.auth.getUser(),
      ]);
      if (error) {
        Alert.alert('Could not load assignees', error.message);
        return;
      }

      const { data: currentContractor } = authData.user
        ? await supabase
            .from('contractors')
            .select('id, full_name, is_admin')
            .eq('auth_user_id', authData.user.id)
            .eq('is_active', true)
            .single()
        : { data: null };

      const availableContractors = ((data ?? []) as ContractorOption[]).filter((contractor) => contractor.id !== currentContractor?.id);
      setContractors(currentContractor ? [currentContractor as ContractorOption, ...availableContractors] : availableContractors);
      if (currentContractor) {
        setCurrentContractorId(currentContractor.id);
        setSelectedContractorId(currentContractor.id);
      }
    };

    void loadContractors();
  }, []);

  const clearForm = () => {
    setCustomerName(''); setCustomerPhone(''); setAddress(''); setDescription('');
    setPriority('medium'); setHasDeadline(false); setDeadline(defaultDeadline());
    setShowCalendar(false); setSelectedContractorId(currentContractorId); setIsContractorListOpen(false);
    setAttachments([]);
  };

  const chooseAttachments = async () => {
    const remainingPhotoSlots = MAX_PHOTO_ATTACHMENTS - photoAttachmentCount;
    const remainingVideoSlots = MAX_VIDEO_ATTACHMENTS - videoAttachmentCount;
    const remainingSlots = remainingPhotoSlots + remainingVideoSlots;
    if (remainingSlots <= 0) { Alert.alert('Attachment limit reached', `Add no more than ${MAX_PHOTO_ATTACHMENTS} photos and ${MAX_VIDEO_ATTACHMENTS} videos.`); return; }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert('Photo access required', 'Allow photo-library access to attach photos or videos.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.8,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
      allowsMultipleSelection: true,
      selectionLimit: remainingSlots,
      orderedSelection: true,
    });
    if (result.canceled) return;
    const selected = result.assets.slice(0, remainingSlots).map((asset, index) => ({
      uri: asset.uri,
      name: asset.fileName ?? `${asset.type === 'video' ? 'work-order-video' : 'work-order-photo'}-${Date.now()}-${index + 1}.${asset.type === 'video' ? 'mp4' : 'jpg'}`,
      mimeType: asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
      size: asset.fileSize,
    }));
    const oversized = selected.find((asset) => asset.size && asset.size > MAX_ATTACHMENT_BYTES);
    if (oversized) { Alert.alert('Attachment is too large', `${oversized.name} is larger than 20 MB. Trim the video or choose a smaller file.`); return; }
    const selectedVideoCount = selected.filter(isVideoAttachment).length;
    const selectedPhotoCount = selected.length - selectedVideoCount;
    if (selectedPhotoCount > remainingPhotoSlots || selectedVideoCount > remainingVideoSlots) {
      Alert.alert('Too many attachments', `You can attach up to ${MAX_PHOTO_ATTACHMENTS} photos and ${MAX_VIDEO_ATTACHMENTS} videos per work order.`);
      return;
    }
    setAttachments((current) => [...current, ...selected]);
  };

  const uploadAttachments = async (workOrderId: string) => {
    for (let index = 0; index < attachments.length; index += 1) {
      const attachment = attachments[index];
      const response = await fetch(attachment.uri);
      if (!response.ok) throw new Error(`Could not read ${attachment.name}.`);
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > MAX_ATTACHMENT_BYTES) throw new Error(`${attachment.name} is larger than 20 MB.`);
      const safeName = attachment.name.replace(/[^a-zA-Z0-9._-]/g, '-');
      const storagePath = `${currentContractorId}/${workOrderId}/admin-${Date.now()}-${index}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from('work-order-files').upload(storagePath, bytes, { contentType: attachment.mimeType });
      if (uploadError) throw new Error(uploadError.message);
      const { error: recordError } = await supabase.from('work_order_files').insert({
        work_order_id: workOrderId,
        uploaded_by: currentContractorId,
        file_type: 'other',
        storage_path: storagePath,
        original_file_name: attachment.name,
        mime_type: attachment.mimeType,
        file_size_bytes: attachment.size ?? bytes.byteLength,
      });
      if (recordError) {
        await supabase.storage.from('work-order-files').remove([storagePath]);
        throw new Error(recordError.message);
      }
    }
  };

  const submitWorkOrder = async () => {
    if (!customerName.trim() || !customerPhone.trim() || !address.trim() || !description.trim()) {
      Alert.alert('Required information missing', 'Enter all required work-order details before submitting.');
      return;
    }

    if (customerPhone.length !== 10) {
      Alert.alert('Invalid phone number', 'Enter exactly 10 numbers for the customer phone number.');
      return;
    }

    if (photoAttachmentCount > MAX_PHOTO_ATTACHMENTS || videoAttachmentCount > MAX_VIDEO_ATTACHMENTS) {
      Alert.alert('Too many attachments', `Add no more than ${MAX_PHOTO_ATTACHMENTS} photos and ${MAX_VIDEO_ATTACHMENTS} videos.`);
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

    if (offerError) {
      setIsSubmitting(false);
      Alert.alert('Could not Create Work Order', offerError.message);
      return;
    }

    const isAssignedToMe = assigneeId === currentContractorId;
    const selectedContractor = contractors.find((contractor) => contractor.id === assigneeId);
    const assigneeName = isAssignedToMe ? 'you' : (selectedContractor?.full_name ?? 'the selected contractor');
    const workOrderId = data?.[0]?.work_order_id;
    const workOrderNumber = data?.[0]?.work_order_number ?? 'New Work Order';
    let attachmentError: string | null = null;
    if (workOrderId && attachments.length) {
      try { await uploadAttachments(workOrderId); }
      catch (error) { attachmentError = error instanceof Error ? error.message : 'An attachment could not be uploaded.'; }
    }
    if (workOrderId) notifyWorkOrderSms(workOrderId, 'work_order_created', undefined, assigneeId);
    const { error: emailError } = workOrderId
      ? await supabase.functions.invoke('send-work-order', { body: { workOrderId, recipientEmail: WORK_ORDER_RECIPIENT } })
      : { error: new Error('The database did not return a work-order ID.') };
    setIsSubmitting(false);

    let emailErrorMessage = emailError?.message;
    if (emailError instanceof FunctionsHttpError) {
      const responseBody = await emailError.context.json().catch(() => null);
      emailErrorMessage = responseBody?.details?.message
        ?? responseBody?.error
        ?? emailError.message;
    }

    Alert.alert(
      emailError || attachmentError ? 'Work order saved with an issue' : 'Work order sent',
      attachmentError
        ? `${formatWorkOrderNumber(workOrderNumber)} was created, but not every attachment uploaded: ${attachmentError}`
        : emailError
        ? `${formatWorkOrderNumber(workOrderNumber)} was ${isAssignedToMe ? 'assigned' : 'offered'} to ${assigneeName}, but the email could not be delivered: ${emailErrorMessage}`
        : `${formatWorkOrderNumber(workOrderNumber)} was ${isAssignedToMe ? 'assigned' : 'offered'} to ${assigneeName} and emailed to ${WORK_ORDER_RECIPIENT}.`,
    );
    clearForm();
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
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>JOBOPS</Text>
            <Text style={styles.title}>Create Work Order</Text>
          </View>
          <View style={styles.headerIcon}>
            <Ionicons name="create" size={28} color={themeMode === 'black' ? PAPER : YELLOW} />
          </View>
        </View>

        <Text style={styles.intro}>Enter the customer and work-order details below.</Text>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Priority</Text>
          <View style={styles.priorityOptions}>{(['low', 'medium', 'high', 'emergency'] as Priority[]).map((option) => <TouchableOpacity key={option} style={[styles.priorityOption, priority === option && styles.priorityOptionSelected]} onPress={() => setPriority(option)} accessibilityRole="radio" accessibilityState={{ checked: priority === option }}><Text style={[styles.priorityOptionText, priority === option && styles.priorityOptionTextSelected, { color: workOrderPriorityColor(option) }]}>{option.toUpperCase()}</Text></TouchableOpacity>)}</View>
        </View>

        <Field label="Customer *" value={customerName} onChangeText={setCustomerName} placeholder="Customer name" />
        <Field label="Customer Phone Number *" value={formatPhoneNumber(customerPhone)} onChangeText={(phone) => setCustomerPhone(phoneNumberDigits(phone))} placeholder="(555) 555-5555" keyboardType="phone-pad" maxLength={14} />
        <Field label="Customer Address *" value={address} onChangeText={setAddress} placeholder="Street, city, state" />
        <Field label="Work Order Description *" value={description} onChangeText={setDescription} placeholder="Describe the work needed" multiline />

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Photos or Videos (Optional)</Text>
          <Text style={styles.attachmentHelp}>Attach up to {MAX_PHOTO_ATTACHMENTS} photos and {MAX_VIDEO_ATTACHMENTS} videos, with a 20 MB limit per file.</Text>
          <Pressable style={({ pressed }) => [styles.attachmentButton, pressed && styles.attachmentButtonPressed]} onPress={() => void chooseAttachments()} disabled={isSubmitting || (photoAttachmentCount >= MAX_PHOTO_ATTACHMENTS && videoAttachmentCount >= MAX_VIDEO_ATTACHMENTS)} accessibilityRole="button">
            <Ionicons name="images" size={20} color={PAPER} />
            <Text style={styles.attachmentButtonText}>Choose Photos or Videos</Text>
          </Pressable>
          <Text style={styles.attachmentCounts}>{photoAttachmentCount}/{MAX_PHOTO_ATTACHMENTS} photos · {videoAttachmentCount}/{MAX_VIDEO_ATTACHMENTS} videos</Text>
          {attachments.map((attachment, index) => <View key={`${attachment.uri}-${index}`} style={styles.attachmentRow}>
            <Ionicons name={attachment.mimeType.startsWith('video/') ? 'videocam' : 'image'} size={20} color={BLUE} />
            <View style={styles.attachmentCopy}><Text style={styles.attachmentName} numberOfLines={1}>{attachment.name}</Text><Text style={styles.attachmentMeta}>{attachment.mimeType.startsWith('video/') ? 'VIDEO' : 'PHOTO'}{attachment.size ? ` · ${(attachment.size / 1024 / 1024).toFixed(1)} MB` : ''}</Text></View>
            <TouchableOpacity onPress={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))} disabled={isSubmitting} accessibilityLabel={`Remove ${attachment.name}`}><Ionicons name="close-circle" size={22} color={colors.danger} /></TouchableOpacity>
          </View>)}
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Completion Deadline</Text>
          <View style={styles.deadlineOptions}>
            <TouchableOpacity style={[styles.deadlineOption, !hasDeadline && styles.deadlineOptionSelected]} onPress={() => { setHasDeadline(false); setShowCalendar(false); }} accessibilityRole="radio" accessibilityState={{ checked: !hasDeadline }}><Ionicons name={!hasDeadline ? 'radio-button-on' : 'radio-button-off'} size={18} color={!hasDeadline ? BLUE : MUTED} /><Text style={[styles.deadlineOptionText, !hasDeadline && styles.deadlineOptionTextSelected]}>No Deadline</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.deadlineOption, hasDeadline && styles.deadlineOptionSelected]} onPress={() => { setHasDeadline(true); setShowCalendar(true); }} accessibilityRole="radio" accessibilityState={{ checked: hasDeadline }}><Ionicons name={hasDeadline ? 'radio-button-on' : 'radio-button-off'} size={18} color={hasDeadline ? BLUE : MUTED} /><Text style={[styles.deadlineOptionText, hasDeadline && styles.deadlineOptionTextSelected]}>Set Deadline</Text></TouchableOpacity>
          </View>
          {hasDeadline && <TouchableOpacity style={styles.calendarButton} onPress={() => setShowCalendar((isOpen) => !isOpen)}><Ionicons name="calendar" size={20} color={BLUE} /><View style={styles.calendarDateCopy}><Text style={styles.calendarLabel}>DEADLINE DATE</Text><Text style={styles.calendarDate}>{deadline.toLocaleDateString(undefined, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}</Text></View><Ionicons name={showCalendar ? 'chevron-up' : 'chevron-down'} size={18} color={PAPER} /></TouchableOpacity>}
          {hasDeadline && showCalendar && <View style={styles.datePickerSurface}><DateTimePicker value={deadline} mode="date" minimumDate={new Date()} display={Platform.OS === 'ios' ? 'inline' : 'calendar'} themeVariant={colorScheme} accentColor={colors.primary} style={styles.datePicker} onChange={(event: DateTimePickerEvent, selectedDate?: Date) => { if (Platform.OS === 'android') setShowCalendar(false); if (event.type === 'set' && selectedDate) setDeadline(selectedDate); }} />{Platform.OS === 'ios' && <TouchableOpacity style={styles.calendarDone} onPress={() => setShowCalendar(false)}><Text style={styles.calendarDoneText}>Done</Text></TouchableOpacity>}</View>}
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Assign to Admin or Contractor</Text>
          <TouchableOpacity
            style={styles.dropdownButton}
            onPress={() => setIsContractorListOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityState={{ expanded: isContractorListOpen }}>
            <Text style={[styles.dropdownText, !selectedContractorId && styles.dropdownPlaceholder]}>
              {selectedContractorId === currentContractorId
                ? 'Me'
                : (() => { const selected = contractors.find((contractor) => contractor.id === selectedContractorId); return selected ? `${selected.full_name}${selected.is_admin ? ' (Admin)' : ''}` : 'Me'; })()}
            </Text>
            <Ionicons name={isContractorListOpen ? 'chevron-up' : 'chevron-down'} size={18} color={PAPER} />
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
                  <View style={styles.dropdownOptionMeta}>
                    <Text style={styles.dropdownRole}>{contractor.is_admin ? 'Administrator' : 'Contractor'}</Text>
                    {selectedContractorId === contractor.id && <Ionicons name="checkmark" size={18} color={BLUE} />}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={styles.emailNotice}>
          <Ionicons name="mail" size={20} color={BLUE} />
          <Text style={styles.emailNoticeText}>Submitting automatically emails the work-order details to <Text style={styles.emailAddress}>{WORK_ORDER_RECIPIENT}</Text>.</Text>
        </View>

        <View style={styles.formActions}>
          <Pressable style={({ pressed }) => [styles.cancelButton, pressed && styles.cancelButtonPressed]} onPress={clearForm} disabled={isSubmitting}><Text style={styles.cancelText}>Cancel</Text></Pressable>
          <Pressable style={({ pressed }) => [styles.submitButton, pressed && styles.submitButtonPressed]} onPress={submitWorkOrder} disabled={isSubmitting}><Text style={styles.submitText}>{isSubmitting ? 'Saving Work Order...' : 'Create Work Order'}</Text></Pressable>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, value, onChangeText, placeholder, multiline = false, keyboardType = 'default', autoCapitalize = 'sentences', maxLength }: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences';
  maxLength?: number;
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
        maxLength={maxLength}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

const createStyles = (colors: AppThemeColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  keyboardAvoidingView: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, backgroundColor: colors.background, paddingHorizontal: 20, paddingBottom: 35 },
  header: { backgroundColor: colors.header, marginHorizontal: -20, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 25, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kicker: { color: YELLOW, fontSize: 10, fontWeight: '900', letterSpacing: 1.4, marginBottom: 8 },
  title: { color: PAPER, fontSize: 27, fontWeight: '900' },
  headerIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  intro: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 21, marginBottom: 3 },
  fieldGroup: { marginTop: 17 },
  label: { color: colors.text, fontSize: 11, fontWeight: '800', marginBottom: 7 },
  input: { borderWidth: 0.5, borderColor: colors.border, backgroundColor: colors.input, minHeight: 47, paddingHorizontal: 13, color: colors.text, fontSize: 13, borderRadius: 6 },
  multilineInput: { minHeight: 94, paddingTop: 13 },
  attachmentHelp: { color: colors.textMuted, fontSize: 10, lineHeight: 15, marginBottom: 9 },
  attachmentButton: { minHeight: 47, borderRadius: 6, backgroundColor: '#243B5C', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12 },
  attachmentButtonPressed: { backgroundColor: '#0E1F35' },
  attachmentButtonText: { color: PAPER, fontSize: 11, fontWeight: '900' },
  attachmentCounts: { color: colors.textMuted, fontSize: 9, fontWeight: '800', textAlign: 'center', marginTop: 7 },
  attachmentRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 0.5, borderBottomColor: colors.border, paddingHorizontal: 4 },
  attachmentCopy: { flex: 1 }, attachmentName: { color: colors.text, fontSize: 11, fontWeight: '800' }, attachmentMeta: { color: colors.textMuted, fontSize: 8, fontWeight: '900', marginTop: 3 },
  priorityOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  priorityOption: { minHeight: 40, paddingHorizontal: 12, borderWidth: 0.5, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  priorityOptionSelected: { borderColor: '#0E1F35', backgroundColor: '#0E1F35' },
  priorityOptionText: { color: colors.textMuted, fontSize: 9, fontWeight: '900' },
  priorityOptionTextSelected: { color: colors.primaryStrong },
  deadlineOptions: { flexDirection: 'row', gap: 9 },
  deadlineOption: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 0.5, borderColor: colors.border, backgroundColor: colors.input, borderRadius: 6 },
  deadlineOptionSelected: { borderColor: '#0E1F35', backgroundColor: '#0E1F35' },
  deadlineOptionText: { color: colors.textMuted, fontSize: 11, fontWeight: '800' },
  deadlineOptionTextSelected: { color: PAPER },
  calendarButton: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 0.5, borderColor: colors.border, backgroundColor: '#243B5C', paddingHorizontal: 13, marginTop: 9, borderRadius: 6 },
  calendarDateCopy: { flex: 1, alignSelf: 'stretch', justifyContent: 'center' },
  calendarLabel: { color: colors.textMuted, fontSize: 8, fontWeight: '900' },
  calendarDate: { color: PAPER, fontSize: 12, fontWeight: '800', marginTop: 3 },
  datePickerSurface: { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: 8, marginTop: 9, overflow: 'hidden' },
  datePicker: { backgroundColor: colors.surface, alignSelf: 'stretch' },
  calendarDone: { minHeight: 42, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center', borderTopWidth: 0.5, borderTopColor: colors.border },
  calendarDoneText: { color: BLUE, fontSize: 12, fontWeight: '900' },
  dropdownButton: { borderWidth: 0.5, borderColor: colors.border, backgroundColor: '#243B5C', minHeight: 47, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 6 },
  dropdownText: { color: PAPER, fontSize: 13, fontWeight: '700' },
  dropdownPlaceholder: { color: PAPER },
  dropdownList: { borderWidth: 0.5, borderTopWidth: 0, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 6 },
  dropdownOption: { minHeight: 47, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: colors.border, borderRadius: 6 },
  dropdownOptionText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  dropdownOptionMeta: { flexDirection: 'row', alignItems: 'center', gap: 7, marginLeft: 10 },
  dropdownRole: { color: colors.textMuted, fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.4 },
  emptyDropdownText: { color: colors.textMuted, fontSize: 12, padding: 13 },
  emailNotice: { flexDirection: 'row', backgroundColor: colors.surfaceMuted, padding: 13, marginTop: 22, alignItems: 'flex-start', borderRadius: 6 },
  emailNoticeText: { color: colors.textMuted, fontSize: 11, lineHeight: 16, flex: 1, marginLeft: 9 },
  emailAddress: { color: colors.text, fontWeight: '900' },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  cancelButton: { flex: 1, minHeight: 52, borderWidth: 0.5, borderColor: colors.border, backgroundColor: '#243B5C', alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  cancelButtonPressed: { backgroundColor: '#0E1F35' },
  cancelText: { color: PAPER, fontSize: 12, fontWeight: '900' },
  submitButton: { flex: 2, minHeight: 52, backgroundColor: '#243B5C', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 6 },
  submitButtonPressed: { backgroundColor: '#0E1F35' },
  submitText: { color: PAPER, fontSize: 12, fontWeight: '900', marginLeft: 8 },
});
