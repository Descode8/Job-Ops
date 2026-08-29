import { Ionicons } from '@expo/vector-icons';
import { Link, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText as Text } from '@/components/app-typography';
import { useAppTheme } from '@/contexts/theme-context';

export type LegalSection = { heading: string; paragraphs: string[]; bullets?: string[] };

export function LegalDocument({ title, effectiveDate, intro, sections }: { title: string; effectiveDate: string; intro: string; sections: LegalSection[] }) {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    content: { flexGrow: 1, paddingBottom: 42, backgroundColor: colors.background },
    header: { minHeight: 76, paddingHorizontal: 20, backgroundColor: colors.header, flexDirection: 'row', alignItems: 'center' },
    back: { width: 44, height: 44, marginLeft: -10, alignItems: 'center', justifyContent: 'center' },
    brand: { color: '#FFFFFF', fontSize: 12, fontWeight: '900', letterSpacing: 0.8 },
    body: { width: '100%', maxWidth: 820, alignSelf: 'center', paddingHorizontal: 22, paddingTop: 28 },
    kicker: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
    title: { color: colors.text, fontSize: 30, lineHeight: 38, fontWeight: '900', marginTop: 8 },
    date: { color: colors.textMuted, fontSize: 11, marginTop: 7 },
    intro: { color: colors.text, fontSize: 14, lineHeight: 22, marginTop: 22 },
    section: { marginTop: 27 },
    heading: { color: colors.text, fontSize: 18, lineHeight: 24, fontWeight: '900', marginBottom: 9 },
    paragraph: { color: colors.text, fontSize: 13, lineHeight: 21, marginBottom: 11 },
    bullet: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
    dot: { color: colors.primary, fontSize: 14, lineHeight: 21, marginRight: 8 },
    bulletText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 21 },
    footer: { marginTop: 34, paddingTop: 18, borderTopWidth: 0.5, borderTopColor: colors.border, flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    link: { color: colors.primary, fontSize: 12, fontWeight: '900', textDecorationLine: 'underline' },
  }), [colors]);

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}><Pressable style={styles.back} onPress={() => router.canGoBack() ? router.back() : router.replace('/')} accessibilityLabel="Go back"><Ionicons name="arrow-back" size={23} color="#FFFFFF" /></Pressable><Text style={styles.brand}>JOBOPS · DESCODE LLC</Text></View>
      <View style={styles.body}>
        <Text style={styles.kicker}>LEGAL</Text><Text style={styles.title}>{title}</Text><Text style={styles.date}>Effective: {effectiveDate}</Text><Text style={styles.intro}>{intro}</Text>
        {sections.map((section) => <View key={section.heading} style={styles.section}><Text style={styles.heading}>{section.heading}</Text>{section.paragraphs.map((paragraph) => <Text key={paragraph} style={styles.paragraph}>{paragraph}</Text>)}{section.bullets?.map((bullet) => <View key={bullet} style={styles.bullet}><Text style={styles.dot}>•</Text><Text style={styles.bulletText}>{bullet}</Text></View>)}</View>)}
        <View style={styles.footer}><Link href="/privacy" style={styles.link}>Privacy Policy</Link><Link href="/terms" style={styles.link}>Terms of Service</Link><Link href="/" style={styles.link}>JobOps Login</Link></View>
      </View>
    </ScrollView>
  </SafeAreaView>;
}
