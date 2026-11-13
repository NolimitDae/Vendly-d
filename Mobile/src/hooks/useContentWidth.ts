import { useWindowDimensions } from 'react-native';

/** On an iPad the app is a centred column this wide (App.tsx TabletFrame); phones use the whole screen. */
export const TABLET_COLUMN = 760;
/** Screens at least this wide (iPad) get the centred column. */
export const TABLET_MIN = 768;

/** The width the app's content really has: the screen on a phone, the centred column on an iPad. */
export function useContentWidth() {
  const { width, height } = useWindowDimensions();
  return { width: width >= TABLET_MIN ? Math.min(width, TABLET_COLUMN) : width, height };
}
