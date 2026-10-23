import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ui } from './brand';
import { DARK, FONTS } from '../constants/colors';

export interface PickerCategory {
  id: string;
  name: string;
  sub_categories?: { id: string; name: string }[];
}

interface Row {
  key: string;
  categoryId: string;
  subId: string | null;
  title: string;
  subtitle?: string;
}

/** Rows for every category and its sub-categories that match the search (a matching category shows all of its own). */
export function categoryRows(categories: PickerCategory[], query: string): Row[] {
  const q = query.trim().toLowerCase();
  const rows: Row[] = [];
  for (const c of categories) {
    const catHit = !q || c.name.toLowerCase().includes(q);
    const subs = (c.sub_categories ?? []).filter((s) => catHit || s.name.toLowerCase().includes(q));
    if (!catHit && !subs.length) continue;
    rows.push({ key: c.id, categoryId: c.id, subId: null, title: c.name, subtitle: q && !catHit ? undefined : 'Any type' });
    for (const s of subs) rows.push({ key: `${c.id}/${s.id}`, categoryId: c.id, subId: s.id, title: s.name, subtitle: c.name });
  }
  return rows;
}

/** A searchable category and sub-category picker for packages (type "DJ", "florist", "cake"...). */
export default function CategoryPicker({
  categories,
  categoryId,
  subCategoryId,
  onChange,
}: {
  categories: PickerCategory[];
  categoryId: string;
  subCategoryId: string;
  onChange: (categoryId: string, subCategoryId: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rows = useMemo(() => categoryRows(categories, query), [categories, query]);

  const cat = categories.find((c) => c.id === categoryId);
  const sub = cat?.sub_categories?.find((s) => s.id === subCategoryId);
  const label = cat ? (sub ? `${cat.name} › ${sub.name}` : cat.name) : '';

  const pick = (r: Row) => {
    onChange(r.categoryId, r.subId ?? '');
    setOpen(false);
    setQuery('');
  };

  return (
    <>
      <Pressable style={ui.field} onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={label ? `Category: ${label}. Change` : 'Choose a category'}>
        <Ionicons name="pricetags-outline" size={20} color={DARK.muted} />
        <Text style={[ui.input, !label && { color: DARK.muted }]} numberOfLines={1}>
          {label || 'Search categories, e.g. DJ, florist, cake'}
        </Text>
        <Ionicons name="chevron-down" size={18} color={DARK.muted} />
      </Pressable>

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <View style={[s.sheet, { paddingBottom: insets.bottom }]}>
          <View style={s.header}>
            <Text style={s.title}>Category</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={24} color="#fff" />
            </Pressable>
          </View>
          <View style={[ui.field, { marginHorizontal: 20 }]}>
            <Ionicons name="search-outline" size={20} color={DARK.muted} />
            <TextInput
              style={ui.input}
              placeholder="Search, e.g. DJ, florist, cake"
              placeholderTextColor={DARK.muted}
              value={query}
              onChangeText={setQuery}
              autoFocus
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel="Search categories"
            />
            {!!query && (
              <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Clear search">
                <Ionicons name="close-circle" size={20} color={DARK.muted} />
              </Pressable>
            )}
          </View>
          <FlatList
            data={rows}
            keyExtractor={(r) => r.key}
            keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
            contentContainerStyle={{ paddingVertical: 12 }}
            ListEmptyComponent={
              <Text style={s.empty}>{categories.length ? 'Nothing matches. Try another word, or pick the closest category.' : 'No categories yet.'}</Text>
            }
            renderItem={({ item }) => {
              const selected = item.categoryId === categoryId && (item.subId ?? '') === (subCategoryId ?? '');
              return (
                <Pressable style={[s.row, !item.subId && s.catRow]} onPress={() => pick(item)} accessibilityRole="button" accessibilityState={{ selected }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.rowTitle, !item.subId && s.catTitle]}>{item.title}</Text>
                    {!!item.subtitle && <Text style={s.rowSub}>{item.subtitle}</Text>}
                  </View>
                  {selected && <Ionicons name="checkmark-circle" size={22} color={DARK.accent} />}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: DARK.bg, paddingTop: 16, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  title: { color: '#fff', fontSize: 18, fontFamily: FONTS.semibold },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingLeft: 36, paddingVertical: 12, gap: 12 },
  catRow: { paddingLeft: 20, marginTop: 8 },
  rowTitle: { color: '#fff', fontSize: 15, fontFamily: FONTS.regular },
  catTitle: { fontFamily: FONTS.semibold, fontSize: 16 },
  rowSub: { color: DARK.muted, fontSize: 12, fontFamily: FONTS.regular, marginTop: 2 },
  empty: { color: DARK.muted, fontSize: 14, textAlign: 'center', padding: 32, fontFamily: FONTS.regular },
});
