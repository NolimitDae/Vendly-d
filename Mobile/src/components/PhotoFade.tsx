import React from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { DARK } from '../constants/colors';

/**
 * Fades the bottom of a card's photo into the card, so the photo runs edge to edge with no frame and
 * the words below sit on the same colour.
 */
export default function PhotoFade({ color = DARK.card, height = '45%' }: { color?: string; height?: `${number}%` | number }) {
  return (
    <LinearGradient
      pointerEvents="none"
      colors={['transparent', color]}
      style={[StyleSheet.absoluteFill, { top: undefined, height }]}
    />
  );
}
