"use client";

import { useEffect, useState } from "react";
import { DEFAULT_PAYMENT_SETTINGS, PaymentsService, type PaymentSettings } from "@/service/payments/payments.service";

// The fee and large booking rules from Admin → Settings, for wording ("5%, up to $500"). Read once per
// page load; until it arrives (or if it fails) the defaults are shown.
let cache: Promise<PaymentSettings> | null = null;
const load = () =>
  (cache ??= Promise.resolve()
    .then(() => PaymentsService.paymentSettings())
    .then((r) => ({ ...DEFAULT_PAYMENT_SETTINGS, ...(r?.data?.data ?? {}) }))
    .catch(() => {
      cache = null;
      return DEFAULT_PAYMENT_SETTINGS;
    }));

export function usePaymentSettings(): PaymentSettings {
  const [s, setS] = useState<PaymentSettings>(DEFAULT_PAYMENT_SETTINGS);
  useEffect(() => {
    let alive = true;
    load().then((v) => alive && setS(v));
    return () => {
      alive = false;
    };
  }, []);
  return s;
}
