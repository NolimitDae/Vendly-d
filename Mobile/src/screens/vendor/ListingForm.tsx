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
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import { api } from '../../services/api';
import type { NativeStackNavigationProp, RouteProp } from '@react-navigation/native-stack';
import type { VendorListingsStackParams } from '../../navigation/types';

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface Category {
  id: string;
  name: string;
}

interface ListingData {
  id: string;
  title: string;
  description: string;
  price: number;
  price_unit: string;
  status: string;
  category_id?: string;
  _count: { bookings: number };
}

type Nav = NativeStackNavigationProp<VendorListingsStackParams, 'ListingForm'>;
type Route = RouteProp<VendorListingsStackParams, 'ListingForm'>;

const PRICE_UNITS = ['per hour', 'per day', 'per night', 'per event'];

// ─── Component ────────────────────────────────────────────────────────────────

export default function ListingForm() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Route>();
  const listingId = route.params?.listingId;
  const isEdit = Boolean(listingId);

  const [loadingForm, setLoadingForm] = useState(isEdit);
  const [categories, setCategories] = useState<Category[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [priceUnit, setPriceUnit] = useState('per hour');
  const [categoryId, setCategoryId] = useState('');
  const [showPriceUnitPicker, setShowPriceUnitPicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  // Validation
  const [errors, setErrors] = useState<{ title?: string; price?: string }>({});

  useEffect(() => {
    const loadData = async () => {
      try {
        const catRes = await api.get('/marketplace/categories');
        if (catRes.data?.success) setCategories(catRes.data.data ?? []);
      } catch {
        // ignore
      }

      if (isEdit && listingId) {
        try {
          const res = await api.get(`/vendor/listings/${listingId}`);
          if (res.data?.success) {
            const d: ListingData = res.data.data;
            setTitle(d.title ?? '');
            setDescription(d.description ?? '');
            setPrice(String(d.price ?? ''));
            setPriceUnit(d.price_unit ?? 'per hour');
            setCategoryId(d.category_id ?? '');
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

  const validate = (): boolean => {
    const errs: { title?: string; price?: string } = {};
    if (!title.trim()) errs.title = 'Title is required';
    if (!price.trim() || isNaN(Number(price)) || Number(price) <= 0) {
      errs.price = 'A valid price is required';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        price: parseFloat(price),
        price_unit: priceUnit,
        ...(categoryId ? { category_id: categoryId } : {}),
      };

      if (isEdit && listingId) {
        await api.patch(`/vendor/listings/${listingId}`, payload);
      } else {
        await api.post('/vendor/listings', payload);
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
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={s.root}
        contentContainerStyle={{ paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.formWrap}>
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
              <TouchableOpacity
                style={s.unitPicker}
                onPress={() => setShowPriceUnitPicker(!showPriceUnitPicker)}
              >
                <Text style={s.unitPickerText}>{priceUnit}</Text>
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
                    <Text style={[s.pickerOptionText, priceUnit === unit && s.pickerOptionTextActive]}>
                      {unit}
                    </Text>
                    {priceUnit === unit && <Ionicons name="checkmark" size={16} color={COLORS.primary} />}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Category */}
          <View style={s.field}>
            <Text style={s.label}>Category</Text>
            <TouchableOpacity
              style={s.input}
              onPress={() => setShowCategoryPicker(!showCategoryPicker)}
            >
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
                  <Text style={[s.pickerOptionText, !categoryId && s.pickerOptionTextActive]}>
                    None
                  </Text>
                </TouchableOpacity>
                {categories.map((cat) => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[s.pickerOption, categoryId === cat.id && s.pickerOptionActive]}
                    onPress={() => { setCategoryId(cat.id); setShowCategoryPicker(false); }}
                  >
                    <Text style={[s.pickerOptionText, categoryId === cat.id && s.pickerOptionTextActive]}>
                      {cat.name}
                    </Text>
                    {categoryId === cat.id && <Ionicons name="checkmark" size={16} color={COLORS.primary} />}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Submit */}
          <TouchableOpacity style={s.submitBtn} onPress={handleSubmit} disabled={submitting}>
            {submitting ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.gray[50] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  formWrap: { padding: 20 },
  field: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: COLORS.gray[700], marginBottom: 6 },
  required: { color: '#ef4444' },
  input: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.gray[200],
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: COLORS.gray[900],
  },
  inputError: { borderColor: '#ef4444' },
  inputMultiline: { minHeight: 120, paddingTop: 13 },
  inputText: { fontSize: 15, color: COLORS.gray[900] },
  inputPlaceholder: { fontSize: 15, color: COLORS.gray[400] },
  priceRow: { flexDirection: 'row', gap: 10 },
  priceInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.gray[200],
    paddingHorizontal: 14,
  },
  currencySymbol: { fontSize: 16, color: COLORS.gray[500], marginRight: 4 },
  priceInput: { flex: 1, fontSize: 15, color: COLORS.gray[900], paddingVertical: 13 },
  unitPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.gray[200],
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  unitPickerText: { fontSize: 14, color: COLORS.gray[700], fontWeight: '500' },
  pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pickerDropdown: {
    marginTop: 4,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.gray[200],
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray[100],
  },
  pickerOptionActive: { backgroundColor: COLORS.primaryBg },
  pickerOptionText: { fontSize: 14, color: COLORS.gray[700] },
  pickerOptionTextActive: { color: COLORS.primary, fontWeight: '600' },
  errorText: { fontSize: 12, color: '#ef4444', marginTop: 4 },
  submitBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  submitBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 16 },
  cancelBtn: { alignItems: 'center', marginTop: 14 },
  cancelBtnText: { fontSize: 15, color: COLORS.gray[500], fontWeight: '600' },
});
