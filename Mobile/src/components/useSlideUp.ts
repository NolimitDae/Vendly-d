import { useEffect, useRef } from 'react';
import { Animated, Dimensions, Easing } from 'react-native';
import { useReduceMotion } from './brand';

const FROM = Dimensions.get('window').height * 0.5;
const EASE = Easing.bezier(0.2, 0.9, 0.3, 1);

/**
 * Bottom sheets open with the Modal on "fade" (so the dim backdrop fades in place instead of sliding up
 * with the sheet), and the sheet panel itself slides up with this transform. Closing just fades.
 * With Reduce Motion on the panel doesn't move.
 */
export function useSlideUp(visible: boolean) {
  const reduceMotion = useReduceMotion();
  const y = useRef(new Animated.Value(FROM)).current;
  useEffect(() => {
    if (!visible) {
      y.setValue(FROM);
      return;
    }
    if (reduceMotion) {
      y.setValue(0);
      return;
    }
    const anim = Animated.timing(y, { toValue: 0, duration: 320, easing: EASE, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [visible, reduceMotion, y]);
  return { transform: [{ translateY: y }] };
}
