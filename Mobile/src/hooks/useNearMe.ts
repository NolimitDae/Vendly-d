import { useCallback, useEffect, useState } from 'react';
import { Linking } from 'react-native';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type NearMeStatus = 'checking' | 'ask' | 'locating' | 'on' | 'denied' | 'error';
export interface Coords {
  lat: number;
  lng: number;
}

const DISMISS_KEY = 'nearMe.dismissed';
/** ~11 m precision is plenty for "near me" and avoids sending an exact position. */
const round = (n: number) => Number(n.toFixed(4));

/**
 * The phone's position for "vendors near you". Checks the permission without prompting on mount;
 * `ask()` shows the system prompt, or opens Settings when the user said no before and iOS/Android
 * won't ask again.
 */
export function useNearMe() {
  const [status, setStatus] = useState<NearMeStatus>('checking');
  const [coords, setCoords] = useState<Coords | null>(null);
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [dismissed, setDismissed] = useState(true);

  const locate = useCallback(async () => {
    setStatus('locating');
    try {
      // A recent fix is instant; otherwise ask the GPS (balanced accuracy is enough for miles).
      const last = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60 * 1000 });
      const pos = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      setCoords({ lat: round(pos.coords.latitude), lng: round(pos.coords.longitude) });
      setStatus('on');
      return true;
    } catch {
      setStatus('error');
      return false;
    }
  }, []);

  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(DISMISS_KEY).then((v) => live && setDismissed(v === '1')).catch(() => live && setDismissed(false));
    Location.getForegroundPermissionsAsync()
      .then((p) => {
        if (!live) return;
        setCanAskAgain(p.canAskAgain);
        if (p.granted) void locate();
        else setStatus(p.status === Location.PermissionStatus.DENIED ? 'denied' : 'ask');
      })
      .catch(() => live && setStatus('ask'));
    return () => {
      live = false;
    };
  }, [locate]);

  const ask = useCallback(async () => {
    if (status === 'denied' && !canAskAgain) {
      await Linking.openSettings();
      return false;
    }
    const p = await Location.requestForegroundPermissionsAsync();
    setCanAskAgain(p.canAskAgain);
    if (!p.granted) {
      setStatus('denied');
      return false;
    }
    return locate();
  }, [status, canAskAgain, locate]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    AsyncStorage.setItem(DISMISS_KEY, '1').catch(() => {});
  }, []);

  return { status, coords, canAskAgain, ask, retry: locate, dismissed, dismiss };
}
