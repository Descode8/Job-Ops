import { Ionicons } from '@expo/vector-icons';
import { Image, ImageBackground } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type AppThemeColors, useAppTheme } from '@/contexts/theme-context';
import { AppText as Text, AppTextInput as TextInput } from '@/components/app-typography';
import { ThemedAlert as Alert } from '@/components/themed-alert';
import { supabase } from '@/lib/supabase';
import { WORK_ORDER_STATUS_FONT, workOrderStatusColor } from '@/lib/work-order-status';
import { formatWorkOrderNumber } from '@/lib/work-order-number';
import { compareWorkOrderPriority, workOrderPriorityColor as getWorkOrderPriorityColor } from '@/lib/work-order-priority';
import { useWorkOrderRealtime } from '@/hooks/use-work-order-realtime';

const YELLOW = '#FFF200';
const NAVY = '#003366';
const BLUE = '#1E67B2';
const PAPER = '#FFFFFF';
const INK = '#172033';
const MUTED = '#566273';

export default function HomeScreen() {
  const { colorScheme, colors, toggleColorScheme } = useAppTheme();
  const workOrderPriorityColor = (priority: string) => getWorkOrderPriorityColor(priority, colorScheme);
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
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const [respondingOfferId, setRespondingOfferId] = useState<string | null>(null);
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
        supabase.from('notifications').select('id, title, message, created_at, read_at').eq('contractor_id', contractor.id).is('read_at', null).order('created_at', { ascending: false }).limit(10),
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

  useFocusEffect(
    useCallback(() => {
      void loadDashboard();
      return () => setIsHeaderMenuOpen(false);
    }, [loadDashboard]),
  );
  useWorkOrderRealtime(() => { void loadDashboard(); });
  useEffect(() => { const timer = setInterval(() => setCurrentTime(Date.now()), 60_000); return () => clearInterval(timer); }, []);

  const activeWorkOrders = workOrders
    .filter((workOrder) => workOrder.status !== 'completed')
    .sort(compareWorkOrderPriority);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const endOfToday = startOfToday + 24 * 60 * 60 * 1000;
  const dueToday = activeWorkOrders.filter((workOrder) => {
    if (!workOrder.deadline_at) return false;
    const deadline = new Date(workOrder.deadline_at).getTime();
    return deadline >= startOfToday && deadline < endOfToday;
  }).length;
  const needsUpdate = activeWorkOrders.filter((workOrder) => workOrder.status === 'not_started').length;
  const currentWorkOrder = activeWorkOrders[0];
  const firstName = contractorName.split(' ')[0] || 'Contractor';
  const avatarInitials = contractorName.split(' ').filter(Boolean).map((name) => name[0]).join('').slice(0, 2).toUpperCase() || 'CT';
  const greeting = new Date().getHours() < 12 ? 'Good Morning' : new Date().getHours() < 18 ? 'Good Afternoon' : 'Good Evening';

  const openDirections = async () => {
    if (!currentWorkOrder?.properties) return;
    const url = `https://maps.apple.com/?daddr=${encodeURIComponent(formatAddress(currentWorkOrder.properties))}&dirflg=d`;
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      if (currentWorkOrder.status === 'not_started') {
        const { data, error } = await supabase.rpc('mark_work_order_started', { p_work_order_id: currentWorkOrder.id, p_action: 'navigation_started' });
        if (error) Alert.alert('Could not update work order', error.message);
        else setWorkOrders((orders) => orders.map((item) => item.id === currentWorkOrder.id ? { ...item, status: data ?? 'in_progress' } : item));
      }
      await Linking.openURL(url);
    }
    else Alert.alert('Could not open maps', 'No maps application is available on this device.');
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
    const { error } = await supabase.rpc('respond_to_work_order_offer', {
      p_offer_id: offerId,
      p_response: response,
    });
    setRespondingOfferId(null);

    if (error) {
      Alert.alert('Could not respond', error.message);
      return;
    }

    Alert.alert(
      response === 'accepted' ? 'Work Order Accepted' : 'Work Order Rejected',
      response === 'accepted'
        ? 'The work order is now assigned to you.'
        : 'The work order has been assigned back to the contractor who sent it.',
    );
    await loadDashboard();
  };

  const openNotificationLog = async () => {
    if (!contractorId) return;
    const { data, error } = await supabase.from('notifications').select('id, title, message, created_at, read_at').eq('contractor_id', contractorId).order('created_at', { ascending: false });
    if (error) { Alert.alert('Could not load notification history', error.message); return; }
    setNotificationLog((data ?? []) as AppNotification[]);
    setIsNotificationLogOpen(true);
  };

  const deleteNotification = async (notificationId: string) => {
    const { error } = await supabase.from('notifications').delete().eq('id', notificationId);
    if (error) { Alert.alert('Could not clear notification', error.message); return; }
    setNotificationLog((current) => current.filter((item) => item.id !== notificationId));
    setNotifications((current) => current.filter((item) => item.id !== notificationId));
  };

  const clearAllNotifications = () => {
    if (!contractorId || notificationLog.length === 0) return;
    Alert.alert('Clear notification history?', 'All of your notifications will be permanently removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear all', style: 'destructive', onPress: async () => {
        const { error: rpcError } = await supabase.rpc('clear_my_notifications');
        if (rpcError && !/clear_my_notifications|schema cache|could not find/i.test(rpcError.message)) { Alert.alert('Could not clear notifications', rpcError.message); return; }

        const { data: remaining, error: verifyError } = await supabase.from('notifications').select('id').eq('contractor_id', contractorId);
        if (verifyError) { Alert.alert('Could not verify notification history', verifyError.message); return; }
        const remainingIds = (remaining ?? []).map((item) => item.id);
        for (let index = 0; index < remainingIds.length; index += 100) {
          const { error } = await supabase.from('notifications').delete().in('id', remainingIds.slice(index, index + 100));
          if (error) { Alert.alert('Could not clear notifications', error.message); return; }
        }

        const { data: finalRows, error: finalError } = await supabase.from('notifications').select('id, title, message, created_at, read_at').eq('contractor_id', contractorId).order('created_at', { ascending: false });
        if (finalError) { Alert.alert('Could not verify notification history', finalError.message); return; }
        const retained = (finalRows ?? []) as AppNotification[];
        setNotificationLog(retained);
        setNotifications(retained.filter((item) => !item.read_at));
        if (retained.length) { Alert.alert('Notifications were not cleared', `The database retained ${retained.length} notification${retained.length === 1 ? '' : 's'}. Apply database/47_clear_notification_history.sql in Supabase, then try again.`); return; }
        Alert.alert('Notifications cleared', 'Your notification history has been cleared.');
      } },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ImageBackground source={require('@/assets/images/dark-blue-particle-texture-background.jpg')} style={styles.topBar} contentFit="cover">
          <View style={styles.brand}>
            <Image source={require('@/assets/images/Marty-Wright-Home-Sales_anderson.png')} style={styles.logo} contentFit="contain" />
            <Text style={styles.brandTitle}>Project Manager</Text>
          </View>
          <TouchableOpacity
            style={styles.notificationButton}
            accessibilityLabel="Open menu"
            accessibilityRole="button"
            accessibilityState={{ expanded: isHeaderMenuOpen }}
            onPress={(event) => {
              event.stopPropagation();
              setIsHeaderMenuOpen((isOpen) => !isOpen);
            }}>
            <Ionicons name="menu" size={28} color={YELLOW} />
          </TouchableOpacity>
          {isHeaderMenuOpen && (
            <View style={styles.headerMenu}>
              <TouchableOpacity style={styles.headerMenuItem} onPress={openProfile} accessibilityRole="menuitem">
                <Ionicons name="person-circle" size={20} color={colors.primary} />
                <Text style={styles.headerMenuText}>Profile</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerMenuItem} onPress={() => { setIsHeaderMenuOpen(false); toggleColorScheme(); }} accessibilityRole="menuitem">
                <Ionicons name={colorScheme === 'dark' ? 'sunny' : 'moon'} size={19} color={colors.primaryStrong} />
                <Text style={styles.headerMenuText}>{colorScheme === 'dark' ? 'Light Mode' : 'Dark Mode'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerMenuItem} onPress={() => void signOut()} accessibilityRole="menuitem">
                <Ionicons name="log-out" size={19} color={colors.primary} />
                <Text style={styles.headerMenuText}>Logout</Text>
              </TouchableOpacity>
            </View>
          )}
        </ImageBackground>
        {isHeaderMenuOpen && <Pressable style={styles.menuDismissLayer} onPress={() => setIsHeaderMenuOpen(false)} accessibilityLabel="Close menu" />}

        <View style={styles.greetingRow}>
          <View>
            <Text style={styles.eyebrow}>{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}</Text>
            <Text style={styles.greeting}>{greeting}, {firstName}</Text>
          </View>
          {profileAvatarUrl ? (
            <Image source={{ uri: profileAvatarUrl }} style={styles.avatarImage} contentFit="cover" />
          ) : (
            <View style={styles.avatarFallback}><Text style={styles.avatarText}>{avatarInitials}</Text></View>
          )}
        </View>

        {pendingOffers.length > 0 && (
          <View style={styles.offersSection}>
            <View style={styles.offerHeadingRow}>
              <Ionicons name="notifications" size={20} color={NAVY} />
              <Text style={styles.offerHeading}>WORK ORDERS WAITING FOR YOUR RESPONSE</Text>
            </View>
            {pendingOffers.map((offer) => (
              <View key={offer.offer_id} style={styles.offerCard}>
                <Text style={styles.offerNumber}>{formatWorkOrderNumber(offer.work_order_number)} · FROM {offer.sender_name.toUpperCase()}</Text>
                <Text style={styles.offerTitle}>{offer.title}</Text>
                <Text style={styles.offerMeta}>{offer.customer_name} · {offer.customer_phone}</Text>
                <Text style={styles.offerMeta}>{offer.customer_address}</Text>
                <Text style={styles.offerDescription}>{offer.description}</Text>
                <View style={styles.offerActions}>
                  <TouchableOpacity
                    style={[styles.offerButton, styles.rejectButton]}
                    disabled={respondingOfferId === offer.offer_id}
                    onPress={() => void respondToOffer(offer.offer_id, 'rejected')}>
                    <Text style={styles.rejectButtonText}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.offerButton, styles.acceptButton]}
                    disabled={respondingOfferId === offer.offer_id}
                    onPress={() => void respondToOffer(offer.offer_id, 'accepted')}>
                    <Text style={styles.acceptButtonText}>{respondingOfferId === offer.offer_id ? 'Saving...' : 'Accept'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <Text style={styles.summaryLabel}>YOUR DAY AT A GLANCE</Text>
            <Ionicons name="sunny" size={21} color={PAPER} />
          </View>
          <View style={styles.summaryStats}>
            <View style={styles.summaryStat}>
              <Text style={styles.summaryNumber}>{isLoading ? '--' : activeWorkOrders.length}</Text>
              <Text style={styles.summaryText}>Assigned Jobs</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryStat}>
              <Text style={styles.summaryNumber}>{isLoading ? '--' : dueToday}</Text>
              <Text style={styles.summaryText}>Due Today</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryStat}>
              <Text style={styles.summaryNumber}>{isLoading ? '--' : needsUpdate}</Text>
              <Text style={styles.summaryText}>Needs Update</Text>
            </View>
          </View>
        </View>

        {currentWorkOrder && <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Continue Working</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/explore')}>
            <Text style={styles.linkText}>View all</Text>
          </TouchableOpacity>
        </View>}

        {currentWorkOrder && <TouchableOpacity style={styles.jobCard} activeOpacity={0.88} onPress={() => router.push({ pathname: '/work-order/[id]', params: { id: currentWorkOrder.id } })}>
          {profile?.is_admin && currentWorkOrder.work_order_number.startsWith('HOME-') && <Text style={styles.deliveryAge}>{formatDeliveryAge(currentWorkOrder.created_at, currentTime)}</Text>}
          <View style={styles.jobTopLine}>
            <View style={styles.statusPill}>
              <View style={[styles.statusDot, { backgroundColor: workOrderStatusColor(currentWorkOrder.status) }]} />
              <Text style={[styles.statusText, { color: workOrderStatusColor(currentWorkOrder.status), fontFamily: WORK_ORDER_STATUS_FONT }]}>{formatStatus(currentWorkOrder.status)}</Text>
            </View>
            <View style={styles.jobCode}>
              <Text style={styles.jobId}>{formatWorkOrderNumber(currentWorkOrder.work_order_number)}</Text>
              {!currentWorkOrder.work_order_number.startsWith('HOME-') && <Text style={[styles.jobPriority, { color: workOrderPriorityColor(currentWorkOrder.priority) }]}>{currentWorkOrder.priority.toUpperCase()}</Text>}
            </View>
          </View>
          <Text style={styles.jobTitle}>{currentWorkOrder.properties?.customer_name || currentWorkOrder.title}</Text>
          <View style={styles.addressRow}>
            <Ionicons name="location" size={18} color={BLUE} />
            <Text style={styles.address}>{formatAddress(currentWorkOrder.properties)}</Text>
          </View>
          <View style={styles.jobFooter}>
            <Text style={styles.jobMeta}>{formatDeadline(currentWorkOrder.deadline_at)}</Text>
            <TouchableOpacity style={styles.arrowButton} onPress={(event) => { event.stopPropagation(); router.push({ pathname: '/work-order/[id]', params: { id: currentWorkOrder.id } }); }} accessibilityLabel={`Open ${formatWorkOrderNumber(currentWorkOrder.work_order_number)}`}>
              <Ionicons name="arrow-forward" size={18} color={PAPER} />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>}

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Quick actions</Text>
        </View>
        <View style={styles.actionGrid}>
          <ActionButton icon="camera" label="Upload Photos" onPress={() => currentWorkOrder && router.push({ pathname: '/work-order/[id]', params: { id: currentWorkOrder.id, action: 'photos' } })} disabled={!currentWorkOrder} />
          <ActionButton icon="document-text" label="Add Job Note" onPress={() => currentWorkOrder && router.push({ pathname: '/work-order/[id]', params: { id: currentWorkOrder.id, action: 'note' } })} disabled={!currentWorkOrder} />
          <ActionButton icon="navigate" label="Start Navigation" onPress={() => void openDirections()} disabled={!currentWorkOrder} />
          <ActionButton icon="receipt" label="Upload Invoice" onPress={() => currentWorkOrder && router.push({ pathname: '/work-order/[id]', params: { id: currentWorkOrder.id, action: 'invoice' } })} disabled={!currentWorkOrder} />
        </View>

        <View style={styles.notificationHeading}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          <TouchableOpacity onPress={() => void openNotificationLog()}><Text style={styles.linkText}>View All</Text></TouchableOpacity>
        </View>
        {notifications.length > 0
          ? notifications.map((item) => <View key={item.id} style={[styles.noticeCard, styles.noticeUnread]}><Ionicons name="notifications" size={19} color={BLUE} /><View style={styles.noticeCopy}><Text style={styles.noticeTitle}>{item.title}</Text><Text style={styles.noticeMessage}>{item.message}</Text><Text style={styles.noticeDate}>{new Date(item.created_at).toLocaleString()}</Text></View></View>)
          : <View style={styles.noNotifications}><Ionicons name="notifications-off" size={21} color={MUTED} /><Text style={styles.noNotificationsText}>No new notifications.</Text></View>}
      </ScrollView>
      <Modal visible={isNotificationLogOpen} transparent animationType="fade" onRequestClose={() => setIsNotificationLogOpen(false)} statusBarTranslucent>
        <View style={styles.modalBackdrop}>
          <View style={styles.notificationModal}>
            <View style={styles.modalHeader}><View><Text style={styles.modalTitle}>Notification Log</Text><Text style={styles.modalSubtitle}>NEWEST TO OLDEST</Text></View><TouchableOpacity style={styles.modalClose} onPress={() => setIsNotificationLogOpen(false)} accessibilityLabel="Close notification log"><Ionicons name="close" size={24} color={PAPER} /></TouchableOpacity></View>
            <View style={styles.logToolbar}><Text style={styles.logCount}>{notificationLog.length} NOTIFICATION{notificationLog.length === 1 ? '' : 'S'}</Text><TouchableOpacity onPress={clearAllNotifications} disabled={!notificationLog.length}><Text style={[styles.clearAllText, !notificationLog.length && styles.clearDisabled]}>Clear All</Text></TouchableOpacity></View>
            <ScrollView contentContainerStyle={styles.logContent}>
              {notificationLog.map((item) => <View key={item.id} style={styles.logItem}><View style={styles.logIcon}><Ionicons name="notifications" size={19} color={BLUE} /></View><View style={styles.logCopy}><Text style={styles.logTitle}>{item.title}</Text><Text style={styles.logMessage}>{item.message}</Text><Text style={styles.logDate}>{new Date(item.created_at).toLocaleString()}</Text></View><TouchableOpacity style={styles.clearOneButton} onPress={() => void deleteNotification(item.id)} accessibilityLabel={`Clear ${item.title}`}><Ionicons name="trash" size={18} color="#B3261E" /></TouchableOpacity></View>)}
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
              <Text style={styles.profileLabel}>PHONE</Text><TextInput style={styles.profileInput} value={profilePhone} onChangeText={setProfilePhone} placeholder="Phone number" placeholderTextColor={colors.textMuted} keyboardType="phone-pad" />
              <Pressable style={({ pressed }) => [styles.profileSaveButton, pressed && styles.profileSavePressed, isSavingProfile && styles.profileSaveDisabled]} disabled={isSavingProfile} onPress={() => void saveProfile()}><Text style={styles.profileSaveText}>{isSavingProfile ? 'Saving...' : 'Save Profile'}</Text></Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ActionButton({ icon, label, onPress, disabled }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; disabled?: boolean }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <TouchableOpacity style={[styles.actionButton, disabled && { opacity: 0.45 }]} activeOpacity={0.8} onPress={onPress} disabled={disabled}>
      <Ionicons name={icon} size={24} color={colors.primary} />
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

function formatAddress(property: WorkOrder['properties']) {
  if (!property) return 'Address unavailable';
  return `${property.address_line_1}, ${property.city}, ${property.state}`;
}

function formatDeliveryAge(createdAt: string, currentTime: number) { const createdTime = new Date(createdAt).getTime(); const totalDays = Number.isFinite(createdTime) ? Math.max(0, Math.floor((currentTime - createdTime) / 86_400_000)) : 0; const weeks = Math.floor(totalDays / 7); const days = totalDays % 7; if (weeks === 0) return `${totalDays} ${totalDays === 1 ? 'Day' : 'Days'} Since Delivery`; return `${weeks} ${weeks === 1 ? 'Week' : 'Weeks'}${days ? ` ${days} ${days === 1 ? 'Day' : 'Days'}` : ''} Since Delivery`; }

function formatDeadline(deadline: string | null) {
  if (!deadline) return 'No Deadline Set';
  return `Due ${new Date(deadline).toLocaleDateString()}`;
}

function formatStatus(status: string) { return status.replaceAll('_', ' ').toUpperCase(); }

const createStyles = (colors: AppThemeColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 20, paddingBottom: 32, backgroundColor: colors.background },
  topBar: { height: 122, marginHorizontal: -20, paddingHorizontal: 20, paddingTop: 15, paddingBottom: 17, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 },
  menuDismissLayer: { ...StyleSheet.absoluteFillObject, zIndex: 9 },
  brand: { alignItems: 'flex-start', justifyContent: 'center' },
  logo: { width: 120, height: 43 },
  brandTitle: { color: PAPER, fontSize: 28, fontWeight: '900', marginTop: 3 },
  notificationButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  headerMenu: { position: 'absolute', right: 20, top: 78, minWidth: 170, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, borderRadius: 6, zIndex: 10, elevation: 5, shadowColor: '#000000', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  headerMenuItem: { minHeight: 48, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerMenuText: { color: colors.text, fontSize: 13, fontWeight: '900' },
  notificationDot: { position: 'absolute', right: 9, top: 8, width: 6, height: 6, backgroundColor: YELLOW, borderRadius: 6 },
  offersSection: { marginBottom: 20 },
  offerHeadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  offerHeading: { color: colors.text, fontSize: 10, fontWeight: '900', letterSpacing: 0.7, flex: 1 },
  offerCard: { borderWidth: 2, borderColor: YELLOW, backgroundColor: colors.surfaceElevated, padding: 16, marginBottom: 10, borderRadius: 6 },
  offerNumber: { color: BLUE, fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  offerTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 8 },
  offerMeta: { color: colors.textMuted, fontSize: 11, lineHeight: 17, marginTop: 3 },
  offerDescription: { color: colors.text, fontSize: 12, lineHeight: 18, marginTop: 10 },
  offerActions: { flexDirection: 'row', gap: 10, marginTop: 15 },
  offerButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  rejectButton: { borderWidth: 1, borderColor: NAVY, backgroundColor: PAPER },
  acceptButton: { backgroundColor: NAVY },
  rejectButtonText: { color: NAVY, fontSize: 12, fontWeight: '900' },
  acceptButtonText: { color: PAPER, fontSize: 12, fontWeight: '900' },
  greetingRow: { paddingTop: 27, paddingBottom: 21, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { color: colors.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 1.3, marginBottom: 7 },
  greeting: { color: colors.text, fontSize: 25, fontWeight: '900' },
  noticesSection: { marginBottom: 20 },
  noticeCard: { flexDirection: 'row', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 13, marginTop: 9, borderRadius: 6 },
  noticeUnread: { borderLeftWidth: 4, borderLeftColor: colors.primary, backgroundColor: colors.surfaceMuted },
  noticeCopy: { flex: 1, marginLeft: 10 }, noticeTitle: { color: colors.text, fontSize: 12, fontWeight: '900' }, noticeMessage: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 3 }, noticeDate: { color: colors.textMuted, fontSize: 8, marginTop: 5 },
  avatarFallback: { width: 46, height: 46, borderRadius: 23, backgroundColor: YELLOW, alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: 46, height: 46, borderRadius: 23, backgroundColor: 'transparent' },
  avatarText: { color: INK, fontSize: 14, fontWeight: '800' },
  summaryCard: { backgroundColor: NAVY, padding: 18, minHeight: 135, borderRadius: 6 },
  summaryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { color: PAPER, fontSize: 10, fontWeight: '900', letterSpacing: 1.25 },
  summaryStats: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 21 },
  summaryStat: { flex: 1, alignItems: 'center' },
  summaryNumber: { color: YELLOW, fontSize: 31, fontWeight: '900' },
  summaryText: { color: PAPER, fontSize: 10, fontWeight: '600', marginTop: 2 },
  summaryDivider: { height: 42, width: 1, backgroundColor: '#4775A7' },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 28, marginBottom: 13 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  linkText: { color: BLUE, fontSize: 12, fontWeight: '800' },
  jobCard: { backgroundColor: NAVY, padding: 18, borderRadius: 6 },
  deliveryAge: { color: YELLOW, fontSize: 11, fontWeight: '900', textAlign: 'center', letterSpacing: 0.4, marginBottom: 13 },
  jobTopLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#164B83', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 6 },
  statusDot: { width: 6, height: 6, borderRadius: 6, backgroundColor: YELLOW, marginRight: 6 },
  statusText: { color: PAPER, fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  jobId: { color: '#A6A6A0', fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  jobCode: { alignItems: 'flex-end' },
  jobPriority: { color: YELLOW, fontSize: 8, fontWeight: '900', letterSpacing: 0.8, marginTop: 4 },
  jobTitle: { color: PAPER, fontSize: 20, fontWeight: '900', marginTop: 22, maxWidth: '90%' },
  addressRow: { flexDirection: 'row', alignItems: 'center', marginTop: 15 },
  address: { color: '#C8C8C1', fontSize: 12, marginLeft: 8, flex: 1 },
  jobFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 22 },
  jobMeta: { color: '#A6A6A0', fontSize: 11, fontWeight: '600' },
  arrowButton: { backgroundColor: BLUE, width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionButton: { backgroundColor: colors.surface, width: '48%', minHeight: 94, padding: 15, justifyContent: 'space-between', borderWidth: 1, borderColor: colors.border, borderRadius: 6 },
  actionLabel: { color: colors.text, fontSize: 12, fontWeight: '900', maxWidth: 100 },
  notificationHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 28, marginBottom: 4 },
  noNotifications: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 6, marginTop: 9 },
  noNotificationsText: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(8, 19, 34, 0.78)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  notificationModal: { width: '100%', maxWidth: 720, height: '82%', backgroundColor: colors.surface, borderRadius: 10, overflow: 'hidden' },
  modalHeader: { minHeight: 68, paddingLeft: 17, backgroundColor: NAVY, flexDirection: 'row', alignItems: 'center' },
  modalTitle: { color: PAPER, fontSize: 18, fontWeight: '900' },
  modalSubtitle: { color: YELLOW, fontSize: 8, fontWeight: '900', letterSpacing: 1, marginTop: 4 },
  modalClose: { width: 62, minHeight: 68, marginLeft: 'auto', alignItems: 'center', justifyContent: 'center' },
  logToolbar: { minHeight: 50, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  logCount: { color: colors.textMuted, fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  clearAllText: { color: '#B3261E', fontSize: 11, fontWeight: '900' },
  clearDisabled: { opacity: 0.4 },
  logContent: { flexGrow: 1, padding: 16 },
  logItem: { minHeight: 76, flexDirection: 'row', alignItems: 'flex-start', borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 12 },
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
  profileModal: { width: '100%', maxWidth: 540, maxHeight: '90%', backgroundColor: colors.surfaceElevated, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  profileHeader: { minHeight: 72, paddingLeft: 19, backgroundColor: NAVY, flexDirection: 'row', alignItems: 'center' },
  profileContent: { padding: 20, paddingBottom: 26 },
  profilePhotoButton: { width: 94, height: 94, borderRadius: 47, alignSelf: 'center', position: 'relative' },
  profilePhoto: { width: 94, height: 94, borderRadius: 47 },
  profilePhotoPlaceholder: { width: 94, height: 94, borderRadius: 47, backgroundColor: YELLOW, alignItems: 'center', justifyContent: 'center' },
  profilePhotoInitials: { color: INK, fontSize: 25, fontWeight: '900' },
  profileCamera: { position: 'absolute', right: 0, bottom: 1, width: 31, height: 31, borderRadius: 16, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.surfaceElevated },
  profilePhotoHelp: { color: colors.textMuted, fontSize: 10, textAlign: 'center', marginTop: 9, marginBottom: 18 },
  profileLabel: { color: colors.text, fontSize: 9, fontWeight: '900', letterSpacing: 0.8, marginTop: 13, marginBottom: 7 },
  profileInput: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.input, color: colors.text, paddingHorizontal: 13, fontSize: 13 },
  profileSaveButton: { minHeight: 52, backgroundColor: '#2577BB', borderRadius: 7, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  profileSavePressed: { backgroundColor: '#1C1C5C' },
  profileSaveDisabled: { opacity: 0.5 },
  profileSaveText: { color: PAPER, fontSize: 12, fontWeight: '900' },
});
