// Extends app.json with values that come from the environment at build time.
// Google sign-in on iOS returns to the app through the reversed iOS client ID, which has to be a
// registered URL scheme; it's only added when EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID is set.
module.exports = ({ config }) => {
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
