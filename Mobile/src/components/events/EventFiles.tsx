import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { DARK, FONTS } from '../../constants/colors';
import { EventToolsService, fileSize, type EventFile, type EventRole } from '../../services/eventTools.service';
import { apiError } from '../../services/contracts.service';

const iconFor = (mime: string): keyof typeof Ionicons.glyphMap =>
  mime.startsWith('image/') ? 'image-outline' : mime === 'application/pdf' ? 'document-text-outline' : /sheet|excel|csv/.test(mime) ? 'grid-outline' : 'document-outline';

/** Files shared on the event: floor plans, shot lists, menus. Planner and booked vendors upload; everyone downloads. */
export default function EventFiles({ eventId, role }: { eventId: string; role: EventRole }) {
  const [files, setFiles] = useState<EventFile[] | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(() => {
    EventToolsService.files(eventId)
      .then((r) => setFiles(r.data?.data ?? []))
      .catch(() => setFiles([]));
  }, [eventId]);

  useEffect(load, [load]);

  const upload = async () => {
    const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.length) return;
    const big = res.assets.find((a) => (a.size ?? 0) > 20 * 1024 * 1024);
    if (big) return Alert.alert('Too large', `${big.name} is over 20 MB.`);
    setUploading(true);
    try {
      await EventToolsService.upload(eventId, res.assets.map((a) => ({ uri: a.uri, name: a.name, type: a.mimeType ?? 'application/octet-stream' })));
      load();
    } catch (e) {
      Alert.alert('Upload failed', apiError(e));
    } finally {
      setUploading(false);
    }
  };

  const remove = (f: EventFile) =>
    Alert.alert('Remove this file?', f.name, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => EventToolsService.deleteFile(eventId, f.id).then(load).catch((e) => Alert.alert('Could not remove', apiError(e))) },
    ]);

  if (!files) return <ActivityIndicator color={DARK.accent} style={{ marginVertical: 24 }} />;

  return (
    <View style={{ gap: 10 }}>
      {role !== 'client' && (
        <Pressable style={s.upload} onPress={upload} disabled={uploading} accessibilityRole="button">
          {uploading ? <ActivityIndicator color={DARK.accent} /> : <Ionicons name="cloud-upload-outline" size={20} color={DARK.accent} />}
          <Text style={s.uploadText}>{uploading ? 'Uploading…' : 'Share a file'}</Text>
        </Pressable>
      )}
      {files.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="folder-open-outline" size={34} color={DARK.accent} />
          <Text style={s.emptyTitle}>No files yet</Text>
          <Text style={s.muted}>Floor plans, shot lists, menus and contracts everyone on the event needs.</Text>
        </View>
      ) : (
        files.map((f) => (
          <Pressable key={f.id} style={s.row} onPress={() => Linking.openURL(f.url)} accessibilityRole="link" accessibilityLabel={`Open ${f.name}`}>
            <View style={s.icon}><Ionicons name={iconFor(f.mime)} size={22} color={DARK.accent} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.name} numberOfLines={1}>{f.name}</Text>
              <Text style={s.muted}>{fileSize(f.size)} · {f.uploader.name} · {formatDistanceToNow(parseISO(f.created_at), { addSuffix: true })}</Text>
            </View>
            {(f.can_delete || role === 'planner') && (
              <Pressable onPress={() => remove(f)} hitSlop={8} accessibilityLabel={`Remove ${f.name}`}>
                <Ionicons name="trash-outline" size={18} color={DARK.muted} />
              </Pressable>
            )}
          </Pressable>
        ))
      )}
    </View>
  );
}

const s = StyleSheet.create({
  upload: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, borderRadius: 25, borderWidth: 1, borderStyle: 'dashed', borderColor: DARK.border },
  uploadText: { color: DARK.accent, fontSize: 14, fontFamily: FONTS.semibold },
  empty: { alignItems: 'center', gap: 6, padding: 24, backgroundColor: DARK.card, borderRadius: 16 },
  emptyTitle: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  muted: { color: DARK.muted, fontSize: 12, lineHeight: 17, fontFamily: FONTS.regular },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: DARK.card, borderRadius: 14, padding: 12 },
  icon: { width: 42, height: 42, borderRadius: 10, backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  name: { color: '#fff', fontSize: 14, fontFamily: FONTS.medium },
});
