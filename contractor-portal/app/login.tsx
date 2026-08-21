import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, ImageBackground, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';

const YELLOW = '#F3EC35';
const NAVY = '#003366';
const BLUE = '#1E67B2';
const PAPER = '#FFFFFF';
const MUTED = '#566273';

export default function LoginScreen() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const signIn = async () => {
    Keyboard.dismiss();
    if (!username.trim() || !password) {
      Alert.alert('Enter your username and password', 'Both fields are required.');
      return;
    }

    setIsLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email: username.trim(), password });

    if (error || !data.user) {
      setIsLoading(false);
      Alert.alert('Log in failed', error?.message ?? 'Supabase did not return a user session.');
      return;
    }

    const { error: contractorError } = await supabase
      .from('contractors')
      .select('id')
      .eq('auth_user_id', data.user.id)
      .eq('is_active', true)
      .single();

    setIsLoading(false);
    if (contractorError) {
      await supabase.auth.signOut();
      Alert.alert('Contractor access required', 'This account is not linked to an active contractor record.');
      return;
    }

    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ImageBackground source={require('@/assets/images/dark-blue-particle-texture-background.jpg')} style={styles.hero}>
          <Image source={require('@/assets/images/Marty-Wright-Home-Sales_anderson.png')} style={styles.logo} resizeMode="contain" />
          <View style={styles.heroCopy}>
            <Text style={styles.heroKicker}>CONTRACTOR ACCESS</Text>
            <Text style={styles.heroTitle}>Your work, organized.</Text>
          </View>
        </ImageBackground>

        <ScrollView
          style={styles.formScroll}
          contentContainerStyle={styles.form}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets>
          <View style={styles.accessLabel}>
            <Ionicons name="shield-checkmark-outline" size={19} color={BLUE} />
            <Text style={styles.accessText}>CONTRACTORS ONLY</Text>
          </View>
          <Text style={styles.title}>Log In</Text>
          <Text style={styles.subtitle}>Use the email address associated with your contractor account as your username.</Text>

          <Text style={styles.label}>Username</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="Enter your email"
            placeholderTextColor="#8A98A8"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={signIn}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Enter your password"
            placeholderTextColor="#8A98A8"
            secureTextEntry
            textContentType="password"
            returnKeyType="done"
            onSubmitEditing={signIn}
          />

          <TouchableOpacity style={styles.primaryButton} onPress={signIn} activeOpacity={0.85} disabled={isLoading}>
            <Text style={styles.primaryButtonText}>{isLoading ? 'Logging in...' : 'Log in'}</Text>
            <Ionicons name="arrow-forward" size={19} color={NAVY} />
          </TouchableOpacity>

          <Text style={styles.demoText}>Only active contractors linked to a Supabase Auth account can continue.</Text>
          <Text style={styles.footerText}>Need access? Contact the Marty Wright office to be added as an approved contractor.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: PAPER },
  flex: { flex: 1 },
  hero: { minHeight: 150, paddingHorizontal: 22, paddingTop: 15, paddingBottom: 15, justifyContent: 'space-between' },
  logo: { width: 190, height: 88, alignSelf: 'flex-start' },
  heroCopy: { maxWidth: 310 },
  heroKicker: { color: YELLOW, fontSize: 10, fontWeight: '900', letterSpacing: 1.5, marginBottom: 9 },
  heroTitle: { color: PAPER, fontSize: 29, fontWeight: '800', marginBottom: 8 },
  heroText: { color: '#DDE8F3', fontSize: 13, lineHeight: 19 },
  formScroll: { flex: 1 },
  form: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 25, paddingBottom: 24 },
  accessLabel: { flexDirection: 'row', alignItems: 'center', marginBottom: 15, borderRadius: 6 },
  accessText: { color: BLUE, fontSize: 10, fontWeight: '900', letterSpacing: 1.2, marginLeft: 7 },
  title: { color: NAVY, fontSize: 27, fontWeight: '800' },
  subtitle: { color: MUTED, fontSize: 13, marginTop: 6, marginBottom: 24 },
  label: { color: NAVY, fontSize: 11, fontWeight: '800', marginBottom: 7, marginTop: 15 },
  input: { minHeight: 50, borderWidth: 1, borderColor: '#C9D7E5', backgroundColor: '#F8FAFC', paddingHorizontal: 14, color: NAVY, fontSize: 15, borderRadius: 6 },
  primaryButton: { minHeight: 52, backgroundColor: YELLOW, marginTop: 24, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 9, borderRadius: 6 },
  primaryButtonText: { color: NAVY, fontSize: 13, fontWeight: '900' },
  demoText: { color: MUTED, fontSize: 11, lineHeight: 16, marginTop: 14 },
  footerText: { color: MUTED, fontSize: 11, lineHeight: 16, marginTop: 'auto', paddingBottom: 20 },
});
