import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { useStripe } from '@stripe/stripe-react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import { api } from '../../services/api';
import type { CustomerBookingsStackParams, PaymentProps } from '../../navigation/types';

type Nav = NativeStackNavigationProp<CustomerBookingsStackParams>;

export default function PaymentScreen() {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const navigation = useNavigation<Nav>();
  const route = useRoute<PaymentProps['route']>();
  const { bookingId, amount, currency } = route.params;

  const [loading, setLoading] = useState(false);
  const [paid, setPaid] = useState(false);

  const handlePay = async () => {
    setLoading(true);
    try {
      const { data } = await api.post<{
        success: boolean;
        data: { clientSecret: string; ephemeralKey: string; customerId: string };
      }>(`/bookings/${bookingId}/payment-intent`);

      if (!data.success) {
        Alert.alert('Error', 'Could not initialize payment. Please try again.');
        return;
      }

      const { clientSecret, ephemeralKey, customerId } = data.data;

      const initResult = await initPaymentSheet({
        merchantDisplayName: 'Vendly',
        customerId,
        customerEphemeralKeySecret: ephemeralKey,
        paymentIntentClientSecret: clientSecret,
        allowsDelayedPaymentMethods: false,
      });

      if (initResult.error) {
        Alert.alert('Payment Error', initResult.error.message);
        return;
      }

      const payResult = await presentPaymentSheet();

      if (payResult.error) {
        if (payResult.error.code !== 'Canceled') {
          Alert.alert('Payment Failed', payResult.error.message);
        }
        return;
      }

      // Confirm with backend
      await api.post(`/bookings/${bookingId}/confirm-payment`);
      setPaid(true);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message ?? 'Payment failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (paid) {
    return (
      <View style={styles.successContainer}>
        <Ionicons name="checkmark-circle" size={72} color={COLORS.primary} />
        <Text style={styles.successTitle}>Payment Complete!</Text>
        <Text style={styles.successSub}>Your booking has been confirmed.</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('CustomerBookings')}
        >
          <Text style={styles.buttonText}>View My Bookings</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Ionicons name="card-outline" size={40} color={COLORS.primary} style={styles.icon} />
        <Text style={styles.title}>Complete Payment</Text>
        <Text style={styles.amount}>
          {(amount / 100).toLocaleString('en-US', {
            style: 'currency',
            currency: currency.toUpperCase(),
          })}
        </Text>
        <Text style={styles.meta}>Booking #{bookingId.slice(0, 8).toUpperCase()}</Text>
      </View>

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handlePay}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={COLORS.white} size="small" />
        ) : (
          <>
            <Ionicons name="lock-closed" size={16} color={COLORS.white} style={{ marginRight: 6 }} />
            <Text style={styles.buttonText}>Pay Securely</Text>
          </>
        )}
      </TouchableOpacity>

      <Text style={styles.stripeNote}>Secured by Stripe</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.gray[50],
    padding: 24,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  icon: { marginBottom: 12 },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.gray[900],
    marginBottom: 8,
  },
  amount: {
    fontSize: 36,
    fontWeight: '800',
    color: COLORS.primary,
    marginBottom: 6,
  },
  meta: {
    fontSize: 13,
    color: COLORS.gray[400],
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
  },
  stripeNote: {
    textAlign: 'center',
    marginTop: 14,
    fontSize: 12,
    color: COLORS.gray[400],
  },
  successContainer: {
    flex: 1,
    backgroundColor: COLORS.gray[50],
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  successTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.gray[900],
    marginTop: 20,
    marginBottom: 8,
  },
  successSub: {
    fontSize: 15,
    color: COLORS.gray[500],
    marginBottom: 32,
  },
});
