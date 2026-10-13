// Web-only stand-in for @stripe/stripe-react-native, which imports native internals that break the web bundle.
// Only used for browser previews of screens (`npm run web`); payments need a device build.
module.exports = { StripeProvider: ({ children }) => children, useStripe: () => ({}), CardField: () => null };
