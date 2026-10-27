import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '../brand';
import { DARK, FONTS } from '../../constants/colors';
import { DosDontsList } from '../listing/DosDonts';
import type { ChosenCustomization } from '../../utils/packageOptions';
import type { TravelQuote } from '../../utils/travelFee';

export interface BookingChoicesFields {
  /** what was picked for the package's customizations, frozen when the booking was made */
  customizations?: ChosenCustomization[] | null;
  /** the delivery / travel fee in the price (null: none applies), and how it was worked out */
  travel_fee?: number | null;
  travel?: TravelQuote | null;
  status?: string;
  listing?: { title?: string; dos?: string[] | null; donts?: string[] | null } | null;
  rental_reservations?: { item?: { title?: string; dos?: string[] | null; donts?: string[] | null } | null }[] | null;
}

const money = (n: number) => `$${Number(n).toFixed(2)}`;

/** The travel fee on a booking, for both sides; the vendor is told when it couldn't be worked out. */
function TravelFeeCard({ booking, forVendor }: { booking: BookingChoicesFields; forVendor?: boolean }) {
  const t = booking.travel;
  if (!t) return null;
  const unpriced = t.status === 'UNPRICED' && booking.travel_fee == null;
  return (
    <Card style={{ gap: 10 }}>
      <Text style={s.title}>Travel fee</Text>
      {unpriced ? (
        <Text style={[s.body, s.muted]}>
          {forVendor
            ? booking.status === 'PENDING'
              ? 'We couldn’t place the customer’s address on the map, so no travel fee was added. If you charge one, add it with Suggest changes before you accept.'
              : 'We couldn’t place the customer’s address on the map, so no travel fee was added.'
            : 'We couldn’t place your address on the map, so no travel fee was added. The vendor may suggest one before they accept, and you approve it first.'}
        </Text>
      ) : (
        <View style={s.row}>
          <Text style={s.body}>{t.label}</Text>
          <Text style={s.price}>{money(booking.travel_fee ?? t.fee ?? 0)}</Text>
        </View>
      )}
    </Card>
  );
}

/** The customizations chosen for a booking, its travel fee, and the vendor's dos and don'ts for the package or rented items. */
export default function BookingChoices({ booking, forVendor }: { booking: BookingChoicesFields; forVendor?: boolean }) {
  const chosen = booking.customizations ?? [];
  const items = (booking.rental_reservations ?? []).map((r) => r.item).filter((i) => !!i && (i.dos?.length || i.donts?.length));
  const pkg = booking.listing && (booking.listing.dos?.length || booking.listing.donts?.length) ? booking.listing : null;
  if (!chosen.length && !items.length && !pkg && !booking.travel) return null;
  return (
    <>
      <TravelFeeCard booking={booking} forVendor={forVendor} />
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
