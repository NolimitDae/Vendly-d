import { BookingStatus } from 'prisma/generated/enums';
import { notStartedWindow, pastStartNotStarted } from './no-show';

describe('no-show rules', () => {
  const now = new Date('2026-10-24T12:00:00Z');

  it('a confirmed booking whose start (event start, else scheduled time) has passed', () => {
    expect(pastStartNotStarted({ status: BookingStatus.CONFIRMED, event_start_at: new Date('2026-10-24T11:00:00Z') }, now)).toBe(true);
    expect(pastStartNotStarted({ status: BookingStatus.CONFIRMED, event_start_at: null, scheduled_at: '2026-10-24T12:00:00Z' }, now)).toBe(true);
    expect(pastStartNotStarted({ status: BookingStatus.CONFIRMED, event_start_at: new Date('2026-10-24T13:00:00Z'), scheduled_at: new Date('2026-10-20') }, now)).toBe(false);
    expect(pastStartNotStarted({ status: BookingStatus.CONFIRMED }, now)).toBe(false);
    expect(pastStartNotStarted({ status: BookingStatus.IN_PROGRESS, event_start_at: new Date('2026-10-24T11:00:00Z') }, now)).toBe(false);
  });

  it('hourly windows follow each other without gaps or overlaps', () => {
    const a = notStartedWindow(new Date('2026-10-24T12:00:01Z'));
    const b = notStartedWindow(new Date('2026-10-24T13:02:00Z'));
    expect(a).toEqual({ gte: new Date('2026-10-24T09:00:00Z'), lt: new Date('2026-10-24T10:00:00Z') });
    expect(b.gte).toEqual(a.lt);
  });
});
