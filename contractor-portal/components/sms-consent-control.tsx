import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText as Text } from '@/components/app-typography';
import { useAppTheme } from '@/contexts/theme-context';

const DISCLOSURE = 'By checking this box, you agree to receive recurring transactional text messages from Descode LLC through JobOps, including verification codes, work-order assignments, scheduling information, and status updates. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is not a condition of purchase.';

export function SmsConsentControl({ checked, onChange, contextLabel }: { checked: boolean; onChange: (checked: boolean) => void; contextLabel?: string }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => StyleSheet.create({
    container: { marginTop: 20, padding: 14, borderWidth: 0.5, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surfaceMuted },
    context: { color: colors.text, fontSize: 11, lineHeight: 17, fontWeight: '800', marginBottom: 10 },
    row: { flexDirection: 'row', alignItems: 'flex-start' },
    checkbox: { width: 24, height: 24, marginTop: 1, marginRight: 10, borderWidth: 1.5, borderColor: checked ? colors.primary : colors.border, borderRadius: 5, backgroundColor: checked ? colors.primary : colors.input, alignItems: 'center', justifyContent: 'center' },
    copy: { flex: 1 },
    disclosure: { color: colors.text, fontSize: 10, lineHeight: 16 },
    links: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8, marginLeft: 34 },
    link: { color: colors.primary, fontSize: 10, lineHeight: 17, fontWeight: '900', textDecorationLine: 'underline' },
    separator: { color: colors.textMuted, fontSize: 10, lineHeight: 17 },
  }), [checked, colors]);

  return <View style={styles.container}>
    {contextLabel ? <Text style={styles.context}>{contextLabel}</Text> : null}
    <Pressable style={styles.row} onPress={() => onChange(!checked)} accessibilityRole="checkbox" accessibilityState={{ checked }}>
      <View style={styles.checkbox}>{checked && <Ionicons name="checkmark" size={18} color="#FFFFFF" />}</View>
      <View style={styles.copy}>
        <Text style={styles.disclosure}>{DISCLOSURE}</Text>
      </View>
    </Pressable>
    <View style={styles.links}>
      <Link href="/privacy" style={styles.link}>Privacy Policy</Link><Text style={styles.separator}>•</Text><Link href="/terms" style={styles.link}>Terms of Service</Link>
    </View>
  </View>;
}
