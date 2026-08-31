import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Image, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText as Text, AppTextInput as TextInput } from '@/components/app-typography';
import { ThemedAlert as Alert } from '@/components/themed-alert';
import { ThemeToggle } from '@/components/theme-toggle';
import { type AppThemeColors, useAppTheme } from '@/contexts/theme-context';
import { normalizeUsPhone } from '@/lib/phone-auth';
import { supabase } from '@/lib/supabase';

const PAPER = '#FFFFFF';
export default function LoginScreen() {
  const router = useRouter(); const { colors } = useAppTheme(); const styles = useMemo(() => createStyles(colors), [colors]);
  const [identifier, setIdentifier] = useState(''); const [password, setPassword] = useState(''); const [showPassword, setShowPassword] = useState(false); const [isLoading, setIsLoading] = useState(false); const submitting = useRef(false);
  const finishSession = async (userId: string) => {
    const { data: contractor, error } = await supabase.from('contractors').select('id, must_change_password').eq('auth_user_id', userId).eq('is_active', true).single();
    if (error || !contractor) { await supabase.auth.signOut(); throw new Error('This account is not linked to an active JobOps contractor.'); }
    router.replace(contractor.must_change_password ? '/set-password' : '/(tabs)');
  };
  const signIn = async () => {
    if (submitting.current || isLoading) return;
    const entered = identifier.trim(); Keyboard.dismiss();
    if (!entered || !password) { Alert.alert('Enter your login information', 'Your email or phone number and password are required.'); return; }
    const isEmail = entered.includes('@'); const phone = isEmail ? null : normalizeUsPhone(entered);
    if (isEmail && !/^\S+@\S+\.\S+$/.test(entered)) { Alert.alert('Invalid email', 'Enter a valid email address.'); return; }
    if (!isEmail && !phone) { Alert.alert('Invalid phone number', 'Enter a valid 10-digit US phone number.'); return; }
    submitting.current = true; setIsLoading(true);
    try {
      const credentials = isEmail ? { email: entered.toLowerCase(), password } : { phone: phone!, password };
      const { data, error } = await supabase.auth.signInWithPassword(credentials);
      if (error || !data.user) throw new Error(error?.message ?? 'No user session was returned.');
      await finishSession(data.user.id);
    } catch (error) { Alert.alert('Log in failed', authError(error)); }
    finally { submitting.current = false; setIsLoading(false); }
  };
  return <SafeAreaView style={styles.safe}><KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <View style={styles.hero}><View style={styles.themeToggle}><ThemeToggle /></View><Image source={require('@/assets/images/JobOps.png')} style={styles.logo} resizeMode="contain" /><View><Text style={styles.kicker}>MANAGE · ASSIGN · COMPLETE</Text><Text style={styles.heroTitle}>Field Operations, Organized</Text></View></View>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets>
      <View style={styles.access}><Ionicons name="shield-checkmark" size={19} color={colors.primary} /><Text style={styles.accessText}>CONTRACTORS ONLY</Text></View><Text style={styles.title}>Log In</Text><Text style={styles.subtitle}>Use your email address or phone number and password.</Text>
      <Label text="Email/Phone Number" /><TextInput style={styles.input} value={identifier} onChangeText={setIdentifier} placeholder="Enter your email or phone number" placeholderTextColor="#8A98A8" autoCapitalize="none" autoCorrect={false} textContentType="username" editable={!isLoading} />
      <Label text="Password" /><View style={styles.passwordField}><TextInput style={styles.passwordInput} value={password} onChangeText={setPassword} placeholder="Enter your password" placeholderTextColor="#8A98A8" secureTextEntry={!showPassword} textContentType="password" autoCapitalize="none" autoCorrect={false} returnKeyType="done" onSubmitEditing={() => void signIn()} editable={!isLoading} /><TouchableOpacity style={styles.eye} onPress={() => setShowPassword((value) => !value)} accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}><Ionicons name={showPassword ? 'eye-off' : 'eye'} size={21} color={colors.primary} /></TouchableOpacity></View>
      <ActionButton label={isLoading ? 'Logging in...' : 'Log in'} onPress={signIn} disabled={isLoading} /><Text style={styles.footer}>Need access? Contact your JobOps administrator.</Text>
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView>;
}
function authError(error: unknown) { const message = error instanceof Error ? error.message : 'The authentication request failed.'; if (/invalid login credentials/i.test(message)) return 'The email or phone number and password do not match.'; if (/rate|limit|too many/i.test(message)) return 'Too many requests. Wait a few minutes and try again.'; return message; }
function Label({ text }: { text: string }) { const { colors } = useAppTheme(); return <Text style={{ color: colors.text, fontSize: 11, fontWeight: '800', marginBottom: 7, marginTop: 15 }}>{text}</Text>; }
function ActionButton({ label, onPress, disabled }: { label: string; onPress: () => void | Promise<void>; disabled: boolean }) { return <TouchableOpacity style={[{ minHeight: 52, backgroundColor: '#243B5C', marginTop: 22, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, borderRadius: 6 }, disabled && { opacity: 0.5 }]} onPress={() => void onPress()} disabled={disabled}><Text style={{ color: PAPER, fontSize: 13, fontWeight: '900' }}>{label}</Text><Ionicons name="arrow-forward" size={19} color={PAPER} /></TouchableOpacity>; }
const createStyles = (c: AppThemeColors) => StyleSheet.create({ safe:{flex:1,backgroundColor:c.background},flex:{flex:1},hero:{minHeight:210,paddingHorizontal:22,paddingTop:15,paddingBottom:22,justifyContent:'space-between',backgroundColor:'#050B14'},themeToggle:{position:'absolute',right:18,top:16,zIndex:2},logo:{width:96,height:96},kicker:{color:'#1D4ED8',fontSize:10,fontWeight:'900',letterSpacing:1.5,marginBottom:9},heroTitle:{color:PAPER,fontSize:29,fontWeight:'800'},scroll:{flex:1,backgroundColor:c.background},form:{flexGrow:1,paddingHorizontal:22,paddingTop:25,paddingBottom:32},access:{flexDirection:'row',alignItems:'center',marginBottom:15},accessText:{color:c.primary,fontSize:10,fontWeight:'900',letterSpacing:1.2,marginLeft:7},title:{color:c.text,fontSize:27,fontWeight:'800'},subtitle:{color:c.textMuted,fontSize:13,lineHeight:19,marginTop:6,marginBottom:8},input:{minHeight:50,borderWidth:.5,borderColor:c.border,backgroundColor:c.input,paddingHorizontal:14,color:c.text,fontSize:15,borderRadius:6},passwordField:{minHeight:50,flexDirection:'row',alignItems:'center',borderWidth:.5,borderColor:c.border,backgroundColor:c.input,borderRadius:6},passwordInput:{flex:1,minHeight:48,paddingHorizontal:14,color:c.text,fontSize:15},eye:{width:50,minHeight:48,alignItems:'center',justifyContent:'center'},footer:{color:c.textMuted,fontSize:11,lineHeight:16,marginTop:24,textAlign:'center'} });
