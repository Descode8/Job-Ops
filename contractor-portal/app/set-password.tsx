import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';

const NAVY = '#003366'; const PAPER = '#FFFFFF'; const MUTED = '#566273'; const YELLOW = '#FFF200';

export default function SetPasswordScreen() {
  const router = useRouter(); const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState(''); const [ready, setReady] = useState(false); const [saving, setSaving] = useState(false);
  useEffect(() => {
    const applyUrl = async (url: string | null) => {
      const params = new URLSearchParams(url?.includes('#') ? url.split('#')[1] : url?.split('?')[1] ?? '');
      const accessToken = params.get('access_token'); const refreshToken = params.get('refresh_token');
      if (accessToken && refreshToken) { const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }); if (!error) setReady(true); return; }
      const { data } = await supabase.auth.getSession(); setReady(Boolean(data.session));
    };
    void Linking.getInitialURL().then(applyUrl);
    const subscription = Linking.addEventListener('url', ({ url }) => void applyUrl(url));
    return () => subscription.remove();
  }, []);
  const save = async () => {
    if (!passwordValid) { Alert.alert('Password requirements not met', 'Complete every password requirement before continuing.'); return; }
    if (password !== confirm) { Alert.alert('Passwords do not match'); return; }
    setSaving(true); const { error } = await supabase.auth.updateUser({ password }); setSaving(false);
    if (error) { Alert.alert('Could not set password', error.message); return; }
    const { error: profileError } = await supabase.rpc('complete_contractor_password_setup');
    if (profileError) { Alert.alert('Password saved', 'Your password changed, but account setup could not be marked complete. Contact an admin.'); return; }
    Alert.alert('Password created', 'You can now use this email and password to sign in.', [{ text: 'Continue', onPress: () => router.replace('/(tabs)') }]);
  };
  const rules = [{ label: 'At least 7 characters', met: password.length >= 7 }, { label: 'At least 1 capital letter', met: /[A-Z]/.test(password) }, { label: 'At least 1 number', met: /\d/.test(password) }, { label: 'At least 1 special character', met: /[^A-Za-z0-9]/.test(password) }];
  const passwordValid = rules.every((rule) => rule.met);
  const passwordsMatch = confirm.length > 0 && password === confirm;
  const canSubmit = ready && passwordValid && passwordsMatch && !saving;
  return <SafeAreaView style={styles.safe}><View style={styles.header}><Ionicons name="key-outline" size={30} color={YELLOW} /><Text style={styles.title}>Create Password</Text></View><View style={styles.form}><Text style={styles.help}>{ready ? 'Choose a permanent password for your contractor account.' : 'Your login session could not be verified. Return to login and enter your temporary password again.'}</Text><TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="New password" placeholderTextColor="#8A98A8" secureTextEntry autoCapitalize="none" autoCorrect={false} /><View style={styles.rules}>{rules.map((rule) => <View key={rule.label} style={styles.rule}><Ionicons name={rule.met ? 'checkmark-circle' : 'ellipse-outline'} size={17} color={rule.met ? '#2E8B57' : MUTED} /><Text style={[styles.ruleText, rule.met && styles.ruleMet]}>{rule.label}</Text></View>)}</View><TextInput style={styles.input} value={confirm} onChangeText={setConfirm} placeholder="Confirm password" placeholderTextColor="#8A98A8" secureTextEntry autoCapitalize="none" autoCorrect={false} />{confirm.length > 0 && <View style={styles.matchRow}><Ionicons name={passwordsMatch ? 'checkmark-circle' : 'close-circle'} size={17} color={passwordsMatch ? '#2E8B57' : '#B3261E'} /><Text style={[styles.matchText, { color: passwordsMatch ? '#2E8B57' : '#B3261E' }]}>{passwordsMatch ? 'Passwords match' : 'Passwords do not match'}</Text></View>}<Pressable style={({ pressed }) => [styles.button, pressed && canSubmit && styles.buttonPressed, !canSubmit && styles.disabled]} disabled={!canSubmit} onPress={() => void save()}><Text style={styles.buttonText}>{saving ? 'Saving password...' : 'Create Password'}</Text></Pressable></View></SafeAreaView>;
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: PAPER }, header: { minHeight: 150, backgroundColor: NAVY, padding: 24, justifyContent: 'flex-end' }, title: { color: PAPER, fontSize: 27, fontWeight: '900', marginTop: 12 }, form: { padding: 22 }, help: { color: MUTED, fontSize: 13, lineHeight: 20, marginBottom: 14 }, input: { minHeight: 50, borderWidth: 1, borderColor: '#C9D7E5', borderRadius: 6, paddingHorizontal: 13, marginTop: 12, color: NAVY }, rules: { backgroundColor: '#F4F7FA', borderRadius: 6, padding: 12, marginTop: 10 }, rule: { flexDirection: 'row', alignItems: 'center', marginVertical: 4 }, ruleText: { color: MUTED, fontSize: 11, marginLeft: 8 }, ruleMet: { color: '#2E8B57', fontWeight: '800' }, matchRow: { flexDirection: 'row', alignItems: 'center', marginTop: 9 }, matchText: { fontSize: 11, fontWeight: '800', marginLeft: 7 }, button: { minHeight: 52, backgroundColor: '#2577BB', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 18, paddingHorizontal: 12, borderRadius: 6 }, buttonPressed: { backgroundColor: '#1C1C5C' }, disabled: { opacity: 0.45 }, buttonText: { color: PAPER, fontSize: 12, fontWeight: '900', marginLeft: 8 } });
