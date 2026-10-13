const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Stripe's React Native SDK can't bundle for web; swap in a stub so screens can be previewed in a browser.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === '@stripe/stripe-react-native') {
    return { type: 'sourceFile', filePath: path.join(__dirname, 'web-stubs/stripe.js') };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
