import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Chip, Field, GradientButton, ScreenHeader, ui } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import { RentalsService } from '../../services/rentals.service';
import { apiMessage } from '../auth/SignIn';
import type { VendorDashboardStackParams } from '../../navigation/types';

interface PickedImage { uri: string; type: string; name: string }

const TURNAROUND = [
  { hours: 0, label: 'None' },
  { hours: 12, label: '12 hours' },
  { hours: 24, label: '1 day' },
  { hours: 48, label: '2 days' },
];

export default function RentalItemForm({ navigation, route }: NativeStackScreenProps<VendorDashboardStackParams, 'RentalItemForm'>) {
  const itemId = route.params?.itemId;
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(!!itemId);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [rate, setRate] = useState('');
  const [deposit, setDeposit] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [turnaround, setTurnaround] = useState(24);
  const [location, setLocation] = useState('');
  const [existing, setExisting] = useState<{ key: string; url: string }[]>([]);
  const [images, setImages] = useState<PickedImage[]>([]);

  useEffect(() => {
    if (!itemId) return;
    RentalsService.mineOne(itemId)
      .then((r) => {
        const i = r.data?.data;
        if (!i) return;
        setTitle(i.title);
        setDescription(i.description);
        setRate(String(i.daily_rate));
        setDeposit(i.deposit_amount ? String(i.deposit_amount) : '');
        setQuantity(String(i.quantity));
        setTurnaround(i.turnaround_hours);
        setLocation(i.location ?? '');
        setExisting((i.image_keys ?? []).map((key, idx) => ({ key, url: i.images[idx] })));
      })
      .catch(() => Alert.alert('Error', 'Could not load the item.'))
      .finally(() => setLoading(false));
  }, [itemId]);

  const pickImages = async () => {
    const total = images.length + existing.length;
    if (total >= 10) return Alert.alert('Limit reached', 'An item can have up to 10 photos.');
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 10 - total, quality: 0.8 });
    if (!res.canceled) setImages((p) => [...p, ...res.assets.map((a, i) => ({ uri: a.uri, type: a.mimeType ?? 'image/jpeg', name: a.fileName ?? `rental_${Date.now()}_${i}.jpg` }))]);
  };

  const save = async () => {
    const daily = Number(rate);
    const qty = parseInt(quantity, 10);
    const dep = deposit.trim() ? Number(deposit) : 0;
    if (!title.trim()) return Alert.alert('Item name', 'Give the item a name customers will search for.');
    if (!daily || daily < 0.5) return Alert.alert('Daily rate', 'Enter a daily rate of at least $0.50.');
    if (!qty || qty < 1) return Alert.alert('Quantity', 'How many of these do you have? At least 1.');
    if (Number.isNaN(dep) || dep < 0) return Alert.alert('Deposit', 'Enter a deposit amount, or leave it empty for none.');
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('title', title.trim());
      fd.append('description', description.trim());
      fd.append('daily_rate', String(daily));
      fd.append('deposit_amount', String(dep));
      fd.append('quantity', String(qty));
      fd.append('turnaround_hours', String(turnaround));
      if (location.trim()) fd.append('location', location.trim());
      if (itemId) fd.append('keep_images', JSON.stringify(existing.map((e) => e.key)));
      images.forEach((img) => fd.append('images', img as unknown as Blob));
      await RentalsService.save(fd, itemId);
      Alert.alert(itemId ? 'Item updated' : 'Item listed', itemId ? 'Your changes are live.' : 'Customers can now rent it.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (err) {
      Alert.alert('Could not save', apiMessage(err, 'Try again in a moment.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <ActivityIndicator color={DARK.accent} style={s.center} />;

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24, gap: 20 }} keyboardShouldPersistTaps="handled">
        <ScreenHeader title={itemId ? 'Edit Rental Item' : 'Add Rental Item'} onBack={() => navigation.goBack()} />
        <View style={{ paddingHorizontal: 20, gap: 20 }}>
          <View style={{ gap: 10 }}>
            <Pressable style={s.addImage} onPress={pickImages} accessibilityRole="button">
              <Ionicons name="image-outline" size={24} color="#fff" />
              <Text style={s.addImageText}>Add Photos</Text>
            </Pressable>
            {(existing.length > 0 || images.length > 0) && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                {existing.map((e) => <Thumb key={e.key} uri={e.url} onRemove={() => setExisting((p) => p.filter((x) => x.key !== e.key))} />)}
                {images.map((img, i) => <Thumb key={`n${i}`} uri={img.uri} onRemove={() => setImages((p) => p.filter((_, idx) => idx !== i))} />)}
              </ScrollView>
            )}
          </View>

          <Field label="Item Name" placeholder="e.g. Gold Chiavari Chair" value={title} onChangeText={setTitle} />

          <View style={{ gap: 8 }}>
            <Text style={ui.label}>Description</Text>
            <View style={[ui.field, s.textarea]}>
              <TextInput style={[ui.input, { minHeight: 100, textAlignVertical: 'top' }]} placeholder="Size, colour, condition, what's included, delivery or pickup…" placeholderTextColor={DARK.muted} value={description} onChangeText={setDescription} multiline />
            </View>
          </View>

          <View style={s.pair}>
            <Money label="Daily rate" value={rate} onChange={setRate} />
            <Money label="Deposit per unit" value={deposit} onChange={setDeposit} placeholder="0" />
          </View>
          <Text style={s.hint}>The deposit is held on the customer’s card the day before pickup and only taken if you report damage or a late return.</Text>

          <View style={{ gap: 8 }}>
            <Text style={ui.label}>Quantity in stock</Text>
            <View style={ui.field}>
              <Ionicons name="layers-outline" size={20} color={DARK.muted} />
              <TextInput style={ui.input} keyboardType="number-pad" value={quantity} onChangeText={(t) => setQuantity(t.replace(/[^0-9]/g, ''))} />
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={ui.label}>Turnaround between rentals</Text>
            <View style={s.chips}>{TURNAROUND.map((t) => <Chip key={t.hours} label={t.label} active={turnaround === t.hours} onPress={() => setTurnaround(t.hours)} />)}</View>
            <Text style={s.hint}>Time to clean, check and deliver. The stock is blocked this long before pickup and after return.</Text>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={ui.label}>Pickup location</Text>
            <View style={ui.field}>
              <Ionicons name="location-outline" size={20} color={DARK.muted} />
              <TextInput style={ui.input} placeholder="City, State" placeholderTextColor={DARK.muted} value={location} onChangeText={setLocation} />
            </View>
          </View>

          <GradientButton title={itemId ? 'Save Changes' : 'List Item'} onPress={save} loading={saving} style={{ marginTop: 8 }} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Money({ label, value, onChange, placeholder = '0.00' }: { label: string; value: string; onChange: (s: string) => void; placeholder?: string }) {
  return (
    <View style={{ gap: 8, flex: 1 }}>
      <Text style={ui.label}>{label}</Text>
      <View style={ui.field}>
        <Text style={s.currency}>$</Text>
        <TextInput style={ui.input} placeholder={placeholder} placeholderTextColor={DARK.muted} value={value} onChangeText={(t) => onChange(t.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" accessibilityLabel={label} />
      </View>
    </View>
  );
}

function Thumb({ uri, onRemove }: { uri: string; onRemove: () => void }) {
  return (
    <View style={s.thumb}>
      <Image source={{ uri }} style={StyleSheet.absoluteFill} />
      <Pressable style={s.remove} onPress={onRemove} hitSlop={6} accessibilityLabel="Remove photo">
        <Ionicons name="close" size={14} color="#fff" />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  center: { flex: 1, backgroundColor: DARK.bg },
  addImage: { height: 56, borderRadius: 28, backgroundColor: DARK.field, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  addImageText: { color: '#fff', fontSize: 16, fontFamily: FONTS.medium },
  thumb: { width: 88, height: 88, borderRadius: 12, overflow: 'hidden', backgroundColor: DARK.field },
  remove: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  textarea: { height: undefined, paddingVertical: 14, alignItems: 'flex-start' },
  pair: { flexDirection: 'row', gap: 12 },
  currency: { color: DARK.muted, fontSize: 18, fontFamily: FONTS.medium },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  hint: { color: DARK.muted, fontSize: 12, lineHeight: 18, fontFamily: FONTS.medium, marginTop: -8 },
});
