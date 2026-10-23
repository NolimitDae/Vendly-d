import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { Chip, GradientButton, ui } from '../brand';
import { DARK, FONTS } from '../../constants/colors';
import { EventToolsService, type EventRole, type TimelineItem } from '../../services/eventTools.service';
import { apiError } from '../../services/contracts.service';

const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** "14:30" on the event's day → ISO (device time zone). */
function at(day: Date, hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

/**
 * The day's schedule. The planner adds and removes items (optionally owned by a booked vendor);
 * a vendor can tick off their own items; the client reads.
 */
export default function RunOfShow({
  eventId,
  eventDate,
  role,
  userId,
  items,
  vendors,
  onChanged,
  readOnly = false,
}: {
  eventId: string;
  eventDate?: string | null;
  role: EventRole;
  userId?: string;
  items: TimelineItem[];
  vendors: { id: string; name: string }[];
  onChanged: () => void;
  /** A cancelled event: the schedule can be read but not changed. */
  readOnly?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const day = eventDate ? parseISO(eventDate) : new Date();

  const add = async () => {
    if (!TIME.test(start)) return Alert.alert('Start time', 'Use 24-hour time, e.g. 14:30.');
    if (end && !TIME.test(end)) return Alert.alert('End time', 'Use 24-hour time, e.g. 15:00, or leave it empty.');
    if (!title.trim()) return Alert.alert('What happens', 'Give the item a title, e.g. “Ceremony”.');
    setBusy('add');
    try {
      await EventToolsService.addTimeline(eventId, { starts_at: at(day, start), ends_at: end ? at(day, end) : undefined, title: title.trim(), notes: notes.trim() || undefined, vendor_id: vendorId ?? undefined });
      setStart('');
      setEnd('');
      setTitle('');
      setNotes('');
      setVendorId(null);
      setAdding(false);
      onChanged();
    } catch (e) {
      Alert.alert('Could not add', apiError(e));
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (item: TimelineItem) => {
    setBusy(item.id);
    try {
      await EventToolsService.updateTimeline(eventId, item.id, { done: !item.done });
      onChanged();
    } catch (e) {
      Alert.alert('Could not update', apiError(e));
    } finally {
      setBusy(null);
    }
  };

  const remove = (item: TimelineItem) =>
    Alert.alert('Remove this item?', item.title, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => EventToolsService.deleteTimeline(eventId, item.id).then(onChanged).catch((e) => Alert.alert('Could not remove', apiError(e))) },
    ]);

  return (
    <View style={{ gap: 12 }}>
      {items.length === 0 && !adding && (
        <View style={s.empty}>
          <Ionicons name="time-outline" size={36} color={DARK.accent} />
          <Text style={s.emptyTitle}>No run of show yet</Text>
          <Text style={s.muted}>{role === 'planner' ? 'Lay out the day: load-in, ceremony, dinner, first dance. Booked vendors see their parts.' : 'The planner hasn’t shared the schedule yet.'}</Text>
        </View>
      )}

      {items.map((item, i) => {
        const mine = role === 'vendor' && item.vendor_id === userId;
        const canTick = !readOnly && (role === 'planner' || mine);
        return (
          <View key={item.id} style={s.row}>
            <View style={s.timeCol}>
              <Text style={s.time}>{format(parseISO(item.starts_at), 'HH:mm')}</Text>
              {item.ends_at && <Text style={s.timeEnd}>{format(parseISO(item.ends_at), 'HH:mm')}</Text>}
            </View>
            <View style={s.rail}>
              <View style={[s.dot, item.done && s.dotDone, mine && s.dotMine]} />
              {i < items.length - 1 && <View style={s.line} />}
            </View>
            <View style={[s.card, mine && s.cardMine]}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                <Text style={[s.title, item.done && s.titleDone]}>{item.title}</Text>
                {canTick && (
                  <Pressable onPress={() => toggle(item)} hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked: item.done }} accessibilityLabel={`Mark ${item.title} done`}>
                    {busy === item.id ? <ActivityIndicator size="small" color={DARK.accent} /> : <Ionicons name={item.done ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={item.done ? '#5BD69A' : DARK.muted} />}
                  </Pressable>
                )}
              </View>
              {!!item.vendor && <Text style={s.vendor}>{mine ? 'You' : item.vendor.name}</Text>}
              {!!item.location && <Text style={s.muted}>📍 {item.location}</Text>}
              {!!item.notes && <Text style={s.notes}>{item.notes}</Text>}
              {role === 'planner' && !readOnly && !readOnly && (
                <Pressable onPress={() => remove(item)} hitSlop={6} style={{ alignSelf: 'flex-end' }} accessibilityLabel={`Remove ${item.title}`}>
                  <Ionicons name="trash-outline" size={16} color={DARK.muted} />
                </Pressable>
              )}
            </View>
          </View>
        );
      })}

      {role === 'planner' &&
        (adding ? (
          <View style={s.form}>
            <Text style={s.formTitle}>Add to {format(day, 'EEE d MMM')}</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={[ui.field, { flex: 1 }]}><TextInput style={ui.input} placeholder="Start 14:00" placeholderTextColor={DARK.muted} value={start} onChangeText={setStart} keyboardType="numbers-and-punctuation" accessibilityLabel="Start time" /></View>
              <View style={[ui.field, { flex: 1 }]}><TextInput style={ui.input} placeholder="End (optional)" placeholderTextColor={DARK.muted} value={end} onChangeText={setEnd} keyboardType="numbers-and-punctuation" accessibilityLabel="End time" /></View>
            </View>
            <View style={ui.field}><TextInput style={ui.input} placeholder="What happens, e.g. Ceremony" placeholderTextColor={DARK.muted} value={title} onChangeText={setTitle} /></View>
            <View style={ui.field}><TextInput style={ui.input} placeholder="Notes (optional)" placeholderTextColor={DARK.muted} value={notes} onChangeText={setNotes} /></View>
            {vendors.length > 0 && (
              <View style={{ gap: 6 }}>
                <Text style={s.muted}>Who runs it</Text>
                <View style={s.chips}>
                  <Chip label="Nobody" active={!vendorId} onPress={() => setVendorId(null)} />
                  {vendors.map((v) => <Chip key={v.id} label={v.name} active={vendorId === v.id} onPress={() => setVendorId(v.id)} />)}
                </View>
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable style={s.cancel} onPress={() => setAdding(false)} accessibilityRole="button"><Text style={s.cancelText}>Cancel</Text></Pressable>
              <GradientButton title="Add" onPress={add} loading={busy === 'add'} style={{ flex: 1 }} />
            </View>
          </View>
        ) : (
          <Pressable style={s.addBtn} onPress={() => setAdding(true)} accessibilityRole="button">
            <Ionicons name="add" size={18} color={DARK.accent} />
            <Text style={s.addText}>Add to the run of show</Text>
          </Pressable>
        ))}
    </View>
  );
}

const s = StyleSheet.create({
  empty: { alignItems: 'center', gap: 6, padding: 24, backgroundColor: DARK.card, borderRadius: 16 },
  emptyTitle: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  muted: { color: DARK.muted, fontSize: 12, lineHeight: 18, fontFamily: FONTS.regular, textAlign: 'left' },
  row: { flexDirection: 'row', gap: 10 },
  timeCol: { width: 46, alignItems: 'flex-end', paddingTop: 10 },
  time: { color: '#fff', fontSize: 14, fontFamily: FONTS.semibold },
  timeEnd: { color: DARK.muted, fontSize: 11, fontFamily: FONTS.regular },
  rail: { width: 14, alignItems: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: DARK.field, borderWidth: 2, borderColor: DARK.border, marginTop: 13 },
  dotDone: { backgroundColor: '#5BD69A', borderColor: '#5BD69A' },
  dotMine: { borderColor: DARK.accent },
  line: { flex: 1, width: 2, backgroundColor: DARK.field, marginTop: 2 },
  card: { flex: 1, backgroundColor: DARK.card, borderRadius: 14, padding: 12, gap: 4, marginBottom: 4 },
  cardMine: { borderWidth: 1, borderColor: DARK.border },
  title: { flex: 1, color: '#fff', fontSize: 15, fontFamily: FONTS.semibold },
  titleDone: { color: DARK.muted, textDecorationLine: 'line-through' },
  vendor: { color: DARK.accent, fontSize: 12, fontFamily: FONTS.semibold },
  notes: { color: '#E9DDEB', fontSize: 13, lineHeight: 19, fontFamily: FONTS.regular },
  form: { backgroundColor: DARK.card, borderRadius: 16, padding: 14, gap: 10 },
  formTitle: { color: '#fff', fontSize: 15, fontFamily: FONTS.semibold },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cancel: { height: 52, paddingHorizontal: 18, borderRadius: 26, borderWidth: 1, borderColor: DARK.border, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: '#fff', fontFamily: FONTS.medium },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 48, borderRadius: 24, borderWidth: 1, borderStyle: 'dashed', borderColor: DARK.border },
  addText: { color: DARK.accent, fontSize: 14, fontFamily: FONTS.semibold },
});
