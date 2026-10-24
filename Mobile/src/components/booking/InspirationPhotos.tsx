import React from 'react';
import { Alert, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { DARK, FONTS } from '../../constants/colors';

export const REQUEST_MAX_PHOTOS = 10;

export type PickedPhoto = { uri: string; name: string; type: string };

/** Reference photos for the vendor, sent with the booking request (up to 10). */
export function InspirationPhotosPicker({ photos, onChange }: { photos: PickedPhoto[]; onChange: (next: PickedPhoto[]) => void }) {
  const pick = async () => {
    const room = REQUEST_MAX_PHOTOS - photos.length;
    if (room <= 0) return void Alert.alert(`Up to ${REQUEST_MAX_PHOTOS} photos`, `You can add up to ${REQUEST_MAX_PHOTOS} photos.`);
    // quality below 1 also means the app sends JPEG, not HEIC
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6, allowsMultipleSelection: true, selectionLimit: room });
    if (res.canceled || !res.assets?.length) return;
    const picked = res.assets.map((a, i) => ({ uri: a.uri, name: a.fileName ?? `inspiration_${Date.now()}_${i}.jpg`, type: a.mimeType ?? 'image/jpeg' }));
    const next = [...photos, ...picked.filter((p) => !photos.some((q) => q.uri === p.uri))];
    if (next.length > REQUEST_MAX_PHOTOS) Alert.alert(`Up to ${REQUEST_MAX_PHOTOS} photos`, `Only the first ${REQUEST_MAX_PHOTOS} were added.`);
    onChange(next.slice(0, REQUEST_MAX_PHOTOS));
  };

  return (
    <View style={{ gap: 10 }}>
      {photos.length < REQUEST_MAX_PHOTOS && (
        <Pressable onPress={pick} style={s.drop} accessibilityRole="button" accessibilityLabel="Add inspiration photos">
          <Ionicons name="images-outline" size={24} color={DARK.accent} />
          <Text style={s.dropText}>Add your images (max {REQUEST_MAX_PHOTOS})</Text>
          <Text style={s.hint}>Only you and the vendor can see them.</Text>
        </Pressable>
      )}
      {photos.length > 0 && (
        <View style={s.wrap}>
          {photos.map((p, i) => (
            <View key={p.uri}>
              <Image source={{ uri: p.uri }} style={s.thumb} accessibilityLabel={`Inspiration photo ${i + 1}`} />
              <Pressable onPress={() => onChange(photos.filter((q) => q.uri !== p.uri))} style={s.remove} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove photo ${i + 1}`}>
                <Ionicons name="close" size={14} color="#fff" />
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/** The photos sent with a request, from short-lived signed links; tapping one opens it full size. */
export function InspirationPhotos({ urls, title = 'Inspiration photos' }: { urls?: string[] | null; title?: string }) {
  const photos = urls ?? [];
  if (photos.length === 0) return null;
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.title}>{title}</Text>
      <View style={s.wrap}>
        {photos.map((url, i) => (
          <Pressable key={url} onPress={() => Linking.openURL(url)} accessibilityRole="imagebutton" accessibilityLabel={`Inspiration photo ${i + 1} of ${photos.length}`}>
            <Image source={{ uri: url }} style={s.thumb} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  drop: { borderWidth: 1, borderStyle: 'dashed', borderColor: DARK.border, borderRadius: 16, paddingVertical: 18, paddingHorizontal: 16, alignItems: 'center', gap: 4 },
  dropText: { color: '#fff', fontSize: 14, fontFamily: FONTS.medium },
  hint: { color: DARK.muted, fontSize: 12, fontFamily: FONTS.regular },
  title: { color: DARK.muted, fontSize: 13, fontFamily: FONTS.medium },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: { width: 72, height: 72, borderRadius: 10, backgroundColor: DARK.field },
  remove: { position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center' },
});
