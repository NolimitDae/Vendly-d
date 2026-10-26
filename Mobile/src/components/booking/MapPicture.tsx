import React, { useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/api';
import { DARK, FONTS } from '../../constants/colors';
import { openDirections } from '../../utils/bookingTracker';

/**
 * A small picture of the map around a place, with a pin and a Directions button. It is a grid of map tiles
 * served (and cached) by the API, so it works on the current app build without a maps SDK. Everything
 * about the map lives in this one file so a live map (react-native-maps) can replace it in a later build.
 */

const TILE = 256;
const ZOOM = 15;

/** Position in tile units at a zoom (Web Mercator, as every slippy map uses). */
function toTile(lat: number, lng: number, z: number) {
  const n = 2 ** z;
  const r = (Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180;
  return { x: ((lng + 180) / 360) * n, y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n };
}

/** The tiles that cover a width × height box centred on the point, with where each one goes. */
function tilesAround(lat: number, lng: number, width: number, height: number, z = ZOOM) {
  const n = 2 ** z;
  const c = toTile(lat, lng, z);
  const left = c.x * TILE - width / 2;
  const top = c.y * TILE - height / 2;
  const out: { key: string; url: string; left: number; top: number }[] = [];
  for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + height) / TILE); ty++) {
    if (ty < 0 || ty >= n) continue;
    for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + width) / TILE); tx++) {
      const x = ((tx % n) + n) % n; // across the date line
      out.push({ key: `${tx}/${ty}`, url: `${api.defaults.baseURL}/geo/tile/${z}/${x}/${ty}`, left: tx * TILE - left, top: ty * TILE - top });
    }
  }
  return out;
}

export default function MapPicture({
  lat,
  lng,
  address,
  height = 180,
  directions = false,
  label = 'Map of the booking location',
}: {
  lat?: number | null;
  lng?: number | null;
  /** used for Directions when the position isn't known yet */
  address?: string | null;
  height?: number;
  /** show the Directions button under the map */
  directions?: boolean;
  label?: string;
}) {
  const [width, setWidth] = useState(0);
  const known = lat != null && lng != null;
  if (!known && !directions) return null;

  return (
    <View style={{ gap: 10 }}>
      {known && (
        <View style={[s.map, { height }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessible accessibilityRole="image" accessibilityLabel={address ? `${label}: ${address}` : label}>
          {width > 0 &&
            tilesAround(lat!, lng!, width, height).map((t) => (
              <Image key={t.key} source={{ uri: t.url }} style={[s.tile, { left: t.left, top: t.top }]} />
            ))}
          {/* the pin's tip sits on the place */}
          <View pointerEvents="none" style={[s.pin, { left: width / 2 - 18, top: height / 2 - 36 }]}>
            <Ionicons name="location" size={36} color={DARK.border} />
          </View>
          <Pressable style={s.credit} onPress={() => Linking.openURL('https://www.openstreetmap.org/copyright')} accessibilityRole="link" hitSlop={6}>
            <Text style={s.creditText}>© OpenStreetMap contributors</Text>
          </Pressable>
        </View>
      )}
      {directions && (
        <Pressable style={s.directions} onPress={() => openDirections({ lat, lng, address })} accessibilityRole="button">
          <Ionicons name="navigate-outline" size={18} color={DARK.accent} />
          <Text style={s.directionsText}>Directions</Text>
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  map: { borderRadius: 14, overflow: 'hidden', backgroundColor: DARK.field },
  tile: { position: 'absolute', width: TILE, height: TILE },
  pin: { position: 'absolute', width: 36, height: 36, alignItems: 'center' },
  credit: { position: 'absolute', right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.8)', paddingHorizontal: 6, paddingVertical: 2, borderTopLeftRadius: 6 },
  creditText: { color: '#333', fontSize: 10, fontFamily: FONTS.regular },
  directions: { height: 46, borderRadius: 100, borderWidth: 1, borderColor: DARK.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  directionsText: { color: DARK.accent, fontSize: 15, fontFamily: FONTS.medium },
});
