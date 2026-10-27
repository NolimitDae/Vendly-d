import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { addDays, parseISO } from 'date-fns';
import { DARK, FONTS } from '../../constants/colors';
import { addRow, evenRows, MAX_PLAN_PAYMENTS, MIN_PLAN_PAYMENT, money, planDate, remainder, type PlanDraftRow } from '../../utils/paymentPlan';

interface Props {
  rows: PlanDraftRow[];
  onChange: (rows: PlanDraftRow[]) => void;
  /** what the payments must add up to */
  total: number;
  /** the Vendly Protection fee charged with the first payment (0 when it was already paid) */
  feeOwed: number;
  /** what "no date" on the first payment means: "When you accept" / "When they agree" */
  firstLabel: string;
  /** the last day a payment can be due */
  latest?: string | null;
}

/**
 * The payment rows of a custom plan: an amount and a date each (the first may be taken straight away),
 * "Split evenly", "Add payment" and the running remainder. The server checks the plan again.
 */
export default function PaymentPlanEditor({ rows, onChange, total, feeOwed, firstLabel, latest }: Props) {
  const [picking, setPicking] = useState<string | null>(null);
  const left = remainder(rows, total);
  const set = (key: string, patch: Partial<PlanDraftRow>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const picked = rows.find((r) => r.key === picking);

  return (
    <View style={{ gap: 10 }}>
      <Text style={s.muted}>
        Each payment is at least {money(MIN_PLAN_PAYMENT)}, except the last.
        {feeOwed > 0 ? ` The first payment includes the Vendly Protection fee of ${money(feeOwed)} and is the deposit: it isn’t refunded if the customer cancels.` : ''}
        {latest ? ` The last payment can be due up to ${planDate(latest)}.` : ''}
      </Text>
      {rows.map((r, k) => (
        <View key={r.key} style={s.row}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[s.label, { flex: 1 }]}>
              Payment {k + 1}
              {k === 0 && feeOwed > 0 ? ' (deposit)' : ''}
            </Text>
            {rows.length > 2 && (
              <Pressable onPress={() => onChange(rows.filter((x) => x.key !== r.key))} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove payment ${k + 1}`}>
                <Ionicons name="trash-outline" size={20} color="#fca5a5" />
              </Pressable>
            )}
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={[s.field, { flex: 1 }]}>
              <Text style={s.muted}>$</Text>
              <TextInput
                style={s.input}
                value={r.amount}
                onChangeText={(t) => set(r.key, { amount: t.replace(/[^0-9.]/g, '') })}
                keyboardType="decimal-pad"
                accessibilityLabel={`Amount of payment ${k + 1}`}
              />
            </View>
            <Pressable style={[s.field, { flex: 1.3 }]} onPress={() => setPicking(r.key)} accessibilityRole="button" accessibilityLabel={`Date of payment ${k + 1}: ${r.date ? planDate(r.date) : k === 0 ? firstLabel : 'not set'}`}>
              <Ionicons name="calendar-outline" size={18} color={DARK.muted} />
              <Text style={s.value} numberOfLines={1}>
                {r.date ? planDate(r.date) : k === 0 ? firstLabel : 'Pick a date'}
              </Text>
            </Pressable>
          </View>
          {k === 0 && r.date && (
            <Pressable onPress={() => set(r.key, { date: null })} accessibilityRole="button">
              <Text style={s.link}>Take it {firstLabel.toLowerCase()} instead</Text>
            </Pressable>
          )}
        </View>
      ))}
      {picked && (
        <DateTimePicker
          value={picked.date ?? addDays(new Date(), 1)}
          mode="date"
          minimumDate={addDays(new Date(), 1)}
          maximumDate={latest ? parseISO(latest) : undefined}
          onChange={(_: unknown, selected?: Date) => {
            if (Platform.OS !== 'ios') setPicking(null);
            if (selected) set(picked.key, { date: selected });
          }}
          themeVariant="dark"
        />
      )}
      {Platform.OS === 'ios' && picked && (
        <TouchableOpacity style={{ alignSelf: 'flex-end', padding: 8 }} onPress={() => setPicking(null)}>
          <Text style={s.link}>Done</Text>
        </TouchableOpacity>
      )}
      <View style={s.actions}>
        <Pressable style={s.chip} onPress={() => onChange(evenRows(rows, total, latest))} accessibilityRole="button">
          <Text style={s.chipText}>Split evenly</Text>
        </Pressable>
        <Pressable style={[s.chip, rows.length >= MAX_PLAN_PAYMENTS && { opacity: 0.5 }]} disabled={rows.length >= MAX_PLAN_PAYMENTS} onPress={() => onChange(addRow(rows, total))} accessibilityRole="button" accessibilityLabel="Add payment">
          <Ionicons name="add" size={16} color={DARK.accent} />
          <Text style={s.chipText}>Add payment</Text>
        </Pressable>
      </View>
      <Text style={[s.status, { color: left === 0 ? '#86efac' : '#fcd34d' }]} accessibilityLiveRegion="polite">
        {left === 0 ? `Adds up to ${money(total)}` : left > 0 ? `${money(left)} left to place of ${money(total)}` : `${money(-left)} over ${money(total)}`}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  muted: { color: DARK.muted, fontSize: 13, lineHeight: 19, fontFamily: FONTS.regular },
  label: { color: '#fff', fontSize: 14, fontFamily: FONTS.semibold },
  value: { color: '#fff', fontSize: 14, fontFamily: FONTS.medium, flexShrink: 1 },
  link: { color: DARK.accent, fontSize: 13, fontFamily: FONTS.medium },
  row: { backgroundColor: DARK.card, borderRadius: 16, padding: 14, gap: 10 },
  field: { height: 48, borderRadius: 16, backgroundColor: DARK.field, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  input: { flex: 1, color: '#fff', fontSize: 15, fontFamily: FONTS.regular },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 100, borderWidth: 1, borderColor: DARK.border },
  chipText: { color: '#fff', fontSize: 13, fontFamily: FONTS.medium },
  status: { fontSize: 14, fontFamily: FONTS.semibold },
});
