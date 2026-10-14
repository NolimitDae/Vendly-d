import React, { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { format, parseISO } from 'date-fns';
import { Card, GradientButton, ui } from './brand';
import { DARK, FONTS } from '../constants/colors';
import type { Booking } from '../services/booking.service';
import { RentalsService } from '../services/rentals.service';
import { apiError } from '../services/contracts.service';

const money = (n: unknown) => `$${Number(n ?? 0).toFixed(2)}`;

/**
 * Rental check-in. The vendor records the return (photos, damage / late fees); afterwards both
 * sides see the outcome. Fees come out of the customer's security deposit hold first.
 */
export default function RentalReturnCard({ booking, role, onDone }: { booking: Booking; role: 'VENDOR' | 'CUSTOMER'; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [photos, setPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [damage, setDamage] = useState('');
  const [late, setLate] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  if (!booking.is_rental) return null;
  const ret = booking.rental_return;
  const deposit = Number(booking.security_deposit ?? 0);

  if (ret) {
    const fees = Number(ret.damage_fee) + Number(ret.late_fee);
    return (
      <Card style={{ gap: 8 }}>
        <View style={s.head}>
          <Ionicons name={fees > 0 ? 'alert-circle-outline' : 'checkmark-circle-outline'} size={22} color={fees > 0 ? '#F5B700' : '#5BD69A'} />
          <Text style={s.h2}>Returned {format(parseISO(ret.created_at), 'EEE d MMM')}</Text>
        </View>
        {fees > 0 ? (
          <>
            {Number(ret.damage_fee) > 0 && <Text style={s.body}>Damage fee: {money(ret.damage_fee)}</Text>}
            {Number(ret.late_fee) > 0 && <Text style={s.body}>Late fee: {money(ret.late_fee)}</Text>}
            {!!ret.notes && <Text style={s.muted}>“{ret.notes}”</Text>}
            {role === 'CUSTOMER' && <Text style={s.muted}>Taken from your deposit hold first. Disagree? Open a dispute below within 48 hours.</Text>}
          </>
        ) : (
          <Text style={s.muted}>{role === 'CUSTOMER' ? 'Everything came back fine. Your security deposit hold has been released.' : 'No fees. The customer’s deposit hold was released.'}</Text>
        )}
      </Card>
    );
  }

  if (role === 'CUSTOMER') {
    if (!deposit || !['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].includes(booking.status)) return null;
    return (
      <Card style={{ gap: 6 }}>
        <View style={s.head}>
          <Ionicons name="shield-checkmark-outline" size={22} color={DARK.accent} />
          <Text style={s.h2}>Security deposit {money(deposit)}</Text>
        </View>
        <Text style={s.muted}>Held on your card the day before pickup, never charged unless the vendor reports damage or a late return when you bring the items back.</Text>
      </Card>
    );
  }

  if (!['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].includes(booking.status)) return null;

  const pick = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.7, selectionLimit: 10 });
    if (!res.canceled) setPhotos(res.assets);
  };
  const submit = async () => {
    const d = Number(damage || 0);
    const l = Number(late || 0);
    if (Number.isNaN(d) || Number.isNaN(l) || d < 0 || l < 0) return Alert.alert('Fees', 'Enter amounts in dollars, or leave them empty.');
    if ((d > 0 || l > 0) && !photos.length && !notes.trim()) return Alert.alert('Evidence needed', 'Add photos or a note explaining the fees.');
    const fees = d + l;
    Alert.alert(
      'Record the return?',
      fees > 0 ? `${money(fees)} will be charged to the customer${deposit ? `, from their ${money(deposit)} deposit hold first` : ''}. They can dispute within 48 hours.` : 'The customer’s deposit hold is released.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Record',
          onPress: async () => {
            setBusy(true);
            try {
              await RentalsService.recordReturn(booking.id, { damage_fee: d || undefined, late_fee: l || undefined, notes: notes.trim() || undefined, photos: photos.map((p) => ({ uri: p.uri, name: p.fileName ?? 'return.jpg', type: p.mimeType ?? 'image/jpeg' })) });
              setOpen(false);
              onDone();
            } catch (e) {
              Alert.alert('Could not record the return', apiError(e));
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  return (
    <Card style={{ gap: 12 }}>
      <View style={s.head}>
        <Ionicons name="return-down-back-outline" size={22} color={DARK.accent} />
        <Text style={s.h2}>Check items back in</Text>
      </View>
      <Text style={s.muted}>When everything is back, record it here. You are paid once the return is in{deposit ? `, and the customer’s ${money(deposit)} deposit hold is released unless you add fees` : ''}.</Text>
      {!open ? (
        <View style={{ gap: 10 }}>
          <GradientButton title="Everything came back OK" onPress={submit} loading={busy} />
          <Pressable style={s.outline} onPress={() => setOpen(true)} accessibilityRole="button">
            <Ionicons name="alert-circle-outline" size={18} color={DARK.accent} />
            <Text style={s.outlineText}>Report damage or a late return</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={s.pair}>
            <MoneyField label="Damage fee" value={damage} onChange={setDamage} />
            <MoneyField label="Late fee" value={late} onChange={setLate} />
          </View>
          <View style={[ui.field, { height: undefined, paddingVertical: 12, alignItems: 'flex-start' }]}>
            <TextInput style={[ui.input, { minHeight: 60, textAlignVertical: 'top' }]} placeholder="What happened? e.g. 2 chairs returned with broken legs" placeholderTextColor={DARK.muted} value={notes} onChangeText={setNotes} multiline />
          </View>
          {photos.length > 0 && <View style={s.photos}>{photos.map((p, i) => <Image key={i} source={{ uri: p.uri }} style={s.thumb} />)}</View>}
          <Pressable style={s.outline} onPress={pick} accessibilityRole="button">
            <Ionicons name="camera-outline" size={18} color={DARK.accent} />
            <Text style={s.outlineText}>{photos.length ? `${photos.length} photo${photos.length > 1 ? 's' : ''} · change` : 'Add photos'}</Text>
          </Pressable>
          <GradientButton title="Record return" onPress={submit} loading={busy} />
        </>
      )}
    </Card>
  );
}

function MoneyField({ label, value, onChange }: { label: string; value: string; onChange: (s: string) => void }) {
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Text style={ui.label}>{label}</Text>
      <View style={ui.field}>
        <Text style={s.currency}>$</Text>
        <TextInput style={ui.input} placeholder="0" placeholderTextColor={DARK.muted} keyboardType="decimal-pad" value={value} onChangeText={(t) => onChange(t.replace(/[^0-9.]/g, ''))} accessibilityLabel={label} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  h2: { color: '#fff', fontSize: 17, fontFamily: FONTS.semibold },
  body: { color: '#fff', fontSize: 14, fontFamily: FONTS.medium },
  muted: { color: DARK.muted, fontSize: 13, lineHeight: 19, fontFamily: FONTS.regular },
  outline: { height: 52, borderRadius: 26, borderWidth: 1, borderColor: DARK.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12 },
  outlineText: { color: '#fff', fontSize: 14, fontFamily: FONTS.medium },
  pair: { flexDirection: 'row', gap: 12 },
  currency: { color: DARK.muted, fontSize: 18, fontFamily: FONTS.medium },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: { width: 64, height: 64, borderRadius: 10 },
});
