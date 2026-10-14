"use client";

import SavedCards from "@/components/payments/SavedCards";

export default function PaymentMethodsPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Payment methods</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Vendors are paid from your saved card when they accept a request. Nothing is charged before that.</p>
      </div>
      <section className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700">
        <SavedCards />
      </section>
    </div>
  );
}
