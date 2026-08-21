import { Ionicons } from '@expo/vector-icons';
import { ImageBackground } from 'expo-image';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';

const NAVY = '#003366'; const BLUE = '#1E67B2'; const PAPER = '#FFFFFF'; const INK = '#172033'; const MUTED = '#566273'; const YELLOW = '#FFF200';
type Row = { contractor_id: string; full_name: string; email: string | null; phone_number: string; is_active: boolean; is_admin: boolean; work_order_id: string | null; work_order_number: string | null; work_order_title: string | null; work_order_status: string | null };
type ContractorView = Omit<Row, 'work_order_id' | 'work_order_number' | 'work_order_title' | 'work_order_status'> & { jobs: Pick<Row, 'work_order_id' | 'work_order_number' | 'work_order_title' | 'work_order_status'>[] };
type CreatedCredentials = { username: string; phoneUsername: string; temporaryPassword: string };

async function functionErrorMessage(error: unknown, data?: { error?: string } | null) {
  if (data?.error) return data.error;
  if (error instanceof FunctionsHttpError) {
    const body = await error.context.json().catch(() => null);
    return body?.error ?? body?.message ?? error.message;
  }
  return error instanceof Error ? error.message : 'The contractor-management function failed.';
}

export default function AdminScreen() {
  const [contractors, setContractors] = useState<ContractorView[]>([]); const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [fullName, setFullName] = useState(''); const [email, setEmail] = useState(''); const [phone, setPhone] = useState(''); const [saving, setSaving] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<CreatedCredentials | null>(null);
  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const { data: profile } = auth.user ? await supabase.from('contractors').select('is_admin').eq('auth_user_id', auth.user.id).single() : { data: null };
    if (!profile?.is_admin) { setAuthorized(false); return; }
    setAuthorized(true);
    const { data, error } = await supabase.rpc('get_admin_contractor_overview');
    if (error) { Alert.alert('Could not load admin data', error.message); return; }
    const grouped = new Map<string, ContractorView>();
    for (const row of (data ?? []) as Row[]) {
      if (!row.is_active) continue;
      const item = grouped.get(row.contractor_id) ?? { contractor_id: row.contractor_id, full_name: row.full_name, email: row.email, phone_number: row.phone_number, is_active: row.is_active, is_admin: row.is_admin, jobs: [] };
      if (row.work_order_id) item.jobs.push({ work_order_id: row.work_order_id, work_order_number: row.work_order_number, work_order_title: row.work_order_title, work_order_status: row.work_order_status });
      grouped.set(row.contractor_id, item);
    }
    setContractors([...grouped.values()]);
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const createContractor = async () => {
    if (!fullName.trim() || !email.trim() || !phone.trim()) { Alert.alert('Missing information', 'Name, email, and phone are required.'); return; }
    setSaving(true);
    const { data, error } = await supabase.functions.invoke('manage-contractors', { body: { action: 'create', fullName, email, phoneNumber: phone } });
    setSaving(false);
    if (error || data?.error) { Alert.alert('Could not create contractor', await functionErrorMessage(error, data)); return; }
    setCreatedCredentials({ username: data.username, phoneUsername: data.phoneUsername, temporaryPassword: data.temporaryPassword });
    setFullName(''); setEmail(''); setPhone(''); Alert.alert('Contractor created', 'Give the contractor the temporary login details shown on the Admin screen.'); await load();
  };
  const removeContractor = (item: ContractorView) => Alert.alert('Permanently delete contractor?', `${item.full_name} will be deleted from Authentication and the contractor database. Their assignment and offer links will be removed. This cannot be undone.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete permanently', style: 'destructive', onPress: async () => { const { data, error } = await supabase.functions.invoke('manage-contractors', { body: { action: 'delete', contractorId: item.contractor_id } }); if (error || data?.error) Alert.alert('Could not delete contractor', await functionErrorMessage(error, data)); else { Alert.alert('Contractor permanently deleted'); await load(); } } }]);

  if (authorized === false) return <SafeAreaView style={styles.safe}><View style={styles.denied}><Ionicons name="lock-closed" size={32} color={BLUE} /><Text style={styles.deniedTitle}>Admin access required</Text></View></SafeAreaView>;
  return <SafeAreaView style={styles.safe} edges={['top']}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><ImageBackground source={require('@/assets/images/dark-blue-particle-texture-background.jpg')} style={styles.header} contentFit="cover"><View><Text style={styles.kicker}>ADMIN ONLY</Text><Text style={styles.title}>Contractor Management</Text></View><Ionicons name="shield-checkmark" size={28} color={YELLOW} /></ImageBackground>
    <View style={styles.form}><Text style={styles.section}>CREATE CONTRACTOR</Text><TextInput style={styles.input} value={fullName} onChangeText={setFullName} placeholder="Full name" placeholderTextColor="#8A98A8" /><TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Email address" placeholderTextColor="#8A98A8" keyboardType="email-address" autoCapitalize="none" /><TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Enter 10-digit Phone Number" placeholderTextColor="#8A98A8" keyboardType="phone-pad" /><Pressable style={({ pressed }) => [styles.createButton, pressed && !saving && styles.createButtonPressed, saving && styles.disabledButton]} onPress={() => void createContractor()} disabled={saving}><Text style={styles.createText}>{saving ? 'Creating Contractor...' : 'Create Contractor'}</Text></Pressable><Text style={styles.help}>No email is sent. Give the contractor their username, temporary password, and app link personally.</Text>{createdCredentials && <View style={styles.credentials}><Text style={styles.credentialsTitle}>NEW CONTRACTOR LOGIN — SAVE THIS NOW</Text><Text style={styles.credentialLabel}>EMAIL USERNAME</Text><Text selectable style={styles.credentialValue}>{createdCredentials.username}</Text><Text style={styles.credentialLabel}>PHONE USERNAME</Text><Text selectable style={styles.credentialValue}>{createdCredentials.phoneUsername}</Text><Text style={styles.credentialLabel}>TEMPORARY PASSWORD</Text><Text selectable style={styles.credentialValue}>{createdCredentials.temporaryPassword}</Text><Text style={styles.credentialsHelp}>The contractor will be required to replace this password after signing in.</Text><TouchableOpacity onPress={() => setCreatedCredentials(null)}><Text style={styles.dismissCredentials}>I saved these details</Text></TouchableOpacity></View>}</View>
    <Text style={styles.listSection}>CONTRACTORS & ASSIGNED WORK</Text>{contractors.map((item) => <View key={item.contractor_id} style={[styles.card, !item.is_active && styles.inactive]}><View style={styles.cardTop}><View style={styles.person}><Text style={styles.name}>{item.full_name}</Text><Text style={styles.meta}>{item.email} · {item.phone_number}</Text></View><Text style={item.is_admin ? styles.adminBadge : styles.activeBadge}>{item.is_admin ? 'ADMIN' : item.is_active ? 'ACTIVE' : 'REMOVED'}</Text></View>{item.jobs.length ? item.jobs.map((job) => <View key={job.work_order_id!} style={styles.job}><Text style={styles.jobNumber}>#{job.work_order_number}</Text><Text style={styles.jobTitle} numberOfLines={1}>{job.work_order_title}</Text><Text style={styles.jobStatus}>{job.work_order_status?.replaceAll('_', ' ').toUpperCase()}</Text></View>) : <Text style={styles.noJobs}>No active work-order assignments.</Text>}{!item.is_admin && item.is_active && <TouchableOpacity style={styles.removeButton} onPress={() => removeContractor(item)}><Text style={styles.removeText}>Delete contractor</Text></TouchableOpacity>}</View>)}</ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: '#000000' }, content: { flexGrow: 1, backgroundColor: '#000000', padding: 20, paddingBottom: 40 }, header: { backgroundColor: NAVY, marginHorizontal: -20, marginTop: -20, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 25, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, kicker: { color: YELLOW, fontSize: 10, fontWeight: '900', letterSpacing: 1.4, marginBottom: 8 }, title: { color: PAPER, fontSize: 27, fontWeight: '800' }, form: { backgroundColor: PAPER, marginHorizontal: -20, paddingHorizontal: 20, paddingTop: 21, paddingBottom: 25, marginBottom: 24 }, section: { color: NAVY, fontSize: 10, fontWeight: '900', letterSpacing: 1.1, marginBottom: 8 }, listSection: { color: PAPER, fontSize: 10, fontWeight: '900', letterSpacing: 1.1, marginBottom: 10 }, input: { minHeight: 47, borderWidth: 1, borderColor: '#C9D7E5', backgroundColor: '#F8FAFC', borderRadius: 6, paddingHorizontal: 13, marginTop: 9, color: INK, fontSize: 13 }, createButton: { minHeight: 52, backgroundColor: '#2577BB', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 18, paddingHorizontal: 12, borderRadius: 6 }, createButtonPressed: { backgroundColor: '#1C1C5C' }, disabledButton: { opacity: 0.45 }, createText: { color: PAPER, fontSize: 12, fontWeight: '900', marginLeft: 8 }, help: { color: MUTED, fontSize: 10, lineHeight: 15, marginTop: 9 }, credentials: { backgroundColor: '#FFF8CC', borderWidth: 1, borderColor: '#E6D64D', borderRadius: 6, padding: 13, marginTop: 14 }, credentialsTitle: { color: NAVY, fontSize: 9, fontWeight: '900', marginBottom: 8 }, credentialLabel: { color: MUTED, fontSize: 7, fontWeight: '900', marginTop: 7 }, credentialValue: { color: INK, fontSize: 13, fontWeight: '900', marginTop: 2 }, credentialsHelp: { color: MUTED, fontSize: 9, lineHeight: 14, marginTop: 10 }, dismissCredentials: { color: BLUE, fontSize: 10, fontWeight: '900', textAlign: 'center', marginTop: 12, textDecorationLine: 'underline' }, card: { backgroundColor: PAPER, borderWidth: 1, borderColor: '#D7E1EC', borderRadius: 7, padding: 15, marginBottom: 11 }, inactive: { opacity: 0.55 }, cardTop: { flexDirection: 'row', alignItems: 'flex-start' }, person: { flex: 1 }, name: { color: INK, fontSize: 15, fontWeight: '900' }, meta: { color: MUTED, fontSize: 10, marginTop: 4 }, adminBadge: { color: NAVY, backgroundColor: YELLOW, fontSize: 8, fontWeight: '900', padding: 6 }, activeBadge: { color: BLUE, fontSize: 8, fontWeight: '900' }, job: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#E2EAF2', paddingTop: 9, marginTop: 10 }, jobNumber: { color: BLUE, fontSize: 9, fontWeight: '900' }, jobTitle: { flex: 1, color: INK, fontSize: 10, marginHorizontal: 8 }, jobStatus: { color: MUTED, fontSize: 7, fontWeight: '900' }, noJobs: { color: MUTED, fontSize: 10, marginTop: 12 }, removeButton: { borderTopWidth: 1, borderTopColor: '#E2EAF2', marginTop: 12, paddingTop: 11 }, removeText: { color: '#B3261E', fontSize: 10, fontWeight: '900' }, denied: { flex: 1, alignItems: 'center', justifyContent: 'center' }, deniedTitle: { color: PAPER, fontSize: 16, fontWeight: '900', marginTop: 12 } });
