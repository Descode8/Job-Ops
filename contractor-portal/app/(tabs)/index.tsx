import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type AppThemeColors, useAppTheme } from '@/contexts/theme-context';
import { AppText as Text, AppTextInput as TextInput } from '@/components/app-typography';
import { ThemedAlert as Alert } from '@/components/themed-alert';
import { supabase } from '@/lib/supabase';
import { notifyWorkOrderSms } from '@/lib/work-order-sms';
import { formatWorkOrderNumber } from '@/lib/work-order-number';
import { formatWorkOrderDeadline } from '@/lib/work-order-deadline';
import { compareWorkOrderPriority, workOrderPriorityColor } from '@/lib/work-order-priority';
import { useWorkOrderRealtime } from '@/hooks/use-work-order-realtime';
import { formatPhoneNumber, phoneNumberDigits } from '@/lib/phone-number';
import { mapChoices, openMapDirections } from '@/lib/map-directions';
import { MediaCarouselModal } from '@/components/media-carousel-modal';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';

const YELLOW = '#1D4ED8';
const NAVY = '#09192D';
const BLUE = '#1D4ED8';
const PAPER = '#FFFFFF';
const INK = '#172033';
const MUTED = '#566273';
type GlanceFilter = 'assigned' | 'due_today' | 'needs_update';

export default function HomeScreen() {
  const { colorScheme, themeMode, colors, toggleColorScheme, setThemeMode } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const [contractorName, setContractorName] = useState('');
  const [contractorId, setContractorId] = useState('');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileImage, setProfileImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [pendingOffers, setPendingOffers] = useState<WorkOrderOffer[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationLog, setNotificationLog] = useState<AppNotification[]>([]);
  const [isNotificationLogOpen, setIsNotificationLogOpen] = useState(false);
  const [notificationMutation, setNotificationMutation] = useState<string | null>(null);
  const [isClearConfirmationOpen, setIsClearConfirmationOpen] = useState(false);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const [respondingOfferId, setRespondingOfferId] = useState<string | null>(null);
  const [viewingOffer, setViewingOffer] = useState<WorkOrderOffer | null>(null);
  const [viewingOfferMedia, setViewingOfferMedia] = useState<OfferMedia[]>([]);
  const [isLoadingOfferMedia, setIsLoadingOfferMedia] = useState(false);
  const [activeOfferMediaId, setActiveOfferMediaId] = useState<string | null>(null);
  const [suspendedOffer, setSuspendedOffer] = useState<WorkOrderOffer | null>(null);
  const [isFlowInfoVisible, setIsFlowInfoVisible] = useState(false);
  const [glanceFilter, setGlanceFilter] = useState<GlanceFilter | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        setIsLoading(false);
        return;
      }
      setContractorName(authData.user.user_metadata?.full_name || authData.user.email?.split('@')[0] || 'Contractor');

      const { data: contractor } = await supabase
        .from('contractors')
        .select('id, full_name, email, phone_number, is_admin')
        .eq('auth_user_id', authData.user.id)
        .eq('is_active', true)
        .single();

      if (!contractor) {
        setIsLoading(false);
        return;
      }

      const { data: avatarProfile } = await supabase.from('contractors').select('avatar_path').eq('id', contractor.id).maybeSingle();
      const contractorProfile = { ...contractor, avatar_path: avatarProfile?.avatar_path ?? null } as Profile;
      setContractorName(contractor.full_name);
      setContractorId(contractor.id);
      setProfile(contractorProfile);
      if (contractorProfile.avatar_path) {
        const { data: avatar } = await supabase.storage.from('profile-images').createSignedUrl(contractorProfile.avatar_path, 3600);
        setProfileAvatarUrl(avatar?.signedUrl ?? null);
      } else setProfileAvatarUrl(null);
      const [{ data: assignments }, { data: offers, error: offersError }, { data: notices }] = await Promise.all([
        supabase
          .from('work_order_assignments')
          .select('work_order:work_orders(id, work_order_number, title, description, status, priority, deadline_at, created_at, completed_at, properties(customer_name, address_line_1, city, state))')
          .eq('contractor_id', contractor.id)
          .is('unassigned_at', null),
        supabase.rpc('get_pending_work_order_offers'),
        supabase.from('notifications').select('id, title, message, created_at, read_at').eq('contractor_id', contractor.id).is('read_at', null).order('created_at', { ascending: false }),
      ]);

      const orders = (assignments ?? [])
        .map((assignment) => assignment.work_order)
        .filter(Boolean) as unknown as WorkOrder[];
      setWorkOrders(orders);
      if (!offersError) setPendingOffers((offers ?? []) as WorkOrderOffer[]);
      const unreadNotices = (notices ?? []) as AppNotification[];
      setNotifications(unreadNotices);
      setIsLoading(false);
  }, []);
  const { isRefreshing, onRefresh } = usePullToRefresh(loadDashboard);

  useFocusEffect(
    useCallback(() => {
      void loadDashboard();
      return () => setIsHeaderMenuOpen(false);
    }, [loadDashboard]),
  );
  useWorkOrderRealtime(() => { void loadDashboard(); });
  useEffect(() => {
    if (!contractorId) return;
    const offerChannel = supabase
      .channel(`home-work-order-offers-${contractorId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_order_offers', filter: `recipient_id=eq.${contractorId}` }, () => { void loadDashboard(); })
      .subscribe();
    return () => { void supabase.removeChannel(offerChannel); };
  }, [contractorId, loadDashboard]);
  useEffect(() => { const timer = setInterval(() => setCurrentTime(Date.now()), 60_000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!contractorId) return;
    const channel = supabase.channel(`home-notifications-${contractorId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `contractor_id=eq.${contractorId}` }, (payload) => {
        const notice = payload.new as AppNotification;
        if (!notice.read_at) setNotifications((current) => current.some((item) => item.id === notice.id) ? current : [notice, ...current]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `contractor_id=eq.${contractorId}` }, (payload) => {
        const notice = payload.new as AppNotification;
        setNotifications((current) => notice.read_at ? current.filter((item) => item.id !== notice.id) : current.map((item) => item.id === notice.id ? notice : item));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'notifications', filter: `contractor_id=eq.${contractorId}` }, (payload) => {
        const deletedId = (payload.old as { id?: string }).id;
        if (deletedId) { setNotifications((current) => current.filter((item) => item.id !== deletedId)); setNotificationLog((current) => current.filter((item) => item.id !== deletedId)); }
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [contractorId]);

  const activeWorkOrders = workOrders
    .filter((workOrder) => workOrder.status !== 'completed')
    .sort((left, right) => compareSuggestedFlow(left, right, currentTime));
  const suggestedFlow = activeWorkOrders;
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const endOfToday = startOfToday + 24 * 60 * 60 * 1000;
  const dueToday = activeWorkOrders.filter((workOrder) => {
    if (!workOrder.deadline_at) return false;
    const deadline = new Date(workOrder.deadline_at).getTime();
    return deadline >= startOfToday && deadline < endOfToday;
  }).length;
  const needsUpdate = activeWorkOrders.filter((workOrder) => workOrder.status === 'not_started').length;
  const glanceJobs = glanceFilter === 'due_today'
    ? activeWorkOrders.filter((workOrder) => { const deadline = workOrder.deadline_at ? new Date(workOrder.deadline_at).getTime() : 0; return deadline >= startOfToday && deadline < endOfToday; })
    : glanceFilter === 'needs_update' ? activeWorkOrders.filter((workOrder) => workOrder.status === 'not_started')
    : activeWorkOrders;
  const glanceTitle = glanceFilter === 'due_today' ? 'Due Today' : glanceFilter === 'needs_update' ? 'Needs Update' : 'Assigned Jobs';
  const currentWorkOrder = activeWorkOrders[0];
  const firstName = contractorName.split(' ')[0] || 'Contractor';
  const avatarInitials = contractorName.split(' ').filter(Boolean).map((name) => name[0]).join('').slice(0, 2).toUpperCase() || 'CT';
  const greeting = new Date().getHours() < 12 ? 'Good Morning' : new Date().getHours() < 18 ? 'Good Afternoon' : 'Good Evening';

  const openDirections = () => {
    if (!currentWorkOrder?.properties) return;
    const choices = mapChoices(formatAddress(currentWorkOrder.properties));
    Alert.alert('Select Navigation', 'Select the app you want to use for directions.', [
      ...choices.map((choice) => ({ text: choice.label, icon: choice.icon, onPress: () => void startDirections(choice.url) })),
    ], { cancelable: true, showCloseButton: true });
  };

  const startDirections = async (url: string) => {
    if (!currentWorkOrder) return;
    try {
      if (currentWorkOrder.status === 'not_started') {
        const { data, error } = await supabase.rpc('mark_work_order_started', { p_work_order_id: currentWorkOrder.id, p_action: 'navigation_started' });
        if (error) Alert.alert('Could not update work order', error.message);
        else setWorkOrders((orders) => orders.map((item) => item.id === currentWorkOrder.id ? { ...item, status: data ?? 'in_progress' } : item));
      }
      await openMapDirections(url);
    } catch (error) {
      Alert.alert('Could not open maps', error instanceof Error ? error.message : 'No maps application is available on this device.');
    }
  };

  const openProfile = () => {
    if (!profile) return;
    setProfileName(profile.full_name);
    setProfileEmail(profile.email ?? '');
    setProfilePhone(profile.phone_number);
    setProfileImage(null);
    setIsHeaderMenuOpen(false);
    setIsProfileOpen(true);
  };

  const chooseProfileImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert('Photo permission required', 'Allow photo access to choose a profile picture.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.85 });
    if (!result.canceled) setProfileImage(result.assets[0]);
  };

  const saveProfile = async () => {
    if (!profile || !profileName.trim() || !profilePhone.trim()) { Alert.alert('Missing information', 'Name and phone number are required.'); return; }
    setIsSavingProfile(true);
    let avatarPath = profile.avatar_path;
    if (profileImage) {
      const mimeType = profileImage.mimeType ?? 'image/jpeg';
      const extension = mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
      avatarPath = `${profile.id}/profile-${Date.now()}.${extension}`;
      const response = await fetch(profileImage.uri);
      const { error: uploadError } = await supabase.storage.from('profile-images').upload(avatarPath, await response.arrayBuffer(), { contentType: mimeType, upsert: true });
      if (uploadError) { setIsSavingProfile(false); Alert.alert('Photo upload failed', `${uploadError.message}\n\nApply database/29_contractor_profiles.sql in Supabase first.`); return; }
    }
    const { error } = await supabase.rpc('update_own_profile', { p_full_name: profileName.trim(), p_email: profileEmail.trim(), p_phone_number: profilePhone.trim(), p_avatar_path: avatarPath });
    setIsSavingProfile(false);
    if (error) { Alert.alert('Could not update profile', `${error.message}\n\nApply database/29_contractor_profiles.sql in Supabase first.`); return; }
    setIsProfileOpen(false);
    await loadDashboard();
    Alert.alert('Profile updated');
  };

  const signOut = async () => {
    setIsHeaderMenuOpen(false);
    await supabase.auth.signOut();
    router.replace('/login');
  };

  const respondToOffer = async (offerId: string, response: 'accepted' | 'rejected') => {
    setRespondingOfferId(offerId);
    try {
      const respondingOffer = pendingOffers.find((offer) => offer.offer_id === offerId);
      const { error } = await withTimeout(supabase.rpc('respond_to_work_order_offer', { p_offer_id: offerId, p_response: response }), 15_000);
      if (error) throw error;
      if (respondingOffer?.work_order_id) notifyWorkOrderSms(respondingOffer.work_order_id, response);
      setViewingOffer((current) => current?.offer_id === offerId ? null : current);
      setSuspendedOffer(null);
      setActiveOfferMediaId(null);
      setViewingOfferMedia([]);
      setPendingOffers((current) => current.filter((offer) => offer.offer_id !== offerId));
      await loadDashboard();
    } catch (error) {
      Alert.alert('Could not respond', errorMessage(error));
    } finally {
      setRespondingOfferId(null);
    }
  };

  const viewOffer = async (offer: WorkOrderOffer) => {
    setViewingOffer(offer);
    setViewingOfferMedia([]);
    setIsLoadingOfferMedia(true);
    try {
      const { data, error } = await withTimeout(supabase.rpc('get_pending_offer_media', { p_offer_id: offer.offer_id }), 15_000);
      if (error) throw error;
      const signedMedia = await Promise.all(((data ?? []) as Omit<OfferMedia, 'url'>[]).map(async (file) => {
        const { data: signed, error: signError } = await supabase.storage.from('work-order-files').createSignedUrl(file.storage_path, 3600);
        return { ...file, url: signError ? undefined : signed?.signedUrl };
      }));
      setViewingOfferMedia(signedMedia);
    } catch (error) {
      Alert.alert('Could not load attachments', errorMessage(error));
    } finally {
      setIsLoadingOfferMedia(false);
    }
  };

  const openOfferPicture = (fileId: string) => {
    if (!viewingOffer) return;
    setSuspendedOffer(viewingOffer);
    setViewingOffer(null);
    setTimeout(() => setActiveOfferMediaId(fileId), 280);
  };

  const closeOfferPicture = () => {
    setActiveOfferMediaId(null);
    const offerToRestore = suspendedOffer;
    setSuspendedOffer(null);
    if (offerToRestore) setTimeout(() => setViewingOffer(offerToRestore), 280);
  };

  const openNotificationLog = async () => {
    if (!contractorId) return;
    const { data, error } = await supabase.from('notifications').select('id, title, message, created_at, read_at').eq('contractor_id', contractorId).order('created_at', { ascending: false });
    if (error) { Alert.alert('Could not load notification history', error.message); return; }
    setNotificationLog((data ?? []) as AppNotification[]);
    setIsNotificationLogOpen(true);
    setIsHeaderMenuOpen(false);
    setNotifications([]);
    const { error: readError } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('contractor_id', contractorId).is('read_at', null);
    if (readError) Alert.alert('Could not mark notifications as read', readError.message);
  };

  const deleteNotification = async (notificationId: string) => {
    if (!contractorId || notificationMutation) return;
    const previousLog = notificationLog;
    const previousUnread = notifications;
    setNotificationMutation(notificationId);
    setNotificationLog((current) => current.filter((item) => item.id !== notificationId));
    setNotifications((current) => current.filter((item) => item.id !== notificationId));
    try {
      const { error } = await withTimeout(supabase.from('notifications').delete().eq('id', notificationId).eq('contractor_id', contractorId));
      if (error) throw error;
    } catch (error) {
      setNotificationLog(previousLog);
      setNotifications(previousUnread);
      Alert.alert('Could not clear notification', errorMessage(error));
    } finally {
      setNotificationMutation(null);
    }
  };

  const clearAllNotifications = async () => {
    if (!contractorId || notificationLog.length === 0 || notificationMutation) return;
    const previousLog = notificationLog;
    const previousUnread = notifications;
    setIsClearConfirmationOpen(false);
    setNotificationMutation('all');
    setNotificationLog([]);
    setNotifications([]);
    try {
        const { error: rpcError } = await withTimeout(supabase.rpc('clear_my_notifications'));
        const fallbackResult = rpcError && /clear_my_notifications|schema cache|could not find/i.test(rpcError.message)
          ? await withTimeout(supabase.from('notifications').delete().eq('contractor_id', contractorId))
          : { error: rpcError };
        if (fallbackResult.error) throw fallbackResult.error;
    } catch (error) {
      setNotificationLog(previousLog);
      setNotifications(previousUnread);
      Alert.alert('Could not clear notifications', errorMessage(error));
    } finally {
      setNotificationMutation(null);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}>
        <View style={[styles.topBar, themeMode !== 'black' && styles.expandedTopBar]}>
          <TouchableOpacity
            style={styles.notificationButton}
            accessibilityLabel="Open menu"
            accessibilityRole="button"
            accessibilityState={{ expanded: isHeaderMenuOpen }}
            onPress={(event) => {
              event.stopPropagation();
              setIsHeaderMenuOpen((isOpen) => !isOpen);
            }}>
            <Ionicons name="menu" size={26} color={PAPER} />
          </TouchableOpacity>
          <View style={styles.brand}>
            <Image source={require('@/assets/images/JobOps_alt.png')} style={styles.logo} contentFit="contain" />
            <Text style={styles.brandTitle}>JobOps</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.notificationButton} accessibilityLabel={`Open notifications${notifications.length ? `, ${notifications.length} unread` : ''}`} accessibilityRole="button" onPress={() => void openNotificationLog()}>
              <Ionicons name="notifications" size={21} color={themeMode === 'black' ? PAPER : YELLOW} />
              {notifications.length > 0 && <View style={styles.notificationBadge}><Text style={styles.notificationBadgeText}>{notifications.length > 99 ? '99+' : notifications.length}</Text></View>}
            </TouchableOpacity>
            <TouchableOpacity onPress={openProfile} accessibilityLabel="Open profile" accessibilityRole="button">
              {profileAvatarUrl ? <Image source={{ uri: profileAvatarUrl }} style={styles.headerAvatarImage} contentFit="cover" /> : <View style={styles.headerAvatarFallback}><Text style={styles.headerAvatarText}>{avatarInitials}</Text></View>}
            </TouchableOpacity>
          </View>
          {isHeaderMenuOpen && (
            <View style={[styles.headerMenu, themeMode !== 'black' && styles.expandedHeaderMenu]}>
              <TouchableOpacity style={styles.headerMenuItem} onPress={openProfile} accessibilityRole="menuitem">
                <Ionicons name="person-circle" size={20} color={colors.primary} />
                <Text style={styles.headerMenuText}>Profile</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerMenuItem} onPress={() => { setIsHeaderMenuOpen(false); toggleColorScheme(); }} accessibilityRole="menuitem">
                <Ionicons name={colorScheme === 'dark' ? 'sunny' : 'moon'} size={19} color={colors.primaryStrong} />
                <Text style={styles.headerMenuText}>{colorScheme === 'dark' ? 'Light Mode' : 'Dark Mode'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerMenuItem} onPress={() => { setIsHeaderMenuOpen(false); setThemeMode('black'); }} accessibilityRole="menuitem" accessibilityState={{ selected: themeMode === 'black' }}>
                <Ionicons name="contrast" size={19} color={colors.primaryStrong} />
                <Text style={styles.headerMenuText}>Black Mode</Text>
                {themeMode === 'black' && <Ionicons name="checkmark" size={18} color={colors.success} />}
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerMenuItem} onPress={() => void signOut()} accessibilityRole="menuitem">
                <Ionicons name="log-out" size={19} color={colors.primary} />
                <Text style={styles.headerMenuText}>Logout</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        {isHeaderMenuOpen && <Pressable style={styles.menuDismissLayer} onPress={() => setIsHeaderMenuOpen(false)} accessibilityLabel="Close menu" />}

        <View style={styles.greetingRow}>
          <View>
            <Text style={styles.greeting}>{greeting}, {firstName}</Text>
            <Text style={styles.eyebrow}>{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
          </View>
        </View>

        {pendingOffers.length > 0 && (
          <View style={styles.offersSection}>
            <View style={styles.offerHeadingRow}>
              <Ionicons name="notifications" size={20} color={colorScheme === 'dark' || themeMode === 'black' ? PAPER : NAVY} />
              <Text style={styles.offerHeading}>WORK ORDERS WAITING FOR YOUR RESPONSE</Text>
            </View>
            {pendingOffers.map((offer) => (
              <View key={offer.offer_id} style={styles.offerCard}>
                <Text style={styles.offerNumber}>{formatWorkOrderNumber(offer.work_order_number)} · FROM {offer.sender_name.toUpperCase()}</Text>
                <Text style={styles.offerTitle}>{offer.title}</Text>
                <Text style={styles.offerMeta}>{offer.customer_name} · {formatPhoneNumber(offer.customer_phone)}</Text>
                <Text style={styles.offerMeta}>{offer.customer_address}</Text>
                <Text style={styles.offerDescription}>{offer.description}</Text>
                <View style={styles.offerActions}>
                  <TouchableOpacity
                    style={[styles.offerButton, styles.viewOfferButton]}
                    disabled={respondingOfferId === offer.offer_id}
                    onPress={() => void viewOffer(offer)}>
                    <Text style={styles.viewOfferButtonText}>View</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.offerButton, styles.acceptButton]}
                    disabled={respondingOfferId === offer.offer_id}
                    onPress={() => void respondToOffer(offer.offer_id, 'accepted')}>
                    <Text style={styles.acceptButtonText}>{respondingOfferId === offer.offer_id ? 'Saving...' : 'Accept'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.offerButton, styles.rejectButton]}
                    disabled={respondingOfferId === offer.offer_id}
                    onPress={() => void respondToOffer(offer.offer_id, 'rejected')}>
                    <Text style={styles.rejectButtonText}>Reject</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <Text style={styles.summaryLabel}>YOUR DAY AT A GLANCE</Text>
            <Ionicons name="sunny" size={21} color={colors.primary} />
          </View>
          <View style={styles.summaryStats}>
            <TouchableOpacity style={styles.summaryStat} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel="View assigned jobs" onPress={() => setGlanceFilter('assigned')}>
              <Text style={styles.summaryNumber}>{isLoading ? '--' : activeWorkOrders.length}</Text>
              <Text style={styles.summaryText}>Assigned Jobs</Text>
              <Ionicons name="arrow-forward-circle-outline" size={14} color={colors.primary} style={styles.summaryActionIcon} />
            </TouchableOpacity>
            <View style={styles.summaryDivider} />
            <TouchableOpacity style={styles.summaryStat} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel="View jobs due today" onPress={() => setGlanceFilter('due_today')}>
              <Text style={styles.summaryNumber}>{isLoading ? '--' : dueToday}</Text>
              <Text style={styles.summaryText}>Due Today</Text>
              <Ionicons name="arrow-forward-circle-outline" size={14} color={colors.primary} style={styles.summaryActionIcon} />
            </TouchableOpacity>
            <View style={styles.summaryDivider} />
            <TouchableOpacity style={styles.summaryStat} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel="View jobs needing an update" onPress={() => setGlanceFilter('needs_update')}>
              <Text style={styles.summaryNumber}>{isLoading ? '--' : needsUpdate}</Text>
              <Text style={styles.summaryText}>Needs Update</Text>
              <Ionicons name="arrow-forward-circle-outline" size={14} color={colors.primary} style={styles.summaryActionIcon} />
            </TouchableOpacity>
          </View>
        </View>

        {suggestedFlow.length > 0 && <>
          <View style={styles.sectionHeading}>
            <View>
              <View style={styles.flowHeadingRow}>
                <Text style={styles.sectionEyebrow}>SUGGESTED FLOW</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="About Suggested Flow" accessibilityState={{ expanded: isFlowInfoVisible }} onPress={() => setIsFlowInfoVisible((visible) => !visible)} hitSlop={8}>
                  <Ionicons name="information-circle-outline" size={17} color={colors.primary} />
                </Pressable>
              </View>
              <Text style={styles.sectionTitle}>Today&apos;s Schedule</Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/(tabs)/explore')}><Text style={styles.linkText}>View all</Text></TouchableOpacity>
          </View>
          {isFlowInfoVisible && <View style={styles.flowTooltip}><View style={styles.flowTooltipArrow} /><Text style={styles.flowTooltipText}>Based on the work assigned to you, its priority, and upcoming deadlines, this is a suggested workflow designed to help you finish everything on time.</Text></View>}
          <View style={styles.flowCard}><ScrollView style={styles.flowScroll} nestedScrollEnabled showsVerticalScrollIndicator={suggestedFlow.length > 3}>
            {suggestedFlow.map((workOrder, index) => {
              const urgency = getFlowUrgency(workOrder);
              return <TouchableOpacity key={workOrder.id} style={styles.flowRow} activeOpacity={0.75} onPress={() => router.push({ pathname: '/work-order/[id]', params: { id: workOrder.id } })}>
                <View style={styles.flowRail}>
                  <View style={[styles.flowDot, { backgroundColor: urgency.color }]} />
                  {index < suggestedFlow.length - 1 && <View style={styles.flowLine} />}
                </View>
                <View style={styles.flowRank}><Text style={styles.flowRankText}>{index + 1}</Text></View>
                <View style={styles.flowCopy}>
                  <View style={styles.flowMetaRow}><Text style={[styles.flowUrgency, { color: urgency.color }]}>{urgency.label}</Text><Text style={styles.flowDeadline}>{formatWorkOrderDeadline(workOrder.deadline_at, new Date(currentTime))}</Text></View>
                  <Text style={styles.flowTitle}>{workOrder.properties?.customer_name || workOrder.title}</Text>
                  <Text style={styles.flowAddress} numberOfLines={1}>{formatAddress(workOrder.properties)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>;
            })}
          </ScrollView></View>
        </>}

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
        </View>
        <View style={styles.actionGrid}>
          <ActionButton icon="camera" label="Upload Photos" onPress={() => currentWorkOrder && router.push({ pathname: '/work-order/[id]', params: { id: currentWorkOrder.id, action: 'photos' } })} disabled={!currentWorkOrder} />
          <ActionButton icon="document-text" label="Add Job Note" onPress={() => currentWorkOrder && router.push({ pathname: '/work-order/[id]', params: { id: currentWorkOrder.id, action: 'note' } })} disabled={!currentWorkOrder} />
          <ActionButton icon="navigate" label="Start Navigation" onPress={() => void openDirections()} disabled={!currentWorkOrder} />
          <ActionButton icon="receipt" label="Upload Invoice" onPress={() => currentWorkOrder && router.push({ pathname: '/work-order/[id]', params: { id: currentWorkOrder.id, action: 'invoice' } })} disabled={!currentWorkOrder} />
        </View>

      </ScrollView>
      <Modal visible={Boolean(viewingOffer)} transparent animationType="fade" onRequestClose={() => setViewingOffer(null)} statusBarTranslucent>
        <View style={styles.modalBackdrop}>
          <View style={styles.offerPreviewModal}>
            <View style={styles.offerPreviewHeader}>
              <View style={styles.offerPreviewHeading}>
                <Text style={styles.offerPreviewKicker}>WORK ORDER REQUEST FROM</Text>
                <Text style={styles.offerPreviewSenderName}>{viewingOffer?.sender_name || 'JobOps User'}</Text>
                <Text style={styles.offerPreviewNumber}>{formatWorkOrderNumber(viewingOffer?.work_order_number)}</Text>
              </View>
              <TouchableOpacity style={styles.modalClose} onPress={() => setViewingOffer(null)} accessibilityLabel="Close work order details"><Ionicons name="close" size={24} color={PAPER} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.offerPreviewContent}>
              <Text style={styles.offerPreviewLabel}>TITLE</Text><Text style={styles.offerPreviewValue}>{viewingOffer?.title || 'Not provided'}</Text>
              <Text style={styles.offerPreviewLabel}>CUSTOMER</Text><Text style={styles.offerPreviewValue}>{viewingOffer?.customer_name || 'Not provided'}</Text>
              <Text style={styles.offerPreviewLabel}>PHONE</Text><Text style={styles.offerPreviewValue}>{formatPhoneNumber(viewingOffer?.customer_phone || '') || 'Not provided'}</Text>
              <Text style={styles.offerPreviewLabel}>SERVICE ADDRESS</Text><Text style={styles.offerPreviewValue}>{viewingOffer?.customer_address || 'Not provided'}</Text>
              <Text style={styles.offerPreviewLabel}>WORK REQUESTED</Text><Text style={styles.offerPreviewDescription}>{viewingOffer?.description || 'No description provided.'}</Text>
              <Text style={styles.offerPreviewLabel}>CREATOR ATTACHMENTS</Text>
              {isLoadingOfferMedia && <Text style={styles.offerPreviewEmpty}>Loading pictures and videos...</Text>}
              {!isLoadingOfferMedia && viewingOfferMedia.map((file) => file.mime_type.toLowerCase().startsWith('image/') && file.url
                ? <TouchableOpacity key={file.id} onPress={() => openOfferPicture(file.id)}><Image source={{ uri: file.url }} style={styles.offerPreviewImage} contentFit="cover" /><Text style={styles.offerPreviewMediaName}>{file.original_file_name}</Text></TouchableOpacity>
                : <TouchableOpacity key={file.id} disabled={!file.url} style={styles.offerPreviewMediaLink} onPress={() => openOfferPicture(file.id)}><Ionicons name="play-circle" size={22} color={PAPER} /><Text style={styles.offerPreviewMediaLinkText}>{file.original_file_name || 'Play video'}</Text><Ionicons name="chevron-forward" size={18} color={PAPER} /></TouchableOpacity>)}
              {!isLoadingOfferMedia && viewingOfferMedia.length === 0 && <Text style={styles.offerPreviewEmpty}>No pictures or videos were attached by the creator.</Text>}
              <Text style={styles.offerPreviewSender}>Sent by {viewingOffer?.sender_name}</Text>
            </ScrollView>
            <View style={styles.offerPreviewActions}>
              <TouchableOpacity style={[styles.offerPreviewAction, styles.acceptButton]} disabled={Boolean(respondingOfferId)} onPress={() => viewingOffer && void respondToOffer(viewingOffer.offer_id, 'accepted')}><Text style={styles.acceptButtonText}>{respondingOfferId ? 'Saving...' : 'Accept'}</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.offerPreviewAction, styles.rejectButton]} disabled={Boolean(respondingOfferId)} onPress={() => viewingOffer && void respondToOffer(viewingOffer.offer_id, 'rejected')}><Text style={styles.rejectButtonText}>Reject</Text></TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.offerPreviewCancel} onPress={() => setViewingOffer(null)}><Text style={styles.offerPreviewCancelText}>Back to Offers</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
      <MediaCarouselModal items={viewingOfferMedia} activeId={activeOfferMediaId} onClose={closeOfferPicture} />
      <Modal visible={Boolean(glanceFilter)} transparent animationType="fade" onRequestClose={() => setGlanceFilter(null)} statusBarTranslucent>
        <View style={styles.glanceBackdrop}>
          <BlurView intensity={45} tint={colorScheme === 'dark' ? 'dark' : 'light'} experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setGlanceFilter(null)} accessibilityLabel="Close job list" />
          <View style={styles.glanceModal}>
            <View style={styles.glanceHeader}><View><Text style={styles.glanceEyebrow}>YOUR DAY AT A GLANCE</Text><Text style={styles.glanceTitle}>{glanceTitle}</Text></View><TouchableOpacity style={styles.glanceClose} onPress={() => setGlanceFilter(null)} accessibilityLabel="Close job list"><Ionicons name="close" size={23} color={colors.text} /></TouchableOpacity></View>
            <Text style={styles.glanceCount}>{glanceJobs.length} WORK ORDER{glanceJobs.length === 1 ? '' : 'S'}</Text>
            <ScrollView contentContainerStyle={styles.glanceList} showsVerticalScrollIndicator={false}>
              {glanceJobs.map((workOrder) => { const priorityColor = workOrderPriorityColor(workOrder.priority, colorScheme); return <TouchableOpacity key={workOrder.id} style={[styles.glanceJob, { borderLeftColor: priorityColor }]} activeOpacity={0.78} onPress={() => { setGlanceFilter(null); router.push({ pathname: '/work-order/[id]', params: { id: workOrder.id } }); }}><View style={styles.glanceJobTop}><Text style={[styles.glancePriority, { color: priorityColor }]}>{workOrder.priority.toUpperCase()}</Text><Text style={styles.glanceJobNumber}>{formatWorkOrderNumber(workOrder.work_order_number)}</Text></View><Text style={styles.glanceJobTitle}>{workOrder.properties?.customer_name || workOrder.title}</Text><Text style={styles.glanceJobAddress} numberOfLines={1}>{formatAddress(workOrder.properties)}</Text><View style={styles.glanceJobFooter}><Text style={styles.glanceDeadline}>{formatWorkOrderDeadline(workOrder.deadline_at, new Date(currentTime))}</Text><Ionicons name="arrow-forward" size={17} color={colors.primary} /></View></TouchableOpacity>; })}
              {glanceJobs.length === 0 && <View style={styles.glanceEmpty}><Ionicons name="briefcase-outline" size={30} color={colors.textMuted} /><Text style={styles.glanceEmptyText}>No matching work orders.</Text></View>}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Modal visible={isNotificationLogOpen} transparent animationType="fade" onRequestClose={() => { setIsNotificationLogOpen(false); setIsClearConfirmationOpen(false); }} statusBarTranslucent>
        <View style={styles.modalBackdrop}>
          <View style={styles.notificationModal}>
            <View style={styles.modalHeader}><View><Text style={styles.modalTitle}>Notification Log</Text><Text style={styles.modalSubtitle}>NEWEST TO OLDEST</Text></View><TouchableOpacity style={styles.modalClose} onPress={() => { setIsNotificationLogOpen(false); setIsClearConfirmationOpen(false); }} accessibilityLabel="Close notification log"><Ionicons name="close" size={24} color={PAPER} /></TouchableOpacity></View>
            <View style={styles.logToolbar}><Text style={styles.logCount}>{notificationLog.length} NOTIFICATION{notificationLog.length === 1 ? '' : 'S'}</Text><TouchableOpacity onPress={() => setIsClearConfirmationOpen(true)} disabled={!notificationLog.length || Boolean(notificationMutation)}><Text style={[styles.clearAllText, (!notificationLog.length || Boolean(notificationMutation)) && styles.clearDisabled]}>{notificationMutation === 'all' ? 'Clearing...' : 'Clear All'}</Text></TouchableOpacity></View>
            {isClearConfirmationOpen && <View style={styles.clearConfirmation}><Text style={styles.clearConfirmationText}>Permanently delete all notifications?</Text><TouchableOpacity style={styles.clearCancelButton} onPress={() => setIsClearConfirmationOpen(false)}><Text style={styles.clearCancelText}>Cancel</Text></TouchableOpacity><TouchableOpacity style={styles.clearConfirmButton} onPress={() => void clearAllNotifications()}><Text style={styles.clearConfirmText}>Delete All</Text></TouchableOpacity></View>}
            <ScrollView contentContainerStyle={styles.logContent}>
              {notificationLog.map((item) => <View key={item.id} style={styles.logItem}><View style={styles.logIcon}><Ionicons name="notifications" size={19} color={BLUE} /></View><View style={styles.logCopy}><Text style={styles.logTitle}>{item.title}</Text><Text style={styles.logMessage}>{item.message}</Text><Text style={styles.logDate}>{new Date(item.created_at).toLocaleString()}</Text></View><TouchableOpacity style={[styles.clearOneButton, notificationMutation && styles.clearDisabled]} disabled={Boolean(notificationMutation)} onPress={() => void deleteNotification(item.id)} accessibilityLabel={`Clear ${item.title}`}><Ionicons name={notificationMutation === item.id ? 'hourglass' : 'trash'} size={18} color="#B3261E" /></TouchableOpacity></View>)}
              {notificationLog.length === 0 && <View style={styles.emptyLog}><Ionicons name="file-tray" size={30} color={MUTED} /><Text style={styles.emptyLogText}>Notification history is empty.</Text></View>}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Modal visible={isProfileOpen} transparent animationType="fade" onRequestClose={() => setIsProfileOpen(false)} statusBarTranslucent>
        <View style={styles.modalBackdrop}>
          <View style={styles.profileModal}>
            <View style={styles.profileHeader}><View><Text style={styles.modalTitle}>My Profile</Text><Text style={styles.modalSubtitle}>{profile?.is_admin ? 'ADMIN' : 'CONTRACTOR'}</Text></View><TouchableOpacity style={styles.modalClose} onPress={() => setIsProfileOpen(false)} accessibilityLabel="Close profile"><Ionicons name="close" size={24} color={PAPER} /></TouchableOpacity></View>
            <ScrollView contentContainerStyle={styles.profileContent} keyboardShouldPersistTaps="handled">
              <TouchableOpacity style={styles.profilePhotoButton} onPress={() => void chooseProfileImage()} accessibilityLabel="Choose profile picture">
                {profileImage?.uri || profileAvatarUrl ? <Image source={{ uri: profileImage?.uri ?? profileAvatarUrl! }} style={styles.profilePhoto} contentFit="cover" /> : <View style={styles.profilePhotoPlaceholder}><Text style={styles.profilePhotoInitials}>{avatarInitials}</Text></View>}
                <View style={styles.profileCamera}><Ionicons name="camera" size={17} color={PAPER} /></View>
              </TouchableOpacity>
              <Text style={styles.profilePhotoHelp}>Tap to choose a profile picture</Text>
              <Text style={styles.profileLabel}>FULL NAME</Text><TextInput style={styles.profileInput} value={profileName} onChangeText={setProfileName} placeholder="Full name" placeholderTextColor={colors.textMuted} />
              <Text style={styles.profileLabel}>EMAIL</Text><TextInput style={styles.profileInput} value={profileEmail} onChangeText={setProfileEmail} placeholder="Email address" placeholderTextColor={colors.textMuted} keyboardType="email-address" autoCapitalize="none" />
              <Text style={styles.profileLabel}>PHONE</Text><TextInput style={styles.profileInput} value={formatPhoneNumber(profilePhone)} onChangeText={(phone) => setProfilePhone(phoneNumberDigits(phone))} placeholder="(555) 555-5555" placeholderTextColor={colors.textMuted} keyboardType="phone-pad" maxLength={14} />
              <Pressable style={({ pressed }) => [styles.profileSaveButton, pressed && styles.profileSavePressed, isSavingProfile && styles.profileSaveDisabled]} disabled={isSavingProfile} onPress={() => void saveProfile()}><Text style={styles.profileSaveText}>{isSavingProfile ? 'Saving...' : 'Save Profile'}</Text></Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ActionButton({ icon, label, onPress, disabled }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; disabled?: boolean }) {
  const { colorScheme, colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <TouchableOpacity style={[styles.actionButton, disabled && { opacity: colorScheme === 'light' ? 0.72 : 0.45 }]} activeOpacity={0.8} onPress={onPress} disabled={disabled}>
      <Ionicons name={icon} size={24} color={colorScheme === 'dark' ? PAPER : colors.primary} />
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

type WorkOrder = {
  id: string;
  work_order_number: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  deadline_at: string | null;
  created_at: string;
  completed_at: string | null;
  properties: { customer_name: string | null; address_line_1: string; city: string; state: string } | null;
};
type AppNotification = { id: string; title: string; message: string; created_at: string; read_at: string | null };
type Profile = { id: string; full_name: string; email: string | null; phone_number: string; avatar_path: string | null; is_admin: boolean };

type WorkOrderOffer = {
  offer_id: string;
  work_order_id: string;
  work_order_number: string;
  title: string;
  description: string;
  sender_name: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  created_at: string;
};
type OfferMedia = { id: string; storage_path: string; original_file_name: string; mime_type: string; url?: string };

function formatAddress(property: WorkOrder['properties']) {
  if (!property) return 'Address unavailable';
  return `${property.address_line_1}, ${property.city}, ${property.state}`;
}

function compareSuggestedFlow(left: WorkOrder, right: WorkOrder, currentTime: number) {
  const leftDeadline = left.deadline_at ? new Date(left.deadline_at).getTime() : Number.POSITIVE_INFINITY;
  const rightDeadline = right.deadline_at ? new Date(right.deadline_at).getTime() : Number.POSITIVE_INFINITY;
  const leftBucket = getSuggestedFlowBucket(left, leftDeadline, currentTime);
  const rightBucket = getSuggestedFlowBucket(right, rightDeadline, currentTime);
  if (leftBucket !== rightBucket) return leftBucket - rightBucket;
  if (leftDeadline !== rightDeadline) return leftDeadline - rightDeadline;
  return compareWorkOrderPriority(left, right);
}

function getSuggestedFlowBucket(workOrder: WorkOrder, deadline: number, currentTime: number) {
  const hoursRemaining = (deadline - currentTime) / 3_600_000;
  if (hoursRemaining < 0) return 0;
  if (hoursRemaining <= 24) return 1;
  if (workOrder.priority === 'emergency') return 2;
  if (hoursRemaining <= 72) return 3;
  if (workOrder.priority === 'high') return 4;
  if (Number.isFinite(deadline)) return 5;
  return 6;
}

function getFlowUrgency(workOrder: WorkOrder) {
  const priority = workOrder.priority.toLowerCase();
  const color = priority === 'emergency' ? '#FF5A5F'
    : priority === 'high' ? '#F97316'
      : priority === 'medium' ? '#FFB020'
        : '#1D4ED8';
  return { label: priority.toUpperCase(), color };
}

function withTimeout<T>(operation: PromiseLike<T>, timeoutMs = 12_000): Promise<T> {
  return Promise.race([
    Promise.resolve(operation),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('The request timed out. Check your connection and try again.')), timeoutMs)),
  ]);
}

function errorMessage(error: unknown) { return error instanceof Error ? error.message : typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : 'An unexpected error occurred.'; }

const createStyles = (colors: AppThemeColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 20, paddingBottom: 32, backgroundColor: colors.background },
  topBar: { height: 68, marginHorizontal: -20, paddingHorizontal: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', zIndex: 10, backgroundColor: colors.header, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  expandedTopBar: { height: 101, paddingHorizontal: 20 },
  menuDismissLayer: { ...StyleSheet.absoluteFillObject, zIndex: 9 },
  brand: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  logo: { width: 50, height: 50 },
  brandTitle: { color: PAPER, fontSize: 27, fontWeight: '900' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  notificationButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  notificationBadge: { position: 'absolute', right: 1, top: 1, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: colors.primary, borderWidth: 1, borderColor: NAVY, alignItems: 'center', justifyContent: 'center' },
  notificationBadgeText: { color: colors.background === '#000000' ? '#000000' : PAPER, fontSize: 9, fontWeight: '900', lineHeight: 11 },
  headerAvatarImage: { width: 42, height: 42, borderRadius: 21 },
  headerAvatarFallback: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#243B5C', borderWidth: 0.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  headerAvatarText: { color: PAPER, fontSize: 12, fontWeight: '900' },
  headerMenu: { position: 'absolute', left: 12, top: 56, minWidth: 170, backgroundColor: colors.surfaceElevated, borderWidth: 0.5, borderColor: colors.border, borderRadius: 6, zIndex: 10, elevation: 5, shadowColor: '#000000', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  expandedHeaderMenu: { left: 20, top: 73 },
  headerMenuItem: { minHeight: 48, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerMenuText: { color: colors.text, fontSize: 13, fontWeight: '900' },
  offersSection: { marginBottom: 20 },
  offerHeadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  offerHeading: { color: colors.text, fontSize: 10, fontWeight: '900', letterSpacing: 0.7, flex: 1 },
  offerCard: { borderWidth: 1, borderColor: YELLOW, backgroundColor: colors.surfaceElevated, padding: 16, marginBottom: 10, borderRadius: 6 },
  offerNumber: { color: BLUE, fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  offerTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 8 },
  offerMeta: { color: colors.textMuted, fontSize: 11, lineHeight: 17, marginTop: 3 },
  offerDescription: { color: colors.text, fontSize: 12, lineHeight: 18, marginTop: 10 },
  offerActions: { flexDirection: 'row', gap: 10, marginTop: 15 },
  offerButton: { flex: 1, minHeight: 52, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  viewOfferButton: { backgroundColor: '#243B5C' },
  rejectButton: { borderWidth: 0.5, borderColor: '#243B5C', backgroundColor: '#243B5C' },
  acceptButton: { backgroundColor: '#243B5C' },
  rejectButtonText: { color: PAPER, fontSize: 12, fontWeight: '900' },
  acceptButtonText: { color: PAPER, fontSize: 12, fontWeight: '900' },
  viewOfferButtonText: { color: PAPER, fontSize: 12, fontWeight: '900' },
  offerPreviewModal: { width: '100%', maxWidth: 500, maxHeight: '84%', borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surfaceElevated, borderWidth: 0.5, borderColor: colors.border },
  offerPreviewHeader: { minHeight: 72, paddingLeft: 18, backgroundColor: NAVY, flexDirection: 'row', alignItems: 'center' },
  offerPreviewHeading: { flex: 1 },
  offerPreviewKicker: { color: '#9FB7D5', fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  offerPreviewSenderName: { color: PAPER, fontSize: 17, fontWeight: '900', marginTop: 4 },
  offerPreviewNumber: { color: PAPER, fontSize: 18, fontWeight: '900', marginTop: 5 },
  offerPreviewContent: { padding: 20 },
  offerPreviewLabel: { color: colors.primary, fontSize: 9, fontWeight: '900', letterSpacing: 0.9, marginTop: 15 },
  offerPreviewValue: { color: colors.text, fontSize: 14, lineHeight: 21, fontWeight: '800', marginTop: 5 },
  offerPreviewDescription: { color: colors.text, fontSize: 14, lineHeight: 22, marginTop: 5 },
  offerPreviewImage: { width: '100%', height: 210, borderRadius: 8, marginTop: 10, backgroundColor: colors.surfaceMuted },
  offerPreviewMediaName: { color: colors.textMuted, fontSize: 10, marginTop: 5 },
  offerPreviewMediaLink: { minHeight: 50, marginTop: 10, paddingHorizontal: 14, borderRadius: 6, backgroundColor: '#243B5C', flexDirection: 'row', alignItems: 'center', gap: 9 },
  offerPreviewMediaLinkText: { flex: 1, color: PAPER, fontSize: 11, fontWeight: '900' },
  offerPreviewEmpty: { color: colors.textMuted, fontSize: 11, lineHeight: 17, marginTop: 8 },
  offerPreviewSender: { color: colors.textMuted, fontSize: 10, fontWeight: '800', marginTop: 22 },
  offerPreviewActions: { flexDirection: 'row', gap: 10, paddingHorizontal: 20 },
  offerPreviewAction: { flex: 1, minHeight: 52, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  offerPreviewCancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center', margin: 12 },
  offerPreviewCancelText: { color: colors.textMuted, fontSize: 12, fontWeight: '900' },
  greetingRow: { paddingTop: 20, paddingBottom: 20 },
  eyebrow: { color: colors.textMuted, fontSize: 11, fontWeight: '700', marginTop: 5 },
  greeting: { color: colors.text, fontSize: 20, fontWeight: '900' },
  avatarFallback: { width: 46, height: 46, borderRadius: 23, backgroundColor: YELLOW, alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: 46, height: 46, borderRadius: 23, backgroundColor: 'transparent' },
  avatarText: { color: INK, fontSize: 14, fontWeight: '800' },
  summaryCard: { backgroundColor: colors.surface, padding: 18, minHeight: 135, borderRadius: 10, borderWidth: 0.5, borderColor: colors.border },
  summaryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 1.25 },
  summaryStats: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 7, marginTop: 21 },
  summaryStat: { flex: 1, minHeight: 78, paddingTop: 6, paddingBottom: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted, borderWidth: 0.5, borderColor: colors.border, borderRadius: 7 },
  summaryNumber: { color: colors.background === 'transparent' ? '#000000' : PAPER, fontSize: 31, fontWeight: '900' },
  summaryText: { color: colors.textMuted, fontSize: 10, fontWeight: '600', marginTop: 2 },
  summaryActionIcon: { marginTop: 5 },
  summaryDivider: { display: 'none' },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 28, marginBottom: 13 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  sectionEyebrow: { color: colors.primary, fontSize: 9, fontWeight: '900', letterSpacing: 1.1, marginBottom: 4 },
  flowHeadingRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  flowTooltip: { position: 'relative', backgroundColor: colors.surfaceElevated, borderWidth: 0.5, borderColor: colors.primary, borderRadius: 9, padding: 12, marginTop: -5, marginBottom: 10 },
  flowTooltipArrow: { position: 'absolute', top: -5, left: 92, width: 9, height: 9, backgroundColor: colors.surfaceElevated, borderLeftWidth: 0.5, borderTopWidth: 0.5, borderColor: colors.primary, transform: [{ rotate: '45deg' }] },
  flowTooltipText: { color: colors.text, fontSize: 11, lineHeight: 17 },
  linkText: { color: BLUE, fontSize: 12, fontWeight: '800' },
  flowCard: { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, overflow: 'hidden' },
  flowScroll: { maxHeight: 252 },
  flowRow: { minHeight: 84, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 0.5, borderBottomColor: colors.border },
  flowRail: { width: 18, height: '100%', alignItems: 'center' },
  flowDot: { width: 8, height: 8, borderRadius: 4, marginTop: 37, zIndex: 2 },
  flowLine: { position: 'absolute', top: 42, bottom: -42, width: 1, backgroundColor: colors.border },
  flowRank: { width: 30, height: 30, borderRadius: 8, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center', marginHorizontal: 8 },
  flowRankText: { color: colors.primary, fontSize: 10, fontWeight: '900' },
  flowCopy: { flex: 1, paddingVertical: 13 },
  flowMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  flowUrgency: { fontSize: 8, fontWeight: '900', letterSpacing: 0.7 },
  flowDeadline: { color: colors.textMuted, fontSize: 8, fontWeight: '800' },
  flowTitle: { color: colors.text, fontSize: 14, fontWeight: '900', marginTop: 5 },
  flowAddress: { color: colors.textMuted, fontSize: 9, marginTop: 4 },
  jobCard: { backgroundColor: colors.surface, padding: 18, borderRadius: 10, borderWidth: 0.5, borderColor: colors.border },
  deliveryAge: { color: YELLOW, fontSize: 11, fontWeight: '900', textAlign: 'center', letterSpacing: 0.4, marginBottom: 13 },
  jobTopLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#164B83', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 6 },
  statusDot: { width: 6, height: 6, borderRadius: 6, backgroundColor: YELLOW, marginRight: 6 },
  statusText: { color: PAPER, fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  jobId: { color: '#A6A6A0', fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  jobCode: { alignItems: 'flex-end' },
  jobPriority: { color: YELLOW, fontSize: 8, fontWeight: '900', letterSpacing: 0.8, marginTop: 4 },
  jobTitle: { color: colors.text, fontSize: 20, fontWeight: '900', marginTop: 22, maxWidth: '90%' },
  addressRow: { flexDirection: 'row', alignItems: 'center', marginTop: 15 },
  address: { color: colors.textMuted, fontSize: 12, marginLeft: 8, flex: 1 },
  jobFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 22 },
  jobMeta: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  arrowButton: { backgroundColor: '#243B5C', width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionButton: { backgroundColor: colors.background === 'transparent' ? '#C8DAEC' : colors.background === '#000000' ? '#18181B' : '#243B5C', width: '48%', minHeight: 94, padding: 15, justifyContent: 'space-between', borderWidth: 0.5, borderColor: colors.background === 'transparent' ? '#7FA1C4' : colors.border, borderRadius: 6 },
  actionLabel: { color: colors.text, fontSize: 12, fontWeight: '900', maxWidth: 100 },
  glanceBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0, 0, 0, 0.32)' },
  glanceModal: { width: '100%', maxWidth: 560, maxHeight: '72%', backgroundColor: colors.surfaceElevated, borderWidth: 0.5, borderColor: colors.border, borderRadius: 16, overflow: 'hidden', elevation: 16, shadowColor: '#000000', shadowOpacity: 0.32, shadowRadius: 22, shadowOffset: { width: 0, height: 12 } },
  glanceHeader: { minHeight: 76, paddingLeft: 18, paddingRight: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 0.5, borderBottomColor: colors.border },
  glanceEyebrow: { color: colors.primary, fontSize: 8, fontWeight: '900', letterSpacing: 1.1, marginBottom: 4 },
  glanceTitle: { color: colors.text, fontSize: 21, fontWeight: '900' },
  glanceClose: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  glanceCount: { color: colors.textMuted, fontSize: 9, fontWeight: '900', letterSpacing: 0.9, paddingHorizontal: 18, paddingTop: 14 },
  glanceList: { padding: 14, paddingBottom: 18 },
  glanceJob: { backgroundColor: colors.surface, borderWidth: 0.5, borderLeftWidth: 3, borderColor: colors.border, borderRadius: 9, padding: 14, marginBottom: 10 },
  glanceJobTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  glancePriority: { fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  glanceJobNumber: { color: colors.textMuted, fontSize: 9, fontWeight: '800' },
  glanceJobTitle: { color: colors.text, fontSize: 15, fontWeight: '900', marginTop: 9 },
  glanceJobAddress: { color: colors.textMuted, fontSize: 10, marginTop: 6 },
  glanceJobFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: colors.border, marginTop: 11, paddingTop: 9 },
  glanceDeadline: { color: colors.text, fontSize: 10, fontWeight: '800' },
  glanceEmpty: { minHeight: 170, alignItems: 'center', justifyContent: 'center' },
  glanceEmptyText: { color: colors.textMuted, fontSize: 12, marginTop: 10 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(8, 19, 34, 0.78)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  notificationModal: { width: '100%', maxWidth: 720, height: '82%', backgroundColor: colors.surface, borderRadius: 10, overflow: 'hidden' },
  modalHeader: { minHeight: 68, paddingLeft: 17, backgroundColor: NAVY, flexDirection: 'row', alignItems: 'center' },
  modalTitle: { color: PAPER, fontSize: 18, fontWeight: '900' },
  modalSubtitle: { color: YELLOW, fontSize: 8, fontWeight: '900', letterSpacing: 1, marginTop: 4 },
  modalClose: { width: 62, minHeight: 68, marginLeft: 'auto', alignItems: 'center', justifyContent: 'center' },
  logToolbar: { minHeight: 50, paddingHorizontal: 16, borderBottomWidth: 0.5, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  logCount: { color: colors.textMuted, fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  clearAllText: { color: '#B3261E', fontSize: 11, fontWeight: '900' },
  clearDisabled: { opacity: 0.4 },
  clearConfirmation: { minHeight: 58, paddingHorizontal: 14, borderBottomWidth: 0.5, borderBottomColor: colors.border, backgroundColor: colors.surfaceMuted, flexDirection: 'row', alignItems: 'center', gap: 9 },
  clearConfirmationText: { color: colors.text, fontSize: 10, fontWeight: '800', flex: 1 },
  clearCancelButton: { minHeight: 36, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center' },
  clearCancelText: { color: colors.textMuted, fontSize: 10, fontWeight: '900' },
  clearConfirmButton: { minHeight: 36, paddingHorizontal: 12, borderRadius: 5, backgroundColor: '#243B5C', alignItems: 'center', justifyContent: 'center' },
  clearConfirmText: { color: PAPER, fontSize: 10, fontWeight: '900' },
  logContent: { flexGrow: 1, padding: 16 },
  logItem: { minHeight: 76, flexDirection: 'row', alignItems: 'flex-start', borderBottomWidth: 0.5, borderBottomColor: colors.border, paddingVertical: 12 },
  logIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  logCopy: { flex: 1, marginLeft: 11 },
  logTitle: { color: colors.text, fontSize: 12, fontWeight: '900' },
  logMessage: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  logDate: { color: '#7C8997', fontSize: 8, marginTop: 5 },
  clearOneButton: { width: 42, minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  emptyLog: { flex: 1, minHeight: 260, alignItems: 'center', justifyContent: 'center' },
  emptyLogText: { color: colors.textMuted, fontSize: 12, marginTop: 10 },
  tipCard: { flexDirection: 'row', backgroundColor: colors.surfaceMuted, padding: 15, marginTop: 26, alignItems: 'center', borderRadius: 6 },
  tipIcon: { width: 36, height: 36, backgroundColor: YELLOW, alignItems: 'center', justifyContent: 'center', marginRight: 12, borderRadius: 6 },
  tipCopy: { flex: 1 },
  tipTitle: { color: colors.text, fontSize: 12, fontWeight: '800', marginBottom: 4 },
  tipText: { color: colors.textMuted, fontSize: 11, lineHeight: 16 },
  profileModal: { width: '100%', maxWidth: 540, maxHeight: '90%', backgroundColor: colors.surfaceElevated, borderRadius: 14, overflow: 'hidden', borderWidth: 0.5, borderColor: colors.border },
  profileHeader: { minHeight: 72, paddingLeft: 19, backgroundColor: NAVY, flexDirection: 'row', alignItems: 'center' },
  profileContent: { padding: 20, paddingBottom: 26 },
  profilePhotoButton: { width: 94, height: 94, borderRadius: 47, alignSelf: 'center', position: 'relative' },
  profilePhoto: { width: 94, height: 94, borderRadius: 47 },
  profilePhotoPlaceholder: { width: 94, height: 94, borderRadius: 47, backgroundColor: YELLOW, alignItems: 'center', justifyContent: 'center' },
  profilePhotoInitials: { color: INK, fontSize: 25, fontWeight: '900' },
  profileCamera: { position: 'absolute', right: 0, bottom: 1, width: 31, height: 31, borderRadius: 16, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.surfaceElevated },
  profilePhotoHelp: { color: colors.textMuted, fontSize: 10, textAlign: 'center', marginTop: 9, marginBottom: 18 },
  profileLabel: { color: colors.text, fontSize: 9, fontWeight: '900', letterSpacing: 0.8, marginTop: 13, marginBottom: 7 },
  profileInput: { minHeight: 48, borderWidth: 0.5, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.input, color: colors.text, paddingHorizontal: 13, fontSize: 13 },
  profileSaveButton: { minHeight: 52, backgroundColor: '#243B5C', borderRadius: 7, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  profileSavePressed: { backgroundColor: '#0E1F35' },
  profileSaveDisabled: { opacity: 0.5 },
  profileSaveText: { color: PAPER, fontSize: 12, fontWeight: '900' },
});
