import { Ionicons } from '@expo/vector-icons';
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText as Text } from '@/components/app-typography';
import { useAppTheme } from '@/contexts/theme-context';

type UploadProgress = { id: string; title: string; completed: number; total: number; fileName: string };
type UploadTask = (report: (completed: number, fileName: string) => void) => Promise<void>;
type UploadContextValue = {
  activeUploads: UploadProgress[];
  isUploading: (id: string) => boolean;
  runUpload: (id: string, title: string, total: number, task: UploadTask) => Promise<void>;
};

const UploadContext = createContext<UploadContextValue | null>(null);

export function UploadProvider({ children }: { children: ReactNode }) {
  const [activeUploads, setActiveUploads] = useState<UploadProgress[]>([]);
  const runUpload = useCallback(async (id: string, title: string, total: number, task: UploadTask) => {
    setActiveUploads((current) => [...current.filter((upload) => upload.id !== id), { id, title, completed: 0, total, fileName: '' }]);
    try {
      await task((completed, fileName) => setActiveUploads((current) => current.map((upload) => upload.id === id ? { ...upload, completed, fileName } : upload)));
    } finally {
      setActiveUploads((current) => current.filter((upload) => upload.id !== id));
    }
  }, []);
  const value = useMemo(() => ({ activeUploads, isUploading: (id: string) => activeUploads.some((upload) => upload.id === id), runUpload }), [activeUploads, runUpload]);
  return <UploadContext.Provider value={value}>{children}<UploadBanner uploads={activeUploads} /></UploadContext.Provider>;
}

export function useUploads() {
  const context = useContext(UploadContext);
  if (!context) throw new Error('useUploads must be used inside UploadProvider.');
  return context;
}

function UploadBanner({ uploads }: { uploads: UploadProgress[] }) {
  const { colors } = useAppTheme();
  if (!uploads.length) return null;
  const completed = uploads.reduce((sum, upload) => sum + upload.completed, 0);
  const total = uploads.reduce((sum, upload) => sum + upload.total, 0);
  const percent = Math.round((completed / Math.max(total, 1)) * 100);
  const current = uploads[0];
  return <SafeAreaView pointerEvents="none" edges={['top']} style={styles.host}>
    <View style={[styles.banner, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
      <Ionicons name="cloud-upload" size={20} color={colors.primary} />
      <View style={styles.copy}>
        <View style={styles.row}><Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{current.title}</Text><Text style={[styles.percent, { color: colors.text }]}>{percent}%</Text></View>
        <View style={[styles.track, { backgroundColor: colors.surfaceMuted }]}><View style={[styles.fill, { width: `${percent}%`, backgroundColor: colors.primary }]} /></View>
        <Text style={[styles.detail, { color: colors.textMuted }]} numberOfLines={1}>{current.fileName || 'Preparing files…'} · {completed}/{total}</Text>
      </View>
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  host: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1000, paddingHorizontal: 12 },
  banner: { minHeight: 68, borderWidth: 0.5, borderRadius: 10, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 8 },
  copy: { flex: 1 }, row: { flexDirection: 'row', alignItems: 'center', gap: 8 }, title: { flex: 1, fontSize: 11, fontWeight: '900' }, percent: { fontSize: 10, fontWeight: '900' },
  track: { height: 5, borderRadius: 3, overflow: 'hidden', marginTop: 6 }, fill: { height: '100%', borderRadius: 3 }, detail: { fontSize: 9, marginTop: 5 },
});
