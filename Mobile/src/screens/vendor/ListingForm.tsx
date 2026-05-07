import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Image,
  FlatList,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import { api } from '../../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStackNavigationProp, RouteProp } from '@react-navigation/native-stack';
import type { VendorListingsStackParams } from '../../navigation/types';

interface Category { id: string; name: string; }
interface PickedImage { uri: string; type: string; name: string; }

type Nav = NativeStackNavigationProp<VendorListingsStackParams, 'ListingForm'>;
type Route = RouteProp<VendorListingsStackParams, 'ListingForm'>;

const PRICE_UNITS = ['fixed', 'hour', 'day', 'event', 'person'];

export default function ListingForm() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Route>();
  const listingId = route.params?.listingId;
  const isEdit = Boolean(listingId);

  const [loadingForm, setLoadingForm] = useState(isEdit);
  const [categories, setCategories] = useState<Category[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [images, setImages] = useState<PickedImage[]>([]);
  const [existingImages, setExistingImages] = useState<string[]>([]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [priceUnit, setPriceUnit] = useState('fixed');
  const [categoryId, setCategoryId] = useState('');
  const [location, setLocation] = useState('');
  const [showPriceUnitPicker, setShowPriceUnitPicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; price?: string }>({});

  useEffect(() => {
    const loadData = async () => {
      try {
        const catRes = await api.get('/marketplace/categories');
        if (catRes.data?.success) setCategories(catRes.data.data ?? []);
      } catch { /* ignore */ }

      if (isEdit && listingId) {
        try {
          const res = await api.get(`/vendor/listings/${listingId}`);
          if (res.data?.success) {
            const d = res.data.data;
            setTitle(d.title ?? '');
            setDescription(d.description ?? '');
            setPrice(String(d.price ?? ''));
            setPriceUnit(d.price_unit ?? 'fixed');
            setCategoryId(d.category_id ?? '');
            setLocation(d.location ?? '');
            setExistingImages(d.images ?? []);
          }
        } catch {
          Alert.alert('Error', 'Failed to load listing details.');
          nav.goBack();
        } finally {
          setLoadingForm(false);
        }
      } else {
        setLoadingForm(false);
      }
    };
    loadData();
  }, [listingId, isEdit]);

  const pickImages = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library.');
      return;
    }
    const total = images.length + existingImages.length;
    if (total >= 10) {
      Alert.alert('Limit reached', 'You can add up to 10 images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 10 - total,
      quality: 0.8,
    });
    if (!result.canceled) {
      const picked: PickedImage[] = result.assets.map((a, i) => ({
        uri: a.uri,
        type: a.mimeType ?? 'image/jpeg',
        name: a.fileName ?? `image_${Date.now()}_${i}.jpg`,
      }));
      setImages((prev) => [...prev, ...picked]);
    }
  };

  const removeNewImage = (i: number) => setImages((prev) => prev.filter((_, idx) => idx !== i));
  const removeExistingImage = (i: number) => setExistingImages((prev) => prev.filter((_, idx) => idx !== i));

  const validate = (): boolean => {
    const errs: { title?: string; price?: string } = {};
    if (!title.trim()) errs.title = 'Title is required';
    if (!price.trim() || isNaN(Number(price)) || Number(price) <= 0)
      errs.price = 'A valid price is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const fd = new FormData();
      fd.append('title', title.trim());
      fd.append('description', description.trim());
      fd.append('price', String(parseFloat(price)));
      fd.append('price_unit', priceUnit);
      if (categoryId) fd.append('category_id', categoryId);
      if (location) fd.append('location', location.trim());
      images.forEach((img) => fd.append('images', { uri: img.uri, type: img.type, name: img.name } as any));

      const config = { headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${token}` } };

      if (isEdit && listingId) {
        await api.patch(`/vendor/listings/${listingId}`, fd, config);
      } else {
        await api.post('/vendor/listings', fd, config);
      }

      Alert.alert('Success', isEdit ? 'Listing updated.' : 'Listing created.', [
        { text: 'OK', onPress: () => nav.navigate('VendorListings') },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message ?? 'Failed to save listing.');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCategory = categories.find((c) => c.id === categoryId);

  if (loadingForm) {
    return <View style={s.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  }

  const allImages = [
    ...existingImages.map((u) => ({ uri: u, existing: true, idx: existingImages.indexOf(u) })),
    ...images.map((img, i) => ({ uri: img.uri, existing: false, idx: i })),
  ];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={s.root} contentContainerStyle={{ paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <View style={s.formWrap}>

          {/* Photos */}
          <View style={s.field}>
            <Text style={s.label}>Photos</Text>
            <View style={s.gallery}>
              {allImages.map((item) => (
                <View key={`${item.existing ? 'ex' : 'new'}-${item.idx}`} style={s.thumb}>
                  <Image source={{ uri: item.uri }} style={s.thumbImg} />
                  <TouchableOpacity
                    style={s.thumbRemove}
                    onPress={() => item.existing ? removeExistingImage(item.idx) : removeNewImage(item.idx)}
                  >
                    <Ionicons name="close-circle" size={20} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              ))}
              {allImages.length < 10 && (
                <TouchableOpacity style={s.addPhotoBtn} onPress={pickImages}>
                  <Ionicons name="camera-outline" size={28} color={COLORS.gray[400]} />
                  <Text style={s.addPhotoText}>Add Photos</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={s.hint}>{allImages.length}/10 photos</Text>
          </View>

          {/* Title */}
          <View style={s.field}>
            <Text style={s.label}>Title <Text style={s.required}>*</Text></Text>
            <TextInput
              style={[s.input, errors.title ? s.inputError : null]}
              placeholder="e.g. Professional Wedding Photography"
              placeholderTextColor={COLORS.gray[400]}
              value={title}
              onChangeText={(v) => { setTitle(v); setErrors((e) => ({ ...e, title: undefined })); }}
            />
            {errors.title ? <Text style={s.errorText}>{errors.title}</Text> : null}
          </View>

          {/* Description */}
          <View style={s.field}>
            <Text style={s.label}>Description</Text>
            <TextInput
              style={[s.input, s.inputMultiline]}
              placeholder="Describe your service in detail..."
              placeholderTextColor={COLORS.gray[400]}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />
          </View>

          {/* Price */}
          <View style={s.field}>
            <Text style={s.label}>Price <Text style={s.required}>*</Text></Text>
            <View style={s.priceRow}>
              <View style={[s.priceInputWrap, errors.price ? s.inputError : null]}>
                <Text style={s.currencySymbol}>$</Text>
                <TextInput
                  style={s.priceInput}
                  placeholder="0.00"
                  placeholderTextColor={COLORS.gray[400]}
                  value={price}
                  onChangeText={(v) => { setPrice(v); setErrors((e) => ({ ...e, price: undefined })); }}
                  keyboardType="decimal-pad"
                />
              </View>
              <TouchableOpacity style={s.unitPicker} onPress={() => setShowPriceUnitPicker(!showPriceUnitPicker)}>
                <Text style={s.unitPickerText}>per {priceUnit}</Text>
                <Ionicons name="chevron-down" size={14} color={COLORS.gray[500]} />
              </TouchableOpacity>
            </View>
            {errors.price ? <Text style={s.errorText}>{errors.price}</Text> : null}
            {showPriceUnitPicker && (
              <View style={s.pickerDropdown}>
                {PRICE_UNITS.map((unit) => (
                  <TouchableOpacity
                    key={unit}
                    style={[s.pickerOption, priceUnit === unit && s.pickerOptionActive]}
                    onPress={() => { setPriceUnit(unit); setShowPriceUnitPicker(false); }}
                  >
                    <Text style={[s.pickerOptionText, priceUnit === unit && s.pickerOptionTextActive]}>per {unit}</Text>
                    {priceUnit === unit && <Ionicons name="checkmark" size={16} color={COLORS.primary} />}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Category */}
          <View style={s.field}>
            <Text style={s.label}>Category</Text>
            <TouchableOpacity style={s.input} onPress={() => setShowCategoryPicker(!showCategoryPicker)}>
              <View style={s.pickerRow}>
                <Text style={selectedCategory ? s.inputText : s.inputPlaceholder}>
                  {selectedCategory?.name ?? 'Select a category (optional)'}
                </Text>
                <Ionicons name="chevron-down" size={14} color={COLORS.gray[500]} />
              </View>
            </TouchableOpacity>
            {showCategoryPicker && categories.length > 0 && (
              <View style={s.pickerDropdown}>
                <TouchableOpacity
                  style={[s.pickerOption, !categoryId && s.pickerOptionActive]}
                  onPress={() => { setCategoryId(''); setShowCategoryPicker(false); }}
                >
                  <Text style={[s.pickerOptionText, !categoryId && s.pickerOptionTextActive]}>None</Text>
                </TouchableOpacity>
                {categories.map((cat) => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[s.pickerOption, categoryId === cat.id && s.pickerOptionActive]}
                    onPress={() => { setCategoryId(cat.id); setShowCategoryPicker(false); }}
                  >
                    <Text style={[s.pickerOptionText, categoryId === cat.id && s.pickerOptionTextActive]}>{cat.name}</Text>
                    {categoryId === cat.id && <Ionicons name="checkmark" size={16} color={COLORS.primary} />}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Location */}
          <View style={s.field}>
            <Text style={s.label}>Location</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. New York, NY"
              placeholderTextColor={COLORS.gray[400]}
              value={location}
              onChangeText={setLocation}
            />
          </View>

          <TouchableOpacity style={s.submitBtn} onPress={handleSubmit} disabled={submitting}>
            {submitting ? <ActivityIndicator color={COLORS.white} /> : (
              <Text style={s.submitBtnText}>{isEdit ? 'Save Changes' : 'Create Listing'}</Text>
            )}
          </TouchableOpacity>
          {isEdit && (
            <TouchableOpacity style={s.cancelBtn} onPress={() => nav.goBack()}>
              <Text style={s.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const THUMB = 88;
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.gray[50] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  formWrap: { padding: 20 },
  field: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: COLORS.gray[700], marginBottom: 6 },
  required: { color: '#ef4444' },
  hint: { fontSize: 11, color: COLORS.gray[400], marginTop: 4 },
  gallery: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  thumb: { width: THUMB, height: THUMB, borderRadius: 10, overflow: 'visible' },
  thumbImg: { width: THUMB, height: THUMB, borderRadius: 10 },
  thumbRemove: { position: 'absolute', top: -8, right: -8, backgroundColor: COLORS.white, borderRadius: 10 },
  addPhotoBtn: {
    width: THUMB, height: THUMB, borderRadius: 10,
    borderWidth: 2, borderColor: COLORS.gray[200], borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  addPhotoText: { fontSize: 10, color: COLORS.gray[400], fontWeight: '600' },
  input: { backgroundColor: COLORS.white, borderRadius: 12, borderWidth: 1, borderColor: COLORS.gray[200], paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: COLORS.gray[900] },
  inputError: { borderColor: '#ef4444' },
  inputMultiline: { minHeight: 120, paddingTop: 13 },
  inputText: { fontSize: 15, color: COLORS.gray[900] },
  inputPlaceholder: { fontSize: 15, color: COLORS.gray[400] },
  priceRow: { flexDirection: 'row', gap: 10 },
  priceInputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 12, borderWidth: 1, borderColor: COLORS.gray[200], paddingHorizontal: 14 },
  currencySymbol: { fontSize: 16, color: COLORS.gray[500], marginRight: 4 },
  priceInput: { flex: 1, fontSize: 15, color: COLORS.gray[900], paddingVertical: 13 },
  unitPicker: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.white, borderRadius: 12, borderWidth: 1, borderColor: COLORS.gray[200], paddingHorizontal: 14, paddingVertical: 13 },
  unitPickerText: { fontSize: 14, color: COLORS.gray[700], fontWeight: '500' },
  pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pickerDropdown: { marginTop: 4, backgroundColor: COLORS.white, borderRadius: 12, borderWidth: 1, borderColor: COLORS.gray[200], overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 3 },
  pickerOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.gray[100] },
  pickerOptionActive: { backgroundColor: COLORS.primaryBg },
  pickerOptionText: { fontSize: 14, color: COLORS.gray[700] },
  pickerOptionTextActive: { color: COLORS.primary, fontWeight: '600' },
  errorText: { fontSize: 12, color: '#ef4444', marginTop: 4 },
  submitBtn: { backgroundColor: COLORS.primary, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 8 },
  submitBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 16 },
  cancelBtn: { alignItems: 'center', marginTop: 14 },
  cancelBtnText: { fontSize: 15, color: COLORS.gray[500], fontWeight: '600' },
});
