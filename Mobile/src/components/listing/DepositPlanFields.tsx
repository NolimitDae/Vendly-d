import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Chip, Field, ui } from '../brand';
import { DARK, FONTS } from '../../constants/colors';
import SlidingTabs from '../SlidingTabs';
import { depositSummary, depositTermsError, MAX_DEPOSIT_PERCENT, MIN_DEPOSIT_PERCENT, type DepositTermsValue } from '../../utils/depositTerms';

const QUICK_PERCENTS = ['25', '50'];

/** The deposit percentage and when the balance is due, for a package on "Custom deposit". */
export default function DepositPlanFields({ value, onChange }: { value: DepositTermsValue; onChange: (v: DepositTermsValue) => void }) {
  const set = (patch: Partial<DepositTermsValue>) => onChange({ ...value, ...patch });
  const problem = depositTermsError('DEPOSIT_CUSTOM', value);
  const summary = depositSummary(value);
  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 8 }}>
        <Text style={ui.label}>Deposit when you accept</Text>
        <View style={s.row}>
          {QUICK_PERCENTS.map((q) => (
            <Chip key={q} label={`${q}%`} active={value.percent === q} onPress={() => set({ percent: q })} />
          ))}
        </View>
        <Field
          label={`Or any percentage (${MIN_DEPOSIT_PERCENT} to ${MAX_DEPOSIT_PERCENT})`}
          placeholder="30"
          value={value.percent}
          onChangeText={(t) => set({ percent: t.replace(/\D/g, '').slice(0, 2) })}
          keyboardType="number-pad"
          accessibilityLabel="Deposit percentage"
        />
      </View>
      <View style={{ gap: 8 }}>
        <Text style={ui.label}>Balance due</Text>
        <SlidingTabs
          items={[{ key: 'after', label: 'After the service' }, { key: 'before', label: 'Before the event' }]}
          value={value.afterService ? 'after' : 'before'}
          onChange={(k) => set({ afterService: k === 'after' })}
          style={{ backgroundColor: DARK.field }}
          accessibilityLabel="Balance due"
        />
        {value.afterService ? (
          <Text style={s.hint}>
            Charged when the customer confirms the work, or automatically if they don’t report a problem within 48 hours of you marking the job complete. You’ll add photos of the finished job before you mark it complete.
          </Text>
        ) : (
          <Field
            label="Days before the event"
            placeholder="7"
            value={value.days}
            onChangeText={(t) => set({ days: t.replace(/\D/g, '').slice(0, 2) })}
            keyboardType="number-pad"
            accessibilityLabel="Days before the event the balance is due"
          />
        )}
      </View>
      {problem ? <Text style={s.problem}>{problem}</Text> : summary ? <Text style={s.example}>{summary}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hint: { color: DARK.muted, fontSize: 12, lineHeight: 18, fontFamily: FONTS.medium },
  problem: { color: '#F87171', fontSize: 13, lineHeight: 18, fontFamily: FONTS.medium },
  example: { color: '#fff', fontSize: 14, lineHeight: 20, fontFamily: FONTS.medium, backgroundColor: DARK.field, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
});
