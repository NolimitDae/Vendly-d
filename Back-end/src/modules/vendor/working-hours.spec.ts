import { formatTime, hoursZone, outsideWorkingHours, parseWorkingHours, readWorkingHours, summariseWorkingHours, validTimeZone, zoneLabel, type WorkingHours } from './working-hours';

const nineToFive = { open: '09:00', close: '17:00' };
const week = (over: Partial<WorkingHours> = {}): WorkingHours => ({
  mon: nineToFive, tue: nineToFive, wed: nineToFive, thu: nineToFive, fri: nineToFive, sat: null, sun: null, ...over,
});

describe('parseWorkingHours (what vendors send)', () => {
  it('accepts all 7 days, closed days as null', () => {
    expect(parseWorkingHours(week())).toEqual({ hours: week() });
  });

  it('accepts a JSON string (multipart forms) and clears with null or empty', () => {
    expect(parseWorkingHours(JSON.stringify(week()))).toEqual({ hours: week() });
    expect(parseWorkingHours(null)).toEqual({ hours: null });
    expect(parseWorkingHours('')).toEqual({ hours: null });
    expect(parseWorkingHours('null')).toEqual({ hours: null });
  });

  it('allows closing at midnight (24:00)', () => {
    expect(parseWorkingHours(week({ sat: { open: '18:00', close: '24:00' } }))).toEqual({ hours: week({ sat: { open: '18:00', close: '24:00' } }) });
  });

  it.each([
    ['a missing day', (() => { const w: any = week(); delete w.sun; return w; })(), /all 7 days \(missing sun\)/],
    ['an unknown day', { ...week(), funday: null }, /Unknown day in working hours: funday/],
    ['a bad time', week({ mon: { open: '9am', close: '17:00' } }), /Monday: times must be HH:MM/],
    ['an hour past 23', week({ tue: { open: '25:00', close: '26:00' } }), /Tuesday: times must be HH:MM/],
    ['24:00 as an opening time', week({ tue: { open: '24:00', close: '24:00' } }), /Tuesday: times must be HH:MM/],
    ['open after close', week({ wed: { open: '17:00', close: '09:00' } }), /Wednesday: the closing time must be after the opening time/],
    ['open equal to close', week({ thu: { open: '09:00', close: '09:00' } }), /Thursday: the closing time must be after/],
    ['extra fields on a day', week({ fri: { open: '09:00', close: '17:00', lunch: '12:00' } as any }), /Friday: only open and close/],
    ['a list', [], /must be an object/],
    ['broken JSON', '{mon:', /must be an object/],
    ['a day that is a string', week({ sat: 'closed' as any }), /Saturday: give open and close times/],
  ])('refuses %s', (_label, input, message) => {
    const r = parseWorkingHours(input);
    expect('error' in r && r.error).toMatch(message);
  });
});

describe('the vendor’s time zone with the hours', () => {
  it('keeps a real IANA zone, spelled the way Intl does', () => {
    expect(parseWorkingHours({ ...week(), timezone: 'America/Chicago' })).toEqual({ hours: { ...week(), timezone: 'America/Chicago' } });
    expect(parseWorkingHours(JSON.stringify({ ...week(), timezone: 'america/chicago' }))).toEqual({ hours: { ...week(), timezone: 'America/Chicago' } });
    expect(readWorkingHours({ ...week(), timezone: 'Europe/London' })).toEqual({ ...week(), timezone: 'Europe/London' });
  });

  it('is optional (hours saved before it was kept)', () => {
    expect(parseWorkingHours({ ...week(), timezone: null })).toEqual({ hours: week() });
    expect(parseWorkingHours({ ...week(), timezone: '' })).toEqual({ hours: week() });
  });

  it.each(['Mars/Olympus_Mons', '+05:00', 'not a zone', 42, 'x'.repeat(80)])('refuses %p', (timezone) => {
    const r = parseWorkingHours({ ...week(), timezone });
    expect('error' in r && r.error).toMatch(/time zone isn’t recognised/);
    expect(validTimeZone(timezone)).toBeNull();
  });

  it('names a zone the way people say it', () => {
    expect(zoneLabel('America/Chicago')).toBe('Chicago time');
    expect(zoneLabel('America/Los_Angeles')).toBe('Los Angeles time');
    expect(zoneLabel('UTC')).toBe('UTC');
  });

  it('checks in the vendor’s zone first, else a real customer zone, else refuses', () => {
    expect(hoursZone({ ...week(), timezone: 'America/Chicago' }, 'America/New_York')).toEqual({ zone: 'America/Chicago', differs: true });
    expect(hoursZone({ ...week(), timezone: 'America/Chicago' }, 'America/Chicago')).toEqual({ zone: 'America/Chicago', differs: false });
    expect(hoursZone({ ...week(), timezone: 'America/Chicago' }, undefined)).toEqual({ zone: 'America/Chicago', differs: true });
    expect(hoursZone(week(), 'Asia/Tokyo')).toEqual({ zone: 'Asia/Tokyo', differs: false });
    expect(hoursZone(week(), 'Not/AZone')).toEqual({ error: 'Your time zone wasn’t recognised. Please refresh and try again.' });
    expect(hoursZone(week(), undefined)).toEqual({ error: expect.any(String) });
  });

  it('names the zone in the refusal when asked', () => {
    expect(outsideWorkingHours(week(), new Date('2026-10-26T12:30:00Z'), null, 'America/Chicago', 'America/Chicago')).toBe('The vendor works 9am–5pm (Chicago time) on Mondays.');
    expect(outsideWorkingHours(week(), new Date('2026-10-25T15:00:00Z'), null, 'America/Chicago', 'America/Chicago')).toBe("The vendor doesn't work on Sundays (Chicago time). Please pick another day.");
  });
});

describe('readWorkingHours (what is stored)', () => {
  it('treats nothing or anything malformed as "not set"', () => {
    expect(readWorkingHours(null)).toBeNull();
    expect(readWorkingHours(undefined)).toBeNull();
    expect(readWorkingHours({ mon: 'x' })).toBeNull();
    expect(readWorkingHours(week())).toEqual(week());
  });
});

describe('outsideWorkingHours', () => {
  const at = (iso: string) => new Date(iso);

  it('is fine without hours', () => {
    expect(outsideWorkingHours(null, at('2026-10-25T03:00:00Z'), null, 'UTC')).toBeNull();
  });

  it('checks start and end within the start day, in the customer time zone', () => {
    // Mon Oct 26 2026, 10:00–12:00 in New York
    expect(outsideWorkingHours(week(), at('2026-10-26T14:00:00Z'), at('2026-10-26T16:00:00Z'), 'America/New_York')).toBeNull();
    // ends exactly at closing
    expect(outsideWorkingHours(week(), at('2026-10-26T19:00:00Z'), at('2026-10-26T21:00:00Z'), 'America/New_York')).toBeNull();
    // ends at 5:30pm
    expect(outsideWorkingHours(week(), at('2026-10-26T19:00:00Z'), at('2026-10-26T21:30:00Z'), 'America/New_York')).toBe('The vendor works 9am–5pm on Mondays.');
    // starts at 8:30am
    expect(outsideWorkingHours(week(), at('2026-10-26T12:30:00Z'), null, 'America/New_York')).toBe('The vendor works 9am–5pm on Mondays.');
    // starts at closing time
    expect(outsideWorkingHours(week(), at('2026-10-26T21:00:00Z'), null, 'America/New_York')).toBe('The vendor works 9am–5pm on Mondays.');
  });

  it('refuses a closed day', () => {
    expect(outsideWorkingHours(week(), at('2026-10-24T15:00:00Z'), null, 'UTC')).toBe("The vendor doesn't work on Saturdays. Please pick another day.");
  });

  it('refuses an event running into the next day', () => {
    const late = week({ fri: { open: '18:00', close: '23:00' } });
    expect(outsideWorkingHours(late, at('2026-10-23T22:00:00Z'), at('2026-10-24T01:00:00Z'), 'UTC')).toBe('The vendor works 6pm–11pm on Fridays.');
  });

  it('lets an event end at midnight when the vendor works until 24:00', () => {
    const late = week({ fri: { open: '18:00', close: '24:00' } });
    expect(outsideWorkingHours(late, at('2026-10-23T20:00:00Z'), at('2026-10-24T00:00:00Z'), 'UTC')).toBeNull();
    expect(outsideWorkingHours(late, at('2026-10-23T20:00:00Z'), at('2026-10-24T00:30:00Z'), 'UTC')).toBe('The vendor works 6pm–midnight on Fridays.');
  });

  it('crosses the date line correctly: same instant, different local weekday', () => {
    // Sun Oct 25 2026 23:00 UTC is Mon Oct 26 10:00 in Sydney (UTC+11)
    expect(outsideWorkingHours(week(), at('2026-10-25T23:00:00Z'), null, 'Australia/Sydney')).toBeNull();
    expect(outsideWorkingHours(week(), at('2026-10-25T23:00:00Z'), null, 'UTC')).toBe("The vendor doesn't work on Sundays. Please pick another day.");
  });

  it('falls back to UTC for an unknown time zone', () => {
    expect(outsideWorkingHours(week(), at('2026-10-26T10:00:00Z'), null, 'Not/AZone')).toBeNull();
  });
});

describe('summariseWorkingHours', () => {
  it('groups days with the same hours', () => {
    expect(summariseWorkingHours(week())).toBe('Mon–Fri 9am–5pm');
    expect(summariseWorkingHours(week({ sat: { open: '10:00', close: '14:30' } }))).toBe('Mon–Fri 9am–5pm · Sat 10am–2:30pm');
    expect(summariseWorkingHours(week({ wed: null }))).toBe('Mon–Tue 9am–5pm · Thu–Fri 9am–5pm');
    expect(summariseWorkingHours({ mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null })).toBe('Not taking bookings on any day');
    expect(summariseWorkingHours(null)).toBeNull();
  });

  it('formats times the short way', () => {
    expect(formatTime('00:00')).toBe('12am');
    expect(formatTime('12:00')).toBe('12pm');
    expect(formatTime('13:05')).toBe('1:05pm');
    expect(formatTime('24:00')).toBe('midnight');
  });
});
