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
import AddOnSheet, { type AddOnDraft } from '../../components/AddOnSheet';
import { CheckRow } from '../../components/Sheet';
import { AddOnsService, countedUnit, priceText, quantityWord, type AddOn, type AddOnKind } from '../../services/addons.service';
import type { VendorDashboardStackParams } from '../../navigation/types';
import { MAX_INCLUDED_ITEMS, MAX_INCLUDED_ITEM_LENGTH, MAX_MIN_NOTICE_HOURS, noticeHours } from '../../utils/packageDetails';

interface PickedImage { uri: string; type: string; name: string }
/** A custom add-on or fee made in this form, created once the package is saved. */
type NewAddOn = AddOnDraft & { tempId: string };

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
  const [minQ, setMinQ] = useState('');
  const [maxQ, setMaxQ] = useState('');
  // "What's included" lines and the minimum notice (a number of days or hours)
  const [included, setIncluded] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [noticeUnit, setNoticeUnit] = useState<'days' | 'hours'>('days');
  // add-ons and fees: everything the vendor can pick from, what this package offers, and new ones made here
  const [library, setLibrary] = useState<AddOn[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<NewAddOn[]>([]);
  const [addOnsReady, setAddOnsReady] = useState(false);
  const [addOnsTouched, setAddOnsTouched] = useState(false);
  const [newKind, setNewKind] = useState<AddOnKind | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const cats = await api.get('/marketplace/categories');
        setCategories(cats.data?.data ?? []);
        // a failure here only hides the add-ons section; the package itself can still be saved
        Promise.all([AddOnsService.list(undefined, listingId), isEdit ? AddOnsService.forListing(listingId!) : Promise.resolve(null)])
          .then(([lib, mine]) => {
            setLibrary(lib.data?.data ?? []);
            const on = mine?.data?.data;
            if (on) setChosen([...on.add_ons, ...on.fees].map((a) => a.id));
            setAddOnsReady(true);
          })
          .catch(() => {});
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
            setMinQ(l.min_quantity ? String(l.min_quantity) : '');
            setMaxQ(l.max_quantity ? String(l.max_quantity) : '');
            setIncluded(l.included_items ?? []);
            const h: number = l.min_notice_hours ?? 0;
            const days = h >= 24 && h % 24 === 0;
            setNotice(h ? String(days ? h / 24 : h) : '');
            setNoticeUnit(days || !h ? 'days' : 'hours');
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
    const counted = countedUnit(priceUnit);
    const lo = Number(minQ || 0);
    const hi = Number(maxQ || 0);
    if (counted && lo > 0 && hi > 0 && lo > hi) return Alert.alert('Limits', `The minimum ${quantityWord(counted)} can’t be more than the maximum.`);
    const items = included.map((i) => i.trim()).filter(Boolean);
    if (items.length > MAX_INCLUDED_ITEMS) return Alert.alert('What’s included', `Add up to ${MAX_INCLUDED_ITEMS} items.`);
    const noticeH = noticeHours(notice, noticeUnit);
    if (Number.isNaN(noticeH)) return Alert.alert('Minimum notice', 'Enter a whole number.');
    if (noticeH > MAX_MIN_NOTICE_HOURS) return Alert.alert('Minimum notice', 'Minimum notice can be up to 90 days.');
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
      // guests / hours / days limits only apply to counted prices; 0 clears one
      if (counted) {
        fd.append('min_quantity', String(lo));
        fd.append('max_quantity', String(hi));
      }
      // when editing, an empty list or notice clears what was there
      if (items.length || isEdit) fd.append('included_items', JSON.stringify(items));
      if (noticeH || isEdit) fd.append('min_notice_hours', noticeH ? String(noticeH) : '');
      // the photos already on the package that the vendor kept; new ones are added after them
      if (isEdit) fd.append('keep_images', JSON.stringify(existing));
      images.forEach((img) => fd.append('images', img as unknown as Blob));
      const config = { headers: { 'Content-Type': 'multipart/form-data' } };
      const res = isEdit ? await api.patch(`/vendor/listings/${listingId}`, fd, config) : await api.post('/vendor/listings', fd, config);
      if (res.data?.success === false) throw new Error(res.data?.message);
      const id: string | undefined = isEdit ? listingId : res.data?.data?.id;
      const addOnProblem = id ? await saveAddOns(id) : null;
      const done = isEdit ? 'Your changes are live.' : 'Publish it from the packages list when you’re ready.';
      Alert.alert(
        isEdit ? 'Package updated' : 'Package created',
        addOnProblem ? `${done}\n\nThe add-ons and fees weren’t saved: ${addOnProblem} Edit the package to try again.` : done,
        [{ text: 'OK', onPress: () => nav.goBack() }],
      );
    } catch (err) {
      Alert.alert('Could not save', apiMessage(err, 'Try again in a moment.'));
    } finally {
      setSaving(false);
    }
  };

  /** After the package saves: create the new add-ons, then set the package's full list. Returns a problem, or null. */
  const saveAddOns = async (id: string): Promise<string | null> => {
    if (!addOnsReady || (!addOnsTouched && !drafts.length)) return null;
    try {
      const ids: Record<string, string> = {};
      for (const d of drafts) {
        if (!chosen.includes(d.tempId)) continue;
        const { tempId, ...body } = d;
        const res = await AddOnsService.create({ ...body, in_library: !!d.in_library, listing_ids: [id] });
        if (res.data?.data?.id) ids[tempId] = res.data.data.id;
      }
      const final = chosen.map((c) => ids[c] ?? c).filter((c) => !c.startsWith('new:'));
      await AddOnsService.setForListing(id, final);
      setDrafts([]);
      setAddOnsTouched(false);
      return null;
    } catch (err) {
      return apiMessage(err, 'Try again in a moment.');
    }
  };

  const toggleAddOn = (id: string) => {
    setAddOnsTouched(true);
    setChosen((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const addDraft = (d: AddOnDraft) => {
    const tempId = `new:${Date.now()}`;
    setDrafts((prev) => [...prev, { ...d, tempId }]);
    setChosen((prev) => [...prev, tempId]);
    setAddOnsTouched(true);
  };

  if (loading) return <ActivityIndicator color={DARK.accent} style={s.center} />;

  const counted = countedUnit(priceUnit);
  const addOnGroup = (kind: AddOnKind) => {
    const known = library.filter((a) => a.kind === kind);
    const fresh = drafts.filter((d) => d.kind === kind);
    return (
      <View style={{ gap: 4 }}>
        <Text style={s.groupTitle}>{kind === 'FEE' ? 'Fees' : 'Add-ons'}</Text>
        {kind === 'FEE' && <Text style={s.hint}>Fees are only requested after a job, and the customer approves each one before it’s charged.</Text>}
        {known.length === 0 && fresh.length === 0 && <Text style={s.hint}>None yet.</Text>}
        {known.map((a) => (
          <CheckRow
            key={a.id}
            checked={chosen.includes(a.id)}
            onPress={() => toggleAddOn(a.id)}
            title={a.name}
            subtitle={`${a.price_text}${a.in_library ? '' : ' · Just this package (removed if unticked)'}`}
          />
        ))}
        {fresh.map((d) => (
          <CheckRow
            key={d.tempId}
            checked={chosen.includes(d.tempId)}
            onPress={() => toggleAddOn(d.tempId)}
            title={d.name}
            subtitle={`${priceText(d.price, d.price_unit ?? 'FIXED')} · New${d.in_library ? ', saved to your library' : ', just this package'}`}
          />
        ))}
        <Pressable onPress={() => setNewKind(kind)} style={s.addRow} accessibilityRole="button">
          <Ionicons name="add-circle-outline" size={22} color={DARK.accent} />
          <Text style={s.addRowText}>{kind === 'FEE' ? 'Custom fee' : 'Custom add-on'}</Text>
        </Pressable>
      </View>
    );
  };

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
            <Text style={ui.label}>{counted ? `Price per ${counted}` : 'Service Price'}</Text>
            <View style={ui.field}>
              <Text style={s.currency}>$</Text>
              <TextInput style={ui.input} placeholder="0.00" placeholderTextColor={DARK.muted} value={price} onChangeText={(t) => setPrice(t.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" />
            </View>
            <View style={s.chips}>
              {PRICE_UNITS.map((u) => <Chip key={u.value} label={u.label} active={priceUnit === u.value} onPress={() => setPriceUnit(u.value)} />)}
            </View>
            {counted && (
              <>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Field
                      label={`Min ${quantityWord(counted)}`}
                      placeholder="No min"
                      value={minQ}
                      onChangeText={(t) => setMinQ(t.replace(/\D/g, ''))}
                      keyboardType="number-pad"
                      accessibilityLabel={`Fewest ${quantityWord(counted)} a customer can book`}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Field
                      label={`Max ${quantityWord(counted)}`}
                      placeholder="No max"
                      value={maxQ}
                      onChangeText={(t) => setMaxQ(t.replace(/\D/g, ''))}
                      keyboardType="number-pad"
                      accessibilityLabel={`Most ${quantityWord(counted)} a customer can book`}
                    />
                  </View>
                </View>
                <Text style={s.hint}>
                  {counted === 'person'
                    ? 'Customers enter their guest count and pay the price for each guest.'
                    : counted === 'hour'
                      ? 'Customers pay for each hour they book. Shorter bookings pay your minimum.'
                      : 'Customers pay for each day the event runs.'}
                </Text>
              </>
            )}
          </View>

          <View style={{ gap: 8 }}>
            <Text style={ui.label}>What’s included</Text>
            <Text style={s.hint}>One short line each, for example “8 hours of coverage”. Shown as a list on your package.</Text>
            {included.map((item, i) => (
              <View key={i} style={[ui.field, { gap: 8 }]}>
                <TextInput
                  style={ui.input}
                  value={item}
                  maxLength={MAX_INCLUDED_ITEM_LENGTH}
                  placeholder="Included item"
                  placeholderTextColor={DARK.muted}
                  onChangeText={(t) => setIncluded((prev) => prev.map((x, idx) => (idx === i ? t : x)))}
                  accessibilityLabel={`Included item ${i + 1}`}
                />
                <Pressable onPress={() => setIncluded((prev) => prev.filter((_, idx) => idx !== i))} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove included item ${i + 1}`}>
                  <Ionicons name="close-circle" size={22} color={DARK.muted} />
                </Pressable>
              </View>
            ))}
            {included.length < MAX_INCLUDED_ITEMS && (
              <Pressable onPress={() => setIncluded((prev) => [...prev, ''])} style={s.addRow} accessibilityRole="button">
                <Ionicons name="add-circle-outline" size={22} color={DARK.accent} />
                <Text style={s.addRowText}>Add an item</Text>
              </Pressable>
            )}
          </View>

          <View style={{ gap: 8 }}>
            <Field
              label="Minimum notice (optional)"
              placeholder="Any date"
              value={notice}
              onChangeText={(t) => setNotice(t.replace(/\D/g, ''))}
              keyboardType="number-pad"
              accessibilityLabel={`How many ${noticeUnit} ahead customers must book`}
            />
            <View style={s.chips}>
              <Chip label="Days" active={noticeUnit === 'days'} onPress={() => setNoticeUnit('days')} />
              <Chip label="Hours" active={noticeUnit === 'hours'} onPress={() => setNoticeUnit('hours')} />
            </View>
            <Text style={s.hint}>Customers can’t request dates sooner than this.</Text>
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

          {addOnsReady && (
            <View style={{ gap: 12 }}>
              <View style={{ gap: 4 }}>
                <Text style={ui.label}>Add-ons and fees</Text>
                <Text style={s.hint}>Tick what this package offers. Customers see them when they book.</Text>
              </View>
              {addOnGroup('ADD_ON')}
              {addOnGroup('FEE')}
            </View>
          )}

          <GradientButton title={isEdit ? 'Save Changes' : 'Create Package'} onPress={save} loading={saving} style={{ marginTop: 12 }} />
        </View>
      </ScrollView>
      <AddOnSheet visible={!!newKind} kind={newKind ?? 'ADD_ON'} libraryToggle onClose={() => setNewKind(null)} onSubmit={addDraft} />
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
  groupTitle: { color: '#fff', fontSize: 15, fontFamily: FONTS.semibold, marginTop: 4 },
  addRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  addRowText: { color: DARK.accent, fontSize: 15, fontFamily: FONTS.semibold },
});
