import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { AppText as Text } from '@/components/app-typography';
import { useAppTheme } from '@/contexts/theme-context';

export type CarouselMedia = {
  id: string;
  url?: string;
  original_file_name: string;
  mime_type: string;
};

export function MediaCarouselModal({ items, activeId, onClose }: { items: CarouselMedia[]; activeId: string | null; onClose: () => void }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const availableItems = useMemo(() => items.filter((item) => Boolean(item.url)), [items]);
  const [index, setIndex] = useState(0);
  const [showVideoPlay, setShowVideoPlay] = useState(true);

  useEffect(() => {
    if (!activeId) return;
    const nextIndex = availableItems.findIndex((item) => item.id === activeId);
    setIndex(nextIndex >= 0 ? nextIndex : 0);
  }, [activeId, availableItems]);

  const item = availableItems[index];
  const canTraverse = availableItems.length > 1;
  const move = (direction: -1 | 1) => setIndex((current) => (current + direction + availableItems.length) % availableItems.length);
  const isImage = item?.mime_type.toLowerCase().startsWith('image/');
  const isVideo = item?.mime_type.toLowerCase().startsWith('video/');
  const videoPlayer = useVideoPlayer(isVideo ? item?.url ?? null : null, (player) => { player.loop = false; });

  useEffect(() => { setShowVideoPlay(true); }, [item?.id]);

  return <Modal visible={Boolean(activeId && item)} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <View style={styles.modal}>
        <View style={styles.header}>
          <View style={styles.heading}>
            <Text style={styles.title} numberOfLines={1}>{item?.original_file_name}</Text>
            <Text style={styles.meta}>{isVideo ? 'VIDEO' : isImage ? 'PICTURE' : 'ATTACHMENT'} · {index + 1} OF {availableItems.length}</Text>
          </View>
          <Pressable style={styles.close} accessibilityRole="button" accessibilityLabel="Close media viewer" onPress={onClose}><Ionicons name="close" size={26} color="#FFFFFF" /></Pressable>
        </View>
        <View style={styles.body}>
          {isImage && item?.url
            ? <Image source={{ uri: item.url }} style={styles.image} contentFit="contain" />
            : isVideo && item?.url
              ? <><VideoView key={item.id} player={videoPlayer} style={styles.video} nativeControls contentFit="contain" fullscreenOptions={{ enable: true }} />{showVideoPlay && <Pressable style={styles.videoPlayOverlay} accessibilityRole="button" accessibilityLabel="Play video" onPress={() => { videoPlayer.play(); setShowVideoPlay(false); }}><View style={styles.videoPlayCircle}><Ionicons name="play" size={42} color="#FFFFFF" /></View><Text style={styles.videoPlayText}>PLAY VIDEO</Text></Pressable>}</>
              : item?.url ? <WebView key={item.id} source={{ uri: item.url }} style={styles.viewer} startInLoadingState /> : null}
          {canTraverse && <>
            <Pressable style={[styles.arrow, styles.left]} accessibilityRole="button" accessibilityLabel="Previous attachment" onPress={() => move(-1)}><Ionicons name="chevron-back" size={34} color="#FFFFFF" /></Pressable>
            <Pressable style={[styles.arrow, styles.right]} accessibilityRole="button" accessibilityLabel="Next attachment" onPress={() => move(1)}><Ionicons name="chevron-forward" size={34} color="#FFFFFF" /></Pressable>
          </>}
        </View>
        {canTraverse && <View style={styles.footer}><Text style={styles.hint}>Use the arrows to view the previous or next picture or video.</Text></View>}
      </View>
    </View>
  </Modal>;
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  backdrop: { flex: 1, padding: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(2, 8, 18, 0.9)' },
  modal: { width: '100%', maxWidth: 760, height: '88%', overflow: 'hidden', borderRadius: 12, backgroundColor: colors.surface },
  header: { minHeight: 66, paddingLeft: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.header },
  heading: { flex: 1, paddingRight: 8 },
  title: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  meta: { color: '#60A5FA', fontSize: 9, fontWeight: '900', marginTop: 4 },
  close: { width: 58, minHeight: 66, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, backgroundColor: '#030812' },
  image: { width: '100%', height: '100%' },
  viewer: { flex: 1, backgroundColor: '#030812' },
  video: { width: '100%', height: '100%', backgroundColor: '#030812' },
  videoPlayOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(3, 8, 18, 0.18)' },
  videoPlayCircle: { width: 88, height: 88, paddingLeft: 6, borderRadius: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(9, 25, 45, 0.9)', borderWidth: 2, borderColor: '#60A5FA' },
  videoPlayText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900', letterSpacing: 1, marginTop: 12 },
  arrow: { position: 'absolute', bottom: 22, width: 64, height: 64, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(9, 25, 45, 0.9)' },
  left: { left: 20 },
  right: { right: 20 },
  footer: { minHeight: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, backgroundColor: colors.header },
  hint: { color: '#9FB7D5', fontSize: 10, textAlign: 'center' },
});
