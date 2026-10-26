/**
 * A phone number as typed in Edit profile, checked loosely: digits with spaces, +, - and brackets,
 * 7 to 20 digits (enough for any country with its code). Empty clears it.
 */
export function normalizePhone(raw: unknown): { phone: string | null } | { error: string } {
  const text = String(raw ?? '').trim();
  if (!text) return { phone: null };
  if (!/^[\d\s+\-().]+$/.test(text)) return { error: 'Use only digits, spaces, +, - and brackets in your phone number.' };
  const digits = text.replace(/\D/g, '').length;
  if (digits < 7 || digits > 20) return { error: 'Enter a phone number with 7 to 20 digits.' };
  return { phone: text.replace(/\s+/g, ' ').slice(0, 40) };
}
