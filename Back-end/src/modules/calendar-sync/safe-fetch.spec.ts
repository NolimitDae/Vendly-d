import { assertPublicHost, CalendarFetchError, fetchCalendar, isPrivateAddress, normalizeCalendarUrl } from './safe-fetch';

const lookup = (...addresses: string[]) => jest.fn(async () => addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })));

describe('calendar fetch SSRF guard', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    '::1',
    '::',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '64:ff9b::a00:1',
    'not-an-ip',
  ])('treats %s as private', (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '142.250.72.14', '172.32.0.1', '2607:f8b0:4005:80c::200e', '2a00:1450:4001:82b::200e'])('treats %s as public', (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });

  it('only accepts https on the default port, and turns webcal into https', () => {
    expect(normalizeCalendarUrl('webcal://p01-calendars.icloud.com/published/2/abc').toString()).toBe('https://p01-calendars.icloud.com/published/2/abc');
    expect(normalizeCalendarUrl('  https://calendar.google.com/calendar/ical/x/basic.ics ').hostname).toBe('calendar.google.com');
    expect(() => normalizeCalendarUrl('http://calendar.google.com/x.ics')).toThrow(CalendarFetchError);
    expect(() => normalizeCalendarUrl('file:///etc/passwd')).toThrow(CalendarFetchError);
    expect(() => normalizeCalendarUrl('https://example.com:8443/x.ics')).toThrow(/port/);
    expect(() => normalizeCalendarUrl('https://user:pw@example.com/x.ics')).toThrow(/password/);
    expect(() => normalizeCalendarUrl('not a url')).toThrow(CalendarFetchError);
  });

  it('refuses hosts that resolve to a private address, even if only one of them does', async () => {
    await expect(assertPublicHost('evil.example', lookup('127.0.0.1'))).rejects.toThrow(/private network/);
    await expect(assertPublicHost('evil.example', lookup('93.184.216.34', '10.0.0.5'))).rejects.toThrow(/private network/);
    await expect(assertPublicHost('evil.example', lookup('::1'))).rejects.toThrow(/private network/);
    await expect(assertPublicHost('calendar.google.com', lookup('142.250.72.14'))).resolves.toHaveLength(1);
  });

  it('refuses private IP literals and local names without looking them up', async () => {
    const l = lookup('8.8.8.8');
    await expect(assertPublicHost('169.254.169.254', l)).rejects.toThrow(/private network/);
    await expect(assertPublicHost('[::1]', l)).rejects.toThrow(/private network/);
    await expect(assertPublicHost('localhost', l)).rejects.toThrow(/private network/);
    await expect(assertPublicHost('db.railway.internal', l)).rejects.toThrow(/private network/);
    expect(l).not.toHaveBeenCalled();
  });

  it('reports a host that does not resolve', async () => {
    await expect(assertPublicHost('nope.example', jest.fn(async () => { throw new Error('ENOTFOUND'); }))).rejects.toThrow(/Couldn’t find/);
  });

  it('never connects to a private address', async () => {
    await expect(fetchCalendar('https://127.0.0.1/cal.ics')).rejects.toThrow(/private network/);
    await expect(fetchCalendar('https://internal.example/cal.ics', { lookup: lookup('192.168.0.10') })).rejects.toThrow(/private network/);
    await expect(fetchCalendar('http://example.com/cal.ics')).rejects.toThrow(/https/);
  });
});
