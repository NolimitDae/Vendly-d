import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GradientButton } from './brand';
import { DARK, FONTS } from '../constants/colors';
import { hasTarget, openStep, useOnboarding } from '../context/OnboardingContext';
import { ProgressBar, ROLE_TITLE, StepRow } from './OnboardingChecklist';

const ALL_SET: Record<string, string> = {
  CUSTOMER: 'Your account is ready. Find vendors near you and book in a few taps.',
  VENDOR: 'Your shop is ready for customers. New booking requests will show up in Bookings.',
  EVENT_PLANNER: 'You’re ready to plan. Add vendors, budget and a timeline to your events.',
};

/**
 * The welcome popup with the checklist (once after sign-up, or after adding a role), and the
 * "you're all set" popup once everything is done. The checklist itself lives in notifications.
 */
export default function OnboardingPopup() {
  const { data, markSeen } = useOnboarding();
  const [shown, setShown] = useState<'intro' | 'complete' | null>(null);

  // a short pause so the popup doesn't land on top of the screen opening
  useEffect(() => {
    const kind = data?.popup;
    if (!kind) return;
    const t = setTimeout(() => {
      setShown(kind);
      // recorded as soon as it's on screen, so closing the app mid-popup doesn't show it again
      markSeen(kind);
    }, 1200);
    return () => clearTimeout(t);
  }, [data?.popup, markSeen]);

  if (!data || !shown) return null;

  const close = () => setShown(null);
  const next = data.steps.find((s) => s.state === 'todo' && hasTarget(data.role, s.key));

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <View style={s.backdrop}>
        <View style={s.card}>
          {shown === 'complete' ? (
            <>
              <Ionicons name="checkmark-circle" size={56} color="#6ee7c7" style={{ alignSelf: 'center' }} />
              <Text style={[s.title, { textAlign: 'center' }]}>You’re all set</Text>
              <Text style={[s.body, { textAlign: 'center' }]}>{ALL_SET[data.role]}</Text>
              <GradientButton title="Done" onPress={close} style={{ marginTop: 8 }} />
            </>
          ) : (
            <>
              <View style={s.headRow}>
                <Text style={s.title}>Welcome to Vendly</Text>
                <Pressable onPress={close} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
                  <Ionicons name="close" size={22} color={DARK.muted} />
                </Pressable>
              </View>
              <Text style={s.body}>
                {ROLE_TITLE[data.role]}: {data.completed} of {data.total} done.
              </Text>
              <ProgressBar done={data.completed} total={data.total} />
              <ScrollView style={{ maxHeight: 340 }} contentContainerStyle={{ paddingVertical: 4 }}>
                {data.steps.map((step) => (
                  <StepRow key={step.key} role={data.role} step={step} onOpen={close} />
                ))}
              </ScrollView>
              {next && (
                <GradientButton
                  title="Get started"
                  onPress={() => {
                    close();
                    openStep(data.role, next.key);
                  }}
                />
              )}
              <Pressable onPress={close} style={s.later} accessibilityRole="button">
                <Text style={s.laterText}>I’ll do it later</Text>
              </Pressable>
              <Text style={s.hint}>You’ll find this checklist in Notifications.</Text>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: DARK.bg, borderRadius: 22, padding: 20, gap: 12, borderWidth: 1, borderColor: DARK.border },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#fff', fontSize: 20, fontFamily: FONTS.semibold },
  body: { color: DARK.muted, fontSize: 14, lineHeight: 20, fontFamily: FONTS.regular },
  later: { alignSelf: 'center', paddingVertical: 6 },
  laterText: { color: DARK.accent, fontSize: 15, fontFamily: FONTS.medium },
  hint: { color: DARK.muted, fontSize: 12, textAlign: 'center', fontFamily: FONTS.regular },
});
