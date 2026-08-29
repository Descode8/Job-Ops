import { Image, type ImageRef } from 'expo-image';
import { Linking, Platform } from 'react-native';

export type MapChoice = { label: string; url: string; icon: number };

const APPLE_MAPS_ICON = require('@/assets/images/apple_maps.webp');
const GOOGLE_MAPS_ICON = require('@/assets/images/google_maps.svg');
let googleMapsIconRef: ImageRef | null = null;

export async function preloadMapIcons() {
  if (googleMapsIconRef) return;
  try {
    googleMapsIconRef = await Image.loadAsync(GOOGLE_MAPS_ICON);
  } catch (error) {
    console.warn('Could not preload the Google Maps icon:', error);
  }
}

export function mapChoices(address: string): MapChoice[] {
  const destination = encodeURIComponent(address);
  const googleMaps = `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;

  if (Platform.OS === 'ios') {
    return [
      { label: 'Apple Maps', url: `https://maps.apple.com/?daddr=${destination}&dirflg=d`, icon: APPLE_MAPS_ICON },
      { label: 'Google Maps', url: googleMaps, icon: GOOGLE_MAPS_ICON },
    ];
  }

  if (Platform.OS === 'android') {
    return [
      { label: 'Google Maps', url: googleMaps, icon: GOOGLE_MAPS_ICON },
      { label: 'Apple Maps', url: `https://maps.apple.com/?daddr=${destination}&dirflg=d`, icon: APPLE_MAPS_ICON },
    ];
  }

  return [
    { label: 'Apple Maps', url: `https://maps.apple.com/?daddr=${destination}&dirflg=d`, icon: APPLE_MAPS_ICON },
    { label: 'Google Maps', url: googleMaps, icon: GOOGLE_MAPS_ICON },
  ];
}

export async function openMapDirections(url: string) {
  const supported = await Linking.canOpenURL(url);
  if (!supported) throw new Error('No maps application is available on this device.');
  await Linking.openURL(url);
}
