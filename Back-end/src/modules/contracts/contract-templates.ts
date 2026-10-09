import { ContractCategory } from 'prisma/generated/client';

export type FieldType = 'text' | 'textarea' | 'money' | 'number' | 'select';

export interface VendorFieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
}

export const CONSENT_TEXT_VERSION = 'esign-consent-v1';
export const CONSENT_TEXT =
  'I agree to sign electronically and receive this contract electronically.';

export const PLATFORM_TERMS_CLAUSE =
  'Payments, fees, held funds, refunds and disputes are governed by the Vendly Terms of Service, which control if anything in this contract conflicts with them.';

export const CANCELLATION_PRESETS: Record<string, { label: string; text: string }> = {
  flexible: {
    label: 'Flexible',
    text: 'Full refund if the Customer cancels at least 7 days before the event date. 50% refund if the Customer cancels 2 to 6 days before the event date. No refund if the Customer cancels less than 48 hours before the event.',
  },
  moderate: {
    label: 'Moderate',
    text: 'Full refund if the Customer cancels at least 30 days before the event date. 50% refund if the Customer cancels 14 to 29 days before the event date. No refund if the Customer cancels less than 14 days before the event.',
  },
  strict: {
    label: 'Strict',
    text: '50% refund if the Customer cancels at least 60 days before the event date. No refund if the Customer cancels less than 60 days before the event.',
  },
};

export const MAX_ADDITIONAL_TERMS = 3000;

const cancellationField: VendorFieldDef = {
  key: 'cancellation_policy',
  label: 'Cancellation policy',
  type: 'select',
  required: true,
  options: Object.entries(CANCELLATION_PRESETS).map(([value, p]) => ({ value, label: p.label })),
};

export const COMMON_VENDOR_FIELDS: VendorFieldDef[] = [
  { key: 'business_legal_name', label: 'Business legal name', type: 'text', required: true },
  { key: 'business_address', label: 'Business address', type: 'text', required: true },
  cancellationField,
  { key: 'overtime_rate', label: 'Overtime rate (per hour)', type: 'money', placeholder: 'e.g. 75' },
  { key: 'travel_fee', label: 'Travel fee', type: 'text', placeholder: 'e.g. $1/mile beyond 25 miles' },
  { key: 'setup_time', label: 'Setup time', type: 'text', placeholder: 'e.g. 60 minutes before start' },
  { key: 'teardown_time', label: 'Teardown time', type: 'text', placeholder: 'e.g. 30 minutes after end' },
  { key: 'governing_law', label: 'Governing law (state/country)', type: 'text', required: true, placeholder: 'e.g. California, USA' },
];

export const CATEGORY_VENDOR_FIELDS: Record<ContractCategory, VendorFieldDef[]> = {
  GENERAL: [],
  PHOTO_VIDEO: [
    { key: 'delivery_time_days', label: 'Delivery time (days)', type: 'number', required: true },
    { key: 'edited_images_count', label: 'Number of edited images', type: 'text', placeholder: 'e.g. 300' },
    { key: 'video_length', label: 'Video length', type: 'text', placeholder: 'e.g. 5-minute highlight film' },
    { key: 'revisions_included', label: 'Revisions included', type: 'number', required: true },
    {
      key: 'usage_rights',
      label: 'Usage rights granted to the Customer',
      type: 'select',
      required: true,
      options: [
        { value: 'personal', label: 'Personal use' },
        { value: 'commercial', label: 'Commercial use' },
      ],
    },
  ],
  RENTALS: [
    { key: 'rental_items', label: 'Items and quantities included', type: 'textarea', required: true, placeholder: 'e.g. 10 x round tables, 80 x chairs' },
    { key: 'security_deposit', label: 'Security deposit', type: 'money', required: true },
    { key: 'late_fee_per_day', label: 'Late return fee per day', type: 'money', required: true },
    { key: 'delivery_pickup_window', label: 'Delivery and pickup times', type: 'text', placeholder: 'e.g. Delivery 2 hours before start, pickup next morning' },
  ],
  CATERING: [
    { key: 'menu', label: 'Menu', type: 'textarea', required: true },
    { key: 'headcount_deadline', label: 'Final headcount deadline', type: 'text', required: true, placeholder: 'e.g. 10 days before the event' },
    { key: 'leftover_policy', label: 'Leftover policy', type: 'textarea' },
    { key: 'service_staff_hours', label: 'Service staff hours', type: 'text' },
  ],
  ENTERTAINMENT: [
    { key: 'performance_length', label: 'Performance length', type: 'text', required: true },
    { key: 'breaks', label: 'Breaks', type: 'text', placeholder: 'e.g. 15 minutes every 2 hours' },
    { key: 'equipment_power_needs', label: 'Equipment and power needs', type: 'textarea' },
    { key: 'song_requests_policy', label: 'Song requests', type: 'textarea' },
  ],
  VENUE: [
    { key: 'capacity', label: 'Capacity', type: 'number', required: true },
    { key: 'access_hours', label: 'Access hours', type: 'text', required: true },
    { key: 'outside_vendor_rules', label: 'Outside vendor rules', type: 'textarea' },
    { key: 'cleanup_policy', label: 'Cleanup', type: 'textarea' },
    { key: 'damage_deposit', label: 'Damage deposit', type: 'money', required: true },
    { key: 'noise_curfew', label: 'Noise curfew', type: 'text' },
  ],
  BEAUTY: [
    { key: 'patch_test_option', label: 'Patch test option', type: 'text' },
    { key: 'lateness_policy', label: 'Start time and lateness policy', type: 'textarea', required: true },
  ],
};

export function vendorFieldsFor(category: ContractCategory): VendorFieldDef[] {
  return [...COMMON_VENDOR_FIELDS, ...CATEGORY_VENDOR_FIELDS[category]];
}

/** Booking-derived merge fields that must be present before a contract can be sent. */
export const REQUIRED_BOOKING_FIELDS: Record<ContractCategory, string[]> = {
  GENERAL: ['event_date'],
  PHOTO_VIDEO: ['event_date', 'event_start_time', 'venue_address'],
  RENTALS: ['event_date', 'venue_address'],
  CATERING: ['event_date', 'event_start_time', 'venue_address', 'guest_count'],
  ENTERTAINMENT: ['event_date', 'event_start_time', 'event_end_time', 'venue_address'],
  VENUE: ['event_date', 'event_start_time', 'event_end_time', 'guest_count'],
  BEAUTY: ['event_date', 'event_start_time', 'venue_address', 'guest_count'],
};

export const CATEGORY_LABELS: Record<ContractCategory, string> = {
  GENERAL: 'General services',
  PHOTO_VIDEO: 'Photography and video',
  RENTALS: 'Rentals',
  CATERING: 'Catering',
  ENTERTAINMENT: 'Entertainment (DJ, band, MC)',
  VENUE: 'Venue',
  BEAUTY: 'Beauty and glam',
};

const R = '[LAWYER REVIEW]';

const GENERAL_SECTIONS = `# Service Agreement

Booking ID: {{booking_id}} · Contract version {{contract_version}}

## 1. Parties ${R}
This agreement is between {{vendor_business_name}} ("Vendor"), {{vendor_business_address}}, contact {{vendor_contact}}, and {{customer_name}} ("{{customer_role_label}}"){{#client_name}}, acting on behalf of {{client_name}}{{/client_name}}. Vendly provides the marketplace through which this booking was made. Vendly is a platform only and is not a party to this agreement.

## 2. Services ${R}
The Vendor will provide: {{package_name}}.
{{package_description}}

## 3. Event details ${R}
- Event: {{event_name}}
- Date: {{event_date}}
- Start time: {{event_start_time}}
- End time: {{event_end_time}}
- Venue: {{venue_address}}
- Guest count: {{guest_count}}

## 4. Price and payment ${R}
- Vendor price: {{vendor_price}}
- Vendly service fee: {{service_fee}}
- Total: {{total_price}}
{{payment_schedule}} All payments are made through Vendly. Any service fee is paid to Vendly.

## 5. Cancellation and rescheduling ${R}
Cancellation policy: {{cancellation_policy_name}}. {{cancellation_policy_text}} Rescheduling requires both parties to sign an amended contract. Refunds are processed by Vendly under the Vendly Terms of Service.

## 6. Vendor responsibilities ${R}
The Vendor will arrive on time, provide the services described above with reasonable skill and care, and upload proof-of-service photos through Vendly.

## 7. Customer responsibilities ${R}
The {{customer_role_label}} will provide venue access and any permissions needed, give accurate event details, and provide safe working conditions for the Vendor.

## 8. Overtime and travel ${R}
- Overtime rate: {{overtime_rate}}
- Travel fee: {{travel_fee}}
- Setup: {{setup_time}}
- Teardown: {{teardown_time}}
Overtime must be agreed by both parties at the event and is paid through Vendly.

## 9. Weather, emergencies and events outside either party's control ${R}
Neither party is liable for failure to perform caused by events outside its reasonable control, including severe weather, natural disasters, public health orders or government action. The parties will first try to reschedule in good faith; if that is not possible, refunds follow the Vendly Terms of Service.

## 10. Limitation of liability ${R}
Except for gross negligence or willful misconduct, each party's liability to the other under this agreement is limited to the total price of this booking. Neither party is liable for indirect or consequential losses.

## 11. Independent business ${R}
The Vendor is an independent business. The Vendor is not an employee, agent or partner of Vendly or of the {{customer_role_label}}.

## 12. Disputes ${R}
The parties will first use Vendly's dispute process. If a dispute is not resolved there, it is governed by the laws of {{governing_law}}.

## 13. Platform terms ${R}
{{platform_terms_clause}}
`;

const GENERAL_TAIL = `
{{#additional_terms}}
## Additional terms from the Vendor ${R}
{{additional_terms}}
{{/additional_terms}}

## Electronic signature consent ${R}
Each party agrees to sign this agreement electronically and to receive it electronically. Electronic signatures have the same effect as handwritten signatures.

## Entire agreement ${R}
This agreement, together with the Vendly Terms of Service, is the entire agreement between the parties about this booking. Changes to the date, time, venue, services, price, quantities or cancellation terms require an amended agreement signed by both parties.
`;

const ADDENDA: Record<ContractCategory, string> = {
  GENERAL: '',
  PHOTO_VIDEO: `
## Photography and video addendum ${R}
- Delivery time: {{delivery_time_days}} days after the event
- Edited images: {{edited_images_count}}
- Video: {{video_length}}
- Revisions included: {{revisions_included}}
- Usage rights: the Customer may use the delivered work for {{usage_rights}} purposes. The Vendor keeps the copyright.
- Portfolio use: the Vendor may use the work in its portfolio unless the Customer opts out in writing through Vendly.
- Equipment failure: the Vendor carries backup equipment. If equipment failure prevents delivery of part of the services, the price is reduced in proportion under the Vendly Terms of Service.
`,
  RENTALS: `
## Rentals addendum ${R}
Items and quantities:
{{rental_items}}
- Delivery and pickup: {{delivery_pickup_window}}
- Condition at drop-off: items are delivered clean and in working order; the Vendor records drop-off photos.
- Return condition: items must be returned in the same condition, allowing for normal wear. The Vendor records return photos.
- Security deposit: {{security_deposit}}
- Damage and loss: damaged or missing items are charged at repair or replacement cost, supported by photos.
- Late return fee: {{late_fee_per_day}} per day.
`,
  CATERING: `
## Catering addendum ${R}
Menu:
{{menu}}
- Final headcount deadline: {{headcount_deadline}}
- Allergy disclosures from the booking: {{booking_comments}}
- Food safety: the Vendor follows applicable food safety laws and holds the required permits.
- Leftovers: {{leftover_policy}}
- Service staff hours: {{service_staff_hours}}
`,
  ENTERTAINMENT: `
## Entertainment addendum ${R}
- Performance length: {{performance_length}}
- Breaks: {{breaks}}
- Equipment and power needs: {{equipment_power_needs}}
- Volume and venue rules: the Vendor follows the venue's volume limits and rules provided by the Customer.
- Song requests: {{song_requests_policy}}
`,
  VENUE: `
## Venue addendum ${R}
- Capacity: {{capacity}}
- Access hours: {{access_hours}}
- Outside vendors: {{outside_vendor_rules}}
- Cleanup: {{cleanup_policy}}
- Damage deposit: {{damage_deposit}}
- Noise curfew: {{noise_curfew}}
`,
  BEAUTY: `
## Beauty and glam addendum ${R}
- Number of people: {{guest_count}}
- Allergy and sensitivity disclosures from the booking: {{booking_comments}}
- Patch test: {{patch_test_option}}
- Start time and lateness: {{lateness_policy}}
`,
};

export interface DefaultTemplate {
  category: ContractCategory;
  title: string;
  body: string;
  required_fields: string[];
}

export function defaultTemplates(): DefaultTemplate[] {
  return (Object.keys(ADDENDA) as ContractCategory[]).map((category) => ({
    category,
    title: `Vendly Service Agreement: ${CATEGORY_LABELS[category]}`,
    body: GENERAL_SECTIONS + ADDENDA[category] + GENERAL_TAIL,
    required_fields: [
      ...REQUIRED_BOOKING_FIELDS[category],
      ...vendorFieldsFor(category).filter((f) => f.required).map((f) => f.key),
      'vendor_business_name',
      'customer_name',
      'vendor_price',
    ],
  }));
}

/** The booking addendum appended to uploaded vendor PDFs. */
export const UPLOADED_ADDENDUM_BODY = `# Booking Addendum

Booking ID: {{booking_id}} · Contract version {{contract_version}}

This addendum attaches to the Vendor's own contract and forms part of it. If anything in the Vendor's contract conflicts with the platform terms clause below, the platform terms clause controls.

## Parties
- Vendor: {{vendor_business_name}}, {{vendor_business_address}}, {{vendor_contact}}
- {{customer_role_label}}: {{customer_name}}{{#client_name}}, on behalf of {{client_name}}{{/client_name}}
- Vendly is a platform only and is not a party to this contract.

## Event
- Event: {{event_name}}
- Date: {{event_date}}
- Time: {{event_start_time}} to {{event_end_time}}
- Venue: {{venue_address}}
- Guest count: {{guest_count}}

## Services and price
- Package: {{package_name}}
- Vendor price: {{vendor_price}}
- Vendly service fee: {{service_fee}}
- Total: {{total_price}}
- Payment: {{payment_schedule}}
- Cancellation policy: {{cancellation_policy_name}}. {{cancellation_policy_text}}

## Booking comments
{{booking_comments}}

## Platform terms
{{platform_terms_clause}}
`;

export const UPLOADED_REQUIRED_FIELDS = ['event_date', 'vendor_business_name', 'customer_name', 'vendor_price', 'cancellation_policy'];
