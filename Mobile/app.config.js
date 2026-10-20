// Extends app.json with values that come from the environment at build time.
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
