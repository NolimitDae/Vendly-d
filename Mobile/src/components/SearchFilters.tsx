import React, { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { Chip, ui } from './brand';
import MonthCalendar from './MonthCalendar';
import { DARK, FONTS } from '../constants/colors';
import { dayKey } from '../services/rentals.service';

export interface Filters {
  /** yyyy-MM-dd */
  date?: string;
  min_price?: number;
  max_price?: number;
  min_rating?: number;
  sort?: 'rating' | 'price_asc' | 'price_desc' | 'newest' | 'distance';
  /** near me: the phone's position and a radius in miles */
  near_lat?: number;
  near_lng?: number;
  radius_miles?: number;
}

const PRICES: { label: string; min?: number; max?: number }[] = [
  { label: 'Any price' },
  { label: 'Under $250', max: 250 },
  { label: '$250 – $1,000', min: 250, max: 1000 },
  { label: '$1,000 – $3,000', min: 1000, max: 3000 },
  { label: '$3,000+', min: 3000 },
];
const RATINGS = [undefined, 4, 4.5] as const;
const SORTS: { value: Filters['sort']; label: string }[] = [
  { value: undefined, label: 'Recommended' },
  { value: 'rating', label: 'Top rated' },
  { value: 'price_asc', label: 'Price: low' },
  { value: 'price_desc', label: 'Price: high' },
];

/** How many filters are set (the sort isn't counted). */
export const activeFilters = (f: Filters) => [f.date, f.min_price ?? f.max_price, f.min_rating, f.near_lat].filter((v) => v !== undefined).length;
const RADII = [10, 25, 50];

/** Date, price, rating and sort controls shared by Find Vendors and the results screen. */
export default function SearchFilters({ value, onChange }: { value: Filters; onChange: (f: Filters) => void }) {
  const [calendar, setCalendar] = useState(false);
  const [locating, setLocating] = useState(false);
  const set = (patch: Partial<Filters>) => onChange({ ...value, ...patch });

  const nearMe = async () => {
    if (value.near_lat !== undefined) return set({ near_lat: undefined, near_lng: undefined, radius_miles: undefined, sort: value.sort === 'distance' ? undefined : value.sort });
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        return perm.canAskAgain
          ? Alert.alert('Location', 'Allow location access to find vendors near you, or type a city instead.')
          : Alert.alert('Location is off', 'Turn on location for Vendly in Settings to find vendors near you, or type a city instead.', [
              { text: 'Not now', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ]);
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      set({ near_lat: Number(pos.coords.latitude.toFixed(4)), near_lng: Number(pos.coords.longitude.toFixed(4)), radius_miles: value.radius_miles ?? 25 });
    } catch {
      Alert.alert('Location', 'We couldn’t get your location. Try again or type a city.');
    } finally {
      setLocating(false);
    }
  };

  return (
    <View style={{ gap: 18 }}>
      <View style={{ gap: 8 }}>
        <Text style={ui.label}>Date</Text>
        <Pressable style={ui.field} onPress={() => setCalendar(!calendar)} accessibilityRole="button" accessibilityLabel="Choose a date">
          <Ionicons name="calendar-outline" size={20} color={DARK.muted} />
          <Text style={[ui.input, !value.date && { color: DARK.muted }]}>{value.date ? format(parseISO(value.date), 'EEE d MMM yyyy') : 'Any date'}</Text>
          {value.date ? (
            <Pressable onPress={() => set({ date: undefined })} hitSlop={8} accessibilityLabel="Clear date"><Ionicons name="close-circle" size={20} color={DARK.muted} /></Pressable>
          ) : (
            <Ionicons name={calendar ? 'chevron-up' : 'chevron-down'} size={18} color={DARK.muted} />
          )}
        </Pressable>
        {calendar && (
          <View style={s.calendar}>
            <MonthCalendar value={value.date ? parseISO(value.date) : null} onChange={(d) => { set({ date: dayKey(d) }); setCalendar(false); }} />
            <Text style={s.hint}>Only vendors who haven’t blocked this day are shown.</Text>
          </View>
        )}
      </View>

      <View style={{ gap: 8 }}>
        <Text style={ui.label}>Distance</Text>
        <View style={s.chips}>
          <Chip
            label={locating ? 'Finding you…' : value.near_lat !== undefined ? 'Near me ✓' : 'Near me'}
            active={value.near_lat !== undefined}
            onPress={nearMe}
            icon={locating ? <ActivityIndicator size="small" color={DARK.accent} /> : <Ionicons name="navigate-outline" size={16} color={value.near_lat !== undefined ? '#fff' : DARK.muted} />}
          />
          {value.near_lat !== undefined && RADII.map((r) => <Chip key={r} label={`${r} mi`} active={(value.radius_miles ?? 25) === r} onPress={() => set({ radius_miles: r })} />)}
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={ui.label}>Price</Text>
        <View style={s.chips}>
          {PRICES.map((p) => (
            <Chip key={p.label} label={p.label} active={value.min_price === p.min && value.max_price === p.max} onPress={() => set({ min_price: p.min, max_price: p.max })} />
          ))}
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={ui.label}>Rating</Text>
        <View style={s.chips}>
          {RATINGS.map((r) => (
            <Chip key={String(r)} label={r ? `${r}+ ★` : 'Any rating'} active={value.min_rating === r} onPress={() => set({ min_rating: r })} />
          ))}
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={ui.label}>Sort by</Text>
        <View style={s.chips}>
          {SORTS.map((o) => <Chip key={o.label} label={o.label} active={value.sort === o.value} onPress={() => set({ sort: o.value })} />)}
          {value.near_lat !== undefined && <Chip label="Nearest" active={value.sort === 'distance'} onPress={() => set({ sort: 'distance' })} />}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  calendar: { backgroundColor: DARK.card, borderRadius: 16, padding: 14, gap: 10 },
  hint: { color: DARK.muted, fontSize: 12, fontFamily: FONTS.medium },
});
