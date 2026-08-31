import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { type AppThemeColors, useAppTheme } from '@/contexts/theme-context';
import { AppText as Text, AppTextInput as TextInput } from '@/components/app-typography';
import { ThemedAlert as Alert } from '@/components/themed-alert';
import { supabase } from '@/lib/supabase';
import { WORK_ORDER_STATUS_FONT, workOrderStatusColor } from '@/lib/work-order-status';
import { formatWorkOrderNumber } from '@/lib/work-order-number';
import { formatWorkOrderDeadline } from '@/lib/work-order-deadline';
import { workOrderPriorityColor } from '@/lib/work-order-priority';
import { formatPhoneNumber, phoneNumberDigits } from '@/lib/phone-number';
import { mapChoices, openMapDirections } from '@/lib/map-directions';
import { useUploads } from '@/contexts/upload-context';
import { MediaCarouselModal } from '@/components/media-carousel-modal';
import { notifyWorkOrderSms } from '@/lib/work-order-sms';

const YELLOW = '#1D4ED8'; const NAVY = '#09192D'; const BLUE = '#1D4ED8'; const PAPER = '#FFFFFF'; const FHA_ORANGE = '#FFB020';

type WorkOrder = {
  id: string; work_order_number: string; title: string; description: string; status: string;
  priority: string; deadline_at: string | null; created_at: string; invoice_amount: number | null;
  properties: { customer_name: string | null; customer_phone: string | null; address_line_1: string; city: string; state: string } | null;
};
type Note = { id: string; note: string; created_at: string };
type WorkOrderFile = { id: string; file_type: string; storage_path: string; original_file_name: string; mime_type: string; created_at: string; invoice_amount: number | null; url?: string };
type ChecklistItem = { id: number; label: string };
type ContractorOption = { id: string; full_name: string; email: string | null; phone_number: string };
type Assignment = { contractor_id: string; contractors: ContractorOption | null };
type Priority = 'low' | 'medium' | 'high' | 'emergency';
const PHOTO_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif', 'image/webp']);
const PHOTO_EXTENSIONS = /\.(jpe?g|png|heic|heif|webp)$/i;
const MAX_WORK_ORDER_PHOTOS = 25;
const MAX_WORK_ORDER_VIDEOS = 2;
const MAX_ADMIN_PHOTOS = 10;
const MAX_ADMIN_VIDEOS = 2;
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export default function WorkOrderDetailScreen() {
  const { colorScheme, colors } = useAppTheme(); const styles = useMemo(() => createStyles(colors), [colors]);
  const { isUploading, runUpload } = useUploads();
  const router = useRouter();
  const { id, action } = useLocalSearchParams<{ id: string; action?: string }>();
  const [order, setOrder] = useState<WorkOrder | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [files, setFiles] = useState<WorkOrderFile[]>([]);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [completedChecklist, setCompletedChecklist] = useState<number[]>([]);
  const [previewFile, setPreviewFile] = useState<WorkOrderFile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [contractors, setContractors] = useState<ContractorOption[]>([]);
  const [isAssignmentOpen, setIsAssignmentOpen] = useState(false);
  const [contractorId, setContractorId] = useState('');
  const [note, setNote] = useState('');
  const [invoicePrice, setInvoicePrice] = useState('');
  const [invoicePriceEdits, setInvoicePriceEdits] = useState<Record<string, string>>({});
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
  const [editingCompletedWorkOrder, setEditingCompletedWorkOrder] = useState(false);
  const [hasCompletedChanges, setHasCompletedChanges] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: authData } = await supabase.auth.getUser();
      const [{ data: workOrder, error }, { data: contractor }, { data: jobNotes }, { data: workOrderFiles }, { data: checklistItems }, { data: checklist }, { data: activeAssignment }, { data: contractorOptions }] = await Promise.all([
        supabase.from('work_orders').select('id, work_order_number, title, description, status, priority, deadline_at, created_at, invoice_amount, properties(customer_name, customer_phone, address_line_1, city, state)').eq('id', id).single(),
        authData.user ? supabase.from('contractors').select('id, is_admin').eq('auth_user_id', authData.user.id).eq('is_active', true).single() : Promise.resolve({ data: null }),
        supabase.from('work_order_notes').select('id, note, created_at').eq('work_order_id', id).order('created_at', { ascending: false }),
        supabase.from('work_order_files').select('id, file_type, storage_path, original_file_name, mime_type, created_at, invoice_amount').eq('work_order_id', id).order('created_at', { ascending: false }),
        supabase.from('home_checklist_items').select('id, label').eq('is_active', true).order('sort_order'),
        supabase.from('work_order_checklist').select('checklist_item_id, is_complete').eq('work_order_id', id).eq('is_complete', true),
        supabase.from('work_order_assignments').select('contractor_id, contractors(id, full_name, email, phone_number)').eq('work_order_id', id).is('unassigned_at', null).maybeSingle(),
        supabase.from('contractors').select('id, full_name, email, phone_number').eq('is_active', true).eq('is_admin', false).order('full_name'),
      ]);
      if (error || !workOrder) { Alert.alert('Work order unavailable', error?.message ?? 'This work order could not be found.', [{ text: 'Back', onPress: () => router.back() }]); return; }
      setOrder(workOrder as unknown as WorkOrder);
      setInvoicePrice(workOrder.invoice_amount?.toString() ?? '');
      setEditingCompletedWorkOrder(workOrder.status === 'completed');
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
      setInvoicePriceEdits(Object.fromEntries(withUrls.filter((file) => file.file_type === 'invoice').map((file) => [file.id, file.invoice_amount?.toString() ?? ''])));
      setChecklistItems((checklistItems ?? []) as ChecklistItem[]);
      setCompletedChecklist((checklist ?? []).map((row) => row.checklist_item_id));
    };
    void load();
  }, [action, id, router]);

  const address = order?.properties ? `${order.properties.address_line_1}, ${order.properties.city}, ${order.properties.state}` : '';
  const isCompleted = order?.status === 'completed';
  const isHomeProgress = order?.work_order_number.startsWith('HOME-') ?? false;
  const photoFiles = files.filter((file) => file.file_type.endsWith('_photo') && PHOTO_MIME_TYPES.has(file.mime_type.toLowerCase()));
  const videoFiles = files.filter((file) => file.file_type === 'completion_video');
  const invoiceFiles = files.filter((file) => file.file_type === 'invoice');
  const photoCount = photoFiles.length;
  const videoCount = videoFiles.length;
  const adminPhotoCount = files.filter((file) => file.file_type === 'other' && PHOTO_MIME_TYPES.has(file.mime_type.toLowerCase())).length;
  const adminVideoCount = files.filter((file) => file.file_type === 'other' && file.mime_type.toLowerCase().startsWith('video/')).length;
  const workOrderUploadId = `work-order-${id}`;
  const isUploadingAttachments = isUploading(workOrderUploadId);
  const hasWorkOrderNote = notes.length > 0;
  const hasCompleteHomeChecklist = checklistItems.length > 0 && checklistItems.every((item) => completedChecklist.includes(item.id));
  const canFinalize = !isCompleted && (isHomeProgress ? hasCompleteHomeChecklist : hasWorkOrderNote && photoCount >= 2);

  const openDirections = () => {
    if (!address) return;
    const choices = mapChoices(address);
    Alert.alert('Select Navigation', 'Select the app you want to use for directions.', [
      ...choices.map((choice) => ({ text: choice.label, icon: choice.icon, onPress: () => void startDirections(choice.url) })),
    ], { cancelable: true, showCloseButton: true });
  };

  const startDirections = async (url: string) => {
    try {
      await markWorkOrderStarted('navigation_started');
      await openMapDirections(url);
    } catch (error) {
      Alert.alert('Could not open maps', error instanceof Error ? error.message : 'No maps application is available on this device.');
    }
  };

  const markWorkOrderStarted = async (startAction: 'customer_called' | 'navigation_started') => {
    if (!order || order.status !== 'not_started') return;
    const { data, error } = await supabase.rpc('mark_work_order_started', { p_work_order_id: order.id, p_action: startAction });
    if (error) { Alert.alert('Could not update work order', error.message); return; }
    setOrder((current) => current ? { ...current, status: data ?? 'in_progress' } : current);
  };

  const refreshStatus = async () => {
    if (!order) return;
    const { data } = await supabase.rpc('refresh_work_order_status', { p_work_order_id: order.id });
    if (data) setOrder((current) => current ? { ...current, status: data } : current);
  };

  const loadCurrentStatus = async () => {
    if (!order) return;
    const { data } = await supabase.from('work_orders').select('status').eq('id', order.id).single();
    if (data?.status) setOrder((current) => current ? { ...current, status: data.status } : current);
  };

  const callCustomer = async () => {
    const phone = order?.properties?.customer_phone?.trim();
    if (!phone) { Alert.alert('Phone number unavailable', 'No Customer Phone Number is saved for this work order.'); return; }
    const phoneUrl = `tel:${phone.replace(/[^\d+]/g, '')}`;
    if (await Linking.canOpenURL(phoneUrl)) { await markWorkOrderStarted('customer_called'); await Linking.openURL(phoneUrl); }
    else Alert.alert('Calling unavailable', 'This device cannot open the phone dialer.');
  };

  const toggleChecklistItem = async (itemId: number) => {
    if (!order || !contractorId || isCompleted || isSaving) return;
    const isComplete = !completedChecklist.includes(itemId);
    const nextChecklist = isComplete ? [...completedChecklist, itemId] : completedChecklist.filter((value) => value !== itemId);
    setCompletedChecklist(nextChecklist);
    const { error } = await supabase.rpc('set_work_order_checklist_item', {
      p_work_order_id: order.id,
      p_checklist_item_id: itemId,
      p_is_complete: isComplete,
    });
    if (error) {
      setCompletedChecklist((current) => isComplete ? current.filter((value) => value !== itemId) : [...current, itemId]);
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
    notifyWorkOrderSms(order.id, 'assigned');
    Alert.alert('Work order reassigned', `${nextContractor.full_name} is now assigned to ${formatWorkOrderNumber(order.work_order_number)}.`);
  };

  const saveNote = async () => {
    if (!note.trim() || !order || !contractorId) return;
    setIsSaving(true);
    const { data, error } = await supabase.from('work_order_notes').insert({ work_order_id: order.id, author_id: contractorId, note: note.trim() }).select('id, note, created_at').single();
    setIsSaving(false);
    if (error) { Alert.alert('Note was not saved', error.message); return; }
    setNotes((current) => [data as Note, ...current]);
    notifyWorkOrderSms(order.id, 'note_added');
    if (editingCompletedWorkOrder) setHasCompletedChanges(true);
    setNote('');
    Keyboard.dismiss();
    await refreshStatus();
  };

  const uploadFile = async (kind: 'photo' | 'video' | 'invoice') => {
    if (!order || !contractorId) return;
    const parsedInvoicePrice = Number(invoicePrice.replace(/[$,\s]/g, ''));
    if (kind === 'invoice' && invoicePrice.trim() && (!Number.isFinite(parsedInvoicePrice) || parsedInvoicePrice < 0)) { Alert.alert('Enter a valid invoice price', 'Use a price of $0 or more, or leave it blank.'); return; }
    let assets: { uri: string; name: string; mimeType: string; size?: number }[] = [];
    if (kind === 'photo' || kind === 'video') {
      const isVideo = kind === 'video';
      const limit = isVideo ? MAX_WORK_ORDER_VIDEOS : MAX_WORK_ORDER_PHOTOS;
      const count = isVideo ? videoCount : photoCount;
      const remainingSlots = limit - count;
      if (remainingSlots <= 0) { Alert.alert(`${isVideo ? 'Video' : 'Photo'} limit reached`, `A work order can hold no more than ${limit} ${isVideo ? 'videos' : 'photos'}.`); return; }
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { Alert.alert('Media access required', `Allow photo-library access to upload job ${isVideo ? 'videos' : 'photos'}.`); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: [isVideo ? 'videos' : 'images'], quality: 0.85, videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium, allowsMultipleSelection: true, selectionLimit: remainingSlots, orderedSelection: true });
      if (!result.canceled) {
        assets = result.assets.slice(0, remainingSlots).map((asset, index) => ({ uri: asset.uri, name: asset.fileName ?? `job-${kind}-${Date.now()}-${index + 1}.${isVideo ? 'mp4' : 'jpg'}`, mimeType: asset.mimeType ?? (isVideo ? 'video/mp4' : 'image/jpeg'), size: asset.fileSize }));
      }
    } else {
      if (invoiceFiles.length >= 1) { Alert.alert('Invoice attachment already added', 'Remove the current invoice attachment before uploading another one.'); return; }
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { Alert.alert('Photo access required', 'Allow photo access to upload an invoice attachment.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsMultipleSelection: false });
      if (!result.canceled) { const image = result.assets[0]; assets = [{ uri: image.uri, name: image.fileName ?? `invoice-attachment-${Date.now()}.jpg`, mimeType: image.mimeType ?? 'image/jpeg', size: image.fileSize }]; }
    }
    if (!assets.length) return;
    const oversizedFile = assets.find((asset) => asset.size && asset.size > MAX_UPLOAD_BYTES);
    if (oversizedFile) { Alert.alert('File is too large', `${oversizedFile.name} is larger than 20 MB.`); return; }
    const unsupportedPhoto = kind === 'photo' && assets.find((asset) => !PHOTO_MIME_TYPES.has(asset.mimeType.toLowerCase()) || !PHOTO_EXTENSIONS.test(asset.name));
    if (unsupportedPhoto) {
      Alert.alert('Unsupported photo', 'Upload a JPG, JPEG, PNG, HEIC, HEIF, or WEBP image from an Android phone or iPhone.'); return;
    }
    if (kind === 'invoice' && (!PHOTO_MIME_TYPES.has(assets[0].mimeType.toLowerCase()) || !PHOTO_EXTENSIONS.test(assets[0].name))) {
      Alert.alert('Unsupported invoice image', 'Upload a JPG, JPEG, PNG, HEIC, HEIF, or WEBP image.'); return;
    }
    const savedFiles: WorkOrderFile[] = [];
    let uploadFailure: string | null = null;
    let completedUploads = 0;
    let nextUploadIndex = 0;
    const uploadErrors: string[] = [];
    void runUpload(workOrderUploadId, kind === 'video' ? 'Uploading work-order videos' : kind === 'photo' ? 'Uploading work-order photos' : 'Uploading invoice', assets.length, async (report) => {
    try {
      const uploadWorker = async () => {
        while (nextUploadIndex < assets.length) {
          const index = nextUploadIndex++;
          const asset = assets[index];
          report(completedUploads, asset.name);
          try {
            const safeName = asset.name.replace(/[^a-zA-Z0-9._-]/g, '-');
            const storagePath = `${contractorId}/${order.id}/${Date.now()}-${index}-${safeName}`;
            const response = await fetch(asset.uri);
            if (!response.ok) throw new Error(`The selected file could not be read (${response.status}).`);
            const bytes = await response.arrayBuffer();
            if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new Error(`${asset.name} is larger than 20 MB.`);
            const { error: uploadError } = await supabase.storage.from('work-order-files').upload(storagePath, bytes, { contentType: asset.mimeType });
            if (uploadError) throw new Error(uploadError.message);
            const { data: record, error: recordError } = await supabase.from('work_order_files').insert({
              work_order_id: order.id, uploaded_by: contractorId, file_type: kind === 'photo' ? 'completion_photo' : kind === 'video' ? 'completion_video' : 'invoice',
              storage_path: storagePath, original_file_name: asset.name, mime_type: asset.mimeType, file_size_bytes: asset.size ?? bytes.byteLength,
              invoice_amount: kind === 'invoice' && invoicePrice.trim() ? parsedInvoicePrice : null,
            }).select('id, file_type, storage_path, original_file_name, mime_type, created_at, invoice_amount').single();
            if (recordError || !record) {
              await supabase.storage.from('work-order-files').remove([storagePath]);
              throw new Error(recordError?.message ?? 'The uploaded file record was not returned.');
            }
            const { data: signed } = await supabase.storage.from('work-order-files').createSignedUrl(storagePath, 3600);
            savedFiles.push({ ...(record as WorkOrderFile), url: signed?.signedUrl });
          } catch (error) {
            uploadErrors.push(error instanceof Error ? error.message : 'An unexpected upload error occurred.');
          } finally {
            completedUploads += 1;
            report(completedUploads, asset.name);
          }
        }
      };
      const concurrentUploads = kind === 'photo' ? Math.min(2, assets.length) : 1;
      await Promise.all(Array.from({ length: concurrentUploads }, () => uploadWorker()));
      if (uploadErrors.length) throw new Error(uploadErrors[0]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An unexpected upload error occurred.';
      uploadFailure = /network request failed|network|fetch/i.test(message)
        ? 'The upload lost its network connection. Keep the app open, reconnect to Wi-Fi or cellular data, and try the remaining files again.'
        : message;
    }
    setFiles((current) => [...savedFiles, ...current]);
    if (savedFiles.length) notifyWorkOrderSms(order.id, kind === 'photo' ? 'photo_uploaded' : kind === 'video' ? 'video_uploaded' : 'invoice_uploaded');
    if (editingCompletedWorkOrder && savedFiles.length) setHasCompletedChanges(true);
    setInvoicePriceEdits((current) => ({ ...current, ...Object.fromEntries(savedFiles.filter((file) => file.file_type === 'invoice').map((file) => [file.id, file.invoice_amount?.toString() ?? ''])) }));
    if (uploadFailure) {
      Alert.alert('Upload failed', `${savedFiles.length ? `${savedFiles.length} file${savedFiles.length === 1 ? '' : 's'} uploaded before the error.\n\n` : ''}${uploadFailure}`);
      return;
    }
    if (kind === 'invoice' && invoicePrice.trim()) {
      const { data: savedPrice } = await supabase.rpc('set_work_order_invoice_price', { p_work_order_id: order.id, p_invoice_amount: parsedInvoicePrice });
      if (savedPrice !== null) {
        setOrder((current) => current ? { ...current, invoice_amount: Number(savedPrice) } : current);
        setInvoicePrice(Number(savedPrice).toFixed(2));
      }
    }
    await refreshStatus();
    Alert.alert(kind === 'photo' ? 'Photos uploaded' : kind === 'video' ? 'Videos uploaded' : 'Invoice uploaded', kind === 'photo' || kind === 'video' ? `${savedFiles.length} ${kind}${savedFiles.length === 1 ? '' : 's'} attached to work order ${order.work_order_number}.` : `${assets[0].name} was attached to work order ${order.work_order_number}.`);
    });
  };

  const confirmRemovePhotos = (photos: WorkOrderFile[]) => {
    if (!photos.length || isSaving) return;
    Alert.alert(
      photos.length === 1 ? 'Remove this photo?' : `Remove all ${photos.length} photos?`,
      'This permanently removes the selected photo files. This cannot be undone.',
      [{ text: 'Cancel', style: 'cancel' }, { text: photos.length === 1 ? 'Remove Photo' : 'Remove All Photos', style: 'destructive', onPress: () => void removePhotos(photos) }],
    );
  };

  const confirmRemoveAttachment = (file: WorkOrderFile) => {
    if (isSaving) return;
    const isPhoto = PHOTO_MIME_TYPES.has(file.mime_type.toLowerCase());
    const attachmentLabel = file.mime_type.toLowerCase().startsWith('video/') ? 'video' : isPhoto ? 'photo' : file.file_type === 'invoice' ? 'invoice' : 'attachment';
    Alert.alert(
      `Remove this ${attachmentLabel}?`,
      'This permanently removes the selected file. This cannot be undone.',
      [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => void removePhotos([file]) }],
    );
  };

  const removePhotos = async (photos: WorkOrderFile[]) => {
    const removingOnlyPhotos = photos.every((file) => file.file_type.endsWith('_photo'));
    const removingOnlyVideos = photos.every((file) => file.file_type === 'completion_video');
    setIsSaving(true);
    const paths = photos.map((photo) => photo.storage_path);
    const ids = photos.map((photo) => photo.id);
    const { error: storageError } = await supabase.storage.from('work-order-files').remove(paths);
    if (storageError) { setIsSaving(false); Alert.alert('Could not remove attachment', storageError.message); return; }
    const { error: recordError } = await supabase.from('work_order_files').delete().in('id', ids);
    setIsSaving(false);
    if (recordError) { Alert.alert('Could not remove attachment record', recordError.message); return; }
    setFiles((current) => current.filter((file) => !ids.includes(file.id)));
    if (order) notifyWorkOrderSms(order.id, photos.some((file) => file.file_type === 'invoice') ? 'invoice_deleted' : 'media_deleted');
    if (editingCompletedWorkOrder) setHasCompletedChanges(true);
    await loadCurrentStatus();
    Alert.alert(
      photos.length === 1 ? `${removingOnlyPhotos ? 'Photo' : removingOnlyVideos ? 'Video' : 'Attachment'} removed` : 'Photos removed',
      photos.length === 1 ? `The ${removingOnlyPhotos ? 'photo' : removingOnlyVideos ? 'video' : 'attachment'} was removed.` : `${photos.length} photos were removed.`,
    );
  };

  const confirmRemoveNote = (item: Note) => {
    if (isSaving) return;
    Alert.alert(
      'Remove this job note?',
      'This permanently removes the note. This cannot be undone.',
      [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove Note', style: 'destructive', onPress: () => void removeNote(item) }],
    );
  };

  const saveInvoicePrice = async (file: WorkOrderFile) => {
    const rawPrice = invoicePriceEdits[file.id] ?? '';
    const parsedPrice = Number(rawPrice.replace(/[$,\s]/g, ''));
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) { Alert.alert('Enter a valid invoice price', 'Use a price of $0 or more.'); return; }
    setIsSaving(true);
    const { error } = await supabase.from('work_order_files').update({ invoice_amount: parsedPrice }).eq('id', file.id);
    setIsSaving(false);
    if (error) { Alert.alert('Invoice price was not saved', error.message); return; }
    setFiles((current) => current.map((item) => item.id === file.id ? { ...item, invoice_amount: parsedPrice } : item));
    notifyWorkOrderSms(order!.id, 'invoice_price_set');
    if (editingCompletedWorkOrder) setHasCompletedChanges(true);
    setInvoicePriceEdits((current) => ({ ...current, [file.id]: parsedPrice.toFixed(2) }));
    Keyboard.dismiss();
    Alert.alert('Invoice price saved', `The invoice price is now ${formatCurrency(parsedPrice)}.`);
  };

  const saveWorkOrderInvoicePrice = async () => {
    if (!order) return;
    const parsedPrice = Number(invoicePrice.replace(/[$,\s]/g, ''));
    if (!invoicePrice.trim() || !Number.isFinite(parsedPrice) || parsedPrice < 0) { Alert.alert('Enter a valid invoice price', 'Use a price of $0 or more.'); return false; }
    const { data, error } = await supabase.rpc('set_work_order_invoice_price', { p_work_order_id: order.id, p_invoice_amount: parsedPrice });
    if (error) { Alert.alert('Invoice price was not saved', error.message); return false; }
    setOrder((current) => current ? { ...current, invoice_amount: Number(data) } : current);
    notifyWorkOrderSms(order.id, 'invoice_price_set');
    setInvoicePrice(Number(data).toFixed(2));
    Keyboard.dismiss();
    return true;
  };

  const removeNote = async (item: Note) => {
    setIsSaving(true);
    const { error } = await supabase.from('work_order_notes').delete().eq('id', item.id);
    setIsSaving(false);
    if (error) { Alert.alert('Could not remove job note', error.message); return; }
    setNotes((current) => current.filter((noteItem) => noteItem.id !== item.id));
    if (order) notifyWorkOrderSms(order.id, 'note_deleted');
    if (editingCompletedWorkOrder) setHasCompletedChanges(true);
    await loadCurrentStatus();
    Alert.alert('Job note removed', 'The job note was removed.');
  };

  const finalizeWorkOrder = async () => {
    if (!order || !canFinalize) return;
    setIsSaving(true);
    const { data, error } = await supabase.rpc(isHomeProgress ? 'complete_home_progress' : 'finalize_work_order', { p_work_order_id: order.id });
    if (error) { setIsSaving(false); Alert.alert('Could not finalize work order', error.message); return; }
    const { error: emailError } = await supabase.functions.invoke('send-completion-email', { body: { workOrderId: order.id } });
    setIsSaving(false);
    setOrder((current) => current ? { ...current, status: data ?? 'completed' } : current);
    notifyWorkOrderSms(order.id, 'completed');
    Alert.alert(emailError ? 'Work order completed; email failed' : 'Work order finalized', emailError ? `${formatWorkOrderNumber(order.work_order_number)} was completed, but the completion email could not be delivered. It can be retried by completing the email function request again.` : `${formatWorkOrderNumber(order.work_order_number)} is now available in the Complete WO tab and a completion email was sent.`);
  };

  const saveCompletedChanges = async () => {
    setIsSaving(true);
    if (invoicePrice.trim() && Number(invoicePrice.replace(/[$,\s]/g, '')) !== Number(order?.invoice_amount)) {
      const saved = await saveWorkOrderInvoicePrice();
      if (!saved) { setIsSaving(false); return; }
    }
    const invoiceEdits = files.filter((file) => file.file_type === 'invoice').map((file) => ({
      file,
      amount: Number((invoicePriceEdits[file.id] ?? '').replace(/[$,\s]/g, '')),
    }));
    if (invoiceEdits.some(({ amount }) => !Number.isFinite(amount) || amount < 0)) { setIsSaving(false); Alert.alert('Enter a valid invoice price', 'Each invoice price must be $0 or more.'); return; }
    const changedInvoices = invoiceEdits.filter(({ file, amount }) => amount !== Number(file.invoice_amount));
    for (const { file, amount } of changedInvoices) {
      const { error } = await supabase.from('work_order_files').update({ invoice_amount: amount }).eq('id', file.id);
      if (error) { setIsSaving(false); Alert.alert('Changes were not saved', error.message); return; }
    }
    if (changedInvoices.length) setFiles((current) => current.map((file) => {
      const changed = changedInvoices.find((item) => item.file.id === file.id);
      return changed ? { ...file, invoice_amount: changed.amount } : file;
    }));
    await loadCurrentStatus();
    const { error: emailError } = await supabase.functions.invoke('send-completion-email', { body: { workOrderId: order?.id, isUpdate: true } });
    setIsSaving(false);
    if (emailError) {
      Alert.alert('Changes saved; email failed', 'The completed work order changes were saved, but the updated completion email could not be delivered.');
      return;
    }
    setHasCompletedChanges(false);
    Alert.alert('Changes saved', 'The completed work order changes were saved and an updated completion email was sent.');
  };

  const resetEditFields = () => {
    if (!order) return;
    setEditCustomerName(order.properties?.customer_name ?? '');
    setEditCustomerPhone(phoneNumberDigits(order.properties?.customer_phone ?? ''));
    setEditAddress(order.properties?.address_line_1 ?? '');
    setEditCity(order.properties?.city ?? '');
    setEditState(order.properties?.state ?? '');
    setEditDescription(order.description);
    setEditPriority(order.priority as Priority);
    setEditHasDeadline(Boolean(order.deadline_at));
    setEditDeadline(order.deadline_at ? new Date(order.deadline_at) : new Date());
    setShowEditCalendar(false);
  };

  const openEditWorkOrder = () => {
    if (!order || !isAdmin) return;
    resetEditFields();
    setIsEditOpen(true);
  };

  const cancelEditWorkOrder = () => {
    if (isSaving) return;
    resetEditFields();
    setIsEditOpen(false);
  };

  const uploadAdminReference = async (kind: 'photo' | 'video') => {
    if (!order || !contractorId || !isAdmin || isUploadingAttachments) return;
    const isVideo = kind === 'video';
    const limit = isVideo ? MAX_ADMIN_VIDEOS : MAX_ADMIN_PHOTOS;
    const count = isVideo ? adminVideoCount : adminPhotoCount;
    const remainingSlots = limit - count;
    if (remainingSlots <= 0) { Alert.alert(`${isVideo ? 'Video' : 'Photo'} limit reached`, `Admins can attach up to ${limit} reference ${isVideo ? 'videos' : 'photos'} to a work order.`); return; }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert('Media access required', 'Allow photo-library access to add work-order attachments.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: [isVideo ? 'videos' : 'images'], quality: 0.8, videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium, allowsMultipleSelection: true, selectionLimit: remainingSlots, orderedSelection: true });
    if (result.canceled) return;
    const assets = result.assets.slice(0, remainingSlots).map((asset, index) => ({
      uri: asset.uri,
      name: asset.fileName ?? `admin-${kind}-${Date.now()}-${index + 1}.${isVideo ? 'mp4' : 'jpg'}`,
      mimeType: asset.mimeType ?? (isVideo ? 'video/mp4' : 'image/jpeg'),
      size: asset.fileSize,
    }));
    const oversized = assets.find((asset) => asset.size && asset.size > MAX_UPLOAD_BYTES);
    if (oversized) { Alert.alert('File is too large', `${oversized.name} is larger than 20 MB.`); return; }
    void runUpload(workOrderUploadId, `Uploading admin ${isVideo ? 'videos' : 'photos'}`, assets.length, async (report) => {
      const savedFiles: WorkOrderFile[] = [];
      for (let index = 0; index < assets.length; index += 1) {
        const asset = assets[index];
        report(index, asset.name);
        try {
          const response = await fetch(asset.uri);
          if (!response.ok) throw new Error(`Could not read ${asset.name}.`);
          const bytes = await response.arrayBuffer();
          if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new Error(`${asset.name} is larger than 20 MB.`);
          const safeName = asset.name.replace(/[^a-zA-Z0-9._-]/g, '-');
          const storagePath = `${contractorId}/${order.id}/admin-${Date.now()}-${index}-${safeName}`;
          const { error: uploadError } = await supabase.storage.from('work-order-files').upload(storagePath, bytes, { contentType: asset.mimeType });
          if (uploadError) throw new Error(uploadError.message);
          const { data: record, error: recordError } = await supabase.from('work_order_files').insert({ work_order_id: order.id, uploaded_by: contractorId, file_type: 'other', storage_path: storagePath, original_file_name: asset.name, mime_type: asset.mimeType, file_size_bytes: asset.size ?? bytes.byteLength }).select('id, file_type, storage_path, original_file_name, mime_type, created_at, invoice_amount').single();
          if (recordError || !record) { await supabase.storage.from('work-order-files').remove([storagePath]); throw new Error(recordError?.message ?? 'The attachment record was not created.'); }
          const { data: signed } = await supabase.storage.from('work-order-files').createSignedUrl(storagePath, 3600);
          savedFiles.push({ ...(record as WorkOrderFile), url: signed?.signedUrl });
          report(index + 1, asset.name);
        } catch (error) {
          setFiles((current) => [...savedFiles, ...current]);
          Alert.alert('Upload failed', error instanceof Error ? error.message : 'An attachment could not be uploaded.');
          return;
        }
      }
      setFiles((current) => [...savedFiles, ...current]);
      Alert.alert(`${isVideo ? 'Videos' : 'Photos'} uploaded`, `${savedFiles.length} admin reference ${isVideo ? 'video' : 'photo'}${savedFiles.length === 1 ? '' : 's'} added.`);
    });
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
    if (error) { setIsSaving(false); Alert.alert('Could not update work order', error.message); return; }
    const { error: emailError } = isCompleted
      ? await supabase.functions.invoke('send-completion-email', { body: { workOrderId: order.id, isUpdate: true } })
      : { error: null };
    setIsSaving(false);
    setOrder((current) => current ? {
      ...current,
      title: `Work Order Request from: ${editCustomerName.trim()}`,
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
    Alert.alert(
      emailError ? 'Work order updated; email failed' : 'Work order updated',
      emailError
        ? `${formatWorkOrderNumber(order.work_order_number)} was updated, but the updated completion email could not be delivered.`
        : `${formatWorkOrderNumber(order.work_order_number)} has been updated${isCompleted ? ' and an updated completion email was sent' : ''}.`,
    );
  };

  const deleteWorkOrder = () => {
    if (!order || !isAdmin || isSaving) return;
    Alert.alert(
      'Permanently delete work order?',
      `${formatWorkOrderNumber(order.work_order_number)} and all of its assignments, notes, checklist entries, photos, invoices, and notifications will be deleted. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete Permanently', style: 'destructive', onPress: async () => {
          setIsSaving(true);
          const storagePaths = files.map((file) => file.storage_path);
          if (storagePaths.length) {
            const { error: storageError } = await supabase.storage.from('work-order-files').remove(storagePaths);
            if (storageError) { setIsSaving(false); Alert.alert('Could not delete work order files', storageError.message); return; }
          }
          const { error } = await supabase.rpc('admin_delete_work_order', { p_work_order_id: order.id });
          setIsSaving(false);
          if (error) { Alert.alert('Could not delete work order', error.message); return; }
          Alert.alert('Work order deleted', `${formatWorkOrderNumber(order.work_order_number)} was permanently deleted.`, [{ text: 'OK', onPress: () => router.back() }]);
        } },
      ],
    );
  };

  return <SafeAreaView style={styles.safeArea} edges={['top']}>
    <View style={styles.header}>
      <TouchableOpacity onPress={() => router.back()} style={[styles.backButton, styles.roundedButton]} accessibilityLabel="Go back"><Ionicons name="arrow-back" size={22} color={PAPER} /></TouchableOpacity>
      <View style={styles.headerCopy}><Text style={styles.kicker}>WORK ORDER</Text><Text style={[styles.headerTitle, order?.work_order_number.startsWith('HOME-FHA-') && { color: FHA_ORANGE }]}>{order ? formatWorkOrderNumber(order.work_order_number) : 'Loading...'}</Text></View>
    </View>
    <KeyboardAvoidingView style={styles.keyboardArea} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" onScrollBeginDrag={Keyboard.dismiss} automaticallyAdjustKeyboardInsets bounces={false} alwaysBounceVertical={false} overScrollMode="never">
      {order && <>
        <View style={styles.statusRow}><View style={styles.statusLabel}><View style={[styles.statusCircle, { backgroundColor: workOrderStatusColor(order.status) }]} /><Text style={[styles.status, { color: workOrderStatusColor(order.status), fontFamily: WORK_ORDER_STATUS_FONT }]}>{order.status.replaceAll('_', ' ').toUpperCase()}</Text></View>{!isHomeProgress && <Text style={[styles.priority, { color: workOrderPriorityColor(order.priority, colorScheme) }]}>{order.priority.toUpperCase()}</Text>}</View>
        <Text style={styles.title}>{order.properties?.customer_name || order.title}</Text>
        <Text style={styles.description}>{order.description}</Text>

        {isAdmin && <View style={styles.adminActions}>
          <Pressable style={({ pressed }) => [styles.editButton, pressed && styles.editButtonPressed]} onPress={openEditWorkOrder} disabled={isSaving}><Ionicons name="create" size={18} color={PAPER} /><Text style={styles.adminActionText}>Edit Work Order</Text></Pressable>
          <Pressable style={({ pressed }) => [styles.deleteButton, pressed && styles.deleteButtonPressed]} onPress={deleteWorkOrder} disabled={isSaving}><Ionicons name="trash" size={18} color={PAPER} /><Text style={styles.adminActionText}>Delete</Text></Pressable>
        </View>}

        <View style={[styles.card, styles.roundedButton]}>
          <Text style={styles.sectionLabel}>SCHEDULE</Text>
          <Text style={styles.meta}>Created {new Date(order.created_at).toLocaleDateString()}</Text>
          <Text style={styles.meta}>{formatWorkOrderDeadline(order.deadline_at)}</Text>
        </View>

        <View style={[styles.card, styles.roundedButton]}>
          <Text style={styles.sectionLabel}>CUSTOMER & LOCATION</Text>
          <Detail icon="person" text={order.properties?.customer_name || 'Customer not provided'} />
          <TouchableOpacity style={styles.detail} onPress={() => void callCustomer()} accessibilityRole="button" accessibilityLabel={`Call ${order.properties?.customer_name || 'customer'}`}>
            <Ionicons name="call" size={18} color={BLUE} />
            <Text style={[styles.detailText, styles.phoneText]}>{formatPhoneNumber(order.properties?.customer_phone) || 'Phone not provided'}</Text>
          </TouchableOpacity>
          <Detail icon="location" text={address || 'Address unavailable'} />
          <Pressable style={({ pressed }) => [styles.directionsButton, styles.roundedButton, pressed && styles.directionsButtonPressed]} onPress={() => void openDirections()} disabled={!address}><Ionicons name="navigate" size={18} color={PAPER} /><Text style={styles.directionsText}>Start Navigation</Text></Pressable>
        </View>

        {isAdmin && <View style={[styles.card, styles.roundedButton]}>
          <Text style={styles.sectionLabel}>ASSIGNED CONTRACTOR</Text>
          {assignment?.contractors ? <><View style={styles.assigneeInfo}><View style={styles.assigneeIcon}><Ionicons name="person" size={20} color={BLUE} /></View><View style={styles.assigneeCopy}><Text style={styles.assigneeName}>{assignment.contractors.full_name}</Text><Text style={styles.assigneeMeta}>{assignment.contractors.email || 'No email'}</Text><Text style={styles.assigneeMeta}>{formatPhoneNumber(assignment.contractors.phone_number)}</Text></View></View><View style={styles.jobBrief}><Text style={styles.jobBriefLabel}>JOB BRIEF</Text><Text style={styles.jobBriefText}>{order.description}</Text></View></> : <Text style={styles.emptyText}>No contractor is currently assigned.</Text>}
          {!isCompleted && !isHomeProgress && <><Pressable style={({ pressed }) => [styles.reassignButton, pressed && styles.reassignButtonPressed]} onPress={() => setIsAssignmentOpen((open) => !open)} disabled={isSaving}><Ionicons name="swap-horizontal" size={18} color={PAPER} /><Text style={styles.reassignText}>Reassign Contractor</Text><Ionicons name={isAssignmentOpen ? 'chevron-up' : 'chevron-down'} size={17} color={PAPER} /></Pressable>
          {isAssignmentOpen && <View style={styles.assigneeList}>{contractors.map((item) => <TouchableOpacity key={item.id} style={[styles.assigneeOption, item.id === assignment?.contractor_id && styles.assigneeOptionCurrent]} disabled={item.id === assignment?.contractor_id || isSaving} onPress={() => void reassignWorkOrder(item)}><View><Text style={styles.assigneeOptionName}>{item.full_name}</Text><Text style={styles.assigneeOptionMeta}>{item.email} · {formatPhoneNumber(item.phone_number)}</Text></View>{item.id === assignment?.contractor_id && <Text style={styles.currentLabel}>CURRENT</Text>}</TouchableOpacity>)}{contractors.length === 0 && <Text style={styles.emptyText}>No active contractors are available.</Text>}</View>}</>}
        </View>}

        {isAdmin && isHomeProgress && <View style={[styles.card, styles.roundedButton]}>
          <View style={styles.checklistHeader}>
            <Text style={styles.sectionLabel}>HOME COMPLETION CHECKLIST</Text>
            <Text style={styles.checklistCount}>{completedChecklist.length}/{checklistItems.length}</Text>
          </View>
          <Text style={styles.checklistHelp}>{isCompleted ? 'Checklist completed for this work order.' : 'Mark each item as it is verified at the home.'}</Text>
          {checklistItems.map((item) => {
            const checked = completedChecklist.includes(item.id);
            return <TouchableOpacity key={item.id} style={styles.checklistItem} onPress={() => void toggleChecklistItem(item.id)} disabled={isCompleted || isSaving} accessibilityRole="checkbox" accessibilityState={{ checked, disabled: isCompleted }}>
              <View style={[styles.checkbox, checked && styles.checkboxComplete]}>{checked && <Ionicons name="checkmark" size={16} color={colors.primary} />}</View>
              <Text style={[styles.checklistLabel, checked && styles.checklistLabelComplete]}>{item.label}</Text>
            </TouchableOpacity>;
          })}
          {checklistItems.length === 0 && <Text style={styles.emptyText}>No active checklist items are configured.</Text>}
        </View>}

        {!isHomeProgress && <View style={styles.invoicePriceField}><Text style={styles.invoicePriceLabel}>INVOICE PRICE (ATTACHMENT OPTIONAL)</Text><View style={styles.invoicePriceInputRow}><Text style={styles.currency}>$</Text><TextInput style={styles.invoicePriceInput} value={invoicePrice} onChangeText={(value) => { setInvoicePrice(value); if (editingCompletedWorkOrder) setHasCompletedChanges(true); }} placeholder="0.00" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" /></View><Text style={styles.invoicePriceHelp}>Save a price with or without uploading an invoice image.</Text>{!editingCompletedWorkOrder && <Pressable style={({ pressed }) => [styles.invoiceSaveButton, { marginTop: 10 }, pressed && styles.saveButtonPressed]} onPress={() => void saveWorkOrderInvoicePrice()} disabled={isSaving}><Text style={styles.saveText}>Save Invoice Price</Text></Pressable>}</View>}
        <View style={styles.uploadRow}>
          <Pressable style={({ pressed }) => [styles.uploadButton, pressed && styles.standardButtonPressed, (photoCount >= MAX_WORK_ORDER_PHOTOS || isUploadingAttachments) && styles.disabled]} onPress={() => void uploadFile('photo')} disabled={isSaving || isUploadingAttachments || photoCount >= MAX_WORK_ORDER_PHOTOS}><Ionicons name="images" size={21} color={PAPER} /><Text style={styles.uploadText}>Upload Photos ({photoCount}/{MAX_WORK_ORDER_PHOTOS})</Text></Pressable>
          <Pressable style={({ pressed }) => [styles.uploadButton, pressed && styles.standardButtonPressed, (videoCount >= MAX_WORK_ORDER_VIDEOS || isUploadingAttachments) && styles.disabled]} onPress={() => void uploadFile('video')} disabled={isSaving || isUploadingAttachments || videoCount >= MAX_WORK_ORDER_VIDEOS}><Ionicons name="videocam" size={21} color={PAPER} /><Text style={styles.uploadText}>Upload Videos ({videoCount}/{MAX_WORK_ORDER_VIDEOS})</Text></Pressable>
          {!isHomeProgress && <Pressable style={({ pressed }) => [styles.uploadButton, pressed && styles.standardButtonPressed, (invoiceFiles.length >= 1 || isUploadingAttachments) && styles.disabled]} onPress={() => void uploadFile('invoice')} disabled={isSaving || isUploadingAttachments || invoiceFiles.length >= 1}><Ionicons name="receipt" size={21} color={PAPER} /><Text style={styles.uploadText}>{invoiceFiles.length >= 1 ? 'Invoice Attachment Added' : 'Upload Invoice Attachment'}</Text></Pressable>}
        </View>

        <View style={[styles.card, styles.roundedButton]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={styles.sectionLabel}>ATTACHMENTS</Text>{photoFiles.length > 1 && <TouchableOpacity onPress={() => confirmRemovePhotos(photoFiles)} disabled={isSaving} accessibilityLabel="Remove all photos"><Text style={{ color: colors.danger, fontSize: 9, fontWeight: '900' }}>REMOVE ALL PHOTOS</Text></TouchableOpacity>}</View>
          {files.map((file) => <View key={file.id} style={styles.fileRow}><TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }} disabled={!file.url} onPress={() => file.url && setPreviewFile(file)}>
            {PHOTO_MIME_TYPES.has(file.mime_type.toLowerCase()) && file.url
              ? <Image source={{ uri: file.url }} style={styles.thumbnail} contentFit="cover" />
              : <View style={styles.fileIcon}><Ionicons name={file.mime_type.toLowerCase().startsWith('video/') ? 'videocam' : 'document-text'} size={22} color={BLUE} /></View>}
            <View style={styles.fileCopy}><Text style={styles.fileName} numberOfLines={1}>{file.original_file_name}</Text><Text style={styles.fileMeta}>{file.file_type === 'invoice' ? `INVOICE ATTACHMENT · ${formatCurrency(file.invoice_amount)}` : file.file_type === 'completion_video' ? 'WORK PERFORMED VIDEO' : file.file_type === 'other' ? 'WORK ORDER REFERENCE' : 'WORK PERFORMED PHOTO'} · {new Date(file.created_at).toLocaleDateString()}</Text></View>
            <Ionicons name="open" size={18} color={BLUE} />
          </TouchableOpacity><TouchableOpacity style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center', marginLeft: 5 }} onPress={() => confirmRemoveAttachment(file)} disabled={isSaving} accessibilityLabel={`Remove ${file.original_file_name}`}><Ionicons name="trash" size={19} color={colors.danger} /></TouchableOpacity></View>)}
          {files.length === 0 && <Text style={styles.emptyText}>{isHomeProgress ? 'No photos uploaded yet.' : 'No photos or invoices uploaded yet.'}</Text>}
          {files.filter((file) => file.file_type === 'invoice').map((file) => <View key={`price-${file.id}`} style={styles.invoiceEditRow}><View style={{ flex: 1 }}><Text style={styles.invoicePriceLabel}>EDIT INVOICE PRICE — {file.original_file_name}</Text><View style={styles.invoicePriceInputRow}><Text style={styles.currency}>$</Text><TextInput style={styles.invoicePriceInput} value={invoicePriceEdits[file.id] ?? ''} onChangeText={(value) => { setInvoicePriceEdits((current) => ({ ...current, [file.id]: value })); if (editingCompletedWorkOrder) setHasCompletedChanges(true); }} placeholder="0.00" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" /></View></View>{!editingCompletedWorkOrder && <Pressable style={({ pressed }) => [styles.invoiceSaveButton, pressed && styles.saveButtonPressed]} onPress={() => void saveInvoicePrice(file)} disabled={isSaving}><Text style={styles.saveText}>Save Price</Text></Pressable>}</View>)}
        </View>

        <View style={[styles.card, styles.roundedButton]}>
          <Text style={styles.sectionLabel}>JOB NOTES</Text>
          <TextInput style={[styles.noteInput, styles.roundedButton]} value={note} onChangeText={setNote} placeholder="Add a required work order note" placeholderTextColor="#8A98A8" multiline />
          <Pressable style={({ pressed }) => [styles.saveButton, styles.roundedButton, pressed && styles.saveButtonPressed]} onPress={() => void saveNote()} disabled={isSaving || !note.trim()}><Text style={styles.saveText}>{isSaving ? 'Saving...' : 'Save note'}</Text></Pressable>
          {notes.map((item) => <View key={item.id} style={styles.note}><View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={[styles.noteDate, { flex: 1 }]}>{new Date(item.created_at).toLocaleString()}</Text><TouchableOpacity onPress={() => confirmRemoveNote(item)} disabled={isSaving} accessibilityLabel="Remove job note"><Ionicons name="trash" size={17} color={colors.danger} /></TouchableOpacity></View><Text style={styles.noteBody}>{item.note}</Text></View>)}
          {notes.length === 0 && <Text style={styles.emptyText}>No job notes yet.</Text>}
        </View>

        <View style={[styles.card, styles.roundedButton]}>
          <Text style={styles.sectionLabel}>COMPLETION REQUIREMENTS</Text>
          {isHomeProgress
            ? <Requirement met={hasCompleteHomeChecklist} text={`All ${checklistItems.length} Home Progress steps`} />
            : <><Requirement met={hasWorkOrderNote} text="At least one work order note" /><Requirement met={photoCount >= 2} text={`At least two work order photos (${photoCount}/2)`} /><Text style={styles.optionalText}>PDF invoice (optional)</Text></>}
          {isCompleted
            ? <View style={styles.completedBanner}><Ionicons name="checkmark-done" size={20} color="#2E8B57" /><Text style={styles.completedText}>WORK ORDER FINALIZED</Text></View>
            : canFinalize
              ? <Pressable style={({ pressed }) => [styles.finalizeButton, styles.roundedButton, pressed && styles.finalizePressed]} onPress={() => void finalizeWorkOrder()} disabled={isSaving}><Text style={styles.finalizeText}>{isSaving ? 'Completing...' : isHomeProgress ? 'Complete WO' : 'Finalize WO'}</Text></Pressable>
              : <Text style={styles.readyHint}>{isHomeProgress ? `Complete WO will appear when all ${checklistItems.length} steps are checked.` : 'Finalize WO will appear when all required items are complete.'}</Text>}
          {editingCompletedWorkOrder && hasCompletedChanges && <Pressable style={({ pressed }) => [styles.saveChangesButton, styles.roundedButton, pressed && styles.saveButtonPressed]} onPress={() => void saveCompletedChanges()} disabled={isSaving}><Ionicons name="save" size={18} color={PAPER} /><Text style={styles.saveText}>{isSaving ? 'Saving...' : 'Save Changes'}</Text></Pressable>}
        </View>
      </>}
    </ScrollView>
    </KeyboardAvoidingView>
    <MediaCarouselModal items={files} activeId={previewFile?.id ?? null} onClose={() => setPreviewFile(null)} />
    <Modal visible={isEditOpen} animationType="slide" onRequestClose={cancelEditWorkOrder}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.editSafeArea} edges={['top', 'bottom']}>
          <View style={styles.editHeader}><Text style={styles.editHeaderTitle}>Edit Work Order</Text><TouchableOpacity style={styles.editCancel} onPress={cancelEditWorkOrder} disabled={isSaving}><Text style={styles.editCancelText}>Cancel</Text></TouchableOpacity></View>
          <ScrollView contentContainerStyle={styles.editContent} keyboardShouldPersistTaps="handled">
          <EditField label="Customer name" value={editCustomerName} onChangeText={setEditCustomerName} />
          <EditField label="Customer phone" value={formatPhoneNumber(editCustomerPhone)} onChangeText={(phone) => setEditCustomerPhone(phoneNumberDigits(phone))} keyboardType="phone-pad" maxLength={14} />
          <EditField label="Street address" value={editAddress} onChangeText={setEditAddress} />
          <View style={styles.editLocationRow}><View style={styles.editCity}><EditField label="City" value={editCity} onChangeText={setEditCity} /></View><View style={styles.editState}><EditField label="State" value={editState} onChangeText={setEditState} autoCapitalize="characters" /></View></View>
          <EditField label="Description" value={editDescription} onChangeText={setEditDescription} multiline />
          {!isHomeProgress && <><Text style={styles.editLabel}>Priority</Text>
          <View style={styles.priorityOptions}>{(['low', 'medium', 'high', 'emergency'] as Priority[]).map((priority) => <TouchableOpacity key={priority} style={[styles.priorityOption, editPriority === priority && styles.priorityOptionSelected]} onPress={() => setEditPriority(priority)}><Text style={[styles.priorityOptionText, editPriority === priority && styles.priorityOptionTextSelected, { color: workOrderPriorityColor(priority, colorScheme) }]}>{priority.toUpperCase()}</Text></TouchableOpacity>)}</View></>}
          <Text style={styles.editLabel}>Completion deadline</Text>
          <View style={styles.deadlineOptions}><TouchableOpacity style={[styles.deadlineOption, !editHasDeadline && styles.deadlineOptionSelected]} onPress={() => { setEditHasDeadline(false); setShowEditCalendar(false); }}><Ionicons name={!editHasDeadline ? 'radio-button-on' : 'radio-button-off'} size={18} color={BLUE} /><Text style={styles.deadlineText}>No deadline</Text></TouchableOpacity><TouchableOpacity style={[styles.deadlineOption, editHasDeadline && styles.deadlineOptionSelected]} onPress={() => { setEditHasDeadline(true); setShowEditCalendar(true); }}><Ionicons name={editHasDeadline ? 'radio-button-on' : 'radio-button-off'} size={18} color={BLUE} /><Text style={styles.deadlineText}>Set deadline</Text></TouchableOpacity></View>
          {editHasDeadline && <TouchableOpacity style={styles.editDateButton} onPress={() => setShowEditCalendar(true)}><Ionicons name="calendar" size={20} color={BLUE} /><Text style={styles.editDateText}>{editDeadline.toLocaleDateString(undefined, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}</Text></TouchableOpacity>}
          {editHasDeadline && showEditCalendar && <DateTimePicker value={editDeadline} mode="date" display={Platform.OS === 'ios' ? 'inline' : 'calendar'} themeVariant={colorScheme} accentColor={colors.primary} onChange={(event: DateTimePickerEvent, date?: Date) => { if (Platform.OS === 'android') setShowEditCalendar(false); if (event.type === 'set' && date) setEditDeadline(date); }} />}
          <View style={styles.adminAttachmentPanel}>
            <Text style={styles.editLabel}>Admin reference attachments</Text>
            <Text style={styles.adminAttachmentHelp}>Add photos or videos for the assigned worker. These do not count toward completion requirements.</Text>
            <View style={styles.adminAttachmentActions}>
              <Pressable style={({ pressed }) => [styles.adminAttachmentButton, pressed && styles.saveEditsPressed, (adminPhotoCount >= MAX_ADMIN_PHOTOS || isUploadingAttachments) && styles.disabled]} onPress={() => void uploadAdminReference('photo')} disabled={isUploadingAttachments || adminPhotoCount >= MAX_ADMIN_PHOTOS}><Ionicons name="images" size={19} color={PAPER} /><Text style={styles.adminAttachmentButtonText}>Photos {adminPhotoCount}/{MAX_ADMIN_PHOTOS}</Text></Pressable>
              <Pressable style={({ pressed }) => [styles.adminAttachmentButton, pressed && styles.saveEditsPressed, (adminVideoCount >= MAX_ADMIN_VIDEOS || isUploadingAttachments) && styles.disabled]} onPress={() => void uploadAdminReference('video')} disabled={isUploadingAttachments || adminVideoCount >= MAX_ADMIN_VIDEOS}><Ionicons name="videocam" size={19} color={PAPER} /><Text style={styles.adminAttachmentButtonText}>Videos {adminVideoCount}/{MAX_ADMIN_VIDEOS}</Text></Pressable>
            </View>
          </View>
            <Pressable style={({ pressed }) => [styles.saveEditsButton, pressed && styles.saveEditsPressed, isSaving && styles.disabled]} onPress={() => void saveWorkOrderEdits()} disabled={isSaving}><Text style={styles.saveEditsText}>{isSaving ? 'Saving...' : 'Save Changes'}</Text></Pressable>
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  </SafeAreaView>;
}

function Detail({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) { const { colors } = useAppTheme(); const styles = useMemo(() => createStyles(colors), [colors]); return <View style={styles.detail}><Ionicons name={icon} size={18} color={colors.primary} /><Text style={styles.detailText}>{text}</Text></View>; }
function Requirement({ met, text }: { met: boolean; text: string }) { const { colors } = useAppTheme(); const styles = useMemo(() => createStyles(colors), [colors]); return <View style={styles.requirement}><Ionicons name={met ? 'checkmark-circle' : 'ellipse'} size={19} color={met ? colors.success : colors.textMuted} /><Text style={styles.requirementText}>{text}</Text></View>; }
function EditField({ label, value, onChangeText, multiline = false, keyboardType = 'default', autoCapitalize = 'sentences', maxLength }: { label: string; value: string; onChangeText: (value: string) => void; multiline?: boolean; keyboardType?: 'default' | 'phone-pad'; autoCapitalize?: 'sentences' | 'characters'; maxLength?: number }) { const { colors } = useAppTheme(); const styles = useMemo(() => createStyles(colors), [colors]); return <View style={styles.editField}><Text style={styles.editLabel}>{label}</Text><TextInput style={[styles.editInput, multiline && styles.editMultiline]} value={value} onChangeText={onChangeText} placeholderTextColor={colors.textMuted} multiline={multiline} keyboardType={keyboardType} autoCapitalize={autoCapitalize} maxLength={maxLength} textAlignVertical={multiline ? 'top' : 'center'} /></View>; }
function formatCurrency(amount: number | null) { return amount && amount > 0 ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount) : 'PRICE NOT SET'; }

const createStyles = (colors: AppThemeColors) => StyleSheet.create({
  roundedButton: { borderRadius: 6 },
  adminActions: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  editButton: { flex: 1, minHeight: 52, backgroundColor: '#243B5C', borderRadius: 6, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  editButtonPressed: { backgroundColor: '#0E1F35' },
  deleteButton: { minHeight: 52, backgroundColor: '#243B5C', borderRadius: 6, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  deleteButtonPressed: { backgroundColor: '#0E1F35' },
  adminActionText: { color: PAPER, fontSize: 12, fontWeight: '900' },
  keyboardArea: { flex: 1 },
  statusLabel: { flexDirection: 'row', alignItems: 'center' },
  statusCircle: { width: 8, height: 8, borderRadius: 4, marginRight: 7 },
  safeArea: { flex: 1, backgroundColor: colors.background }, header: { minHeight: 82, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.header }, backButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: '#7798BC' }, headerCopy: { marginLeft: 14 }, kicker: { color: '#60A5FA', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 }, headerTitle: { color: PAPER, fontSize: 21, fontWeight: '900', marginTop: 4 }, content: { flexGrow: 1, backgroundColor: colors.background, padding: 20, paddingBottom: 40 }, statusRow: { flexDirection: 'row', justifyContent: 'space-between' }, status: { color: colors.primary, fontSize: 10, fontWeight: '900' }, priority: { color: colors.textMuted, fontSize: 10, fontWeight: '900' }, title: { color: colors.primary, fontSize: 25, fontWeight: '900', marginTop: 14 }, description: { color: colors.textMuted, fontSize: 14, lineHeight: 22, marginTop: 10, marginBottom: 20 }, card: { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, padding: 17, marginBottom: 14 }, sectionLabel: { color: colors.text, fontSize: 10, fontWeight: '900', letterSpacing: 1.1, marginBottom: 10 }, detail: { flexDirection: 'row', alignItems: 'center', marginTop: 10 }, detailText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 19, marginLeft: 10 }, phoneText: { color: colors.primary, fontWeight: '900', textDecorationLine: 'underline' }, directionsButton: { backgroundColor: '#243B5C', minHeight: 52, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 18 }, directionsButtonPressed: { backgroundColor: '#0E1F35' }, directionsText: { color: PAPER, fontSize: 12, fontWeight: '900' }, uploadRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 }, uploadButton: { flexGrow: 1, flexBasis: 105, minHeight: 72, backgroundColor: '#243B5C', paddingHorizontal: 12, borderRadius: 6, alignItems: 'center', justifyContent: 'center', gap: 8 }, uploadText: { color: PAPER, fontSize: 11, fontWeight: '900', textAlign: 'center' }, meta: { color: colors.text, fontSize: 13, marginTop: 8 }, noteInput: { minHeight: 88, borderWidth: 0.5, borderColor: colors.border, backgroundColor: colors.input, padding: 12, color: colors.text, textAlignVertical: 'top' }, saveButton: { backgroundColor: '#243B5C', minHeight: 52, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 18 }, saveButtonPressed: { backgroundColor: '#0E1F35' }, standardButtonPressed: { backgroundColor: '#0E1F35' }, saveText: { color: PAPER, fontSize: 12, fontWeight: '900' }, note: { borderTopWidth: 0.5, borderTopColor: colors.border, paddingTop: 12, marginTop: 14 }, noteDate: { color: colors.textMuted, fontSize: 9, fontWeight: '700' }, noteBody: { color: colors.text, fontSize: 13, lineHeight: 19, marginTop: 5 }, emptyText: { color: colors.textMuted, fontSize: 12, marginTop: 14 },
  assigneeInfo: { flexDirection: 'row', alignItems: 'center' }, assigneeIcon: { width: 43, height: 43, backgroundColor: colors.surfaceMuted, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }, assigneeCopy: { flex: 1, marginLeft: 11 }, assigneeName: { color: colors.text, fontSize: 14, fontWeight: '900' }, assigneeMeta: { color: colors.textMuted, fontSize: 10, marginTop: 3 }, reassignButton: { minHeight: 52, backgroundColor: '#243B5C', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 6, marginTop: 18 }, reassignButtonPressed: { backgroundColor: '#0E1F35' }, reassignText: { color: PAPER, fontSize: 12, fontWeight: '900' }, assigneeList: { borderWidth: 0.5, borderColor: colors.border, borderRadius: 6, marginTop: 8, overflow: 'hidden' }, assigneeOption: { minHeight: 54, padding: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: colors.border }, assigneeOptionCurrent: { backgroundColor: colors.surfaceMuted }, assigneeOptionName: { color: colors.text, fontSize: 12, fontWeight: '800' }, assigneeOptionMeta: { color: colors.textMuted, fontSize: 9, marginTop: 3 }, currentLabel: { color: colors.primary, fontSize: 8, fontWeight: '900' }, modalBackdrop: { flex: 1, backgroundColor: 'rgba(8, 19, 34, 0.78)', alignItems: 'center', justifyContent: 'center', padding: 18 }, previewModal: { width: '100%', maxWidth: 720, height: '82%', backgroundColor: colors.surface, borderRadius: 10, overflow: 'hidden' }, previewHeader: { minHeight: 64, backgroundColor: colors.header, flexDirection: 'row', alignItems: 'center', paddingLeft: 16 }, previewTitleCopy: { flex: 1, paddingRight: 10 }, previewTitle: { color: PAPER, fontSize: 13, fontWeight: '800' }, previewType: { color: YELLOW, fontSize: 9, fontWeight: '900', marginTop: 4 }, closeButton: { width: 58, minHeight: 64, alignItems: 'center', justifyContent: 'center' }, previewBody: { flex: 1, backgroundColor: colors.background }, previewImage: { width: '100%', height: '100%' }, pdfViewer: { flex: 1, backgroundColor: colors.surface }, viewerLoading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }, viewerLoadingText: { color: colors.textMuted, fontSize: 12 }, checklistHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, checklistCount: { color: colors.primary, fontSize: 15, fontWeight: '900', marginBottom: 10 }, checklistHelp: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginBottom: 8 }, checklistItem: { flexDirection: 'row', alignItems: 'center', minHeight: 42, borderTopWidth: 0.5, borderTopColor: colors.border }, checkbox: { width: 22, height: 22, borderWidth: 0.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginRight: 10, backgroundColor: colors.surface, borderRadius: 5 }, checkboxComplete: { backgroundColor: colors.surface, borderColor: colors.primary, borderWidth: 1.5 }, checklistLabel: { color: colors.text, fontSize: 12, flex: 1 }, checklistLabelComplete: { color: colors.textMuted, textDecorationLine: 'line-through' }, disabled: { opacity: 0.45 }, fileRow: { flexDirection: 'row', alignItems: 'center', minHeight: 58, borderTopWidth: 0.5, borderTopColor: colors.border, paddingVertical: 8 }, thumbnail: { width: 48, height: 48, borderRadius: 4 }, fileIcon: { width: 48, height: 48, borderRadius: 4, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' }, fileCopy: { flex: 1, marginHorizontal: 10 }, fileName: { color: colors.text, fontSize: 12, fontWeight: '800' }, fileMeta: { color: colors.textMuted, fontSize: 9, fontWeight: '700', marginTop: 4 }, requirement: { flexDirection: 'row', alignItems: 'center', marginTop: 8 }, requirementText: { color: colors.text, fontSize: 13, marginLeft: 9 }, optionalText: { color: colors.textMuted, fontSize: 12, marginTop: 12 }, readyHint: { color: colors.textMuted, fontSize: 11, lineHeight: 17, marginTop: 14 }, finalizeButton: { minHeight: 52, backgroundColor: '#243B5C', paddingHorizontal: 12, borderRadius: 6, alignItems: 'center', justifyContent: 'center', marginTop: 16 }, finalizePressed: { backgroundColor: '#0E1F35' }, finalizeText: { color: PAPER, fontSize: 13, fontWeight: '900' }, completedBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 48, backgroundColor: colors.surfaceMuted, marginTop: 16, gap: 8 }, completedText: { color: colors.success, fontSize: 12, fontWeight: '900' }, saveChangesButton: { minHeight: 52, marginTop: 16, paddingHorizontal: 14, backgroundColor: '#243B5C', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  jobBrief: { backgroundColor: colors.surfaceMuted, borderRadius: 6, padding: 12, marginTop: 14 },
  jobBriefLabel: { color: colors.primary, fontSize: 8, fontWeight: '900', letterSpacing: 0.9 },
  jobBriefText: { color: colors.text, fontSize: 12, lineHeight: 18, marginTop: 5 },
  invoicePriceField: { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: 6, padding: 14, marginBottom: 10 },
  invoicePriceLabel: { color: colors.text, fontSize: 9, fontWeight: '900', letterSpacing: 0.9, marginBottom: 7 },
  invoicePriceInputRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', borderWidth: 0.5, borderColor: colors.border, backgroundColor: colors.input, borderRadius: 6 },
  currency: { color: colors.text, fontSize: 17, fontWeight: '900', marginLeft: 13 },
  invoicePriceInput: { flex: 1, minHeight: 46, color: colors.text, paddingHorizontal: 8, fontSize: 15 },
  invoicePriceHelp: { color: colors.textMuted, fontSize: 9, marginTop: 7 },
  invoiceEditRow: { borderTopWidth: 0.5, borderTopColor: colors.border, paddingTop: 12, marginTop: 10, flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  invoiceSaveButton: { minHeight: 48, backgroundColor: '#243B5C', paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  editSafeArea: { flex: 1, backgroundColor: colors.background },
  editHeader: { minHeight: 66, backgroundColor: NAVY, paddingLeft: 20, flexDirection: 'row', alignItems: 'center' },
  editHeaderTitle: { flex: 1, color: PAPER, fontSize: 20, fontWeight: '900' },
  editCancel: { minHeight: 66, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  editCancelText: { color: PAPER, fontSize: 12, fontWeight: '900' },
  editContent: { padding: 20, paddingBottom: 40, backgroundColor: colors.background },
  editField: { marginBottom: 15 },
  editLabel: { color: colors.text, fontSize: 11, fontWeight: '800', marginBottom: 7, marginTop: 4 },
  editInput: { minHeight: 48, borderWidth: 0.5, borderColor: colors.border, backgroundColor: colors.input, borderRadius: 6, paddingHorizontal: 12, color: colors.text, fontSize: 13 },
  editMultiline: { minHeight: 96, paddingTop: 12 },
  editLocationRow: { flexDirection: 'row', gap: 10 },
  editCity: { flex: 1 },
  editState: { width: 92 },
  priorityOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 15 },
  priorityOption: { minHeight: 40, paddingHorizontal: 12, borderWidth: 0.5, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  priorityOptionSelected: { borderColor: '#0E1F35', backgroundColor: '#0E1F35' },
  priorityOptionText: { color: colors.textMuted, fontSize: 9, fontWeight: '900' },
  priorityOptionTextSelected: { color: colors.primaryStrong },
  deadlineOptions: { flexDirection: 'row', gap: 9 },
  deadlineOption: { flex: 1, minHeight: 44, borderWidth: 0.5, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  deadlineOptionSelected: { borderColor: '#0E1F35', backgroundColor: '#0E1F35' },
  deadlineText: { color: colors.text, fontSize: 11, fontWeight: '800' },
  editDateButton: { minHeight: 54, marginTop: 9, paddingHorizontal: 13, borderWidth: 0.5, borderColor: colors.border, backgroundColor: '#243B5C', borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 10 },
  editDateText: { flex: 1, color: colors.text, fontSize: 12, fontWeight: '800' },
  adminAttachmentPanel: { marginTop: 20, padding: 14, borderWidth: 0.5, borderColor: colors.border, borderRadius: 6, backgroundColor: colors.surface },
  adminAttachmentHelp: { color: colors.textMuted, fontSize: 10, lineHeight: 15, marginBottom: 10 },
  adminAttachmentActions: { flexDirection: 'row', gap: 9 },
  adminAttachmentButton: { flex: 1, minHeight: 54, borderRadius: 6, backgroundColor: '#243B5C', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 8 },
  adminAttachmentButtonText: { color: PAPER, fontSize: 10, fontWeight: '900', textAlign: 'center' },
  saveEditsButton: { minHeight: 52, backgroundColor: '#243B5C', borderRadius: 6, alignItems: 'center', justifyContent: 'center', marginTop: 22, paddingHorizontal: 12 },
  saveEditsPressed: { backgroundColor: '#0E1F35' },
  saveEditsText: { color: PAPER, fontSize: 12, fontWeight: '900' },
});
