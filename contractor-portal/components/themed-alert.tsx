import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { AppText as Text } from '@/components/app-typography';
import { type AppThemeColors, useAppTheme } from '@/contexts/theme-context';

type AlertButton = {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
  icon?: number;
};

type AlertOptions = {
  cancelable?: boolean;
  onDismiss?: () => void;
  showCloseButton?: boolean;
};

type AlertRequest = {
  id: number;
  title: string;
  message?: string;
  buttons: AlertButton[];
  options?: AlertOptions;
};

let nextAlertId = 0;
let showAlert: ((request: AlertRequest) => void) | null = null;
const pendingAlerts: AlertRequest[] = [];

export const ThemedAlert = {
  alert(title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) {
    const request = {
      id: ++nextAlertId,
      title,
      message,
      buttons: buttons?.length ? buttons : [{ text: 'OK' }],
      options,
    };
    if (showAlert) showAlert(request);
    else pendingAlerts.push(request);
  },
};

export function ThemedAlertHost() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [alerts, setAlerts] = useState<AlertRequest[]>([]);
  const activeAlert = alerts[0];

  useEffect(() => {
    showAlert = (request) => setAlerts((current) => [...current, request]);
    if (pendingAlerts.length) {
      const queued = pendingAlerts.splice(0);
      setAlerts((current) => [...current, ...queued]);
    }
    return () => { showAlert = null; };
  }, []);

  const dismiss = (button?: AlertButton) => {
    setAlerts((current) => current.slice(1));
    button?.onPress?.();
  };

  const dismissFromBackdrop = () => {
    if (!activeAlert?.options?.cancelable) return;
    setAlerts((current) => current.slice(1));
    activeAlert.options.onDismiss?.();
  };

  return (
    <Modal
      visible={Boolean(activeAlert)}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={dismissFromBackdrop}>
      <Pressable style={styles.backdrop} onPress={dismissFromBackdrop}>
        <Pressable
          accessibilityRole="alert"
          style={styles.dialog}
          onPress={(event) => event.stopPropagation()}>
          {activeAlert?.options?.showCloseButton && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={10}
              onPress={dismissFromBackdrop}
              style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}>
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
          )}
          <View style={styles.iconCircle}>
            <Ionicons name="information-circle" size={26} color={colors.primaryStrong} />
          </View>
          <Text style={styles.title}>{activeAlert?.title}</Text>
          {Boolean(activeAlert?.message) && <Text style={styles.message}>{activeAlert?.message}</Text>}
          <View style={styles.actions}>
            {activeAlert?.buttons.map((button, index) => {
              const destructive = button.style === 'destructive';
              const primary = button.style !== 'cancel' && (activeAlert.buttons.length === 1 || index === activeAlert.buttons.length - 1);
              return (
                <Pressable
                  key={`${button.text ?? 'OK'}-${index}`}
                  accessibilityRole="button"
                  onPress={() => dismiss(button)}
                  style={({ pressed }) => [
                    styles.button,
                    button.icon ? styles.logoButton : undefined,
                    primary && !button.icon && styles.primaryButton,
                    destructive && styles.destructiveButton,
                    pressed && (button.icon ? styles.logoButtonPressed : styles.pressedButton),
                  ]}>
                  {button.icon && <View style={styles.buttonLogoFrame}><Image source={button.icon} style={styles.buttonLogo} contentFit="contain" cachePolicy="memory-disk" accessibilityLabel={`${button.text ?? 'Maps'} logo`} /></View>}
                  <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} style={[styles.buttonText, button.icon ? styles.logoButtonText : undefined, primary && !button.icon && styles.primaryButtonText, destructive && styles.destructiveButtonText]}>
                    {button.text ?? 'OK'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const createStyles = (colors: AppThemeColors) => StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(3, 12, 23, 0.72)',
  },
  dialog: {
    width: '100%',
    maxWidth: 420,
    padding: 22,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 24,
    elevation: 12,
  },
  closeButton: { position: 'absolute', top: 14, right: 14, zIndex: 1, width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  closeButtonPressed: { backgroundColor: colors.surfaceMuted },
  iconCircle: {
    width: 44,
    height: 44,
    marginBottom: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: 'transparent',
  },
  title: { color: colors.text, fontSize: 19, fontWeight: '900', lineHeight: 24, textTransform: 'capitalize' },
  message: { color: colors.textMuted, fontSize: 13, lineHeight: 20, marginTop: 8 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 22 },
  button: {
    flex: 1,
    minHeight: 50,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
    borderWidth: 0.5,
    borderColor: '#2577BB',
    backgroundColor: '#243B5C',
  },
  logoButton: { minHeight: 94, paddingHorizontal: 4, paddingVertical: 6, gap: 8, borderWidth: 0, backgroundColor: 'transparent' },
  logoButtonPressed: { backgroundColor: colors.surfaceMuted },
  logoButtonText: { color: colors.text },
  buttonLogoFrame: { width: 64, height: 64, padding: 5, alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  buttonLogo: { width: 54, height: 54 },
  primaryButton: { borderColor: '#243B5C', backgroundColor: '#243B5C' },
  destructiveButton: { borderColor: '#243B5C', backgroundColor: '#243B5C' },
  pressedButton: { borderColor: '#0E1F35', backgroundColor: '#0E1F35' },
  buttonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  primaryButtonText: { color: '#FFFFFF' },
  destructiveButtonText: { color: '#FFFFFF' },
});
