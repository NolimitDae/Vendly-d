import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Chip, Field, GradientButton, ScreenHeader, ui } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import { MarketplaceService, type Category } from '../../services/marketplace.service';
import SearchFilters, { type Filters } from '../../components/SearchFilters';
import { useAuth } from '../../context/AuthContext';
import type { CustomerHomeStackParams } from '../../navigation/types';

export default function FindVendors({ navigation, route }: NativeStackScreenProps<CustomerHomeStackParams, 'FindVendors'>) {
  const eventId = route.params?.eventId;
  const insets = useSafeAreaInsets();
  const [categories, setCategories] = useState<Category[]>([]);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<Category | null>(null);
  // start from the location on their profile; they can change it for this search
  const { user } = useAuth();
  const [location, setLocation] = useState(((user as any)?.address as string | undefined) ?? '');
  const [filters, setFilters] = useState<Filters>({});

  useEffect(() => {
    MarketplaceService.getCategories().then((r) => setCategories(r.data?.data ?? [])).catch(() => {});
  }, []);

  const find = () =>
    navigation.navigate('SearchResults', {
      q: q.trim() || undefined,
      categoryId: category?.id,
      categoryName: category?.name,
      location: location.trim() || undefined,
      eventId,
      filters,
    });

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 20, gap: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenHeader title="Find Vendors" onBack={() => navigation.goBack()} />

        <View style={s.search}>
          <Ionicons name="search-outline" size={20} color={DARK.muted} />
          <TextInput
            style={s.searchInput}
            placeholder="Search service & locations"
            placeholderTextColor={DARK.muted}
            value={q}
            onChangeText={setQ}
            onSubmitEditing={find}
            returnKeyType="search"
          />
        </View>

        <View style={s.chips}>
          {categories.map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              active={category?.id === c.id}
              onPress={() => setCategory(category?.id === c.id ? null : c)}
              icon={<Ionicons name="pricetag-outline" size={16} color={category?.id === c.id ? '#fff' : DARK.muted} />}
            />
          ))}
        </View>

        <View style={{ paddingHorizontal: 20, gap: 16 }}>
          <View style={{ gap: 8 }}>
            <Text style={ui.label}>Location</Text>
            <View style={ui.field}>
              <Ionicons name="location-outline" size={20} color={DARK.muted} />
              <TextInput
                style={ui.input}
                placeholder="Enter your location"
                placeholderTextColor={DARK.muted}
                value={location}
                onChangeText={setLocation}
                onSubmitEditing={find}
                returnKeyType="search"
              />
            </View>
          </View>
          <SearchFilters value={filters} onChange={setFilters} />
          <GradientButton title="Find Vendors" onPress={find} style={{ marginTop: 12 }} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    paddingHorizontal: 14,
    height: 50,
    borderRadius: 99,
    backgroundColor: DARK.field,
    borderWidth: 1,
    borderColor: DARK.border,
  },
  searchInput: { flex: 1, color: '#fff', fontSize: 16, fontFamily: FONTS.regular, paddingVertical: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 20 },
});
