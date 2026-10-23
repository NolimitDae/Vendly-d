/**
 * Minimal RFC 5545 writer for the vendor's private feed: CRLF line endings, lines folded at 75 octets,
 * TEXT values escaped, a UID and DTSTAMP on every event.
 */

/** UIDs of events Vendly publishes end with this, so an import of the same calendar can skip them. */
export const FEED_UID_DOMAIN = 'vendly.calendar';

export type IcsEvent = {
  uid: string;
  summary: string;
  /** Timed events: exact instants, written in UTC. */
  start?: Date;
  end?: Date;
  /** All-day events: YYYY-MM-DD, end inclusive (written as the exclusive next day). */
  startDate?: string;
  endDate?: string;
  location?: string | null;
  description?: string | null;
  url?: string | null;
  status?: 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED';
};

const CRLF = '\r\n';
const MAX_OCTETS = 75;

/** Escapes a TEXT value: backslash, semicolon, comma and newlines (RFC 5545 §3.3.11). */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** Folds one content line so no physical line is longer than 75 octets, never splitting a UTF-8 character. */
export function foldLine(line: string): string {
  if (Buffer.byteLength(line, 'utf8') <= MAX_OCTETS) return line;
  const parts: string[] = [];
  let current = '';
  let size = 0;
  // the first line holds 75 octets; continuation lines start with a space, leaving 74
  let limit = MAX_OCTETS;
  for (const ch of line) {
    const n = Buffer.byteLength(ch, 'utf8');
    if (size + n > limit) {
      parts.push(current);
      current = '';
      size = 0;
      limit = MAX_OCTETS - 1;
    }
    current += ch;
    size += n;
  }
  parts.push(current);
  return parts.join(CRLF + ' ');
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** 20261101T150000Z */
export function formatUtc(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** 2026-11-01 -> 20261101 */
export function formatDate(day: string): string {
  return day.slice(0, 10).replace(/-/g, '');
}

/** The day after a YYYY-MM-DD date. */
export function nextDay(day: string): string {
  const d = new Date(`${day.slice(0, 10)}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function eventLines(e: IcsEvent, stamp: string): string[] {
  const lines = ['BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp}`];
  if (e.startDate) {
    const last = e.endDate && e.endDate >= e.startDate ? e.endDate : e.startDate;
    lines.push(`DTSTART;VALUE=DATE:${formatDate(e.startDate)}`, `DTEND;VALUE=DATE:${formatDate(nextDay(last))}`);
  } else if (e.start) {
    const end = e.end && e.end > e.start ? e.end : new Date(e.start.getTime() + 60 * 60 * 1000);
    lines.push(`DTSTART:${formatUtc(e.start)}`, `DTEND:${formatUtc(end)}`);
  }
  lines.push(`SUMMARY:${escapeText(e.summary)}`);
  if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
  if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
  // URL is a URI value, not TEXT: no escaping
  if (e.url) lines.push(`URL:${e.url.replace(/[\r\n]/g, '')}`);
  if (e.status) lines.push(`STATUS:${e.status}`);
  lines.push('TRANSP:OPAQUE', 'END:VEVENT');
  return lines;
}

/** A complete VCALENDAR document. */
export function buildCalendar(events: IcsEvent[], opts: { name: string; now?: Date }): string {
  const stamp = formatUtc(opts.now ?? new Date());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Vendly//Vendor bookings//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(opts.name)}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...events.flatMap((e) => eventLines(e, stamp)),
    'END:VCALENDAR',
  ];
  return lines.map(foldLine).join(CRLF) + CRLF;
}
