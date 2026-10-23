import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DARK, FONTS } from '../constants/colors';
import { hasTarget, openStep } from '../context/OnboardingContext';
import type { Onboarding, OnboardingStep } from '../services/onboarding.service';

export const ROLE_TITLE: Record<Onboarding['role'], string> = {
  CUSTOMER: 'Get set up to book',
  VENDOR: 'Get your shop ready',
  EVENT_PLANNER: 'Get set up to plan',
};

/** One checklist step: a tick when done, a clock while Vendly reviews it, otherwise an open circle. */
export function StepRow({ role, step, onOpen }: { role: Onboarding['role']; step: OnboardingStep; onOpen?: () => void }) {
  const tappable = step.state === 'todo' && hasTarget(role, step.key);
  return (
    <Pressable
      style={({ pressed }) => [s.step, pressed && tappable && { opacity: 0.7 }]}
      onPress={() => {
        if (!tappable) return;
        onOpen?.();
        openStep(role, step.key);
      }}
      disabled={!tappable}
      accessibilityRole={tappable ? 'button' : 'text'}
      accessibilityLabel={`${step.title}. ${step.state === 'done' ? 'Done' : step.state === 'pending' ? 'In review' : 'To do'}`}
    >
      {step.state === 'done' ? (
        <Ionicons name="checkmark-circle" size={22} color="#6ee7c7" />
      ) : step.state === 'pending' ? (
        <Ionicons name="time-outline" size={22} color="#fcd34d" />
      ) : (
        <Ionicons name="ellipse-outline" size={22} color={DARK.muted} />
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[s.stepTitle, step.state === 'done' && s.doneTitle]}>{step.title}</Text>
        {step.state !== 'done' && <Text style={s.stepBody}>{step.note ?? step.description}</Text>}
      </View>
      {tappable && <Ionicons name="chevron-forward" size={18} color={DARK.muted} />}
    </Pressable>
  );
}

export function ProgressBar({ done, total }: { done: number; total: number }) {
  return (
    <View style={s.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: done }}>
      <View style={[s.fill, { width: `${total ? Math.round((done / total) * 100) : 0}%` }]} />
    </View>
  );
}

/** The "get set up" checklist at the top of notifications; it goes away once everything is done. */
export default function OnboardingChecklist({ data }: { data: Onboarding }) {
  return (
    <View style={s.card}>
      <View style={s.header}>
        <Text style={s.title}>{ROLE_TITLE[data.role]}</Text>
        <Text style={s.count}>
          {data.completed} of {data.total}
        </Text>
      </View>
      <ProgressBar done={data.completed} total={data.total} />
      <View style={{ marginTop: 6 }}>
        {data.steps.map((step) => (
          <StepRow key={step.key} role={data.role} step={step} />
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: DARK.card, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: DARK.border, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  count: { color: DARK.accent, fontSize: 13, fontFamily: FONTS.medium },
  track: { height: 6, borderRadius: 3, backgroundColor: DARK.field, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: DARK.accent },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  stepTitle: { color: '#fff', fontSize: 14, fontFamily: FONTS.semibold },
  doneTitle: { color: DARK.muted, textDecorationLine: 'line-through' },
  stepBody: { color: DARK.muted, fontSize: 12, lineHeight: 17, fontFamily: FONTS.regular },
});
