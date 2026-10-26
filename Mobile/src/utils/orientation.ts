import * as ScreenOrientation from 'expo-screen-orientation';

// The app is used upright; only the signature pad turns the screen sideways so there's room to sign.
// The native build allows both (app.json "orientation": "default"), so everything else is locked here.

export function lockPortrait() {
  ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
}

export function lockLandscape() {
  ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
}
