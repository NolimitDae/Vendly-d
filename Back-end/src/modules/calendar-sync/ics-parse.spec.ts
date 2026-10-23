import { parseDuration, parseIcs, resolveZone, zonedToUtc } from './ics-parse';

const cal = (body: string, header = '') =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Test//EN', header, body, 'END:VCALENDAR'].filter(Boolean).join('\r\n');
const ev = (...props: string[]) => ['BEGIN:VEVENT', ...props, 'END:VEVENT'].join('\r\n');

const window = { from: new Date('2026-10-01T00:00:00Z'), to: new Date('2027-10-01T00:00:00Z') };

describe('ICS parser', () => {
  it('reads all-day events with an exclusive DTEND as inclusive days', () => {
    const r = parseIcs(cal(ev('UID:a', 'DTSTART;VALUE=DATE:20261105', 'DTEND;VALUE=DATE:20261108', 'SUMMARY:Holiday')), window);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ allDay: true, startDate: '2026-11-05', endDate: '2026-11-07' });
  });

  it('treats an all-day event without DTEND as one day', () => {
    const r = parseIcs(cal(ev('UID:a', 'DTSTART;VALUE=DATE:20261105')), window);
    expect(r[0]).toMatchObject({ startDate: '2026-11-05', endDate: '2026-11-05' });
  });

  it('reads UTC times', () => {
    const r = parseIcs(cal(ev('UID:a', 'DTSTART:20261110T150000Z', 'DTEND:20261110T170000Z')), window);
    expect(r[0].start.toISOString()).toBe('2026-11-10T15:00:00.000Z');
    expect(r[0].end.toISOString()).toBe('2026-11-10T17:00:00.000Z');
    expect(r[0]).toMatchObject({ allDay: false, startDate: '2026-11-10', endDate: '2026-11-10' });
  });

  it('converts TZID times to UTC, across daylight saving', () => {
    const r = parseIcs(
      cal(
        [
          ev('UID:summer', 'DTSTART;TZID=America/New_York:20261020T090000', 'DTEND;TZID=America/New_York:20261020T100000'),
          ev('UID:winter', 'DTSTART;TZID="America/New_York":20261210T090000', 'DTEND;TZID=America/New_York:20261210T100000'),
        ].join('\r\n'),
      ),
      window,
    );
    expect(r.map((x) => x.start.toISOString())).toEqual(['2026-10-20T13:00:00.000Z', '2026-12-10T14:00:00.000Z']);
  });

  it('counts a late-evening event on its local day, not the UTC one', () => {
    // 22:00 in Los Angeles is 05:00 UTC the next day
    const r = parseIcs(cal(ev('UID:a', 'DTSTART;TZID=America/Los_Angeles:20261112T220000', 'DTEND;TZID=America/Los_Angeles:20261112T233000')), window);
    expect(r[0].start.toISOString()).toBe('2026-11-13T06:00:00.000Z');
    expect(r[0]).toMatchObject({ startDate: '2026-11-12', endDate: '2026-11-12' });
  });

  it('uses the calendar time zone for UTC times and floating times', () => {
    const r = parseIcs(
      cal([ev('UID:z', 'DTSTART:20261113T040000Z', 'DTEND:20261113T050000Z'), ev('UID:f', 'DTSTART:20261120T100000', 'DTEND:20261120T110000')].join('\r\n'), 'X-WR-TIMEZONE:America/Chicago'),
      window,
    );
    // 04:00Z is 22:00 the evening before in Chicago
    expect(r[0]).toMatchObject({ startDate: '2026-11-12' });
    expect(r[1].start.toISOString()).toBe('2026-11-20T16:00:00.000Z');
  });

  it('maps Windows zone names and Mozilla-style TZIDs', () => {
    expect(resolveZone('Pacific Standard Time')).toBe('America/Los_Angeles');
    expect(resolveZone('/mozilla.org/20050126_1/Europe/London')).toBe('Europe/London');
    expect(resolveZone('Nowhere/Special')).toBeNull();
    expect(zonedToUtc(Date.UTC(2026, 6, 1, 12), 'Europe/London')).toBe(Date.UTC(2026, 6, 1, 11));
  });

  it('uses DURATION when there is no DTEND', () => {
    expect(parseDuration('PT1H30M')).toBe(90 * 60 * 1000);
    expect(parseDuration('P1W')).toBe(7 * 24 * 3600 * 1000);
    const r = parseIcs(cal(ev('UID:a', 'DTSTART:20261110T150000Z', 'DURATION:PT2H')), window);
    expect(r[0].end.toISOString()).toBe('2026-11-10T17:00:00.000Z');
  });

  it('expands a weekly rule with COUNT, keeping local time across DST', () => {
    const r = parseIcs(cal(ev('UID:w', 'DTSTART;TZID=America/New_York:20261026T180000', 'DTEND;TZID=America/New_York:20261026T190000', 'RRULE:FREQ=WEEKLY;COUNT=3')), window);
    expect(r.map((x) => x.start.toISOString())).toEqual(['2026-10-26T22:00:00.000Z', '2026-11-02T23:00:00.000Z', '2026-11-09T23:00:00.000Z']);
  });

  it('expands weekly BYDAY with INTERVAL and UNTIL', () => {
    const r = parseIcs(cal(ev('UID:w', 'DTSTART:20261102T100000Z', 'DTEND:20261102T110000Z', 'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;UNTIL=20261125T235959Z')), window);
    expect(r.map((x) => x.startDate)).toEqual(['2026-11-02', '2026-11-04', '2026-11-16', '2026-11-18']);
  });

  it('expands a daily rule with UNTIL as a date, and skips EXDATEs', () => {
    const r = parseIcs(
      cal(ev('UID:d', 'DTSTART;VALUE=DATE:20261201', 'DTEND;VALUE=DATE:20261202', 'RRULE:FREQ=DAILY;UNTIL=20261205', 'EXDATE;VALUE=DATE:20261203')),
      window,
    );
    expect(r.map((x) => x.startDate)).toEqual(['2026-12-01', '2026-12-02', '2026-12-04', '2026-12-05']);
  });

  it('expands monthly rules by day of month and by "second Tuesday"', () => {
    const byDate = parseIcs(cal(ev('UID:m', 'DTSTART:20261115T120000Z', 'RRULE:FREQ=MONTHLY;COUNT=3', 'DTEND:20261115T130000Z')), window);
    expect(byDate.map((x) => x.startDate)).toEqual(['2026-11-15', '2026-12-15', '2027-01-15']);
    const byDay = parseIcs(cal(ev('UID:t', 'DTSTART:20261110T120000Z', 'DTEND:20261110T130000Z', 'RRULE:FREQ=MONTHLY;BYDAY=2TU;COUNT=3')), window);
    expect(byDay.map((x) => x.startDate)).toEqual(['2026-11-10', '2026-12-08', '2027-01-12']);
  });

  it('skips months without the day (the 31st) as RFC 5545 says', () => {
    const r = parseIcs(cal(ev('UID:m', 'DTSTART;VALUE=DATE:20261031', 'RRULE:FREQ=MONTHLY;COUNT=3')), window);
    expect(r.map((x) => x.startDate)).toEqual(['2026-10-31', '2026-12-31', '2027-01-31']);
  });

  it('stops open-ended rules at the end of the window and drops past occurrences', () => {
    const r = parseIcs(cal(ev('UID:y', 'DTSTART;VALUE=DATE:20200101', 'RRULE:FREQ=WEEKLY')), window);
    expect(r.length).toBeGreaterThanOrEqual(52);
    expect(r.length).toBeLessThanOrEqual(53);
    expect(r[0].startDate >= '2026-09-30').toBe(true);
    expect(r[r.length - 1].startDate < '2027-10-02').toBe(true);
  });

  it('keeps counting COUNT from an old DTSTART', () => {
    // 10 weekly occurrences from 2026-08-03 run until 2026-10-05: only the last one is in the window
    const r = parseIcs(cal(ev('UID:c', 'DTSTART:20260803T100000Z', 'DTEND:20260803T110000Z', 'RRULE:FREQ=WEEKLY;COUNT=10')), window);
    expect(r.map((x) => x.startDate)).toEqual(['2026-10-05']);
  });

  it('moves an occurrence overridden by RECURRENCE-ID', () => {
    const r = parseIcs(
      cal(
        [
          ev('UID:r', 'DTSTART:20261102T100000Z', 'DTEND:20261102T110000Z', 'RRULE:FREQ=WEEKLY;COUNT=3'),
          ev('UID:r', 'RECURRENCE-ID:20261109T100000Z', 'DTSTART:20261110T150000Z', 'DTEND:20261110T160000Z'),
        ].join('\r\n'),
      ),
      window,
    );
    expect(r.map((x) => x.start.toISOString())).toEqual(['2026-11-02T10:00:00.000Z', '2026-11-10T15:00:00.000Z', '2026-11-16T10:00:00.000Z']);
  });

  it('leaves out free, cancelled and Vendly-exported events, and alarms do not leak in', () => {
    const r = parseIcs(
      cal(
        [
          ev('UID:free', 'DTSTART:20261110T150000Z', 'DTEND:20261110T160000Z', 'TRANSP:TRANSPARENT'),
          ev('UID:gone', 'DTSTART:20261111T150000Z', 'DTEND:20261111T160000Z', 'STATUS:CANCELLED'),
          ev('UID:booking-1@vendly.calendar', 'DTSTART:20261112T150000Z', 'DTEND:20261112T160000Z'),
          ['BEGIN:VEVENT', 'UID:busy', 'DTSTART:20261113T150000Z', 'DTEND:20261113T160000Z', 'BEGIN:VALARM', 'TRIGGER:-PT15M', 'DTSTART:20200101T000000Z', 'END:VALARM', 'END:VEVENT'].join('\r\n'),
        ].join('\r\n'),
      ),
      { ...window, skipUidSuffix: '@vendly.calendar' },
    );
    expect(r).toHaveLength(1);
    expect(r[0].start.toISOString()).toBe('2026-11-13T15:00:00.000Z');
  });

  it('unfolds folded lines and accepts LF-only files', () => {
    const text = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:a', 'DTSTART;TZID=America/New_Yo', ' rk:20261020T090000', 'DTEND:20261020T140000Z', 'END:VEVENT', 'END:VCALENDAR'].join('\n');
    const r = parseIcs(text, window);
    expect(r[0].start.toISOString()).toBe('2026-10-20T13:00:00.000Z');
  });

  it('ignores events outside the window', () => {
    const r = parseIcs(cal([ev('UID:old', 'DTSTART;VALUE=DATE:20250101'), ev('UID:far', 'DTSTART;VALUE=DATE:20290101')].join('\r\n')), window);
    expect(r).toEqual([]);
  });

  it('refuses something that is not a calendar', () => {
    expect(() => parseIcs('<html>login</html>', window)).toThrow(/iCalendar/);
  });
});
