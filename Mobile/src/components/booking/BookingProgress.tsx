import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, isToday, parseISO } from 'date-fns';
import { Card, useReduceMotion } from '../brand';
import { DARK, FONTS } from '../../constants/colors';
import type { Booking } from '../../services/booking.service';
import { trackerSteps } from '../../utils/bookingTracker';

const when = (iso: string) => {
  const d = parseISO(iso);
  return isToday(d) ? format(d, 'h:mm a') : format(d, 'd MMM, h:mm a');
};

/** The customer's step-by-step tracker for an accepted booking, with the time each step happened. */
export default function BookingProgress({ booking }: { booking: Booking }) {
  const steps = trackerSteps(booking);
  const current = steps.reduce((acc, st, i) => (st.done ? i : acc), -1);
  const finished = booking.status === 'COMPLETED';
  const reduceMotion = useReduceMotion();
  // the step we're at breathes gently until the booking is done; it stays still with Reduce Motion on
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion || finished) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, finished, pulse]);

  const summary = steps[current] ? `${steps[current].label}${steps[current].at ? ` at ${when(steps[current].at!)}` : ''}` : 'Waiting';

  return (
    <Card style={{ gap: 14 }}>
      <Text style={s.h2}>Booking progress</Text>
      <View style={s.row} accessible accessibilityLabel={`Booking progress: step ${current + 1} of ${steps.length}, ${summary}`}>
        {steps.map((st, i) => (
          <View key={st.key} style={s.step}>
            <View style={s.track}>
              <View style={[s.line, { opacity: i === 0 ? 0 : 1 }, st.done && s.lineDone]} />
              <View style={s.dotWrap}>
                {i === current && !finished && <Animated.View style={[s.halo, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.7] }) }]} />}
                <View style={[s.dot, st.done && s.dotDone]}>{st.done && <Ionicons name="checkmark" size={12} color="#fff" />}</View>
              </View>
              <View style={[s.line, { opacity: i === steps.length - 1 ? 0 : 1 }, steps[i + 1]?.done && s.lineDone]} />
            </View>
            <Text style={[s.label, st.done && s.labelDone]} numberOfLines={2}>{st.label}</Text>
            {!!st.at && st.done && <Text style={s.time}>{when(st.at)}</Text>}
          </View>
        ))}
      </View>
    </Card>
  );
}

const s = StyleSheet.create({
  h2: { color: '#fff', fontSize: 18, fontFamily: FONTS.semibold },
  row: { flexDirection: 'row' },
  step: { flex: 1, alignItems: 'center', gap: 6 },
  track: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  line: { flex: 1, height: 3, backgroundColor: DARK.field },
  lineDone: { backgroundColor: DARK.border },
  dotWrap: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 26, height: 26, borderRadius: 13, backgroundColor: DARK.border },
  dot: { width: 18, height: 18, borderRadius: 9, backgroundColor: DARK.field, borderWidth: 2, borderColor: DARK.muted, alignItems: 'center', justifyContent: 'center' },
  dotDone: { backgroundColor: DARK.border, borderColor: DARK.border },
  label: { color: DARK.muted, fontSize: 11, lineHeight: 14, fontFamily: FONTS.medium, textAlign: 'center' },
  labelDone: { color: '#fff' },
  time: { color: DARK.muted, fontSize: 10, fontFamily: FONTS.regular, textAlign: 'center' },
});
