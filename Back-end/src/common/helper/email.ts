/** Emails are matched case-insensitively: stored and looked up as trimmed lower case. */
export function normalizeEmail<T>(value: T): T {
  return (typeof value === 'string' ? value.trim().toLowerCase() : value) as T;
}

/** Request body fields that carry an account email. */
export const EMAIL_BODY_FIELDS = ['email', 'new_email'] as const;
