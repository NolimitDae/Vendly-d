// Extends app.json with values that come from the environment at build time.
// GOOGLE_MAPS_ANDROID_KEY (an EAS environment variable) turns on the live booking map on Android.
// Google sign-in on iOS returns to the app through the reversed iOS client ID, which has to be a
// registered URL scheme; it's only added when EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID is set.
const { withEntitlementsPlist } = require('expo/config-plugins');

module.exports = ({ config }) => {
  // shortcut: the ad-hoc profile was made before Sign in with Apple was added, so test builds leave it out;
  // remove once the profile is regenerated with that capability.
  if (['development', 'preview'].includes(process.env.EAS_BUILD_PROFILE)) {
    config = withEntitlementsPlist({ ...config, ios: { ...config.ios, usesAppleSignIn: false } }, (c) => {
      delete c.modResults['com.apple.developer.applesignin'];
      return c;
    });
  }
  // the live booking map uses Google Maps on Android, which needs a key (iPhone uses Apple Maps, no key);
  // without one the Android app shows the map picture instead
  const androidMapsKey = process.env.GOOGLE_MAPS_ANDROID_KEY;
  if (androidMapsKey) {
    config = {
      ...config,
      android: { ...config.android, config: { ...config.android?.config, googleMaps: { apiKey: androidMapsKey } } },
      // the key itself isn't in the app's public config, so the app reads this flag instead
      extra: { ...config.extra, androidLiveMap: true },
    };
  }
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  if (!iosClientId) return config;
  const reversed = iosClientId.split('.').reverse().join('.');
  const urlTypes = config.ios?.infoPlist?.CFBundleURLTypes ?? [];
  return {
    ...config,
    ios: {
      ...config.ios,
      infoPlist: {
        ...config.ios?.infoPlist,
        CFBundleURLTypes: [...urlTypes, { CFBundleURLSchemes: [reversed] }],
      },
    },
  };
};
