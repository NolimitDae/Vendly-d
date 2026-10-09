import { createHash } from 'crypto';
import {
  CANCELLATION_PRESETS,
  PLATFORM_TERMS_CLAUSE,
} from './contract-templates';

export type MergeData = Record<string, string>;

export interface MergeInput {
  booking: {
    id: string;
    scheduled_at?: Date | string | null;
    event_start_at?: Date | string | null;
    event_end_at?: Date | string | null;
    venue_address?: string | null;
    guest_count?: number | null;
    message?: string | null;
    amount?: number | string | { toString(): string } | null;
    service_fee?: number | string | { toString(): string } | null;
    currency?: string | null;
  };
  listing?: { title?: string | null; description?: string | null } | null;
  vendor: {
    name?: string | null;
    email?: string | null;
    phone_number?: string | null;
    vendorProfile?: { business_name?: string | null; address?: string | null } | null;
  };
  customer: { name?: string | null; email?: string | null; type?: string | null };
  event?: { name?: string | null; venue?: string | null; guest_count?: number | null } | null;
  clientName?: string | null;
  fieldValues?: Record<string, unknown> | null;
  additionalTerms?: string | null;
  contractVersion: number;
  timezone?: string | null;
}

const LABELS: Record<string, string> = {
  event_date: 'event date',
  event_start_time: 'start time',
  event_end_time: 'end time',
  venue_address: 'venue address',
  guest_count: 'guest count',
  vendor_business_name: "vendor's business name",
  customer_name: 'customer name',
  vendor_price: 'price',
  cancellation_policy: 'cancellation policy',
  business_legal_name: 'business legal name',
  business_address: 'business address',
  governing_law: 'governing law',
};

export function fieldLabel(key: string) {
  return LABELS[key] ?? key.replace(/_/g, ' ');
}

function validTz(tz?: string | null) {
  if (!tz) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

function fmtDate(d: Date | string | null | undefined, tz: string) {
  if (!d) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  }).format(new Date(d));
}

function fmtTime(d: Date | string | null | undefined, tz: string) {
  if (!d) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(new Date(d));
}

export function fmtMoney(amount: unknown, currency?: string | null) {
  const n = Number(amount ?? 0);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: (currency || 'usd').toUpperCase(),
  }).format(Number.isFinite(n) ? n : 0);
}

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

export function buildMergeData(input: MergeInput): MergeData {
  const tz = validTz(input.timezone);
  const fv = Object.fromEntries(
    Object.entries(input.fieldValues ?? {}).map(([k, v]) => [k, str(v)]),
  );
  const b = input.booking;
  const currency = b.currency || 'usd';
  const price = Number(b.amount ?? 0);
  const serviceFee = Number(b.service_fee ?? 0);

  const preset = CANCELLATION_PRESETS[fv.cancellation_policy];
  const isPlanner = input.customer.type === 'EVENT_PLANNER';
  const eventDate = b.event_start_at ?? b.scheduled_at;

  const moneyField = (k: string) => (fv[k] ? fmtMoney(fv[k], currency) : '');

  const data: MergeData = {
    ...fv,
    vendor_business_name:
      fv.business_legal_name || str(input.vendor.vendorProfile?.business_name) || str(input.vendor.name),
    vendor_business_address: fv.business_address || str(input.vendor.vendorProfile?.address),
    vendor_contact: [str(input.vendor.email), str(input.vendor.phone_number)].filter(Boolean).join(', '),
    customer_name: str(input.customer.name),
    customer_role_label: isPlanner ? 'Event Planner' : 'Customer',
    client_name: str(input.clientName),
    event_name: str(input.event?.name) || str(input.listing?.title),
    event_date: fmtDate(eventDate, tz),
    event_start_time: b.event_start_at ? fmtTime(b.event_start_at, tz) : '',
    event_end_time: b.event_end_at ? fmtTime(b.event_end_at, tz) : '',
    venue_address: str(b.venue_address) || str(input.event?.venue),
    guest_count: str(b.guest_count ?? input.event?.guest_count),
    package_name: str(input.listing?.title),
    package_description: str(input.listing?.description),
    vendor_price: b.amount !== null && b.amount !== undefined ? fmtMoney(price, currency) : '',
    service_fee: fmtMoney(serviceFee, currency),
    total_price: fmtMoney(price + serviceFee, currency),
    payment_schedule: 'The total is paid through Vendly after the Vendor accepts and signs this agreement.',
    cancellation_policy: fv.cancellation_policy ?? '',
    cancellation_policy_name: preset?.label ?? '',
    cancellation_policy_text: preset?.text ?? '',
    booking_comments: str(b.message),
    overtime_rate: fv.overtime_rate ? `${moneyField('overtime_rate')} per hour` : '',
    security_deposit: moneyField('security_deposit'),
    late_fee_per_day: moneyField('late_fee_per_day'),
    damage_deposit: moneyField('damage_deposit'),
    usage_rights: fv.usage_rights ?? '',
    governing_law: fv.governing_law ?? '',
    additional_terms: str(input.additionalTerms),
    booking_id: b.id,
    contract_version: String(input.contractVersion),
    platform_terms_clause: PLATFORM_TERMS_CLAUSE,
    timezone: tz,
  };
  return data;
}

export function missingFields(required: string[], data: MergeData): string[] {
  return [...new Set(required)].filter((k) => !str(data[k]));
}

export function missingFieldsMessage(missing: string[]) {
  return `The contract can't be sent yet. Missing: ${missing.map(fieldLabel).join(', ')}.`;
}

/**
 * Renders {{field}} placeholders and {{#field}}...{{/field}} sections
 * (kept only when the field is non-empty). Empty plain fields render as "Not specified".
 */
export function renderTemplate(body: string, data: MergeData): string {
  const withSections = body.replace(
    /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_, key: string, inner: string) => (str(data[key]) ? inner : ''),
  );
  return withSections
    .replace(/\{\{(\w+)\}\}/g, (_, key: string) => str(data[key]) || 'Not specified')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function sha256(input: string | Buffer | Uint8Array) {
  return createHash('sha256').update(input).digest('hex');
}

/** Hash of exactly what signers agree to. */
export function contentHash(renderedBody: string, sourcePdfSha256?: string | null) {
  return sha256(`${renderedBody}\n--source-pdf:${sourcePdfSha256 ?? 'none'}`);
}

/** Customer service fee for a vendor price, rounded to cents. */
export function serviceFeeFor(price: unknown, percent: number) {
  const p = Number(price ?? 0);
  return Math.round(p * percent) / 100;
}
