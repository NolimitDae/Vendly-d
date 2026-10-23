import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { Chip, ui } from './brand';
import { DARK, FONTS } from '../constants/colors';
import { api } from '../services/api';

export interface PickedPlace {
  label: string;
  /** set when picked from suggestions or the phone's position; typed text is geocoded on save */
  lat?: number;
  lng?: number;
}

export const SERVICE_RADII = [
  { value: 0, label: 'Customers come to me' },
  { value: 10, label: '10 mi' },
  { value: 25, label: '25 mi' },
  { value: 50, label: '50 mi' },
  { value: 100, label: '100 mi' },
];

/** Location with address suggestions as you type, "use my current location", and how far the vendor travels. */
export default function LocationPicker({
  value,
  onChange,
  radius,
  onRadiusChange,
}: {
  value: PickedPlace;
  onChange: (p: PickedPlace) => void;
  radius: number | null;
  onRadiusChange: (miles: number) => void;
}) {
  const [suggestions, setSuggestions] = useState<{ label: string; lat: number; lng: number }[]>([]);
  const [focused, setFocused] = useState(false);
  const [locating, setLocating] = useState(false);
  const near = useRef<{ lat: number; lng: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef('');

  // bias suggestions to where the vendor is, only if location is already allowed (never prompts here)
  useEffect(() => {
    Location.getForegroundPermissionsAsync()
      .then((p) => (p.granted ? Location.getLastKnownPositionAsync() : null))
      .then((pos) => {
        if (pos) near.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      })
      .catch(() => {});
    return () => clearTimeout(timer.current);
  }, []);

  const type = (text: string) => {
    onChange({ label: text }); // typed text: position unknown until picked
    latest.current = text;
    clearTimeout(timer.current);
    if (text.trim().length < 2) return setSuggestions([]);
    timer.current = setTimeout(async () => {
      try {
        const res = await api.get('/geo/suggest', { params: { q: text, ...(near.current ?? {}) } });
        if (latest.current === text) setSuggestions(res.data?.data ?? []);
      } catch {
        setSuggestions([]);
      }
    }, 300);
  };

  const useCurrent = async () => {
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        return perm.canAskAgain
          ? Alert.alert('Location', 'Allow location to fill this in, or type the city instead.')
          : Alert.alert('Location is off', 'Turn on location for Vendly in Settings, or type the city instead.', [
              { text: 'Not now', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ]);
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const res = await api.get('/geo/reverse', { params: { lat: pos.coords.latitude, lng: pos.coords.longitude } });
      const place = res.data?.data;
      if (!place) return Alert.alert('Location', 'We couldn’t name this spot. Type the city instead.');
      onChange(place);
      setSuggestions([]);
    } catch {
      Alert.alert('Location', 'We couldn’t get your location. Type the city instead.');
    } finally {
      setLocating(false);
    }
  };

  return (
    <View style={{ gap: 8 }}>
      <View style={ui.field}>
        <Ionicons name={value.lat != null ? 'location' : 'location-outline'} size={20} color={value.lat != null ? DARK.accent : DARK.muted} />
        <TextInput
          style={ui.input}
          placeholder="Start typing a city or address"
          placeholderTextColor={DARK.muted}
          value={value.label}
          onChangeText={type}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          autoCorrect={false}
          accessibilityLabel="Package location"
        />
        {!!value.label && (
          <Pressable onPress={() => { onChange({ label: '' }); setSuggestions([]); }} hitSlop={8} accessibilityLabel="Clear location">
            <Ionicons name="close-circle" size={20} color={DARK.muted} />
          </Pressable>
        )}
      </View>

      {focused && suggestions.length > 0 && (
        <View style={s.list}>
          {suggestions.map((p) => (
            <Pressable
              key={`${p.label}${p.lat}`}
              style={s.item}
              onPress={() => { onChange(p); setSuggestions([]); }}
              accessibilityRole="button"
            >
              <Ionicons name="location-outline" size={16} color={DARK.muted} />
              <Text style={s.itemText} numberOfLines={1}>{p.label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <Pressable style={s.current} onPress={useCurrent} disabled={locating} accessibilityRole="button">
        {locating ? <ActivityIndicator size="small" color={DARK.accent} /> : <Ionicons name="navigate-outline" size={16} color={DARK.accent} />}
        <Text style={s.currentText}>Use my current location</Text>
      </Pressable>

      <Text style={[ui.label, { marginTop: 8 }]}>How far will you travel?</Text>
      <View style={s.chips}>
        {SERVICE_RADII.map((r) => (
          <Chip key={r.value} label={r.label} active={radius === r.value} onPress={() => onRadiusChange(r.value)} />
        ))}
      </View>
      <Text style={s.hint}>
        {radius == null
          ? 'Pick how far you travel so customers nearby find this package with Near me.'
          : radius
            ? `Customers within ${radius} miles of this location will find this package with Near me.`
            : 'Customers come to you at this location.'}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  list: { borderRadius: 14, backgroundColor: DARK.card, borderWidth: 1, borderColor: DARK.field, overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: DARK.field },
  itemText: { flex: 1, color: '#fff', fontSize: 14, fontFamily: FONTS.regular },
  current: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 4 },
  currentText: { color: DARK.accent, fontSize: 14, fontFamily: FONTS.medium },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  hint: { color: DARK.muted, fontSize: 12, lineHeight: 18, fontFamily: FONTS.medium },
});
