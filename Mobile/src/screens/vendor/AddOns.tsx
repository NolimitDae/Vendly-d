import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BrandGradient, Chip, GradientButton, ScreenHeader } from '../../components/brand';
import AddOnSheet, { type AddOnDraft } from '../../components/AddOnSheet';
import Sheet, { CheckRow } from '../../components/Sheet';
import { DARK, FONTS } from '../../constants/colors';
import { api } from '../../services/api';
import { AddOnsService, plural, type AddOn, type AddOnKind, type AddOnSuggestion } from '../../services/addons.service';
import { apiMessage } from '../auth/SignIn';
import { haptic } from '../../utils/haptics';
import type { VendorDashboardStackParams } from '../../navigation/types';

interface Pkg { id: string; title: string; status: string; price: number; price_unit?: string }

const TABS: { value: AddOnKind; label: string }[] = [
  { value: 'ADD_ON', label: 'Add-ons' },
  { value: 'FEE', label: 'Fees' },
];

/** The vendor's library of add-ons and fees, and which packages offer each one. */
export default function AddOns() {
  const nav = useNavigation<NativeStackNavigationProp<VendorDashboardStackParams>>();
  const route = useRoute<RouteProp<VendorDashboardStackParams, 'AddOns'>>();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<AddOnKind>(route.params?.tab ?? 'ADD_ON');
  const [items, setItems] = useState<AddOn[]>([]);
  const [ideas, setIdeas] = useState<Record<AddOnKind, AddOnSuggestion[]>>({ ADD_ON: [], FEE: [] });
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<Partial<AddOn> | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [attachMode, setAttachMode] = useState<'add' | 'remove' | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [attaching, setAttaching] = useState(false);

  // the dashboard's Add-ons and Fees tiles both land here
  useEffect(() => {
    if (route.params?.tab) setTab(route.params.tab);
  }, [route.params?.tab]);

  const load = useCallback(async () => {
    try {
      const [lib, pk] = await Promise.all([AddOnsService.list(), api.get('/vendor/listings', { params: { limit: 100 } })]);
      setItems(lib.data?.data ?? []);
      if (pk.data?.success) setPackages((pk.data.data ?? []).filter((p: Pkg) => p.status !== 'ARCHIVED'));
    } catch (err) {
      Alert.alert('Could not load', apiMessage(err, 'Pull down to try again.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    if (ideas[tab].length) return;
    AddOnsService.suggestions(tab)
      .then((r) => setIdeas((prev) => ({ ...prev, [tab]: r.data?.data ?? [] })))
      .catch(() => {});
  }, [tab, ideas]);

  const list = items.filter((a) => a.kind === tab);
  const word = tab === 'FEE' ? 'fee' : 'add-on';
  const taken = new Set(list.map((a) => a.name.toLowerCase()));
  const freshIdeas = ideas[tab].filter((i) => !taken.has(i.name.toLowerCase()));

  const switchTab = (t: AddOnKind) => {
    setTab(t);
    setSelecting(false);
    setSelected([]);
  };

  const save = async (d: AddOnDraft) => {
    const body = { name: d.name, description: d.description ?? '', price: d.price, price_unit: d.price_unit, max_quantity: d.max_quantity ?? null };
    if (editing?.id) {
      const res = await AddOnsService.update(editing.id, body);
      const updated = res.data?.data;
      if (updated) setItems((prev) => prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)));
    } else {
      const res = await AddOnsService.create({ ...body, description: d.description, kind: tab, in_library: true });
      if (res.data?.data) setItems((prev) => [...prev, { ...res.data.data, listing_ids: res.data.data.listing_ids ?? [] }]);
    }
    haptic.success();
  };

  const remove = (a: AddOn) =>
    Alert.alert(`Delete “${a.name}”?`, a.listing_ids?.length ? `It comes off ${plural(a.listing_ids.length, 'package')}. Bookings already made keep it.` : 'Bookings already made keep it.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await AddOnsService.remove(a.id);
            setItems((prev) => prev.filter((x) => x.id !== a.id));
          } catch (err) {
            Alert.alert('Could not delete', apiMessage(err, 'Try again in a moment.'));
          }
        },
      },
    ]);

  const toggleSelected = (id: string) => {
    haptic.select();
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const openAttach = (mode: 'add' | 'remove') => {
    if (!packages.length) return Alert.alert('No packages yet', 'Create a package first, then add these to it.');
    setTargets([]);
    setAttachMode(mode);
  };

  const attach = async () => {
    if (!attachMode || !targets.length) return;
    setAttaching(true);
    try {
      const res = await AddOnsService.attach(selected, targets, attachMode);
      haptic.success();
      const n = attachMode === 'add' ? res.data?.data?.added : res.data?.data?.removed;
      setAttachMode(null);
      setSelecting(false);
      setSelected([]);
      await load();
      Alert.alert(
        attachMode === 'add' ? 'Added to packages' : 'Removed from packages',
        n === 0 ? 'Nothing changed. They were already set that way.' : `Updated ${plural(targets.length, 'package')}.`,
      );
    } catch (err) {
      Alert.alert('Could not update packages', apiMessage(err, 'Try again in a moment.'));
    } finally {
      setAttaching(false);
    }
  };

  const header = (
    <View style={{ gap: 20 }}>
      <ScreenHeader
        title="Add-ons & fees"
        onBack={() => nav.goBack()}
        right={
          list.length > 0 ? (
            <Pressable
              onPress={() => {
                haptic.select();
                setSelecting((v) => !v);
                setSelected([]);
              }}
              hitSlop={8}
              style={s.headerBtn}
              accessibilityRole="button"
              accessibilityLabel={selecting ? 'Stop selecting' : `Select ${word}s to add to packages`}
            >
              <Text style={s.link}>{selecting ? 'Done' : 'Select'}</Text>
            </Pressable>
          ) : undefined
        }
      />
      <View style={{ paddingHorizontal: 20, gap: 14 }}>
        <View style={s.tabs} accessibilityRole="tablist">
          {TABS.map((t) => {
            const on = tab === t.value;
            return (
              <Pressable
                key={t.value}
                style={{ flex: 1 }}
                onPress={() => {
                  haptic.select();
                  switchTab(t.value);
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
              >
                {on ? (
                  <BrandGradient style={s.tab}><Text style={[s.tabText, { color: '#fff' }]}>{t.label}</Text></BrandGradient>
                ) : (
                  <View style={s.tab}><Text style={s.tabText}>{t.label}</Text></View>
                )}
              </Pressable>
            );
          })}
        </View>
        <Text style={s.body}>
          {tab === 'FEE'
            ? 'Fees are only requested after a job, and the customer approves each one before it’s charged. Listing them on a package shows customers up front.'
            : 'Extras customers can pick when they book, like a bartender or extra hours. You can also send one during a booking.'}
        </Text>
        {freshIdeas.length > 0 && (
          <View style={{ gap: 8 }}>
            <Text style={s.label}>Start from an idea</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
              {freshIdeas.map((i) => (
                <Chip
                  key={i.name}
                  label={i.name}
                  icon={<Ionicons name="add" size={16} color={DARK.muted} />}
                  onPress={() => setEditing({ name: i.name, price_unit: i.price_unit, description: i.description ?? null })}
                />
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    </View>
  );

  return (
    <View style={s.root}>
      <FlatList
        data={list}
        keyExtractor={(a) => a.id}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 120, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={DARK.accent} />}
        ListHeaderComponent={header}
        ListHeaderComponentStyle={{ marginBottom: 8 }}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={DARK.accent} style={{ marginTop: 32 }} />
          ) : (
            <View style={s.empty}>
              <Ionicons name={tab === 'FEE' ? 'receipt-outline' : 'pricetags-outline'} size={40} color={DARK.muted} />
              <Text style={s.emptyTitle}>No {word}s yet</Text>
              <Text style={[s.body, { textAlign: 'center' }]}>Pick an idea above or make your own.</Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const on = selected.includes(item.id);
          const count = item.listing_ids?.length ?? 0;
          return (
            // the row and its delete button are siblings so screen readers reach both
            <View style={[s.card, selecting && on && s.cardOn]}>
              <Pressable
                style={s.cardMain}
                onPress={() => (selecting ? toggleSelected(item.id) : setEditing(item))}
                onLongPress={() => {
                  if (selecting) return;
                  setSelecting(true);
                  toggleSelected(item.id);
                }}
                accessibilityRole={selecting ? 'checkbox' : 'button'}
                accessibilityState={selecting ? { checked: on } : undefined}
                accessibilityLabel={`${item.name}, ${item.price_text}, on ${plural(count, 'package')}`}
                accessibilityHint={selecting ? undefined : 'Opens it to edit. Long press to select.'}
              >
                {selecting && <Ionicons name={on ? 'checkbox' : 'square-outline'} size={24} color={on ? DARK.accent : DARK.muted} />}
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={s.title} numberOfLines={1}>{item.name}</Text>
                  <Text style={s.price}>{item.price_text}{item.max_quantity ? ` · up to ${item.max_quantity}` : ''}</Text>
                  <Text style={s.muted}>{count ? `On ${plural(count, 'package')}` : 'Not on any package yet'}</Text>
                </View>
              </Pressable>
              {!selecting && (
                <Pressable onPress={() => remove(item)} style={s.iconBtn} accessibilityRole="button" accessibilityLabel={`Delete ${item.name}`}>
                  <Ionicons name="trash-outline" size={20} color={DARK.muted} />
                </Pressable>
              )}
            </View>
          );
        }}
      />

      <View style={[s.footer, { paddingBottom: insets.bottom + 16 }]}>
        {selecting ? (
          <View style={{ gap: 10 }}>
            <Text style={s.footerHint}>{selected.length ? `${selected.length} selected` : `Tap ${word}s to select them`}</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                style={[s.outline, !selected.length && { opacity: 0.4 }]}
                disabled={!selected.length}
                onPress={() => openAttach('remove')}
                accessibilityRole="button"
                accessibilityState={{ disabled: !selected.length }}
              >
                <Text style={s.outlineText}>Remove from packages</Text>
              </Pressable>
              <GradientButton title="Add to packages" onPress={() => openAttach('add')} disabled={!selected.length} style={{ flex: 1 }} />
            </View>
          </View>
        ) : (
          <GradientButton title={tab === 'FEE' ? 'New fee' : 'New add-on'} onPress={() => setEditing({})} />
        )}
      </View>

      <AddOnSheet visible={!!editing} kind={tab} initial={editing} onClose={() => setEditing(null)} onSubmit={save} />

      <Sheet
        visible={!!attachMode}
        onClose={() => setAttachMode(null)}
        title={attachMode === 'remove' ? 'Remove from packages' : 'Add to packages'}
        subtitle={`${plural(selected.length, word)} selected. Choose the packages.`}
        footer={
          <GradientButton
            title={targets.length ? `${attachMode === 'remove' ? 'Remove from' : 'Add to'} ${plural(targets.length, 'package')}` : 'Choose packages'}
            onPress={attach}
            loading={attaching}
            disabled={!targets.length}
          />
        }
      >
        <CheckRow
          checked={targets.length === packages.length && packages.length > 0}
          onPress={() => setTargets(targets.length === packages.length ? [] : packages.map((p) => p.id))}
          title="All packages"
        />
        <View style={s.divider} />
        {packages.map((p) => (
          <CheckRow
            key={p.id}
            checked={targets.includes(p.id)}
            onPress={() => {
              haptic.select();
              setTargets((prev) => (prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id]));
            }}
            title={p.title}
            subtitle={p.status === 'ACTIVE' ? 'Live' : p.status === 'PAUSED' ? 'Paused' : 'Draft'}
          />
        ))}
      </Sheet>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  headerBtn: { minWidth: 48, height: 48, alignItems: 'flex-end', justifyContent: 'center' },
  link: { color: DARK.accent, fontSize: 15, fontFamily: FONTS.semibold },
  tabs: { flexDirection: 'row', gap: 8, padding: 4, borderRadius: 100, backgroundColor: DARK.card },
  tab: { height: 44, borderRadius: 100, alignItems: 'center', justifyContent: 'center' },
  tabText: { color: DARK.muted, fontSize: 15, fontFamily: FONTS.medium },
  body: { color: DARK.muted, fontSize: 14, lineHeight: 21, fontFamily: FONTS.regular },
  label: { color: '#fff', fontSize: 15, fontFamily: FONTS.medium },
  empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 32, gap: 8 },
  emptyTitle: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  card: { marginHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 12, paddingRight: 16, borderRadius: 16, backgroundColor: DARK.card, borderWidth: 1, borderColor: 'transparent' },
  cardMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, paddingRight: 0 },
  cardOn: { borderColor: DARK.border },
  title: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  price: { color: DARK.accent, fontSize: 14, fontFamily: FONTS.medium },
  muted: { color: DARK.muted, fontSize: 13, fontFamily: FONTS.regular },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: DARK.field },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 10, backgroundColor: DARK.bg },
  footerHint: { color: DARK.muted, fontSize: 13, fontFamily: FONTS.medium, textAlign: 'center' },
  outline: { flex: 1, height: 56, borderRadius: 24, borderWidth: 1, borderColor: DARK.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  outlineText: { color: DARK.accent, fontSize: 14, fontFamily: FONTS.medium, textAlign: 'center' },
  divider: { height: 1, backgroundColor: DARK.field },
});
