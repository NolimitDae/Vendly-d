import { NOTIFICATION_PREF_KEYS, readPrefs, wants } from './notification-prefs';

describe('notification prefs', () => {
  it('treats null, junk and missing keys as on', () => {
    for (const raw of [null, undefined, 'x', 3, [], {}]) {
      expect(Object.values(readPrefs(raw)).every(Boolean)).toBe(true);
    }
    expect(Object.keys(readPrefs(null))).toEqual([...NOTIFICATION_PREF_KEYS]);
    expect(readPrefs({ messages: false, unknown: false })).toEqual({
      booking_updates: true,
      messages: false,
      payments: true,
      reminders: true,
      review_requests: true,
      email: true,
    });
  });

  it('only an explicit false turns a switch off', () => {
    expect(readPrefs({ reminders: 0, review_requests: 'false' }).reminders).toBe(true);
    expect(readPrefs({ reminders: 0, review_requests: 'false' }).review_requests).toBe(true);
  });

  it('sends everything when nothing is saved', () => {
    expect(wants(null, 'review_requests', 'push')).toBe(true);
    expect(wants(null, 'review_requests', 'email')).toBe(true);
  });

  it('skips a topic the user turned off, on both channels', () => {
    const prefs = { review_requests: false };
    expect(wants(prefs, 'review_requests', 'push')).toBe(false);
    expect(wants(prefs, 'review_requests', 'email')).toBe(false);
    expect(wants(prefs, 'booking_updates', 'push')).toBe(true);
  });

  it('the email switch stops optional emails but not pushes', () => {
    const prefs = { email: false };
    expect(wants(prefs, 'booking_updates', 'email')).toBe(false);
    expect(wants(prefs, 'booking_updates', 'push')).toBe(true);
  });

  it('always sends required messages (no topic)', () => {
    const allOff = Object.fromEntries(NOTIFICATION_PREF_KEYS.map((k) => [k, false]));
    expect(wants(allOff, undefined, 'push')).toBe(true);
    expect(wants(allOff, undefined, 'email')).toBe(true);
  });

  it('the payments switch covers pushes, never the payment emails', () => {
    const prefs = { payments: false, email: false };
    expect(wants(prefs, 'payments', 'push')).toBe(false);
    expect(wants(prefs, 'payments', 'email')).toBe(true);
  });
});
