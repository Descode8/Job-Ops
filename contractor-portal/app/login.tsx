import { Ionicons } from '@expo/vector-icons';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { Link, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Image, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemeToggle } from '@/components/theme-toggle';
import { type AppThemeColors, useAppTheme } from '@/contexts/theme-context';
import { supabase } from '@/lib/supabase';
import { AppText as Text, AppTextInput as TextInput } from '@/components/app-typography';
import { ThemedAlert as Alert } from '@/components/themed-alert';
import { SmsConsentControl } from '@/components/sms-consent-control';

const BRAND_BLUE = '#1D4ED8';
const PAPER = '#FFFFFF';

export default function LoginScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [smsConsent, setSmsConsent] = useState(false);

  const signIn = async () => {
    Keyboard.dismiss();
    if (!username.trim() || !password) {
      Alert.alert('Enter your username and password', 'Both fields are required.');
      return;
    }

    setIsLoading(true);
    const identifier = username.trim().toLowerCase();
    const phoneDigits = identifier.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
    if (!identifier.includes('@') && phoneDigits.length !== 10) {
      setIsLoading(false);
      Alert.alert('Invalid username', 'Enter your email address or 10-digit phone number without +1.');
      return;
    }
    let data: { user: { id: string } | null } = { user: null };
    let error: { message: string } | null = null;
    if (identifier.includes('@')) {
      const result = await supabase.auth.signInWithPassword({ email: identifier, password });
      data = result.data; error = result.error;
    } else {
      const result = await supabase.functions.invoke('phone-login', { body: { phone: phoneDigits, password } });
      if (result.error) {
        let message = result.error.message;
        if (result.error instanceof FunctionsHttpError) {
          const body = await result.error.context.json().catch(() => null);
          message = body?.message ?? body?.error ?? message;
        }
        error = { message };
      } else if (result.data?.error) error = { message: result.data.error };
      else {
        const sessionResult = await supabase.auth.setSession({ access_token: result.data.accessToken, refresh_token: result.data.refreshToken });
        data = { user: sessionResult.data.user }; error = sessionResult.error;
      }
    }

    if (error || !data.user) {
      setIsLoading(false);
      Alert.alert('Log in failed', error?.message ?? 'Supabase did not return a user session.');
      return;
    }

    const { data: contractor, error: contractorError } = await supabase
      .from('contractors')
      .select('id, must_change_password')
      .eq('auth_user_id', data.user.id)
      .eq('is_active', true)
      .single();

    setIsLoading(false);
    if (contractorError) {
      await supabase.auth.signOut();
      Alert.alert('Contractor access required', 'This account is not linked to an active contractor record.');
      return;
    }

    if (smsConsent) {
      const { error: consentError } = await supabase.rpc('set_my_sms_consent', { p_consent: true });
      if (consentError) console.warn('SMS consent could not be saved:', consentError.message);
    }

    router.replace(contractor?.must_change_password ? '/set-password' : '/(tabs)');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.hero}>
          <View style={styles.themeToggle}><ThemeToggle /></View>
          <Image source={require('@/assets/images/JobOps_alt.png')} style={styles.logo} resizeMode="contain" />
          <View style={styles.heroCopy}>
            <Text style={styles.heroKicker}>MANAGE · ASSIGN · COMPLETE</Text>
            <Text style={styles.heroTitle}>Field Operations, Organized</Text>
          </View>
        </View>

        <ScrollView
          style={styles.formScroll}
          contentContainerStyle={styles.form}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets>
          <View style={styles.accessLabel}>
            <Ionicons name="shield-checkmark" size={19} color={colors.primary} />
            <Text style={styles.accessText}>CONTRACTORS ONLY</Text>
          </View>
          <Text style={styles.title}>Log In</Text>
          <Text style={styles.subtitle}>Use your email address or 10-digit cell phone number as your username.</Text>

          <Text style={styles.label}>Username</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="Email or 10-digit Phone Number"
            placeholderTextColor="#8A98A8"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={signIn}
          />

          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordField}>
            <TextInput
              style={styles.passwordInput}
              value={password}
              onChangeText={setPassword}
              placeholder="Enter your password"
              placeholderTextColor="#8A98A8"
              secureTextEntry={!showPassword}
              textContentType="password"
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              returnKeyType="done"
              onSubmitEditing={signIn}
            />
            <TouchableOpacity style={styles.passwordToggle} onPress={() => setShowPassword((visible) => !visible)} accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
              <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={21} color={colors.primary} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.primaryButton} onPress={signIn} activeOpacity={0.72} disabled={isLoading}>
            <Text style={styles.primaryButtonText}>{isLoading ? 'Logging in...' : 'Log in'}</Text>
            <Ionicons name="arrow-forward" size={19} color={PAPER} />
          </TouchableOpacity>

          <Text style={styles.demoText}>Only active contractors linked to a Supabase Auth account can continue.</Text>
          <SmsConsentControl checked={smsConsent} onChange={setSmsConsent} />
          <Text style={styles.footerText}>Need access? Contact your JobOps administrator to be added as an approved contractor.</Text>
          <View style={styles.legalLinks}><Link href="/privacy" style={styles.legalLink}>Privacy Policy</Link><Text style={styles.legalSeparator}>•</Text><Link href="/terms" style={styles.legalLink}>Terms of Service</Link></View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (colors: AppThemeColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  hero: { minHeight: 210, paddingHorizontal: 22, paddingTop: 15, paddingBottom: 22, justifyContent: 'space-between', backgroundColor: '#050B14', borderBottomWidth: 0.5, borderBottomColor: '#243B5C' },
  themeToggle: { position: 'absolute', right: 18, top: 16, zIndex: 2 },
  logo: { width: 96, height: 96, alignSelf: 'flex-start' },
  heroCopy: { maxWidth: 310 },
  heroKicker: { color: BRAND_BLUE, fontSize: 10, fontWeight: '900', letterSpacing: 1.5, marginBottom: 9 },
  heroTitle: { color: PAPER, fontSize: 29, fontWeight: '800', marginBottom: 8 },
  heroText: { color: '#DDE8F3', fontSize: 13, lineHeight: 19 },
  formScroll: { flex: 1, backgroundColor: colors.background },
  form: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 25, paddingBottom: 24 },
  accessLabel: { flexDirection: 'row', alignItems: 'center', marginBottom: 15, borderRadius: 6 },
  accessText: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 1.2, marginLeft: 7 },
  title: { color: colors.text, fontSize: 27, fontWeight: '800' },
  subtitle: { color: colors.textMuted, fontSize: 13, marginTop: 6, marginBottom: 24 },
  label: { color: colors.text, fontSize: 11, fontWeight: '800', marginBottom: 7, marginTop: 15 },
  input: { minHeight: 50, borderWidth: 0.5, borderColor: colors.border, backgroundColor: colors.input, paddingHorizontal: 14, color: colors.text, fontSize: 15, borderRadius: 6 },
  passwordField: { minHeight: 50, flexDirection: 'row', alignItems: 'center', borderWidth: 0.5, borderColor: colors.border, backgroundColor: colors.input, borderRadius: 6 },
  passwordInput: { flex: 1, minHeight: 48, paddingHorizontal: 14, color: colors.text, fontSize: 15 },
  passwordToggle: { width: 50, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  primaryButton: { minHeight: 52, backgroundColor: '#243B5C', marginTop: 24, paddingHorizontal: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, borderRadius: 6 },
  primaryButtonText: { color: PAPER, fontSize: 13, fontWeight: '900' },
  demoText: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 14 },
  footerText: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 24 },
  legalLinks: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 14, paddingBottom: 20 },
  legalLink: { color: colors.primary, fontSize: 11, fontWeight: '900', textDecorationLine: 'underline' },
  legalSeparator: { color: colors.textMuted, fontSize: 11 },
});
