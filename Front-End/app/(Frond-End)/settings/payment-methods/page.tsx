"use client";

import SavedCards from "@/components/payments/SavedCards";
import TransactionsList from "@/components/payments/TransactionsList";
import { usePaymentSettings } from "@/hooks/usePaymentSettings";
import { BANK_CLEARING_TEXT, wholeMoney } from "@/service/payments/payments.service";

export default function PaymentMethodsPage() {
  const { large_payment_threshold: largeFrom } = usePaymentSettings();
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Payment methods</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Vendors are paid from your saved card when they accept a request. Nothing is charged before that.</p>
      </div>
      <section className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700">
        {/* bank accounts pay only for large bookings (Admin → Settings; off when there's no threshold) */}
        <SavedCards
          allowBank={!!largeFrom}
          bankNote={largeFrom ? `A bank account can pay for bookings of ${wholeMoney(largeFrom)} or more. Bank payments take ${BANK_CLEARING_TEXT} to clear.` : undefined}
        />
      </section>
      <TransactionsList role="customer" title="Payments and refunds" />
    </div>
  );
}
