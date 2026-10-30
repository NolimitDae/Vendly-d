import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Card, Field, GradientButton, ScreenHeader, ui } from '../../components/brand';
import { CheckRow } from '../../components/Sheet';
import SlidingTabs from '../../components/SlidingTabs';
import { DARK, FONTS } from '../../constants/colors';
import { api } from '../../services/api';
import { PromosService, type VendorPromo, type VendorPromoInput } from '../../services/promos.service';
import { apiMessage } from '../auth/SignIn';

interface Draft {
  code: string;
  description: string;
  kind: 'percent' | 'amount';
  value: string;
  minAmount: string;
  maxUses: string;
  /** YYYY-MM-DD, the last day it works */
  expires: string;
  oncePerCustomer: boolean;
  firstBookingOnly: boolean;
  allPackages: boolean;
  listingIds: string[];
}

const emptyDraft = (): Draft => ({ code: '', description: '', kind: 'percent', value: '', minAmount: '', maxUses: '', expires: '', oncePerCustomer: true, firstBookingOnly: false, allPackages: true, listingIds: [] });

const draftFrom = (p: VendorPromo): Draft => ({
  code: p.code,
  description: p.description ?? '',
  kind: p.percent_off != null ? 'percent' : 'amount',
  value: String(p.percent_off ?? p.amount_off ?? ''),
  minAmount: p.min_amount != null ? String(p.min_amount) : '',
  maxUses: p.max_uses != null ? String(p.max_uses) : '',
  expires: p.expires_at ? p.expires_at.slice(0, 10) : '',
  oncePerCustomer: p.once_per_customer,
  firstBookingOnly: p.first_booking_only,
  allPackages: !p.listing_ids.length,
  listingIds: p.listing_ids,
});

function draftError(d: Draft): string | null {
  if (!/^[A-Za-z0-9_-]{3,50}$/.test(d.code.trim())) return 'Codes use 3–50 letters, numbers, dashes or underscores.';
  const v = Number(d.value);
  if (!d.value.trim() || !(v > 0)) return d.kind === 'percent' ? 'Enter the percent off.' : 'Enter the amount off.';
  if (d.kind === 'percent' && v > 90) return 'A code can take at most 90% off.';
  if (d.maxUses.trim() && !(Number.isInteger(Number(d.maxUses)) && Number(d.maxUses) > 0)) return 'The number of uses must be a whole number.';
  if (d.expires.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(d.expires.trim())) return 'Write the last day as YYYY-MM-DD, e.g. 2026-12-31.';
  if (!d.allPackages && !d.listingIds.length) return 'Pick at least one package, or let it work on all of them.';
  return null;
}

const num = (v: string) => (v.trim() === '' ? null : Number(v));
const toInput = (d: Draft): VendorPromoInput => ({
  code: d.code.trim().toUpperCase(),
  description: d.description.trim() || undefined,
  percent_off: d.kind === 'percent' ? Number(d.value) : null,
  amount_off: d.kind === 'amount' ? Number(d.value) : null,
  min_amount: num(d.minAmount),
  max_uses: num(d.maxUses),
  // the end of the chosen day, on this phone's clock
  expires_at: d.expires.trim() ? new Date(`${d.expires.trim()}T23:59:59`).toISOString() : null,
  once_per_customer: d.oncePerCustomer,
  first_booking_only: d.firstBookingOnly,
  listing_ids: d.allPackages ? [] : d.listingIds,
});

const money = (n: number | string) => `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

/** The vendor's promo codes: customers type one when booking to get money off this vendor's packages. */
export default function PromoCodes() {
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const [promos, setPromos] = useState<VendorPromo[] | null>(null);
  const [listings, setListings] = useState<{ id: string; title: string }[]>([]);
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    PromosService.list()
      .then((r) => setPromos(r.data?.data ?? []))
      .catch((e) => {
        setPromos([]);
        Alert.alert('Promo codes', apiMessage(e, 'Couldn’t load your promo codes.'));
      });
    api
      .get('/vendor/listings', { params: { limit: 100 } })
      .then((r) => setListings(((r.data?.data ?? []) as { id: string; title: string; status?: string }[]).filter((l) => l.status !== 'ARCHIVED')))
      .catch(() => setListings([]));
  }, []);
  useFocusEffect(load);

  const titles = new Map(listings.map((l) => [l.id, l.title]));
  const set = (patch: Partial<Draft>) => setEditing((e) => (e ? { ...e, draft: { ...e.draft, ...patch } } : e));

  const save = async () => {
    if (!editing) return;
    const problem = draftError(editing.draft);
    if (problem) return Alert.alert('Promo code', problem);
    setBusy(true);
    try {
      if (editing.id) await PromosService.update(editing.id, toInput(editing.draft));
      else await PromosService.create(toInput(editing.draft));
      setEditing(null);
      load();
    } catch (e) {
      Alert.alert('Promo code', apiMessage(e, 'Couldn’t save the promo code.'));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (p: VendorPromo) => {
    try {
      await PromosService.update(p.id, { active: !p.active });
      load();
    } catch (e) {
      Alert.alert('Promo code', apiMessage(e, 'Couldn’t change the promo code.'));
    }
  };

  const summary = (p: VendorPromo) =>
    [
      p.percent_off != null ? `${Number(p.percent_off)}% off` : `${money(p.amount_off ?? 0)} off`,
      p.min_amount != null ? `bookings of ${money(p.min_amount)}+` : null,
      p.once_per_customer ? 'once per customer' : null,
      p.first_booking_only ? 'first booking only' : null,
      p.listing_ids.length ? p.listing_ids.map((id) => titles.get(id) ?? 'a package').join(', ') : 'all your packages',
    ]
      .filter(Boolean)
      .join(' · ');

  const d = editing?.draft;
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: DARK.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: insets.bottom + 40, gap: 16 }} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Promo codes" onBack={() => nav.goBack()} />
        <Text style={s.hint}>Customers type a code when they book to get money off your packages. The discount comes off your price.</Text>

        {d ? (
          <Card style={{ gap: 12 }}>
            <Field label="Code" placeholder="SUMMER15" value={d.code} onChangeText={(t) => set({ code: t.toUpperCase().replace(/[^A-Z0-9_-]/g, '') })} autoCapitalize="characters" maxLength={50} />
            <Field label="Note (optional)" placeholder="Summer weddings" value={d.description} onChangeText={(t) => set({ description: t })} maxLength={255} />
            <View style={{ gap: 8 }}>
              <Text style={ui.label}>Discount</Text>
              <SlidingTabs
                items={[{ key: 'percent', label: 'Percent off' }, { key: 'amount', label: 'Amount off' }]}
                value={d.kind}
                onChange={(k) => set({ kind: k as Draft['kind'] })}
                style={{ backgroundColor: DARK.field }}
                accessibilityLabel="Discount type"
              />
              <Field
                label={d.kind === 'percent' ? 'Percent off (up to 90)' : 'Amount off ($)'}
                placeholder={d.kind === 'percent' ? '15' : '25.00'}
                value={d.value}
                onChangeText={(t) => set({ value: t.replace(/[^0-9.]/g, '') })}
                keyboardType="decimal-pad"
              />
            </View>
            <Field label="Minimum booking, $ (optional)" placeholder="No minimum" value={d.minAmount} onChangeText={(t) => set({ minAmount: t.replace(/[^0-9.]/g, '') })} keyboardType="decimal-pad" />
            <Field label="Times it can be used (optional)" placeholder="No limit" value={d.maxUses} onChangeText={(t) => set({ maxUses: t.replace(/\D/g, '') })} keyboardType="number-pad" />
            <Field label="Last day it works (optional)" placeholder="YYYY-MM-DD" value={d.expires} onChangeText={(t) => set({ expires: t.replace(/[^0-9-]/g, '').slice(0, 10) })} keyboardType="numbers-and-punctuation" />
            <CheckRow checked={d.oncePerCustomer} onPress={() => set({ oncePerCustomer: !d.oncePerCustomer })} title="Each customer can use it once" />
            <CheckRow checked={d.firstBookingOnly} onPress={() => set({ firstBookingOnly: !d.firstBookingOnly })} title="Only on a customer’s first booking on Vendly" />
            <View style={{ gap: 8 }}>
              <Text style={ui.label}>Works on</Text>
              <SlidingTabs
                items={[{ key: 'all', label: 'All packages' }, { key: 'some', label: 'Some packages' }]}
                value={d.allPackages ? 'all' : 'some'}
                onChange={(k) => set({ allPackages: k === 'all' })}
                style={{ backgroundColor: DARK.field }}
                accessibilityLabel="Works on"
              />
              {!d.allPackages &&
                (listings.length ? (
                  listings.map((l) => (
                    <CheckRow
                      key={l.id}
                      checked={d.listingIds.includes(l.id)}
                      onPress={() => set({ listingIds: d.listingIds.includes(l.id) ? d.listingIds.filter((x) => x !== l.id) : [...d.listingIds, l.id] })}
                      title={l.title}
                    />
                  ))
                ) : (
                  <Text style={s.hint}>You have no packages yet.</Text>
                ))}
            </View>
            <GradientButton title={editing?.id ? 'Save' : 'Create code'} onPress={save} loading={busy} />
            <Pressable onPress={() => setEditing(null)} hitSlop={8} style={{ alignSelf: 'center' }}>
              <Text style={s.link}>Cancel</Text>
            </Pressable>
          </Card>
        ) : (
          <GradientButton title="New promo code" onPress={() => setEditing({ id: null, draft: emptyDraft() })} />
        )}

        {promos === null ? (
          <ActivityIndicator color={DARK.accent} />
        ) : promos.length === 0 ? (
          !d && (
            <Card style={{ alignItems: 'center', gap: 8 }}>
              <Ionicons name="pricetag-outline" size={32} color={DARK.accent} />
              <Text style={[s.hint, { textAlign: 'center' }]}>No promo codes yet. Make one to reward repeat customers or fill quiet dates.</Text>
            </Card>
          )
        ) : (
          promos.map((p) => (
            <Card key={p.id} style={{ gap: 4 }}>
              <View style={s.row}>
                <Text style={s.code}>{p.code}</Text>
                {!p.active && <Text style={s.off}>Off</Text>}
              </View>
              <Text style={s.body}>{summary(p)}</Text>
              <Text style={s.hint}>
                Used {p.uses}
                {p.max_uses != null ? ` of ${p.max_uses}` : ''} {p.uses === 1 ? 'time' : 'times'}
                {p.expires_at ? ` · until ${new Date(p.expires_at).toLocaleDateString()}` : ''}
                {p.description ? ` · ${p.description}` : ''}
              </Text>
              <View style={[s.row, { gap: 20, marginTop: 6 }]}>
                <Pressable onPress={() => setEditing({ id: p.id, draft: draftFrom(p) })} hitSlop={8} accessibilityRole="button">
                  <Text style={s.link}>Edit</Text>
                </Pressable>
                <Pressable onPress={() => toggle(p)} hitSlop={8} accessibilityRole="button">
                  <Text style={s.link}>{p.active ? 'Turn off' : 'Turn on'}</Text>
                </Pressable>
              </View>
            </Card>
          ))
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  hint: { color: DARK.muted, fontSize: 13, lineHeight: 19, fontFamily: FONTS.medium },
  body: { color: DARK.text, fontSize: 14, lineHeight: 20, fontFamily: FONTS.medium },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  code: { color: '#fff', fontSize: 17, fontFamily: FONTS.bold, letterSpacing: 0.5 },
  off: { color: DARK.muted, fontSize: 12, fontFamily: FONTS.semibold },
  link: { color: DARK.accent, fontSize: 14, fontFamily: FONTS.semibold },
});
