import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Chip, Field, ui } from '../brand';
import { CheckRow } from '../Sheet';
import { DARK, FONTS } from '../../constants/colors';
import { travelExample, travelFeeError, type TravelFeeValue } from '../../utils/travelFee';

const decimal = (t: string) => t.replace(/[^0-9.]/g, '');

/**
 * "Delivery / travel fee" for a package where the vendor goes to the customer: free miles, a price per
 * mile after them, an optional base fee, and one way or round trip. Vendly works out the miles per booking.
 */
export default function TravelFeeEditor({ value, onChange }: { value: TravelFeeValue; onChange: (v: TravelFeeValue) => void }) {
  const set = (patch: Partial<TravelFeeValue>) => onChange({ ...value, ...patch });
  const problem = travelFeeError(value);
  return (
    <View style={{ gap: 10 }}>
      <CheckRow
        checked={value.enabled}
        onPress={() => set({ enabled: !value.enabled })}
        title="Charge a delivery / travel fee"
        subtitle="Vendly works out the distance to each customer’s address (a straight line plus 20%, close to the miles by road) and adds the fee to their booking."
      />
      {value.enabled && (
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field label="Free miles" placeholder="0" value={value.freeMiles} onChangeText={(t) => set({ freeMiles: t.replace(/\D/g, '') })} keyboardType="number-pad" accessibilityLabel="Free miles" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Price per mile ($)" placeholder="0.00" value={value.perMile} onChangeText={(t) => set({ perMile: decimal(t) })} keyboardType="decimal-pad" accessibilityLabel="Price per mile" />
            </View>
          </View>
          <Field label="Base fee, optional ($)" placeholder="0.00" value={value.baseFee} onChangeText={(t) => set({ baseFee: decimal(t) })} keyboardType="decimal-pad" accessibilityLabel="Base travel fee" />
          <View style={{ gap: 8 }}>
            <Text style={ui.label}>Count the miles</Text>
            <View style={s.chips}>
              <Chip label="One way" active={!value.roundTrip} onPress={() => set({ roundTrip: false })} />
              <Chip label="Round trip" active={value.roundTrip} onPress={() => set({ roundTrip: true })} />
            </View>
          </View>
          <Text style={s.hint}>The first free miles cost nothing, then each mile is charged at your price. The base fee is added to every booking with an address.</Text>
          {problem ? <Text style={s.problem}>{problem}</Text> : <Text style={s.example}>{travelExample(value)}</Text>}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  hint: { color: DARK.muted, fontSize: 12, lineHeight: 18, fontFamily: FONTS.medium },
  problem: { color: '#F87171', fontSize: 13, lineHeight: 18, fontFamily: FONTS.medium },
  example: { color: '#fff', fontSize: 14, lineHeight: 20, fontFamily: FONTS.medium, backgroundColor: DARK.field, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
});
