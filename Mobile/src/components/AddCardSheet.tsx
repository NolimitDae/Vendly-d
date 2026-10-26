import React, { useState } from 'react';
import { Alert, Animated, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { GradientButton } from './brand';
import { DARK, FONTS } from '../constants/colors';
import { PaymentsService } from '../services/payments.service';
import { apiMessage } from '../screens/auth/SignIn';
import { useSlideUp } from './useSlideUp';

// Stripe's native module isn't available in Expo Go or on web; the sheet then explains instead of crashing.
let CardField: React.ComponentType<any> | null = null;
let useStripe: () => { confirmSetupIntent?: (secret: string, params: any) => Promise<{ setupIntent?: { paymentMethodId?: string | null; paymentMethod?: { id: string } | null }; error?: { message: string } }> } = () => ({});
try {
  const stripe = require('@stripe/stripe-react-native');
  CardField = stripe.CardField ?? null;
  useStripe = stripe.useStripe ?? useStripe;
} catch {}

/** Bottom sheet that saves a card to the customer's Stripe profile and hands back its id. */
export default function AddCardSheet({ visible, onClose, onSaved }: { visible: boolean; onClose: () => void; onSaved: (paymentMethodId: string) => void }) {
  const insets = useSafeAreaInsets();
  const { confirmSetupIntent } = useStripe();
  const [complete, setComplete] = useState(false);
  const [saving, setSaving] = useState(false);
  const slide = useSlideUp(visible);
  const supported = !!CardField && !!confirmSetupIntent && Platform.OS !== 'web';

  const save = async () => {
    if (!confirmSetupIntent) return;
    setSaving(true);
    try {
      const res = await PaymentsService.setupIntent();
      const secret = res.data?.data?.client_secret;
      if (!secret) throw new Error('Could not start card setup');
      const { setupIntent, error } = await confirmSetupIntent(secret, { paymentMethodType: 'Card' });
      if (error) {
        // Stripe's own wording ("Your card was declined.") is the useful part; a key mix-up between the
        // app and the server reads "No such setupintent", which the customer can't act on.
        const setupProblem = /no such (setup_?intent|customer)|api key|publishable/i.test(error.message ?? '');
        Sentry.captureMessage(`Card setup failed: ${error.message}`, setupProblem ? 'error' : 'warning');
        throw new Error(setupProblem ? 'Card payments aren’t available right now. We’ve been told and are fixing it.' : error.message);
      }
      const id = setupIntent?.paymentMethodId ?? setupIntent?.paymentMethod?.id;
      if (!id) throw new Error('Card was not saved');
      Keyboard.dismiss();
      onSaved(id);
      onClose();
    } catch (err) {
      Alert.alert('Could not save card', apiMessage(err, 'Check the details and try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* the sheet rides up with the keyboard so Save card stays visible */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Pressable style={s.overlay} onPress={() => (Keyboard.isVisible() ? Keyboard.dismiss() : onClose())}>
        <Animated.View style={slide}>
        <Pressable style={[s.sheet, { paddingBottom: insets.bottom + 24 }]} onPress={Keyboard.dismiss}>
          <View style={s.handle} />
          <Text style={s.title}>Add Your Payment Information</Text>
          <Text style={s.body}>Your card is saved securely with Stripe. Nothing is charged until the vendor accepts your request.</Text>
          {supported && CardField ? (
            <CardField
              postalCodeEnabled={false}
              placeholders={{ number: 'Card number' }}
              onCardChange={(c: { complete: boolean }) => setComplete(c.complete)}
              cardStyle={{ backgroundColor: DARK.field, textColor: '#FFFFFF', placeholderColor: DARK.muted, borderRadius: 24, fontSize: 16 }}
              style={s.cardField}
            />
          ) : (
            <View style={s.unsupported}>
              <Ionicons name="phone-portrait-outline" size={22} color={DARK.accent} />
              <Text style={s.unsupportedText}>Cards can be added in the installed Vendly app (not in Expo Go or the browser preview).</Text>
            </View>
          )}
          <GradientButton title="Save card" onPress={save} loading={saving} disabled={!supported || !complete} />
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
  cardField: { height: 56 },
  unsupported: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 16, backgroundColor: DARK.field },
  unsupportedText: { flex: 1, color: '#fff', fontSize: 13, lineHeight: 19, fontFamily: FONTS.medium },
});
