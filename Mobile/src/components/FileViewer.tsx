import React, { useState } from 'react';
import { ActivityIndicator, Image, Linking, Modal, Pressable, Share, StatusBar, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FONTS } from '../constants/colors';

export type FileKind = 'image' | 'pdf' | 'video' | 'other';

/** What a file is, from its type (when known) or the extension in its link. */
export function fileKind(url: string, mime?: string | null): FileKind {
  if (mime) {
    if (mime.startsWith('image/')) return 'image';
    if (mime === 'application/pdf') return 'pdf';
    if (mime.startsWith('video/')) return 'video';
  }
  const ext = url.split(/[?#]/)[0].split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'heic', 'heif'].includes(ext)) return 'image';
  if (ext === 'pdf') return 'pdf';
  if (['mp4', 'mov', 'webm', 'm4v'].includes(ext)) return 'video';
  return 'other';
}

/**
 * A file (photo, PDF, video or document) or a web link full screen inside the app, instead of Safari.
 * Photos show as they are; everything else in a web view (iOS previews PDFs, videos and Office files). Share opens the
 * phone's share sheet (save, AirDrop, Messages…); "Open in browser" shows it on its own page.
 */
export default function FileViewer({ url, name, mime, onClose }: { url: string; name: string; mime?: string | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const kind = fileKind(url, mime);
  const [loading, setLoading] = useState(kind !== 'image');

  const share = () => Share.share({ url, title: name, message: name }).catch(() => {});
  const openOutside = () => Linking.openURL(url).catch(() => {});

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose} statusBarTranslucent>
      <StatusBar barStyle="light-content" />
      <View style={[s.root, { paddingTop: insets.top }]}>
        <View style={s.bar}>
          <Pressable onPress={onClose} style={s.iconBtn} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
          <Text style={s.title} numberOfLines={1}>{name}</Text>
          <Pressable onPress={share} style={s.iconBtn} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Share ${name}`}>
            <Ionicons name="share-outline" size={22} color="#fff" />
          </Pressable>
          <Pressable onPress={openOutside} style={s.iconBtn} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Open ${name} in the browser`}>
            <Ionicons name="open-outline" size={22} color="#fff" />
          </Pressable>
        </View>

        <View style={[s.body, { paddingBottom: insets.bottom }]}>
          {kind === 'image' ? (
            <Image source={{ uri: url }} style={s.fill} resizeMode="contain" accessibilityLabel={name} />
          ) : (
            <>
              <WebView
                source={{ uri: url }}
                style={s.web}
                allowsInlineMediaPlayback
                mediaPlaybackRequiresUserAction={false}
                allowsFullscreenVideo
                onLoadEnd={() => setLoading(false)}
                onError={() => setLoading(false)}
              />
              {loading && <ActivityIndicator style={StyleSheet.absoluteFill} color="#fff" />}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  title: { flex: 1, color: '#fff', fontFamily: FONTS.medium, fontSize: 15 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, justifyContent: 'center' },
  fill: { flex: 1, width: '100%' },
  web: { flex: 1, backgroundColor: '#000' },
});
