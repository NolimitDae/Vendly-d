import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BrandGradient, GradientButton, ui } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import type { AuthStackParams } from '../../navigation/types';

export const ONBOARDED_KEY = 'vendly_onboarded';

const SLIDES = [
  {
    image: require('../../../assets/onboarding/onboarding-1.jpg'),
    crop: { w: 3, h: 0.7306, left: -1.0533, top: -0.05 },
    title: 'Everything You Need, In One Place',
    body: 'Beauty, creativity, and event services brought together to make planning effortless.',
  },
  {
    image: require('../../../assets/onboarding/onboarding-2.jpg'),
    crop: { w: 2.11, h: 0.6321, left: -0.555, top: -0.0069 },
    title: 'Discover. Book. Create.',
    body: 'Find trusted professionals, explore real work, and book with confidence.',
  },
  {
    image: require('../../../assets/onboarding/onboarding-3.jpg'),
    crop: { w: 1, h: 0.6919, left: 0, top: -0.0036 },
    title: 'Built on Trust and Ease',
    body: 'Clear pricing, secure deposits, and simple communication — so everyone’s time is respected.',
  },
  {
    image: require('../../../assets/onboarding/onboarding-4.jpg'),
    crop: { w: 1.18, h: 0.8164, left: -0.09, top: -0.1434 },
    title: 'Bring Your Vision to Life',
    body: 'From everyday services to unforgettable events — everything you need to make it happen.',
  },
];

const PANEL = 302;
const CURVE = 40;

export default function Onboarding({ navigation }: NativeStackScreenProps<AuthStackParams, 'Onboarding'>) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;
  const panel = Math.max(PANEL, 268 + insets.bottom);

  useEffect(() => {
    fade.setValue(0.4);
    Animated.timing(fade, { toValue: 1, duration: 350, useNativeDriver: true }).start();
  }, [index, fade]);

  const finish = async () => {
    await AsyncStorage.setItem(ONBOARDED_KEY, '1');
    navigation.replace('RoleSelect');
  };

  const slide = SLIDES[index];
  const last = index === SLIDES.length - 1;

  return (
    <View style={s.root}>
      <Animated.View style={[s.photo, { height: height - panel + CURVE, opacity: fade }]}>
        {/* Figma crops each photo relative to the full 375x812 frame; scale that to this screen */}
        <Image
          source={slide.image}
          resizeMode="cover"
          style={{ position: 'absolute', width: width * slide.crop.w, height: height * slide.crop.h, left: width * slide.crop.left, top: height * slide.crop.top }}
        />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.2)' }]} />
      </Animated.View>

      <View style={[s.progressRow, { top: insets.top + 8 }]}>
        <View style={s.bars}>
          {SLIDES.map((_, i) =>
            i <= index ? (
              <BrandGradient key={i} style={s.bar} />
            ) : (
              <View key={i} style={[s.bar, { backgroundColor: '#fff' }]} />
            ),
          )}
        </View>
        <Pressable onPress={finish} hitSlop={12} accessibilityRole="button">
          <Text style={s.skip}>Skip</Text>
        </Pressable>
      </View>

      {/* Concave corner where the photo meets the panel, as in the Figma "Exclude" shape */}
      <Svg width={CURVE} height={CURVE} style={[s.corner, { bottom: panel }]}>
        <Path d={`M0 0A${CURVE} ${CURVE} 0 0 0 ${CURVE} ${CURVE}H0Z`} fill={DARK.bg} />
      </Svg>

      <View style={[s.panel, { height: panel, paddingBottom: insets.bottom + 20 }]}>
        <View style={{ gap: 6, alignItems: 'center' }}>
          <Text style={s.title}>{slide.title}</Text>
          <Text style={ui.body}>{slide.body}</Text>
        </View>
        <GradientButton
          pill
          title={last ? 'Get Started' : 'Next'}
          onPress={() => (last ? finish() : setIndex(index + 1))}
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  photo: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
  progressRow: { position: 'absolute', left: 20, right: 20, flexDirection: 'row', alignItems: 'center', gap: 16 },
  bars: { flex: 1, flexDirection: 'row', gap: 6 },
  bar: { flex: 1, height: 6, borderRadius: 100 },
  skip: { color: '#fff', fontSize: 14, fontFamily: FONTS.medium },
  corner: { position: 'absolute', left: 0 },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: DARK.bg,
    borderTopRightRadius: CURVE,
    paddingTop: 40,
    paddingHorizontal: 20,
    justifyContent: 'space-between',
  },
  title: { color: '#fff', fontSize: 28, lineHeight: 36, fontFamily: FONTS.semibold, textAlign: 'center', maxWidth: 290 },
});
