import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

const SIGNED_IN_AT_KEY = 'jobops.signed-in-at';
export const SESSION_WINDOW_MS = 12 * 60 * 60 * 1000;

export async function startTwelveHourSession() {
  await AsyncStorage.setItem(SIGNED_IN_AT_KEY, String(Date.now()));
}

export async function clearTwelveHourSession() {
  await AsyncStorage.removeItem(SIGNED_IN_AT_KEY);
}

export async function hasActiveTwelveHourSession() {
  const value = await AsyncStorage.getItem(SIGNED_IN_AT_KEY);
  const signedInAt = Number(value);
  return Number.isFinite(signedInAt) && signedInAt > 0 && Date.now() - signedInAt < SESSION_WINDOW_MS;
}

export async function expireSessionIfNeeded() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    await clearTwelveHourSession();
    return false;
  }
  if (await hasActiveTwelveHourSession()) return false;
  await clearTwelveHourSession();
  await supabase.auth.signOut();
  return true;
}
