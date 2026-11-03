import React, { useState } from 'react';
import { FlatList, Image, Modal, Pressable, ScrollView, StatusBar, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FONTS } from '../constants/colors';

/**
 * A package's or rental's photos full screen, uncropped, on black. Swipe between them; pinch to zoom
 * (iOS); the close button or the back gesture returns to the page.
 */
export default function PhotoViewer({ photos, start, onClose, title }: { photos: string[]; start: number; onClose: () => void; title?: string }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(start);
  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose} statusBarTranslucent>
      <StatusBar barStyle="light-content" />
      <View style={s.root}>
        <FlatList
          data={photos}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={start}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          keyExtractor={(uri, i) => `${i}-${uri}`}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item, index: i }) => (
            // a zoomable page per photo (pinch-zoom is built into iOS scroll views)
            <ScrollView
              style={{ width, height }}
              contentContainerStyle={s.page}
              maximumZoomScale={3}
              minimumZoomScale={1}
              centerContent
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
            >
              <Image source={{ uri: item }} style={{ width, height }} resizeMode="contain" accessibilityLabel={title ? `${title}, photo ${i + 1}` : `Photo ${i + 1}`} />
            </ScrollView>
          )}
        />
        <View style={[s.bar, { top: insets.top + 8 }]} pointerEvents="box-none">
          <Text style={s.count}>{photos.length > 1 ? `${index + 1} / ${photos.length}` : ''}</Text>
          <Pressable onPress={onClose} style={s.close} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close photo">
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  page: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  bar: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  count: { color: 'rgba(255,255,255,0.85)', fontFamily: FONTS.medium, fontSize: 15 },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
});
