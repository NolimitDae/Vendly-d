import React, { useEffect, useState } from 'react';
import { Alert, Animated, Keyboard, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { GradientButton } from './brand';
import { DARK, FONTS } from '../constants/colors';
import { BANK_CLEARING_TEXT, PaymentsService } from '../services/payments.service';
import { apiMessage } from '../screens/auth/SignIn';
import { useSlideUp } from './useSlideUp';

// Stripe's bank account flow (Financial Connections) comes with the Stripe module already in the app;
// in Expo Go, on the web preview or if it's missing, the sheet offers the website instead.
type BankResult = { setupIntent?: { status?: string; paymentMethodId?: string | null; paymentMethod?: { id: string; USBankAccount?: { last4?: string | null; bankName?: string | null } | null } | null }; error?: { code?: string; message: string } };
let collectBankAccountForSetup: ((secret: string, params: any) => Promise<BankResult>) | null = null;
let confirmSetupIntent: ((secret: string, params: any) => Promise<BankResult>) | null = null;
try {
  const stripe = require('@stripe/stripe-react-native');
  collectBankAccountForSetup = stripe.collectBankAccountForSetup ?? null;
  confirmSetupIntent = stripe.confirmSetupIntent ?? null;
} catch {}

const WEB = (process.env.EXPO_PUBLIC_WEB_URL ?? 'https://vendlymarketplace.com').replace(/\/+$/, '');

/** The authorization the customer gives when saving a bank account (ACH debits need it). Same words as the website. */
export const BANK_MANDATE_TEXT =
  'By saving this bank account, you authorize Vendly to debit it for the payments due on bookings you choose to pay with it (deposits, balances and add-ons you approve), under the Vendly Terms of Service, until you remove it. You can remove it at any time in Payment methods. Bank payments take about 4 business days to clear.';

/**
 * Bottom sheet that connects a US bank account with Stripe (the customer signs in to their bank in
 * Stripe's window, so it's verified straight away), shows the authorization and saves it. For large bookings.
 */
export default function AddBankSheet({ visible, onClose, onSaved, holderName }: { visible: boolean; onClose: () => void; onSaved: (paymentMethodId: string) => void; holderName?: string | null }) {
  const insets = useSafeAreaInsets();
  const slide = useSlideUp(visible);
  const [name, setName] = useState(holderName ?? '');
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  // the account picked in Stripe's window, waiting for the customer to authorize it
  const [picked, setPicked] = useState<{ last4?: string | null; bank?: string | null } | null>(null);
  const supported = !!collectBankAccountForSetup && !!confirmSetupIntent && Platform.OS !== 'web';

  useEffect(() => {
    if (!visible) {
      setPicked(null);
      setSecret(null);
    }
  }, [visible]);

  const connect = async () => {
    if (!collectBankAccountForSetup || name.trim().length < 2) return;
    setBusy(true);
    try {
      const res = await PaymentsService.setupIntent('us_bank_account');
      const s = res.data?.data?.client_secret;
      if (!s) throw new Error('Could not start bank setup');
      const { setupIntent, error } = await collectBankAccountForSetup(s, {
        paymentMethodType: 'USBankAccount',
        paymentMethodData: { billingDetails: { name: name.trim() } },
      });
      if (error) {
        // closed Stripe's window: nothing to say
        if (error.code === 'Canceled') return;
        Sentry.captureMessage(`Bank setup failed: ${error.message}`, 'warning');
        throw new Error(error.message);
      }
      if (setupIntent?.status === 'RequiresPaymentMethod') return;
      setSecret(s);
      setPicked({ last4: setupIntent?.paymentMethod?.USBankAccount?.last4, bank: setupIntent?.paymentMethod?.USBankAccount?.bankName });
    } catch (err) {
      Alert.alert('Could not connect your bank', apiMessage(err, 'Try again, or pay with a card.'));
    } finally {
      setBusy(false);
    }
  };

  const authorize = async () => {
    if (!confirmSetupIntent || !secret) return;
    setBusy(true);
    try {
      const { setupIntent, error } = await confirmSetupIntent(secret, { paymentMethodType: 'USBankAccount' });
      if (error) throw new Error(error.message);
      if (setupIntent?.status !== 'Succeeded') throw new Error('Your bank needs more checks before it can be used. Please pay with a card for now.');
      const id = setupIntent.paymentMethodId ?? setupIntent.paymentMethod?.id;
      if (!id) throw new Error('The bank account was not saved');
      Keyboard.dismiss();
      onSaved(id);
      onClose();
    } catch (err) {
      Alert.alert('Could not save the bank account', apiMessage(err, 'Try again, or pay with a card.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={s.overlay} onPress={() => (Keyboard.isVisible() ? Keyboard.dismiss() : onClose())}>
          <Animated.View style={slide}>
            <Pressable style={[s.sheet, { paddingBottom: insets.bottom + 24 }]} onPress={Keyboard.dismiss}>
              <View style={s.handle} />
              <Text style={s.title}>Add a bank account</Text>
              {!supported ? (
                <>
                  <View style={s.note}>
                    <Ionicons name="globe-outline" size={22} color={DARK.accent} />
                    <Text style={s.noteText}>Bank accounts can be added on the Vendly website for now. Add it under Payment methods, then come back and pick it here.</Text>
                  </View>
                  <GradientButton title="Open the website" onPress={() => Linking.openURL(`${WEB}/settings/payment-methods`).catch(() => {})} />
                </>
              ) : picked ? (
                <>
                  <Text style={s.account}>{picked.bank ? `${picked.bank} ` : ''}Bank account •••• {picked.last4}</Text>
                  <Text style={s.body}>{BANK_MANDATE_TEXT}</Text>
                  <GradientButton title="Agree and save" onPress={authorize} loading={busy} />
                </>
              ) : (
                <>
                  <Text style={s.body}>You sign in to your bank in a secure Stripe window to connect your account. Bank payments take {BANK_CLEARING_TEXT} to clear. Nothing is taken until the vendor accepts your request.</Text>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="Account holder name"
                    placeholderTextColor={DARK.muted}
                    autoComplete="name"
                    style={s.input}
                    accessibilityLabel="Account holder name"
                  />
                  <GradientButton title="Connect your bank" onPress={connect} loading={busy} disabled={name.trim().length < 2} />
                </>
              )}
            </Pressable>
          </Animated.View>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: DARK.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingTop: 12, gap: 16 },
  handle: { alignSelf: 'center', width: 60, height: 5, borderRadius: 3, backgroundColor: DARK.muted, marginBottom: 8 },
  title: { color: '#fff', fontSize: 20, fontFamily: FONTS.semibold },
  body: { color: DARK.muted, fontSize: 14, lineHeight: 21, fontFamily: FONTS.regular },
  account: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  input: { height: 52, borderRadius: 24, paddingHorizontal: 18, backgroundColor: DARK.field, color: '#fff', fontSize: 16, fontFamily: FONTS.regular },
  note: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 16, backgroundColor: DARK.field },
  noteText: { flex: 1, color: '#fff', fontSize: 13, lineHeight: 19, fontFamily: FONTS.medium },
});
