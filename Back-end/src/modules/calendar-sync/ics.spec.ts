import { buildCalendar, escapeText, foldLine, formatUtc, nextDay } from './ics';

const lines = (ics: string) => ics.split('\r\n');

describe('ICS writer', () => {
  it('escapes backslashes, semicolons, commas and newlines in text', () => {
    expect(escapeText('a\\b; c, d\ne\r\nf')).toBe('a\\\\b\\; c\\, d\\ne\\nf');
  });

  it('leaves short lines alone and folds long ones at 75 octets', () => {
    expect(foldLine('SUMMARY:short')).toBe('SUMMARY:short');
    const long = 'DESCRIPTION:' + 'x'.repeat(200);
    const folded = foldLine(long).split('\r\n');
    expect(folded.length).toBeGreaterThan(2);
    expect(Buffer.byteLength(folded[0])).toBe(75);
    for (const l of folded.slice(1)) {
      expect(l.startsWith(' ')).toBe(true);
      expect(Buffer.byteLength(l)).toBeLessThanOrEqual(75);
    }
    // unfolding gives the original back
    expect(folded.join('\r\n').replace(/\r\n /g, '')).toBe(long);
  });

  it('never splits a multi-byte character when folding', () => {
    const long = 'SUMMARY:' + 'é'.repeat(60) + '🎉'.repeat(10);
    const folded = foldLine(long).split('\r\n');
    for (const l of folded) {
      expect(Buffer.byteLength(l)).toBeLessThanOrEqual(75);
      expect(l).not.toContain('�');
    }
    expect(folded.join('\r\n').replace(/\r\n /g, '')).toBe(long);
  });

  it('writes a valid calendar with CRLF endings, UID and DTSTAMP on each event', () => {
    const now = new Date('2026-10-23T08:00:00Z');
    const ics = buildCalendar(
      [
        { uid: 'booking-1@vendly.calendar', summary: 'DJ set – Ada', start: new Date('2026-11-01T18:00:00Z'), end: new Date('2026-11-01T23:30:00Z'), location: '12 Main St, Austin; TX', status: 'CONFIRMED' },
        { uid: 'block-1@vendly.calendar', summary: 'Blocked on Vendly: Photos', startDate: '2026-11-05', endDate: '2026-11-07' },
      ],
      { name: 'Vendly bookings', now },
    );
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    const l = lines(ics);
    expect(l[0]).toBe('BEGIN:VCALENDAR');
    expect(l).toContain('VERSION:2.0');
    expect(l.filter((x) => x === 'BEGIN:VEVENT')).toHaveLength(2);
    expect(l.filter((x) => x === `DTSTAMP:${formatUtc(now)}`)).toHaveLength(2);
    expect(l).toContain('UID:booking-1@vendly.calendar');
    expect(l).toContain('UID:block-1@vendly.calendar');
    // timed: UTC date-times
    expect(l).toContain('DTSTART:20261101T180000Z');
    expect(l).toContain('DTEND:20261101T233000Z');
    expect(l).toContain('LOCATION:12 Main St\\, Austin\\; TX');
    // all-day: DATE values with an exclusive end
    expect(l).toContain('DTSTART;VALUE=DATE:20261105');
    expect(l).toContain('DTEND;VALUE=DATE:20261108');
  });

  it('gives a timed event with no end one hour', () => {
    const ics = buildCalendar([{ uid: 'u@x', summary: 's', start: new Date('2026-11-01T10:00:00Z') }], { name: 'n' });
    expect(lines(ics)).toContain('DTEND:20261101T110000Z');
  });

  it('rolls dates over month and year ends', () => {
    expect(nextDay('2026-12-31')).toBe('2027-01-01');
    expect(nextDay('2028-02-28')).toBe('2028-02-29');
  });
});
