import React, { useRef, useState } from 'react';
import { Dimensions, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DARK, FONTS } from '../../constants/colors';

const TILE = 96;
const GAP = 4;

/**
 * Every photo of a message: one large photo, or a small grid (3 a row) when there are several.
 * Tap one to see it full size; swipe between them there.
 */
export default function PhotoGrid({ urls, from, onLongPress }: { urls: string[]; from: string; onLongPress?: () => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const pager = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const { width, height } = Dimensions.get('window');
  if (!urls.length) return null;

  const single = urls.length === 1;
  const perRow = urls.length === 2 || urls.length === 4 ? 2 : 3;

  return (
    <>
      <View style={[s.grid, !single && { width: perRow * TILE + (perRow - 1) * GAP }]}>
        {urls.map((url, i) => (
          <Pressable
            key={url}
            onPress={() => setOpen(i)}
            onLongPress={onLongPress}
            delayLongPress={350}
            accessibilityRole="imagebutton"
            accessibilityLabel={single ? `Photo from ${from}. Tap to view full size` : `Photo ${i + 1} of ${urls.length} from ${from}. Tap to view full size`}
          >
            <Image source={{ uri: url }} style={single ? s.single : s.tile} />
          </Pressable>
        ))}
      </View>

      <Modal visible={open !== null} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <View style={s.viewer}>
          <ScrollView
            ref={pager}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            // start on the photo that was tapped (contentOffset alone is iOS-only)
            onLayout={() => pager.current?.scrollTo({ x: (open ?? 0) * width, animated: false })}
            onMomentumScrollEnd={(e) => setOpen(Math.round(e.nativeEvent.contentOffset.x / width))}
          >
            {urls.map((url, i) => (
              <Pressable key={url} onPress={() => setOpen(null)} style={{ width, height }} accessibilityLabel={`Photo ${i + 1} of ${urls.length}. Tap to close`}>
                <Image source={{ uri: url }} style={{ width, height }} resizeMode="contain" />
              </Pressable>
            ))}
          </ScrollView>
          <Pressable onPress={() => setOpen(null)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close photo" style={[s.close, { top: insets.top + 12 }]}>
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
          {urls.length > 1 && open !== null && (
            <Text style={[s.count, { bottom: insets.bottom + 20 }]}>
              {open + 1} / {urls.length}
            </Text>
          )}
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  single: { width: 200, height: 150, borderRadius: 16, backgroundColor: DARK.card },
  tile: { width: TILE, height: TILE, borderRadius: 12, backgroundColor: DARK.card },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' },
  close: { position: 'absolute', right: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  count: { position: 'absolute', alignSelf: 'center', color: '#fff', fontSize: 14, fontFamily: FONTS.medium },
});
