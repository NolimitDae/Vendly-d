import 'react-native-gesture-handler'; // must be first
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { AuthProvider } from './src/contexts/AuthContext';
import RootNavigator from './src/navigation';
import * as Sentry from '@sentry/react-native';
import { lockPortrait } from './src/utils/orientation';
import { View, useWindowDimensions } from 'react-native';
import { DARK } from './src/constants/colors';
import { TABLET_COLUMN, TABLET_MIN } from './src/hooks/useContentWidth';

// upright everywhere except the signature pad (src/utils/orientation.ts)
lockPortrait();

// Crash and error reports. Off unless EXPO_PUBLIC_SENTRY_DSN is set for the build.
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.EXPO_PUBLIC_SENTRY_DSN,
  environment: process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT ?? (__DEV__ ? 'development' : 'production'),
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
});

// StripeProvider uses a native module unavailable in Expo Go — wrap conditionally
let StripeProvider: React.ComponentType<any> = ({ children }: { children: React.ReactNode }) => <>{children}</>;
try {
  StripeProvider = require('@stripe/stripe-react-native').StripeProvider;
} catch {}

const STRIPE_PK = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

/**
 * On an iPad the app is a centred column (the phone layout at a comfortable width) instead of stretched
 * across the whole screen; phones are unchanged.
 */
function TabletFrame({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  if (width < TABLET_MIN) return <>{children}</>;
  return (
    <View style={{ flex: 1, backgroundColor: DARK.bg, alignItems: 'center' }}>
      <View style={{ flex: 1, width: Math.min(width, TABLET_COLUMN), overflow: 'hidden' }}>{children}</View>
    </View>
  );
}

function App() {
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  // The native splash stays up meanwhile; on a font error, carry on with system fonts.
  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <StripeProvider publishableKey={STRIPE_PK}>
        <AuthProvider>
          {/* before the navigator, so a screen's own status bar (the launch screen's dark one) wins while it shows */}
          <StatusBar style="light" />
          <TabletFrame>
            <RootNavigator />
          </TabletFrame>
        </AuthProvider>
      </StripeProvider>
    </SafeAreaProvider>
  );
}

export default Sentry.wrap(App);
