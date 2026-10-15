import { track } from './analytics';

describe('track', () => {
  const fetchMock = jest.fn().mockResolvedValue({ ok: true });
  const env = { ...process.env };
  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).fetch = fetchMock;
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it('does nothing without a key (or in tests, or without a user)', () => {
    delete process.env.POSTHOG_KEY;
    track('signup', 'u1');
    process.env.POSTHOG_KEY = 'phc_test';
    track('signup', null);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the event to PostHog when configured', () => {
    process.env.POSTHOG_KEY = 'phc_test';
    process.env.NODE_ENV = 'production';
    process.env.POSTHOG_HOST = 'https://eu.i.posthog.com/';
    track('booking_requested', 'u1', { booking_id: 'b1' });
    expect(fetchMock).toHaveBeenCalledWith('https://eu.i.posthog.com/capture/', expect.objectContaining({ method: 'POST' }));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ api_key: 'phc_test', event: 'booking_requested', distinct_id: 'u1', properties: { booking_id: 'b1', $lib: 'vendly-api' } });
  });
});
