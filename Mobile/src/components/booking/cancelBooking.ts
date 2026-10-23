import { Alert } from 'react-native';
import { BookingMoneyService, type CancellationSummary } from '../../services/bookingMoney.service';

const errorText = (err: any, fallback: string) => err?.response?.data?.message ?? fallback;

/**
 * Cancel confirmation that first shows what cancelling now does with the money
 * (GET /bookings/:id/cancel-preview), then cancels and shows the refund result.
 * Resolves once the user has answered; `onCancelled` runs after a successful cancel.
 */
export async function confirmCancelBooking(opts: {
  bookingId: string;
  role: 'CUSTOMER' | 'VENDOR';
  /** "Cancel request" for a request the vendor hasn't accepted yet */
  title?: string;
  reason?: string;
  onCancelled?: (summary: CancellationSummary | null) => void;
}) {
  let preview: CancellationSummary | null = null;
  try {
    preview = (await BookingMoneyService.cancelPreview(opts.bookingId)).data?.data ?? null;
  } catch (err: any) {
    // the booking can no longer be cancelled (a 400 says why); otherwise still let them cancel
    if (err?.response?.status === 400 || err?.response?.status === 403) {
      Alert.alert('Can’t cancel', errorText(err, 'This booking can’t be cancelled now.'));
      return;
    }
  }
  const policy = preview?.policy && preview.cancelled_by === 'CUSTOMER' ? `\n\n${preview.policy.label} cancellation policy: ${preview.policy.text}` : '';
  const body = preview ? `${preview.message}${policy}` : 'Any payment is refunded under the contract’s cancellation terms.';

  await new Promise<void>((resolve) => {
    Alert.alert(opts.title ?? (opts.role === 'VENDOR' ? 'Cancel this booking?' : 'Cancel your booking?'), body, [
      { text: 'Keep it', style: 'cancel', onPress: () => resolve() },
      {
        text: 'Cancel booking',
        style: 'destructive',
        onPress: async () => {
          try {
            const res = await BookingMoneyService.cancel(opts.bookingId, opts.reason);
            const summary = res.data?.data?.refund_summary ?? null;
            opts.onCancelled?.(summary);
            // the message already says how much comes back, to which card and when
            Alert.alert('Booking cancelled', summary?.message ?? 'The booking is cancelled.');
          } catch (err) {
            Alert.alert('Could not cancel', errorText(err, 'Try again in a moment.'));
          } finally {
            resolve();
          }
        },
      },
    ], { cancelable: true, onDismiss: () => resolve() });
  });
}
