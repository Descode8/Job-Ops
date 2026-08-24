import { Ionicons } from '@expo/vector-icons';
import { ImageBackground } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText as Text } from '@/components/app-typography';
import { ThemedAlert as Alert } from '@/components/themed-alert';
import { type AppThemeColors, useAppTheme } from '@/contexts/theme-context';
import { supabase } from '@/lib/supabase';
import { WORK_ORDER_STATUS_COLORS, WORK_ORDER_STATUS_FONT } from '@/lib/work-order-status';
import { formatWorkOrderNumber } from '@/lib/work-order-number';
import { useWorkOrderRealtime } from '@/hooks/use-work-order-realtime';

const PAPER = '#FFFFFF';
const YELLOW = '#FFF200';

type CompletedHome = {
  id: string;
  work_order_number: string;
  title: string;
  completed_at: string | null;
  properties: {
    customer_name: string | null;
    address_line_1: string;
    city: string;
    state: string;
    postal_code: string;
  } | null;
};

export default function CompletedHomeScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const [homes, setHomes] = useState<CompletedHome[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  const loadCompletedHomes = useCallback(async () => {
    setIsLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    const { data: profile } = auth.user
      ? await supabase.from('contractors').select('is_admin').eq('auth_user_id', auth.user.id).eq('is_active', true).single()
      : { data: null };

    if (!profile?.is_admin) {
      setAuthorized(false);
      setHomes([]);
      setIsLoading(false);
      return;
    }

    setAuthorized(true);
    const { data, error } = await supabase
      .from('work_orders')
      .select('id, work_order_number, title, completed_at, properties(customer_name, address_line_1, city, state, postal_code)')
      .like('work_order_number', 'HOME-%')
      .eq('status', 'completed')
      .order('completed_at', { ascending: false });

    if (error) {
      Alert.alert('Could not load complete homes', error.message);
      setHomes([]);
    } else {
      setHomes((data ?? []) as unknown as CompletedHome[]);
    }
    setIsLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { void loadCompletedHomes(); }, [loadCompletedHomes]));
  useWorkOrderRealtime(() => { void loadCompletedHomes(); });

  if (authorized === false) {
    return <SafeAreaView style={styles.safeArea}><View style={styles.denied}><Ionicons name="lock-closed" size={32} color={colors.primary} /><Text style={styles.deniedTitle}>Admin access required</Text></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ImageBackground source={require('@/assets/images/dark-blue-particle-texture-background.jpg')} style={styles.header} contentFit="cover">
          <View><Text style={styles.kicker}>ADMIN ONLY</Text><Text style={styles.title}>Complete Home</Text></View>
          <Ionicons name="home" size={29} color={YELLOW} />
        </ImageBackground>

        <View style={styles.intro}>
          <Ionicons name="archive" size={23} color={colors.primary} />
          <View style={styles.introCopy}><Text style={styles.introTitle}>Complete Home History</Text><Text style={styles.introText}>Homes with all 14 Home Progress steps complete are stored here.</Text></View>
        </View>

        <Text style={styles.count}>{isLoading ? 'LOADING...' : `${homes.length} COMPLETE HOME${homes.length === 1 ? '' : 'S'}`}</Text>
        {!isLoading && homes.length === 0 && <View style={styles.empty}><Ionicons name="home" size={34} color={colors.primary} /><Text style={styles.emptyTitle}>No complete homes yet</Text><Text style={styles.emptyText}>A home will appear here after all 14 steps are checked and Complete WO is selected.</Text></View>}
        {homes.map((home) => (
          <TouchableOpacity key={home.id} style={styles.card} activeOpacity={0.85} onPress={() => router.push({ pathname: '/work-order/[id]', params: { id: home.id } })}>
            <View style={styles.cardTop}><Text style={[styles.status, { fontFamily: WORK_ORDER_STATUS_FONT }]}>COMPLETE</Text><Text style={styles.id}>{formatWorkOrderNumber(home.work_order_number)}</Text></View>
            <Text style={styles.homeName}>{home.properties?.customer_name || home.title}</Text>
            <Text style={styles.address}>{formatAddress(home.properties)}</Text>
            <View style={styles.footer}><Text style={styles.footerLabel}>COMPLETE {home.completed_at ? new Date(home.completed_at).toLocaleDateString() : ''}</Text><Ionicons name="arrow-forward-circle" size={21} color={colors.primary} /></View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function formatAddress(property: CompletedHome['properties']) {
  return property ? `${property.address_line_1}, ${property.city}, ${property.state} ${property.postal_code}` : 'Address unavailable';
}

const createStyles = (colors: AppThemeColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 34, backgroundColor: colors.background },
  header: { marginHorizontal: -20, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 25, backgroundColor: colors.header, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kicker: { color: YELLOW, fontSize: 9, fontWeight: '900', letterSpacing: 1.3, marginBottom: 7 },
  title: { color: PAPER, fontSize: 28, fontWeight: '900' },
  intro: { marginTop: 22, padding: 16, borderRadius: 9, backgroundColor: colors.surfaceMuted, flexDirection: 'row', alignItems: 'center', gap: 12 },
  introCopy: { flex: 1 },
  introTitle: { color: colors.text, fontSize: 14, fontWeight: '900', marginBottom: 4 },
  introText: { color: colors.textMuted, fontSize: 11, lineHeight: 16 },
  count: { color: colors.textMuted, fontSize: 9, fontWeight: '900', letterSpacing: 1.1, marginTop: 25, marginBottom: 12 },
  empty: { alignItems: 'center', paddingVertical: 72, paddingHorizontal: 28 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '900', marginTop: 13 },
  emptyText: { color: colors.textMuted, fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 6 },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  deniedTitle: { color: colors.text, fontSize: 16, fontWeight: '900', marginTop: 12 },
  card: { padding: 17, marginBottom: 13, borderRadius: 9, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  status: { color: WORK_ORDER_STATUS_COLORS.completed, fontSize: 10, fontWeight: '900' },
  id: { color: colors.textMuted, fontSize: 9, fontWeight: '700' },
  homeName: { color: colors.text, fontSize: 18, fontWeight: '900', marginTop: 14 },
  address: { color: colors.textMuted, fontSize: 11, lineHeight: 17, marginTop: 7 },
  footer: { marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  footerLabel: { color: WORK_ORDER_STATUS_COLORS.completed, fontSize: 9, fontWeight: '900' },
});
