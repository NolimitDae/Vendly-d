/**
 * One seventh of a row, rounded down: 7 × 14.2857% can add up to just over 100% on iPhone and push
 * the last day (Saturday) onto its own row.
 */
export const SEVENTH_PCT = Math.floor(10000 / 7) / 100;
export const SEVENTH = `${SEVENTH_PCT}%` as const;
