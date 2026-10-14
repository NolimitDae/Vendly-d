/**
 * Spots contact details and off-platform payment asks in chat messages. Used to flag messages and
 * to show a gentle "keep it in Vendly to stay protected" reminder; it never blocks a message.
 */

const EMAIL = /[A-Z0-9._%+-]+\s*(?:@|\(at\)|\[at\])\s*[A-Z0-9.-]+\s*(?:\.|\(dot\)|\[dot\]|\sdot\s)\s*[A-Z]{2,}/i;
// runs of digits with the usual phone separators; checked for 10-15 digits below
const PHONE_CANDIDATE = /\+?\(?\d[\d\s().-]{8,22}\d/g;
const DATE_LIKE = /^\d{4}[-./]\d{1,2}[-./]\d{1,2}$|^\d{1,2}[-./]\d{1,2}[-./]\d{2,4}$/;
const OFF_PLATFORM = /\b(whats\s?app|telegram|signal app|wechat|venmo|cash\s?app|zelle|paypal\.me|text me at|call me at|dm me on|my (?:cell|number) is)\b/i;

export type ContactReason = 'email' | 'phone' | 'off_platform';

export function contactReasons(text: string | null | undefined): ContactReason[] {
  if (!text) return [];
  const reasons: ContactReason[] = [];
  if (EMAIL.test(text)) reasons.push('email');
  for (const m of text.match(PHONE_CANDIDATE) ?? []) {
    const trimmed = m.trim();
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length >= 10 && digits.length <= 15 && !DATE_LIKE.test(trimmed)) {
      reasons.push('phone');
      break;
    }
  }
  if (OFF_PLATFORM.test(text)) reasons.push('off_platform');
  return reasons;
}

export const CONTACT_WARNING =
  'Keep it in Vendly to stay protected. Payments and agreements made outside Vendly aren’t covered by Vendly Protection.';
