import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Modal, Pressable, StyleSheet, View } from 'react-native';

import { AppText as Text } from '@/components/app-typography';
import { type AppThemeColors, useAppTheme } from '@/contexts/theme-context';

type UpdateStep = 'available' | 'downloading' | 'ready' | 'error';
type UpdateManifest = Record<string, unknown> | undefined;

const FALLBACK_VERSION = 'unknown';

function releaseFromManifest(manifest: UpdateManifest) {
  const extra = manifest?.extra as Record<string, unknown> | undefined;
  const expoClient = extra?.expoClient as Record<string, unknown> | undefined;
  const expoClientExtra = expoClient?.extra as Record<string, unknown> | undefined;
  const release = expoClientExtra?.jobOpsRelease ?? extra?.jobOpsRelease;
  return typeof release === 'string' && release.trim() ? release.trim() : undefined;
}

export function AppUpdateHost() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const updateState = Updates.useUpdates();
  const checkingRef = useRef(false);
  const [step, setStep] = useState<UpdateStep | null>(null);
  const [latestVersion, setLatestVersion] = useState<string>();
  const [errorMessage, setErrorMessage] = useState('');

  const currentVersion = String(Constants.expoConfig?.extra?.jobOpsRelease ?? Constants.expoConfig?.version ?? FALLBACK_VERSION);

  const checkForUpdate = useCallback(async () => {
    if (!Updates.isEnabled || checkingRef.current) return;
    checkingRef.current = true;
    try {
      const result = await Updates.checkForUpdateAsync();
      if (result.isAvailable) {
        setLatestVersion(releaseFromManifest(result.manifest as UpdateManifest));
        setStep('available');
      }
    } catch (error) {
      console.warn('Could not check for a JobOps update:', error);
    } finally {
      checkingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!Updates.isEnabled || updateState.isStartupProcedureRunning) return;
    if (updateState.isUpdatePending || updateState.isUpdateAvailable) return;
    const timer = setTimeout(() => { void checkForUpdate(); }, 0);
    return () => clearTimeout(timer);
  }, [checkForUpdate, updateState.isStartupProcedureRunning, updateState.isUpdateAvailable, updateState.isUpdatePending]);

  useEffect(() => {
    if (!Updates.isEnabled) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkForUpdate();
    });
    return () => subscription.remove();
  }, [checkForUpdate]);

  const downloadUpdate = async () => {
    setStep('downloading');
    setErrorMessage('');
    try {
      if (!updateState.isUpdatePending) {
        const result = await Updates.fetchUpdateAsync();
        if (!result.isNew && !result.isRollBackToEmbedded) throw new Error('The update could not be downloaded.');
        if (result.isNew) setLatestVersion(releaseFromManifest(result.manifest as UpdateManifest) ?? latestVersion);
      }
      setStep('ready');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'The update could not be downloaded.');
      setStep('error');
    }
  };

  const closeAndApply = async () => {
    try {
      await Updates.reloadAsync();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'The application could not restart.');
      setStep('error');
    }
  };

  const discoveredUpdate = updateState.downloadedUpdate?.type === Updates.UpdateInfoType.NEW
    ? updateState.downloadedUpdate
    : updateState.availableUpdate?.type === Updates.UpdateInfoType.NEW
      ? updateState.availableUpdate
      : undefined;
  const visibleStep = step ?? (discoveredUpdate ? 'available' : null);
  const visible = visibleStep !== null;
  const displayLatestVersion = latestVersion ?? releaseFromManifest(discoveredUpdate?.manifest as UpdateManifest) ?? 'the latest version';

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => undefined}>
      <View style={styles.backdrop}>
        <View accessibilityRole="alert" style={styles.card}>
          <View style={styles.icon}>
            <Ionicons name={visibleStep === 'ready' ? 'checkmark-circle' : 'cloud-download-outline'} size={30} color={colors.primary} />
          </View>

          {visibleStep === 'ready' ? (
            <>
              <Text style={styles.kicker}>UPDATE COMPLETE</Text>
              <Text style={styles.title}>Your application is now up to date</Text>
              <Text style={styles.message}>Version v{displayLatestVersion} has been downloaded. Please close this message to load the new version.</Text>
              <Pressable accessibilityRole="button" style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]} onPress={() => void closeAndApply()}>
                <Text style={styles.buttonText}>Close</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.kicker}>SOFTWARE UPDATE</Text>
              <Text style={styles.title}>A newer version is available</Text>
              <Text style={styles.message}>You are currently using an older software version (v{currentVersion}) of this application. Please select Update to download the latest software version ({latestVersion ? `v${latestVersion}` : displayLatestVersion}).</Text>
              {visibleStep === 'error' && <Text style={styles.error}>{errorMessage} Please check your connection and try again.</Text>}
              <Pressable accessibilityRole="button" disabled={visibleStep === 'downloading'} style={({ pressed }) => [styles.button, visibleStep === 'downloading' && styles.buttonDisabled, pressed && visibleStep !== 'downloading' && styles.buttonPressed]} onPress={() => void downloadUpdate()}>
                {visibleStep === 'downloading' && <ActivityIndicator size="small" color="#FFFFFF" />}
                <Text style={styles.buttonText}>{visibleStep === 'downloading' ? 'Updating...' : visibleStep === 'error' ? 'Try Again' : 'Update'}</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: AppThemeColors) => StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(3, 12, 23, 0.78)' },
  card: { width: '100%', maxWidth: 420, padding: 24, alignItems: 'center', borderRadius: 16, borderWidth: 0.5, borderColor: colors.border, backgroundColor: colors.surfaceElevated, shadowColor: '#000000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 24, elevation: 14 },
  icon: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center', marginBottom: 14, borderRadius: 29, backgroundColor: colors.surfaceMuted },
  kicker: { color: colors.primary, fontSize: 9, fontWeight: '900', letterSpacing: 1.2, textAlign: 'center' },
  title: { marginTop: 8, color: colors.text, fontSize: 20, fontWeight: '900', lineHeight: 25, textAlign: 'center' },
  message: { marginTop: 10, color: colors.textMuted, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  error: { marginTop: 12, color: '#D94A4A', fontSize: 12, lineHeight: 18, fontWeight: '700', textAlign: 'center' },
  button: { width: '100%', minHeight: 50, marginTop: 22, paddingHorizontal: 18, flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center', borderRadius: 7, backgroundColor: '#243B5C' },
  buttonPressed: { backgroundColor: '#0E1F35' },
  buttonDisabled: { opacity: 0.72 },
  buttonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
});
