import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Image, ImageBackground } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { type AppThemeColors, useAppTheme } from '@/contexts/theme-context';
import { supabase } from '@/lib/supabase';

const YELLOW = '#FFF200'; const NAVY = '#003366'; const BLUE = '#1E67B2'; const PAPER = '#FFFFFF';

type WorkOrder = {
  id: string; work_order_number: string; title: string; description: string; status: string;
  priority: string; deadline_at: string | null; created_at: string;
  properties: { customer_name: string | null; customer_phone: string | null; address_line_1: string; city: string; state: string } | null;
};
type Note = { id: string; note: string; created_at: string };
type WorkOrderFile = { id: string; file_type: string; storage_path: string; original_file_name: string; mime_type: string; created_at: string; url?: string };
type Requirements = { active: number; complete: number };
type ChecklistItem = { id: number; label: string };
type ContractorOption = { id: string; full_name: string; email: string | null; phone_number: string };
type Assignment = { contractor_id: string; contractors: ContractorOption | null };
type Priority = 'low' | 'medium' | 'high' | 'emergency';

const PHOTO_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif', 'image/webp']);
const PHOTO_EXTENSIONS = /\.(jpe?g|png|heic|heif|webp)$/i;

export default function WorkOrderDetailScreen() {
  const { colorScheme, colors } = useAppTheme(); const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { id, action } = useLocalSearchParams<{ id: string; action?: string }>();
  const [order, setOrder] = useState<WorkOrder | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [files, setFiles] = useState<WorkOrderFile[]>([]);
  const [requirements, setRequirements] = useState<Requirements>({ active: 0, complete: 0 });
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [completedChecklist, setCompletedChecklist] = useState<number[]>([]);
  const [previewFile, setPreviewFile] = useState<WorkOrderFile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [contractors, setContractors] = useState<ContractorOption[]>([]);
  const [isAssignmentOpen, setIsAssignmentOpen] = useState(false);
  const [contractorId, setContractorId] = useState('');
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editCustomerPhone, setEditCustomerPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editState, setEditState] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPriority, setEditPriority] = useState<Priority>('medium');
  const [editHasDeadline, setEditHasDeadline] = useState(false);
  const [editDeadline, setEditDeadline] = useState(new Date());
  const [showEditCalendar, setShowEditCalendar] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: authData } = await supabase.auth.getUser();
      const [{ data: workOrder, error }, { data: contractor }, { data: jobNotes }, { data: workOrderFiles }, { data: checklistItems }, { data: checklist }, { data: activeAssignment }, { data: contractorOptions }] = await Promise.all([
        supabase.from('work_orders').select('id, work_order_number, title, description, status, priority, deadline_at, created_at, properties(customer_name, customer_phone, address_line_1, city, state)').eq('id', id).single(),
        authData.user ? supabase.from('contractors').select('id, is_admin').eq('auth_user_id', authData.user.id).eq('is_active', true).single() : Promise.resolve({ data: null }),
        supabase.from('work_order_notes').select('id, note, created_at').eq('work_order_id', id).order('created_at', { ascending: false }),
        supabase.from('work_order_files').select('id, file_type, storage_path, original_file_name, mime_type, created_at').eq('work_order_id', id).order('created_at', { ascending: false }),
        supabase.from('home_checklist_items').select('id, label').eq('is_active', true).order('sort_order'),
        supabase.from('work_order_checklist').select('checklist_item_id, is_complete').eq('work_order_id', id).eq('is_complete', true),
        supabase.from('work_order_assignments').select('contractor_id, contractors(id, full_name, email, phone_number)').eq('work_order_id', id).is('unassigned_at', null).maybeSingle(),
        supabase.from('contractors').select('id, full_name, email, phone_number').eq('is_active', true).eq('is_admin', false).order('full_name'),
      ]);
      if (error || !workOrder) { Alert.alert('Work order unavailable', error?.message ?? 'This work order could not be found.', [{ text: 'Back', onPress: () => router.back() }]); return; }
      setOrder(workOrder as unknown as WorkOrder);
      setContractorId(contractor?.id ?? '');
      setIsAdmin(Boolean(contractor?.is_admin));
      setAssignment((activeAssignment as unknown as Assignment | null) ?? null);
      setContractors((contractorOptions ?? []) as ContractorOption[]);
      setNotes((jobNotes ?? []) as Note[]);
      const fileRows = (workOrderFiles ?? []) as WorkOrderFile[];
      const withUrls = await Promise.all(fileRows.map(async (file) => {
        const { data } = await supabase.storage.from('work-order-files').createSignedUrl(file.storage_path, 3600);
        return { ...file, url: data?.signedUrl };
      }));
      setFiles(withUrls);
      setRequirements({ active: checklistItems?.length ?? 0, complete: checklist?.length ?? 0 });
      setChecklistItems((checklistItems ?? []) as ChecklistItem[]);
      setCompletedChecklist((checklist ?? []).map((row) => row.checklist_item_id));
    };
    void load();
  }, [action, id, router]);

  const address = order?.properties ? `${order.properties.address_line_1}, ${order.properties.city}, ${order.properties.state}` : '';
  const isCompleted = order?.status === 'completed';
  const hasPhoto = files.some((file) => file.file_type.endsWith('_photo') && PHOTO_MIME_TYPES.has(file.mime_type.toLowerCase()));
  const hasInvoice = files.some((file) => file.file_type === 'invoice' && file.mime_type.toLowerCase() === 'application/pdf');
  const canFinalize = !isCompleted && requirements.active > 0 && requirements.active === requirements.complete && hasPhoto && hasInvoice;

  const openDirections = async () => {
    if (!address) return;
    await Linking.openURL(`https://maps.apple.com/?daddr=${encodeURIComponent(address)}&dirflg=d`);
  };

  const refreshStatus = async () => {
    if (!order) return;
    const { data } = await supabase.rpc('refresh_work_order_status', { p_work_order_id: order.id });
    if (data) setOrder((current) => current ? { ...current, status: data } : current);
  };

  const callCustomer = async () => {
    const phone = order?.properties?.customer_phone?.trim();
    if (!phone) { Alert.alert('Phone number unavailable', 'No Customer Phone Number is saved for this work order.'); return; }
    const phoneUrl = `tel:${phone.replace(/[^\d+]/g, '')}`;
    if (await Linking.canOpenURL(phoneUrl)) await Linking.openURL(phoneUrl);
    else Alert.alert('Calling unavailable', 'This device cannot open the phone dialer.');
  };

  const toggleChecklistItem = async (itemId: number) => {
    if (!order || !contractorId || isCompleted || isSaving) return;
    const isComplete = !completedChecklist.includes(itemId);
    setCompletedChecklist((current) => isComplete ? [...current, itemId] : current.filter((value) => value !== itemId));
    setRequirements((current) => ({ ...current, complete: current.complete + (isComplete ? 1 : -1) }));
    const { error } = await supabase.rpc('set_work_order_checklist_item', {
      p_work_order_id: order.id,
      p_checklist_item_id: itemId,
      p_is_complete: isComplete,
    });
    if (error) {
      setCompletedChecklist((current) => isComplete ? current.filter((value) => value !== itemId) : [...current, itemId]);
      setRequirements((current) => ({ ...current, complete: current.complete + (isComplete ? -1 : 1) }));
      Alert.alert('Checklist was not saved', error.message);
      return;
    }
    await refreshStatus();
  };

  const reassignWorkOrder = async (nextContractor: ContractorOption) => {
    if (!order || !isAdmin || isCompleted) return;
    setIsSaving(true);
    const { error } = await supabase.rpc('admin_reassign_work_order', { p_work_order_id: order.id, p_contractor_id: nextContractor.id });
    setIsSaving(false); setIsAssignmentOpen(false);
    if (error) { Alert.alert('Could not reassign work order', error.message); return; }
    setAssignment({ contractor_id: nextContractor.id, contractors: nextContractor });
    Alert.alert('Work order reassigned', `${nextContractor.full_name} is now assigned to #${order.work_order_number}.`);
  };

  const saveNote = async () => {
    if (!note.trim() || !order || !contractorId) return;
    setIsSaving(true);
    const { data, error } = await supabase.from('work_order_notes').insert({ work_order_id: order.id, author_id: contractorId, note: note.trim() }).select('id, note, created_at').single();
    setIsSaving(false);
    if (error) { Alert.alert('Note was not saved', error.message); return; }
    setNotes((current) => [data as Note, ...current]);
    setNote('');
    await refreshStatus();
  };

  const uploadFile = async (kind: 'photo' | 'invoice') => {
    if (!order || !contractorId || isCompleted) return;
    let asset: { uri: string; name: string; mimeType: string; size?: number } | null = null;
    if (kind === 'photo') {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { Alert.alert('Photo access required', 'Allow photo access to upload job photos.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
      if (!result.canceled) {
        const image = result.assets[0];
        asset = { uri: image.uri, name: image.fileName ?? `job-photo-${Date.now()}.jpg`, mimeType: image.mimeType ?? 'image/jpeg', size: image.fileSize };
      }
    } else {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
      if (!result.canceled) {
        const document = result.assets[0];
        asset = { uri: document.uri, name: document.name, mimeType: document.mimeType ?? 'application/octet-stream', size: document.size };
      }
    }
    if (!asset) return;
    const normalizedMime = asset.mimeType.toLowerCase();
    if (kind === 'photo' && (!PHOTO_MIME_TYPES.has(normalizedMime) || !PHOTO_EXTENSIONS.test(asset.name))) {
      Alert.alert('Unsupported photo', 'Upload a JPG, JPEG, PNG, HEIC, HEIF, or WEBP image from an Android phone or iPhone.'); return;
    }
    if (kind === 'invoice' && (normalizedMime !== 'application/pdf' || !asset.name.toLowerCase().endsWith('.pdf'))) {
      Alert.alert('PDF invoice required', 'Invoices must be uploaded as a .pdf file.'); return;
    }
    setIsSaving(true);
    const safeName = asset.name.replace(/[^a-zA-Z0-9._-]/g, '-');
    const storagePath = `${contractorId}/${order.id}/${Date.now()}-${safeName}`;
    const bytes = await fetch(asset.uri).then((response) => response.arrayBuffer());
    const { error: uploadError } = await supabase.storage.from('work-order-files').upload(storagePath, bytes, { contentType: asset.mimeType });
    if (uploadError) { setIsSaving(false); Alert.alert('Upload failed', `${uploadError.message}\n\nApply database/14_work_order_file_storage.sql in Supabase if the storage bucket has not been created.`); return; }
    const { error: recordError } = await supabase.from('work_order_files').insert({
      work_order_id: order.id, uploaded_by: contractorId, file_type: kind === 'photo' ? 'completion_photo' : 'invoice',
      storage_path: storagePath, original_file_name: asset.name, mime_type: asset.mimeType, file_size_bytes: asset.size ?? bytes.byteLength,
    });
    setIsSaving(false);
    if (recordError) { Alert.alert('File uploaded, record failed', recordError.message); return; }
    const savedFile = { id: `${Date.now()}`, file_type: kind === 'photo' ? 'completion_photo' : 'invoice', storage_path: storagePath, original_file_name: asset.name, mime_type: asset.mimeType, created_at: new Date().toISOString() };
    const { data: signed } = await supabase.storage.from('work-order-files').createSignedUrl(storagePath, 3600);
    setFiles((current) => [{ ...savedFile, url: signed?.signedUrl }, ...current]);
    await refreshStatus();
    Alert.alert(kind === 'photo' ? 'Photo uploaded' : 'Invoice uploaded', `${asset.name} was attached to work order ${order.work_order_number}.`);
  };

  const finalizeWorkOrder = async () => {
    if (!order || !canFinalize) return;
    setIsSaving(true);
    const { data, error } = await supabase.rpc('finalize_work_order', { p_work_order_id: order.id });
    setIsSaving(false);
    if (error) { Alert.alert('Could not finalize work order', error.message); return; }
    setOrder((current) => current ? { ...current, status: data ?? 'completed' } : current);
    Alert.alert('Work order finalized', `#${order.work_order_number} is now available in the Complete WO tab.`);
  };

  const openEditWorkOrder = () => {
    if (!order || !isAdmin) return;
    setEditCustomerName(order.properties?.customer_name ?? '');
    setEditCustomerPhone(order.properties?.customer_phone ?? '');
    setEditAddress(order.properties?.address_line_1 ?? '');
    setEditCity(order.properties?.city ?? '');
    setEditState(order.properties?.state ?? '');
    setEditDescription(order.description);
    setEditPriority(order.priority as Priority);
    setEditHasDeadline(Boolean(order.deadline_at));
    setEditDeadline(order.deadline_at ? new Date(order.deadline_at) : new Date());
    setShowEditCalendar(false);
    setIsEditOpen(true);
  };

  const saveWorkOrderEdits = async () => {
    if (!order || !isAdmin || isSaving) return;
    if (![editCustomerName, editCustomerPhone, editAddress, editCity, editState, editDescription].every((value) => value.trim())) {
      Alert.alert('Required information missing', 'Complete every work-order field before saving.');
      return;
    }
    setIsSaving(true);
    const { error } = await supabase.rpc('admin_update_work_order', {
      p_work_order_id: order.id,
      p_customer_name: editCustomerName.trim(),
      p_customer_phone: editCustomerPhone.trim(),
      p_address_line_1: editAddress.trim(),
      p_city: editCity.trim(),
      p_state: editState.trim(),
      p_description: editDescription.trim(),
      p_priority: editPriority,
      p_deadline_at: editHasDeadline ? editDeadline.toISOString() : null,
    });
    setIsSaving(false);
    if (error) { Alert.alert('Could not update work order', error.message); return; }
    setOrder((current) => current ? {
      ...current,
      title: `Work order for ${editCustomerName.trim()}`,
      description: editDescription.trim(),
      priority: editPriority,
      deadline_at: editHasDeadline ? editDeadline.toISOString() : null,
      properties: current.properties ? {
        ...current.properties,
        customer_name: editCustomerName.trim(), customer_phone: editCustomerPhone.trim(),
        address_line_1: editAddress.trim(), city: editCity.trim(), state: editState.trim().toUpperCase(),
      } : null,
    } : current);
    setIsEditOpen(false);
    Alert.alert('Work order updated', `#${order.work_order_number} has been updated.`);
  };

  const deleteWorkOrder = () => {
    if (!order || !isAdmin || isSaving) return;
    Alert.alert(
      'Permanently delete work order?',
      `#${order.work_order_number} and all of its assignments, notes, checklist entries, photos, invoices, and notifications will be deleted. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete permanently', style: 'destructive', onPress: async () => {
          setIsSaving(true);
          const storagePaths = files.map((file) => file.storage_path);
          if (storagePaths.length) {
            const { error: storageError } = await supabase.storage.from('work-order-files').remove(storagePaths);
            if (storageError) { setIsSaving(false); Alert.alert('Could not delete work order files', storageError.message); return; }
          }
          const { error } = await supabase.rpc('admin_delete_work_order', { p_work_order_id: order.id });
          setIsSaving(false);
          if (error) { Alert.alert('Could not delete work order', error.message); return; }
          Alert.alert('Work order deleted', `#${order.work_order_number} was permanently deleted.`, [{ text: 'OK', onPress: () => router.back() }]);
        } },
      ],
    );
  };

  return <SafeAreaView style={styles.safeArea} edges={['top']}>
    <ImageBackground source={require('@/assets/images/dark-blue-particle-texture-background.jpg')} style={styles.header} contentFit="cover">
      <TouchableOpacity onPress={() => router.back()} style={[styles.backButton, styles.roundedButton]} accessibilityLabel="Go back"><Ionicons name="arrow-back" size={22} color={PAPER} /></TouchableOpacity>
      <View style={styles.headerCopy}><Text style={styles.kicker}>WORK ORDER</Text><Text style={styles.headerTitle}>{order ? `#${order.work_order_number}` : 'Loading...'}</Text></View>
    </ImageBackground>
    <KeyboardAvoidingView style={styles.keyboardArea} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets>
      {order && <>
        <View style={styles.statusRow}><View style={styles.statusLabel}><View style={[styles.statusCircle, { backgroundColor: statusColor(order.status) }]} /><Text style={styles.status}>{order.status.replaceAll('_', ' ').toUpperCase()}</Text></View><Text style={styles.priority}>{order.priority.toUpperCase()} PRIORITY</Text></View>
        <Text style={styles.title}>{order.properties?.customer_name || order.title}</Text>
        <Text style={styles.description}>{order.description}</Text>

        {isAdmin && <View style={styles.adminActions}>
          <Pressable style={({ pressed }) => [styles.editButton, pressed && styles.editButtonPressed]} onPress={openEditWorkOrder} disabled={isSaving}><Ionicons name="create-outline" size={18} color={PAPER} /><Text style={styles.adminActionText}>Edit Work Order</Text></Pressable>
          <Pressable style={({ pressed }) => [styles.deleteButton, pressed && styles.deleteButtonPressed]} onPress={deleteWorkOrder} disabled={isSaving}><Ionicons name="trash-outline" size={18} color={PAPER} /><Text style={styles.adminActionText}>Delete</Text></Pressable>
        </View>}

        <View style={[styles.card, styles.roundedButton]}>
          <Text style={styles.sectionLabel}>CUSTOMER & LOCATION</Text>
          <Detail icon="person-outline" text={order.properties?.customer_name || 'Customer not provided'} />
          <TouchableOpacity style={styles.detail} onPress={() => void callCustomer()} accessibilityRole="button" accessibilityLabel={`Call ${order.properties?.customer_name || 'customer'}`}>
            <Ionicons name="call-outline" size={18} color={BLUE} />
            <Text style={[styles.detailText, styles.phoneText]}>{order.properties?.customer_phone || 'Phone not provided'}</Text>
          </TouchableOpacity>
          <Detail icon="location-outline" text={address || 'Address unavailable'} />
          <Pressable style={({ pressed }) => [styles.directionsButton, styles.roundedButton, pressed && styles.directionsButtonPressed]} onPress={() => void openDirections()} disabled={!address}><Ionicons name="navigate" size={18} color={PAPER} /><Text style={styles.directionsText}>Start Navigation</Text></Pressable>
        </View>

        {isAdmin && <View style={[styles.card, styles.roundedButton]}>
          <Text style={styles.sectionLabel}>ASSIGNED CONTRACTOR</Text>
          {assignment?.contractors ? <View style={styles.assigneeInfo}><View style={styles.assigneeIcon}><Ionicons name="person" size={20} color={BLUE} /></View><View style={styles.assigneeCopy}><Text style={styles.assigneeName}>{assignment.contractors.full_name}</Text><Text style={styles.assigneeMeta}>{assignment.contractors.email || 'No email'}</Text><Text style={styles.assigneeMeta}>{assignment.contractors.phone_number}</Text></View></View> : <Text style={styles.emptyText}>No contractor is currently assigned.</Text>}
          {!isCompleted && <><TouchableOpacity style={styles.reassignButton} onPress={() => setIsAssignmentOpen((open) => !open)} disabled={isSaving}><Ionicons name="swap-horizontal" size={18} color={PAPER} /><Text style={styles.reassignText}>Reassign contractor</Text><Ionicons name={isAssignmentOpen ? 'chevron-up' : 'chevron-down'} size={17} color={PAPER} /></TouchableOpacity>
          {isAssignmentOpen && <View style={styles.assigneeList}>{contractors.map((item) => <TouchableOpacity key={item.id} style={[styles.assigneeOption, item.id === assignment?.contractor_id && styles.assigneeOptionCurrent]} disabled={item.id === assignment?.contractor_id || isSaving} onPress={() => void reassignWorkOrder(item)}><View><Text style={styles.assigneeOptionName}>{item.full_name}</Text><Text style={styles.assigneeOptionMeta}>{item.email} · {item.phone_number}</Text></View>{item.id === assignment?.contractor_id && <Text style={styles.currentLabel}>CURRENT</Text>}</TouchableOpacity>)}{contractors.length === 0 && <Text style={styles.emptyText}>No active contractors are available.</Text>}</View>}</>}
        </View>}

        <View style={[styles.card, styles.roundedButton]}>
          <View style={styles.checklistHeader}>
            <Text style={styles.sectionLabel}>HOME COMPLETION CHECKLIST</Text>
            <Text style={styles.checklistCount}>{completedChecklist.length}/{checklistItems.length}</Text>
          </View>
          <Text style={styles.checklistHelp}>{isCompleted ? 'Checklist completed for this work order.' : 'Mark each item as it is verified at the home.'}</Text>
          {checklistItems.map((item) => {
            const checked = completedChecklist.includes(item.id);
            return <TouchableOpacity key={item.id} style={styles.checklistItem} onPress={() => void toggleChecklistItem(item.id)} disabled={isCompleted || isSaving} accessibilityRole="checkbox" accessibilityState={{ checked, disabled: isCompleted }}>
              <View style={[styles.checkbox, checked && styles.checkboxComplete]}>{checked && <Ionicons name="checkmark" size={15} color={PAPER} />}</View>
              <Text style={[styles.checklistLabel, checked && styles.checklistLabelComplete]}>{item.label}</Text>
            </TouchableOpacity>;
          })}
          {checklistItems.length === 0 && <Text style={styles.emptyText}>No active checklist items are configured.</Text>}
        </View>

        <View style={styles.uploadRow}>
          <TouchableOpacity style={[styles.uploadButton, styles.roundedButton, isCompleted && styles.disabled]} onPress={() => void uploadFile('photo')} disabled={isSaving || isCompleted}><Ionicons name="camera-outline" size={21} color={BLUE} /><Text style={styles.uploadText}>Upload photo</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.uploadButton, styles.roundedButton, isCompleted && styles.disabled]} onPress={() => void uploadFile('invoice')} disabled={isSaving || isCompleted}><Ionicons name="receipt-outline" size={21} color={BLUE} /><Text style={styles.uploadText}>Upload PDF invoice</Text></TouchableOpacity>
        </View>

        <View style={[styles.card, styles.roundedButton]}>
          <Text style={styles.sectionLabel}>ATTACHMENTS</Text>
          {files.map((file) => <TouchableOpacity key={file.id} style={styles.fileRow} disabled={!file.url} onPress={() => file.url && setPreviewFile(file)}>
            {file.file_type.endsWith('_photo') && file.url
              ? <Image source={{ uri: file.url }} style={styles.thumbnail} contentFit="cover" />
              : <View style={styles.fileIcon}><Ionicons name="document-text-outline" size={22} color={BLUE} /></View>}
            <View style={styles.fileCopy}><Text style={styles.fileName} numberOfLines={1}>{file.original_file_name}</Text><Text style={styles.fileMeta}>{file.file_type === 'invoice' ? 'PDF INVOICE' : 'JOB PHOTO'} · {new Date(file.created_at).toLocaleDateString()}</Text></View>
            <Ionicons name="open-outline" size={18} color={BLUE} />
          </TouchableOpacity>)}
          {files.length === 0 && <Text style={styles.emptyText}>No photos or invoices uploaded yet.</Text>}
        </View>

        <View style={[styles.card, styles.roundedButton]}>
          <Text style={styles.sectionLabel}>COMPLETION REQUIREMENTS</Text>
          <Requirement met={requirements.active > 0 && requirements.active === requirements.complete} text={`All checklist items (${requirements.complete}/${requirements.active})`} />
          <Requirement met={hasPhoto} text="At least one job photo" />
          <Requirement met={hasInvoice} text="PDF invoice" />
          <Text style={styles.optionalText}>Job note (optional)</Text>
          {isCompleted
            ? <View style={styles.completedBanner}><Ionicons name="checkmark-done" size={20} color="#2E8B57" /><Text style={styles.completedText}>WORK ORDER FINALIZED</Text></View>
            : canFinalize
              ? <Pressable style={({ pressed }) => [styles.finalizeButton, styles.roundedButton, pressed && styles.finalizePressed]} onPress={() => void finalizeWorkOrder()} disabled={isSaving}><Text style={styles.finalizeText}>{isSaving ? 'Finalizing...' : 'Finalize WO'}</Text></Pressable>
              : <Text style={styles.readyHint}>Finalize WO will appear when all required items are complete.</Text>}
        </View>

        <View style={[styles.card, styles.roundedButton]}>
          <Text style={styles.sectionLabel}>SCHEDULE</Text>
          <Text style={styles.meta}>Created {new Date(order.created_at).toLocaleDateString()}</Text>
          <Text style={styles.meta}>{order.deadline_at ? `Due ${new Date(order.deadline_at).toLocaleDateString()}` : 'No Deadline Set'}</Text>
        </View>

        <View style={[styles.card, styles.roundedButton]}>
          <Text style={styles.sectionLabel}>JOB NOTES</Text>
          {!isCompleted && <><TextInput style={[styles.noteInput, styles.roundedButton]} value={note} onChangeText={setNote} placeholder="Add an optional update for this job" placeholderTextColor="#8A98A8" multiline />
          <Pressable style={({ pressed }) => [styles.saveButton, styles.roundedButton, pressed && styles.saveButtonPressed]} onPress={() => void saveNote()} disabled={isSaving || !note.trim()}><Text style={styles.saveText}>{isSaving ? 'Saving...' : 'Save note'}</Text></Pressable></>}
          {notes.map((item) => <View key={item.id} style={styles.note}><Text style={styles.noteDate}>{new Date(item.created_at).toLocaleString()}</Text><Text style={styles.noteBody}>{item.note}</Text></View>)}
          {notes.length === 0 && <Text style={styles.emptyText}>No job notes yet.</Text>}
        </View>
      </>}
    </ScrollView>
    </KeyboardAvoidingView>
    <Modal visible={Boolean(previewFile)} transparent animationType="fade" onRequestClose={() => setPreviewFile(null)} statusBarTranslucent>
      <View style={styles.modalBackdrop}>
        <View style={styles.previewModal}>
          <View style={styles.previewHeader}>
            <View style={styles.previewTitleCopy}><Text style={styles.previewTitle} numberOfLines={1}>{previewFile?.original_file_name}</Text><Text style={styles.previewType}>{previewFile?.file_type === 'invoice' ? 'PDF INVOICE' : 'JOB PHOTO'}</Text></View>
            <TouchableOpacity style={styles.closeButton} onPress={() => setPreviewFile(null)} accessibilityRole="button" accessibilityLabel="Close attachment preview"><Ionicons name="close" size={24} color={PAPER} /></TouchableOpacity>
          </View>
          <View style={styles.previewBody}>
            {previewFile?.url && previewFile.file_type.endsWith('_photo')
              ? <Image source={{ uri: previewFile.url }} style={styles.previewImage} contentFit="contain" />
              : previewFile?.url
                ? <WebView source={{ uri: previewFile.url }} style={styles.pdfViewer} startInLoadingState renderLoading={() => <View style={styles.viewerLoading}><Text style={styles.viewerLoadingText}>Loading PDF...</Text></View>} />
                : null}
          </View>
        </View>
      </View>
    </Modal>
    <Modal visible={isEditOpen} animationType="slide" onRequestClose={() => setIsEditOpen(false)}>
      <SafeAreaView style={styles.editSafeArea} edges={['top', 'bottom']}>
        <View style={styles.editHeader}><Text style={styles.editHeaderTitle}>Edit Work Order</Text><TouchableOpacity style={styles.editClose} onPress={() => setIsEditOpen(false)} disabled={isSaving}><Ionicons name="close" size={25} color={PAPER} /></TouchableOpacity></View>
        <ScrollView contentContainerStyle={styles.editContent} keyboardShouldPersistTaps="handled">
          <EditField label="Customer name" value={editCustomerName} onChangeText={setEditCustomerName} />
          <EditField label="Customer phone" value={editCustomerPhone} onChangeText={setEditCustomerPhone} keyboardType="phone-pad" />
          <EditField label="Street address" value={editAddress} onChangeText={setEditAddress} />
          <View style={styles.editLocationRow}><View style={styles.editCity}><EditField label="City" value={editCity} onChangeText={setEditCity} /></View><View style={styles.editState}><EditField label="State" value={editState} onChangeText={setEditState} autoCapitalize="characters" /></View></View>
          <EditField label="Description" value={editDescription} onChangeText={setEditDescription} multiline />
          <Text style={styles.editLabel}>Priority</Text>
          <View style={styles.priorityOptions}>{(['low', 'medium', 'high', 'emergency'] as Priority[]).map((priority) => <TouchableOpacity key={priority} style={[styles.priorityOption, editPriority === priority && styles.priorityOptionSelected]} onPress={() => setEditPriority(priority)}><Text style={[styles.priorityOptionText, editPriority === priority && styles.priorityOptionTextSelected]}>{priority.toUpperCase()}</Text></TouchableOpacity>)}</View>
          <Text style={styles.editLabel}>Completion deadline</Text>
          <View style={styles.deadlineOptions}><TouchableOpacity style={[styles.deadlineOption, !editHasDeadline && styles.deadlineOptionSelected]} onPress={() => { setEditHasDeadline(false); setShowEditCalendar(false); }}><Ionicons name={!editHasDeadline ? 'radio-button-on' : 'radio-button-off'} size={18} color={BLUE} /><Text style={styles.deadlineText}>No deadline</Text></TouchableOpacity><TouchableOpacity style={[styles.deadlineOption, editHasDeadline && styles.deadlineOptionSelected]} onPress={() => { setEditHasDeadline(true); setShowEditCalendar(true); }}><Ionicons name={editHasDeadline ? 'radio-button-on' : 'radio-button-off'} size={18} color={BLUE} /><Text style={styles.deadlineText}>Set deadline</Text></TouchableOpacity></View>
          {editHasDeadline && <TouchableOpacity style={styles.editDateButton} onPress={() => setShowEditCalendar(true)}><Ionicons name="calendar-outline" size={20} color={BLUE} /><Text style={styles.editDateText}>{editDeadline.toLocaleDateString(undefined, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}</Text></TouchableOpacity>}
          {editHasDeadline && showEditCalendar && <DateTimePicker value={editDeadline} mode="date" display={Platform.OS === 'ios' ? 'inline' : 'calendar'} themeVariant={colorScheme} accentColor={colors.primary} onChange={(event: DateTimePickerEvent, date?: Date) => { if (Platform.OS === 'android') setShowEditCalendar(false); if (event.type === 'set' && date) setEditDeadline(date); }} />}
          <Pressable style={({ pressed }) => [styles.saveEditsButton, pressed && styles.saveEditsPressed, isSaving && styles.disabled]} onPress={() => void saveWorkOrderEdits()} disabled={isSaving}><Text style={styles.saveEditsText}>{isSaving ? 'Saving...' : 'Save Changes'}</Text></Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  </SafeAreaView>;
}

function Detail({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) { const { colors } = useAppTheme(); const styles = useMemo(() => createStyles(colors), [colors]); return <View style={styles.detail}><Ionicons name={icon} size={18} color={colors.primary} /><Text style={styles.detailText}>{text}</Text></View>; }
function Requirement({ met, text }: { met: boolean; text: string }) { const { colors } = useAppTheme(); const styles = useMemo(() => createStyles(colors), [colors]); return <View style={styles.requirement}><Ionicons name={met ? 'checkmark-circle' : 'ellipse-outline'} size={19} color={met ? colors.success : colors.textMuted} /><Text style={styles.requirementText}>{text}</Text></View>; }
function EditField({ label, value, onChangeText, multiline = false, keyboardType = 'default', autoCapitalize = 'sentences' }: { label: string; value: string; onChangeText: (value: string) => void; multiline?: boolean; keyboardType?: 'default' | 'phone-pad'; autoCapitalize?: 'sentences' | 'characters' }) { const { colors } = useAppTheme(); const styles = useMemo(() => createStyles(colors), [colors]); return <View style={styles.editField}><Text style={styles.editLabel}>{label}</Text><TextInput style={[styles.editInput, multiline && styles.editMultiline]} value={value} onChangeText={onChangeText} placeholderTextColor={colors.textMuted} multiline={multiline} keyboardType={keyboardType} autoCapitalize={autoCapitalize} textAlignVertical={multiline ? 'top' : 'center'} /></View>; }
function statusColor(status: string) { if (status === 'completed') return '#2E8B57'; if (status === 'in_progress') return BLUE; return '#8B97A5'; }

const createStyles = (colors: AppThemeColors) => StyleSheet.create({
  roundedButton: { borderRadius: 6 },
  adminActions: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  editButton: { flex: 1, minHeight: 52, backgroundColor: '#2577BB', borderRadius: 6, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  editButtonPressed: { backgroundColor: '#1C1C5C' },
  deleteButton: { minHeight: 52, backgroundColor: '#B3261E', borderRadius: 6, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  deleteButtonPressed: { backgroundColor: '#7F1D1D' },
  adminActionText: { color: PAPER, fontSize: 12, fontWeight: '900' },
  keyboardArea: { flex: 1 },
  statusLabel: { flexDirection: 'row', alignItems: 'center' },
  statusCircle: { width: 8, height: 8, borderRadius: 4, marginRight: 7 },
  safeArea: { flex: 1, backgroundColor: colors.background }, header: { minHeight: 82, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' }, backButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#7798BC' }, headerCopy: { marginLeft: 14 }, kicker: { color: YELLOW, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 }, headerTitle: { color: PAPER, fontSize: 21, fontWeight: '800', marginTop: 4 }, content: { flexGrow: 1, backgroundColor: colors.background, padding: 20, paddingBottom: 40 }, statusRow: { flexDirection: 'row', justifyContent: 'space-between' }, status: { color: colors.primary, fontSize: 10, fontWeight: '900' }, priority: { color: colors.textMuted, fontSize: 10, fontWeight: '800' }, title: { color: colors.primary, fontSize: 25, fontWeight: '800', marginTop: 14 }, description: { color: colors.textMuted, fontSize: 14, lineHeight: 22, marginTop: 10, marginBottom: 20 }, card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 17, marginBottom: 14 }, sectionLabel: { color: colors.text, fontSize: 10, fontWeight: '900', letterSpacing: 1.1, marginBottom: 10 }, detail: { flexDirection: 'row', alignItems: 'center', marginTop: 10 }, detailText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 19, marginLeft: 10 }, phoneText: { color: colors.primary, fontWeight: '800', textDecorationLine: 'underline' }, directionsButton: { backgroundColor: '#2577BB', minHeight: 52, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 18 }, directionsButtonPressed: { backgroundColor: '#1C1C5C' }, directionsText: { color: PAPER, fontSize: 12, fontWeight: '900' }, uploadRow: { flexDirection: 'row', gap: 10, marginBottom: 14 }, uploadButton: { flex: 1, minHeight: 72, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', gap: 7 }, uploadText: { color: colors.text, fontSize: 11, fontWeight: '800' }, meta: { color: colors.text, fontSize: 13, marginTop: 8 }, noteInput: { minHeight: 88, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input, padding: 12, color: colors.text, textAlignVertical: 'top' }, saveButton: { backgroundColor: '#2577BB', minHeight: 52, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 18 }, saveButtonPressed: { backgroundColor: '#1C1C5C' }, standardButtonPressed: { backgroundColor: '#1C1C5C' }, saveText: { color: PAPER, fontSize: 12, fontWeight: '900' }, note: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, marginTop: 14 }, noteDate: { color: colors.textMuted, fontSize: 9, fontWeight: '700' }, noteBody: { color: colors.text, fontSize: 13, lineHeight: 19, marginTop: 5 }, emptyText: { color: colors.textMuted, fontSize: 12, marginTop: 14 },
  assigneeInfo: { flexDirection: 'row', alignItems: 'center' }, assigneeIcon: { width: 43, height: 43, backgroundColor: colors.surfaceMuted, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }, assigneeCopy: { flex: 1, marginLeft: 11 }, assigneeName: { color: colors.text, fontSize: 14, fontWeight: '900' }, assigneeMeta: { color: colors.textMuted, fontSize: 10, marginTop: 3 }, reassignButton: { minHeight: 52, backgroundColor: colors.primary, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 6, marginTop: 18 }, reassignText: { color: PAPER, fontSize: 12, fontWeight: '900' }, assigneeList: { borderWidth: 1, borderColor: colors.border, borderRadius: 6, marginTop: 8, overflow: 'hidden' }, assigneeOption: { minHeight: 54, padding: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border }, assigneeOptionCurrent: { backgroundColor: colors.surfaceMuted }, assigneeOptionName: { color: colors.text, fontSize: 12, fontWeight: '800' }, assigneeOptionMeta: { color: colors.textMuted, fontSize: 9, marginTop: 3 }, currentLabel: { color: colors.primary, fontSize: 8, fontWeight: '900' }, modalBackdrop: { flex: 1, backgroundColor: 'rgba(8, 19, 34, 0.78)', alignItems: 'center', justifyContent: 'center', padding: 18 }, previewModal: { width: '100%', maxWidth: 720, height: '82%', backgroundColor: colors.surface, borderRadius: 10, overflow: 'hidden' }, previewHeader: { minHeight: 64, backgroundColor: colors.header, flexDirection: 'row', alignItems: 'center', paddingLeft: 16 }, previewTitleCopy: { flex: 1, paddingRight: 10 }, previewTitle: { color: PAPER, fontSize: 13, fontWeight: '800' }, previewType: { color: YELLOW, fontSize: 9, fontWeight: '900', marginTop: 4 }, closeButton: { width: 58, minHeight: 64, alignItems: 'center', justifyContent: 'center' }, previewBody: { flex: 1, backgroundColor: colors.background }, previewImage: { width: '100%', height: '100%' }, pdfViewer: { flex: 1, backgroundColor: colors.surface }, viewerLoading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }, viewerLoadingText: { color: colors.textMuted, fontSize: 12 }, checklistHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, checklistCount: { color: colors.primary, fontSize: 15, fontWeight: '900', marginBottom: 10 }, checklistHelp: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginBottom: 8 }, checklistItem: { flexDirection: 'row', alignItems: 'center', minHeight: 42, borderTopWidth: 1, borderTopColor: colors.border }, checkbox: { width: 22, height: 22, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginRight: 10, backgroundColor: colors.surface, borderRadius: 5 }, checkboxComplete: { backgroundColor: colors.primary, borderColor: colors.primary }, checklistLabel: { color: colors.text, fontSize: 12, flex: 1 }, checklistLabelComplete: { color: colors.textMuted, textDecorationLine: 'line-through' }, disabled: { opacity: 0.45 }, fileRow: { flexDirection: 'row', alignItems: 'center', minHeight: 58, borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 8 }, thumbnail: { width: 48, height: 48, borderRadius: 4 }, fileIcon: { width: 48, height: 48, borderRadius: 4, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' }, fileCopy: { flex: 1, marginHorizontal: 10 }, fileName: { color: colors.text, fontSize: 12, fontWeight: '800' }, fileMeta: { color: colors.textMuted, fontSize: 9, fontWeight: '700', marginTop: 4 }, requirement: { flexDirection: 'row', alignItems: 'center', marginTop: 8 }, requirementText: { color: colors.text, fontSize: 13, marginLeft: 9 }, optionalText: { color: colors.textMuted, fontSize: 12, marginTop: 12 }, readyHint: { color: colors.textMuted, fontSize: 11, lineHeight: 17, marginTop: 14 }, finalizeButton: { minHeight: 48, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center', marginTop: 16 }, finalizePressed: { opacity: 0.8 }, finalizeText: { color: PAPER, fontSize: 13, fontWeight: '900' }, completedBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 48, backgroundColor: colors.surfaceMuted, marginTop: 16, gap: 8 }, completedText: { color: colors.success, fontSize: 12, fontWeight: '900' },
  editSafeArea: { flex: 1, backgroundColor: colors.background },
  editHeader: { minHeight: 66, backgroundColor: NAVY, paddingLeft: 20, flexDirection: 'row', alignItems: 'center' },
  editHeaderTitle: { flex: 1, color: PAPER, fontSize: 20, fontWeight: '900' },
  editClose: { width: 62, minHeight: 66, alignItems: 'center', justifyContent: 'center' },
  editContent: { padding: 20, paddingBottom: 40, backgroundColor: colors.background },
  editField: { marginBottom: 15 },
  editLabel: { color: colors.text, fontSize: 11, fontWeight: '800', marginBottom: 7, marginTop: 4 },
  editInput: { minHeight: 48, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input, borderRadius: 6, paddingHorizontal: 12, color: colors.text, fontSize: 13 },
  editMultiline: { minHeight: 96, paddingTop: 12 },
  editLocationRow: { flexDirection: 'row', gap: 10 },
  editCity: { flex: 1 },
  editState: { width: 92 },
  priorityOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 15 },
  priorityOption: { minHeight: 40, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  priorityOptionSelected: { borderColor: colors.primary, backgroundColor: colors.surfaceMuted },
  priorityOptionText: { color: colors.textMuted, fontSize: 9, fontWeight: '900' },
  priorityOptionTextSelected: { color: colors.primaryStrong },
  deadlineOptions: { flexDirection: 'row', gap: 9 },
  deadlineOption: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  deadlineOptionSelected: { borderColor: colors.primary, backgroundColor: colors.surfaceMuted },
  deadlineText: { color: colors.text, fontSize: 11, fontWeight: '800' },
  editDateButton: { minHeight: 54, marginTop: 9, paddingHorizontal: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 10 },
  editDateText: { flex: 1, color: colors.text, fontSize: 12, fontWeight: '800' },
  saveEditsButton: { minHeight: 52, backgroundColor: '#2577BB', borderRadius: 6, alignItems: 'center', justifyContent: 'center', marginTop: 22, paddingHorizontal: 12 },
  saveEditsPressed: { backgroundColor: '#1C1C5C' },
  saveEditsText: { color: PAPER, fontSize: 12, fontWeight: '900' },
});
