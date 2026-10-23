/** 'Closes in 22 hours' for an open booking request, or null once it's past. */
export function closesIn(expiresAt: string | null | undefined, now = Date.now()): string | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - now;
  if (!(ms > 0)) return null;
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return `Closes in ${hours} hour${hours === 1 ? '' : 's'}`;
  const mins = Math.max(1, Math.round(ms / 60_000));
  return `Closes in ${mins} minute${mins === 1 ? '' : 's'}`;
}

/** The customer's side of the same clock: 'The vendor has 22 hours to answer', or null once it's past. */
export function vendorAnswersWithin(expiresAt: string | null | undefined, now = Date.now()): string | null {
  const left = closesIn(expiresAt, now);
  return left ? `The vendor has ${left.replace('Closes in ', '')} to answer` : null;
}
