import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '../brand';
import { DARK, FONTS } from '../../constants/colors';
import { DosDontsList } from '../listing/DosDonts';
import type { ChosenCustomization } from '../../utils/packageOptions';

export interface BookingChoicesFields {
  /** what was picked for the package's customizations, frozen when the booking was made */
  customizations?: ChosenCustomization[] | null;
  listing?: { title?: string; dos?: string[] | null; donts?: string[] | null } | null;
  rental_reservations?: { item?: { title?: string; dos?: string[] | null; donts?: string[] | null } | null }[] | null;
}

const money = (n: number) => `$${Number(n).toFixed(2)}`;

/** The customizations chosen for a booking, and the vendor's dos and don'ts for the package or rented items. */
export default function BookingChoices({ booking }: { booking: BookingChoicesFields }) {
  const chosen = booking.customizations ?? [];
  const items = (booking.rental_reservations ?? []).map((r) => r.item).filter((i) => !!i && (i.dos?.length || i.donts?.length));
  const pkg = booking.listing && (booking.listing.dos?.length || booking.listing.donts?.length) ? booking.listing : null;
  if (!chosen.length && !items.length && !pkg) return null;
  return (
    <>
      {chosen.length > 0 && (
        <Card style={{ gap: 10 }}>
          <Text style={s.title}>Customizations</Text>
          {chosen.map((g) => (
            <View key={g.group_id} style={s.row} accessible accessibilityLabel={`${g.title}: ${g.options.map((o) => o.label).join(', ')}${g.amount > 0 ? `, plus ${money(g.amount)}` : ''}`}>
              <Text style={s.body}>
                <Text style={s.muted}>{g.title}: </Text>
                {g.options.map((o) => o.label).join(', ')}
              </Text>
              {g.amount > 0 && <Text style={s.price}>+{money(g.amount)}</Text>}
            </View>
          ))}
        </Card>
      )}
      {pkg && (
        <Card>
          <DosDontsList dos={pkg.dos} donts={pkg.donts} />
        </Card>
      )}
      {items.map((i, k) => (
        <Card key={k}>
          <DosDontsList dos={i!.dos} donts={i!.donts} title={items.length > 1 ? `Dos and don’ts: ${i!.title}` : undefined} />
        </Card>
      ))}
    </>
  );
}

const s = StyleSheet.create({
  title: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  body: { flex: 1, color: '#fff', fontSize: 14, lineHeight: 22, fontFamily: FONTS.medium },
  muted: { color: DARK.muted },
  price: { color: DARK.accent, fontSize: 14, fontFamily: FONTS.semibold },
});
