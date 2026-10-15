import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as AppleAuthentication from 'expo-apple-authentication';
import { OutlineButton } from './brand';
import { useAuth } from '../context/AuthContext';
import { GOOGLE_IDS, socialSignIn, type SocialPending } from '../services/socialAuth';
import { apiMessage } from '../screens/auth/SignIn';

WebBrowser.maybeCompleteAuthSession();

const googleConfigured = Platform.select({
  ios: !!GOOGLE_IDS.iosClientId,
  android: !!GOOGLE_IDS.androidClientId,
  default: !!GOOGLE_IDS.webClientId,
});

/** "Continue with Google / Apple". New accounts are sent to pick a role (onNeedsRole). */
export default function SocialButtons({ onNeedsRole }: { onNeedsRole: (pending: SocialPending) => void }) {
  const { login } = useAuth();
  const [busy, setBusy] = useState<'google' | 'apple' | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'ios') AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => {});
  }, []);

  const finish = async (pending: SocialPending) => {
    try {
      const result = await socialSignIn(pending, login);
      if (result === 'needs_role') onNeedsRole(pending);
    } catch (err) {
      Alert.alert('Sign-in failed', apiMessage(err, 'Try again, or use your email.'));
    } finally {
      setBusy(null);
    }
  };

  const apple = async () => {
    setBusy('apple');
    try {
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      });
      if (!cred.identityToken) throw new Error('Apple didn’t return a sign-in token');
      // Apple only shares the name the first time, so pass it along for the new account
      const name = [cred.fullName?.givenName, cred.fullName?.familyName].filter(Boolean).join(' ') || undefined;
      await finish({ provider: 'apple', id_token: cred.identityToken, name });
    } catch (err: any) {
      setBusy(null);
      if (err?.code !== 'ERR_REQUEST_CANCELED') Alert.alert('Apple sign-in failed', err?.message ?? 'Try again.');
    }
  };

  return (
    <View style={{ gap: 16 }}>
      {googleConfigured ? (
        <GoogleButton busy={busy === 'google'} onStart={() => setBusy('google')} onCancel={() => setBusy(null)} onToken={(t) => finish({ provider: 'google', id_token: t })} />
      ) : (
        <OutlineButton title="Continue with Google" icon={<Ionicons name="logo-google" size={22} color="#fff" />} onPress={() => Alert.alert('Coming soon', 'Google sign-in is being switched on. Use your email for now.')} />
      )}
      {appleAvailable && (
        <OutlineButton title="Continue with Apple" icon={busy === 'apple' ? <ActivityIndicator color="#fff" /> : <Ionicons name="logo-apple" size={24} color="#fff" />} onPress={apple} />
      )}
    </View>
  );
}

/** Kept separate so the Google hook only runs when client IDs exist (it throws without them). */
function GoogleButton({ busy, onStart, onCancel, onToken }: { busy: boolean; onStart: () => void; onCancel: () => void; onToken: (idToken: string) => void }) {
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    iosClientId: GOOGLE_IDS.iosClientId,
    androidClientId: GOOGLE_IDS.androidClientId,
    webClientId: GOOGLE_IDS.webClientId,
    clientId: GOOGLE_IDS.webClientId,
  });

  useEffect(() => {
    if (!response) return;
    if (response.type === 'success' && response.params?.id_token) onToken(response.params.id_token);
    else if (response.type === 'error') {
      onCancel();
      Alert.alert('Google sign-in failed', response.error?.message ?? 'Try again.');
    } else onCancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  return (
    <OutlineButton
      title="Continue with Google"
      icon={busy ? <ActivityIndicator color="#fff" /> : <Ionicons name="logo-google" size={22} color="#fff" />}
      onPress={() => {
        if (!request) return;
        onStart();
        promptAsync();
      }}
    />
  );
}
