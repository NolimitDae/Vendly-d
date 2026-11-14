const path = require('path');
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

// Expo's default config plus Debug IDs on the bundle and its source maps, so Sentry can show readable
// stack traces (the maps are uploaded during App Store builds; see the Sentry plugin in app.json)
const config = getSentryExpoConfig(__dirname);

// Stripe's React Native SDK can't bundle for web; swap in a stub so screens can be previewed in a browser.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === '@stripe/stripe-react-native') {
    return { type: 'sourceFile', filePath: path.join(__dirname, 'web-stubs/stripe.js') };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
