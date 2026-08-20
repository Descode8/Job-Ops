import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, ImageBackground, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const YELLOW = '#FFF200';
const NAVY = '#062C5B';
const BLUE = '#1E67B2';
const PAPER = '#FFFFFF';
const MUTED = '#566273';

export default function LoginScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);

  const sendCode = () => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) {
      Alert.alert('Enter a valid phone number', 'Use the cell phone number approved for your contractor account.');
      return;
    }
    setCodeSent(true);
  };

  const verifyCode = () => {
    if (code.trim().length !== 6) {
      Alert.alert('Enter your verification code', 'The code should contain six digits.');
      return;
    }
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ImageBackground source={require('@/assets/images/dark-blue-particle-texture-background.jpg')} style={styles.hero} contentFit="cover">
          <Image source={require('@/assets/images/Marty-Wright-Home-Sales_anderson.png')} style={styles.logo} contentFit="contain" />
          <View style={styles.heroCopy}>
            <Text style={styles.heroKicker}>CONTRACTOR ACCESS</Text>
            <Text style={styles.heroTitle}>Your work, organized.</Text>
            <Text style={styles.heroText}>Sign in with the cell phone number connected to your contractor account.</Text>
          </View>
        </ImageBackground>

        <View style={styles.form}>
          <View style={styles.accessLabel}>
            <Ionicons name="shield-checkmark-outline" size={19} color={BLUE} />
            <Text style={styles.accessText}>CONTRACTORS ONLY</Text>
          </View>
          <Text style={styles.title}>Sign in</Text>
          <Text style={styles.subtitle}>No email or password required.</Text>

          <Text style={styles.label}>Cell phone number</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="(864) 555-0123"
            placeholderTextColor="#8A98A8"
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
          />

          {codeSent && (
            <>
              <Text style={styles.label}>Text verification code</Text>
              <TextInput
                style={styles.input}
                value={code}
                onChangeText={setCode}
                placeholder="6-digit code"
                placeholderTextColor="#8A98A8"
                keyboardType="number-pad"
                maxLength={6}
                textContentType="oneTimeCode"
              />
            </>
          )}

          <TouchableOpacity style={styles.primaryButton} onPress={codeSent ? verifyCode : sendCode} activeOpacity={0.85}>
            <Text style={styles.primaryButtonText}>{codeSent ? 'Verify and continue' : 'Send verification code'}</Text>
            <Ionicons name="arrow-forward" size={19} color={NAVY} />
          </TouchableOpacity>

          {codeSent && <Text style={styles.demoText}>Prototype mode: any six-digit code continues. Supabase phone OTP will enforce approved contractors in production.</Text>}
          <Text style={styles.footerText}>Need access? Contact the Marty Wright office to be added as an approved contractor.</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: PAPER },
  flex: { flex: 1 },
  hero: { minHeight: 285, paddingHorizontal: 22, paddingTop: 23, paddingBottom: 30, justifyContent: 'space-between' },
  logo: { width: 177, height: 82 },
  heroCopy: { maxWidth: 310 },
  heroKicker: { color: YELLOW, fontSize: 10, fontWeight: '900', letterSpacing: 1.5, marginBottom: 9 },
  heroTitle: { color: PAPER, fontSize: 29, fontWeight: '800', marginBottom: 8 },
  heroText: { color: '#DDE8F3', fontSize: 13, lineHeight: 19 },
  form: { flex: 1, paddingHorizontal: 22, paddingTop: 25 },
  accessLabel: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  accessText: { color: BLUE, fontSize: 10, fontWeight: '900', letterSpacing: 1.2, marginLeft: 7 },
  title: { color: NAVY, fontSize: 27, fontWeight: '800' },
  subtitle: { color: MUTED, fontSize: 13, marginTop: 6, marginBottom: 24 },
  label: { color: NAVY, fontSize: 11, fontWeight: '800', marginBottom: 7, marginTop: 15 },
  input: { minHeight: 50, borderWidth: 1, borderColor: '#C9D7E5', backgroundColor: '#F8FAFC', paddingHorizontal: 14, color: NAVY, fontSize: 15 },
  primaryButton: { minHeight: 52, backgroundColor: YELLOW, marginTop: 24, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 9 },
  primaryButtonText: { color: NAVY, fontSize: 13, fontWeight: '900' },
  demoText: { color: MUTED, fontSize: 11, lineHeight: 16, marginTop: 14 },
  footerText: { color: MUTED, fontSize: 11, lineHeight: 16, marginTop: 'auto', paddingBottom: 20 },
});
