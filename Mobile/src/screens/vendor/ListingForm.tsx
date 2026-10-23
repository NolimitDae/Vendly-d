import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Chip, Field, GradientButton, ScreenHeader, ui } from '../../components/brand';
import CategoryPicker, { type PickerCategory } from '../../components/CategoryPicker';
import LocationPicker, { type PickedPlace } from '../../components/LocationPicker';
import { DARK, FONTS } from '../../constants/colors';
import { api } from '../../services/api';
import { apiMessage } from '../auth/SignIn';
import { PLAN_LABELS, type PaymentPlan } from '../../services/payments.service';
import type { VendorDashboardStackParams } from '../../navigation/types';

interface PickedImage { uri: string; type: string; name: string }

const PLANS: { value: PaymentPlan; label: string }[] = [
  { value: 'FULL_ON_ACCEPT', label: 'Full on accept' },
  { value: 'DEPOSIT_50', label: '50% deposit' },
  { value: 'DEPOSIT_25', label: '25% deposit' },
  { value: 'PAY_AFTER_SERVICE', label: 'Pay after service' },
];

const PRICE_UNITS = [
  { value: 'fixed', label: 'Fixed price' },
  { value: 'hour', label: 'Per hour' },
  { value: 'day', label: 'Per day' },
  { value: 'event', label: 'Per event' },
  { value: 'person', label: 'Per person' },
];

export default function ListingForm() {
  const nav = useNavigation<NativeStackNavigationProp<VendorDashboardStackParams>>();
  const listingId = useRoute<RouteProp<VendorDashboardStackParams, 'ListingForm'>>().params?.listingId;
  const insets = useSafeAreaInsets();
  const isEdit = !!listingId;
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<PickerCategory[]>([]);
  const [images, setImages] = useState<PickedImage[]>([]);
  const [existing, setExisting] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [priceUnit, setPriceUnit] = useState('fixed');
  const [categoryId, setCategoryId] = useState('');
  const [subCategoryId, setSubCategoryId] = useState('');
  const [place, setPlace] = useState<PickedPlace>({ label: '' });
  const [radius, setRadius] = useState<number | null>(null);
  const [plan, setPlan] = useState<PaymentPlan>('FULL_ON_ACCEPT');

  useEffect(() => {
    (async () => {
      try {
        const cats = await api.get('/marketplace/categories');
        setCategories(cats.data?.data ?? []);
        if (isEdit) {
          const res = await api.get(`/vendor/listings/${listingId}`);
          const l = res.data?.data;
          if (l) {
            setTitle(l.title ?? '');
            setDescription(l.description ?? '');
            setPrice(String(l.price ?? ''));
            setPriceUnit(l.price_unit ?? 'fixed');
            setCategoryId(l.category_id ?? l.category?.id ?? '');
            setSubCategoryId(l.sub_category_id ?? l.sub_category?.id ?? '');
            setPlace({ label: l.location ?? '', lat: l.lat ?? undefined, lng: l.lng ?? undefined });
            setRadius(l.service_radius_miles ?? null);
            setPlan(l.payment_plan ?? l.effective_payment_plan ?? 'FULL_ON_ACCEPT');
            setExisting(l.images ?? []);
          }
        }
      } catch {
        Alert.alert('Error', 'Could not load the package.');
      } finally {
        setLoading(false);
      }
    })();
  }, [listingId, isEdit]);

  const pickImages = async () => {
    const total = images.length + existing.length;
    if (total >= 10) return Alert.alert('Limit reached', 'A package can have up to 10 photos.');
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 10 - total, quality: 0.6 });
    if (!res.canceled) {
      setImages((prev) => [...prev, ...res.assets.map((a, i) => ({ uri: a.uri, type: a.mimeType ?? 'image/jpeg', name: a.fileName ?? `image_${Date.now()}_${i}.jpg` }))]);
    }
  };

  const save = async () => {
    if (!title.trim()) return Alert.alert('Package name', 'Give the package a name customers will recognise.');
    const amount = Number(price);
    if (!price.trim() || Number.isNaN(amount) || amount <= 0) return Alert.alert('Price', 'Enter a price greater than zero.');
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('title', title.trim());
      fd.append('description', description.trim());
      fd.append('price', String(amount));
      fd.append('price_unit', priceUnit);
      // when editing, empty values clear what was there
      if (categoryId || isEdit) fd.append('category_id', categoryId);
      if (subCategoryId || isEdit) fd.append('sub_category_id', subCategoryId);
      const location = place.label.trim();
      if (location || isEdit) fd.append('location', location);
      if (location && place.lat != null && place.lng != null) {
        fd.append('lat', String(place.lat));
        fd.append('lng', String(place.lng));
      }
      if (radius != null) fd.append('service_radius_miles', String(radius));
      fd.append('payment_plan', plan);
      images.forEach((img) => fd.append('images', img as unknown as Blob));
      const config = { headers: { 'Content-Type': 'multipart/form-data' } };
      const res = isEdit ? await api.patch(`/vendor/listings/${listingId}`, fd, config) : await api.post('/vendor/listings', fd, config);
      if (res.data?.success === false) throw new Error(res.data?.message);
      Alert.alert(isEdit ? 'Package updated' : 'Package created', isEdit ? 'Your changes are live.' : 'Publish it from the packages list when you’re ready.', [{ text: 'OK', onPress: () => nav.goBack() }]);
    } catch (err) {
      Alert.alert('Could not save', apiMessage(err, 'Try again in a moment.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <ActivityIndicator color={DARK.accent} style={s.center} />;

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24, gap: 20 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
        <ScreenHeader title={isEdit ? 'Edit Package' : 'Add A Package'} onBack={() => nav.goBack()} />

        <View style={{ paddingHorizontal: 20, gap: 20 }}>
          <View style={{ gap: 10 }}>
            <Pressable style={s.addImage} onPress={pickImages} accessibilityRole="button">
              <Ionicons name="image-outline" size={24} color="#fff" />
              <Text style={s.addImageText}>Add Service Image</Text>
            </Pressable>
            {(existing.length > 0 || images.length > 0) && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                {existing.map((uri, i) => (
                  <Thumb key={`e${i}`} uri={uri} onRemove={() => setExisting((p) => p.filter((_, idx) => idx !== i))} />
                ))}
                {images.map((img, i) => (
                  <Thumb key={`n${i}`} uri={img.uri} onRemove={() => setImages((p) => p.filter((_, idx) => idx !== i))} />
                ))}
              </ScrollView>
            )}
          </View>

          <Field label="Package Name" placeholder="e.g. Full Wedding Coverage" value={title} onChangeText={setTitle} />

          <View style={{ gap: 8 }}>
            <Text style={ui.label}>Package Summary</Text>
            <View style={[ui.field, s.textarea]}>
              <Ionicons name="pencil-outline" size={20} color={DARK.muted} style={{ marginTop: 2 }} />
              <TextInput
                style={[ui.input, { minHeight: 120, textAlignVertical: 'top' }]}
                placeholder="What's included, how long it takes, what you need from the customer..."
                placeholderTextColor={DARK.muted}
                value={description}
                onChangeText={setDescription}
                multiline
              />
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={ui.label}>Service Price</Text>
            <View style={ui.field}>
              <Text style={s.currency}>$</Text>
              <TextInput style={ui.input} placeholder="0.00" placeholderTextColor={DARK.muted} value={price} onChangeText={(t) => setPrice(t.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" />
            </View>
            <View style={s.chips}>
              {PRICE_UNITS.map((u) => <Chip key={u.value} label={u.label} active={priceUnit === u.value} onPress={() => setPriceUnit(u.value)} />)}
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={ui.label}>Category</Text>
            <CategoryPicker
              categories={categories}
              categoryId={categoryId}
              subCategoryId={subCategoryId}
              onChange={(c, sub) => {
                setCategoryId(c);
                setSubCategoryId(sub);
              }}
            />
          </View>

          <View style={{ gap: 8 }}>
            <Text style={ui.label}>How customers pay</Text>
            <View style={s.chips}>{PLANS.map((p) => <Chip key={p.value} label={p.label} active={plan === p.value} onPress={() => setPlan(p.value)} />)}</View>
            <Text style={s.hint}>{PLAN_LABELS[plan]}. Vendly holds the money until the job is done.</Text>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={ui.label}>Location</Text>
            <LocationPicker value={place} onChange={setPlace} radius={radius} onRadiusChange={setRadius} />
          </View>

          <GradientButton title={isEdit ? 'Save Changes' : 'Create Package'} onPress={save} loading={saving} style={{ marginTop: 12 }} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: DARK.bg },
  addImage: { height: 56, borderRadius: 28, backgroundColor: DARK.field, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  addImageText: { color: '#fff', fontSize: 16, fontFamily: FONTS.medium },
  thumb: { width: 88, height: 88, borderRadius: 12, overflow: 'hidden', backgroundColor: DARK.field },
  remove: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  textarea: { height: undefined, paddingVertical: 14, alignItems: 'flex-start' },
  currency: { color: DARK.muted, fontSize: 18, fontFamily: FONTS.medium },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  hint: { color: DARK.muted, fontSize: 12, lineHeight: 18, fontFamily: FONTS.medium },
});
