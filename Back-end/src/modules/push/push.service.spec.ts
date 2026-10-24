import { Test } from '@nestjs/testing';
import { PushService } from './push.service';
import { PrismaService } from 'src/prisma/prisma.service';

const mockPrisma = {
  user: { findUnique: jest.fn(), update: jest.fn() },
  notificationEvent: { create: jest.fn().mockResolvedValue({ id: 'ev1' }) },
  notification: { create: jest.fn() },
};

describe('PushService', () => {
  let service: PushService;
  const fetchMock = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    (global as any).fetch = fetchMock;
    const module = await Test.createTestingModule({
      providers: [PushService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(PushService);
  });

  it('saves to the inbox even without a push token, but sends no push', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ push_token: null });
    await service.sendToUser('u1', { title: 'Booking confirmed', body: 'Bridal Glam was confirmed', data: { type: 'booking', bookingId: 'b1' } });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockPrisma.notificationEvent.create).toHaveBeenCalledWith({ data: { type: 'booking', text: 'Booking confirmed: Bridal Glam was confirmed' } });
    expect(mockPrisma.notification.create).toHaveBeenCalledWith({ data: { receiver_id: 'u1', notification_event_id: 'ev1', entity_id: 'b1' } });
  });

  it('posts to the Expo push API with the token and payload', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ push_token: 'ExponentPushToken[abc]' });
    fetchMock.mockResolvedValue({ json: () => Promise.resolve({ data: { status: 'ok' } }) });

    await service.sendToUser('u1', { title: 'Hi', body: 'There', data: { type: 'booking', bookingId: 'b1' } });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://exp.host/--/api/v2/push/send',
      expect.objectContaining({ method: 'POST' }),
    );
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent).toEqual(
      expect.objectContaining({ to: 'ExponentPushToken[abc]', title: 'Hi', body: 'There', data: { type: 'booking', bookingId: 'b1' } }),
    );
  });

  it('does not push a topic the user turned off, but keeps it in the inbox', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ push_token: 'ExponentPushToken[abc]', notification_prefs: { review_requests: false } });
    await service.sendToUser('u1', { title: 'How was it?', body: 'Rate it', data: { type: 'booking', bookingId: 'b1' } }, 'review_requests');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockPrisma.notification.create).toHaveBeenCalled();
  });

  it('always pushes a message without a topic, even with everything off', async () => {
    const allOff = { booking_updates: false, messages: false, payments: false, reminders: false, review_requests: false, email: false };
    mockPrisma.user.findUnique.mockResolvedValue({ push_token: 'ExponentPushToken[abc]', notification_prefs: allOff });
    fetchMock.mockResolvedValue({ json: () => Promise.resolve({ data: { status: 'ok' } }) });
    await service.sendToUser('u1', { title: 'A customer reported a problem', body: 'b', data: { type: 'booking', bookingId: 'b1' } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('clears the token when Expo reports DeviceNotRegistered', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ push_token: 'ExponentPushToken[old]' });
    fetchMock.mockResolvedValue({
      json: () => Promise.resolve({ data: { status: 'error', details: { error: 'DeviceNotRegistered' } } }),
    });

    await service.sendToUser('u1', { title: 't', body: 'b' });

    expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { push_token: null } });
  });

  it('never throws when the network fails', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ push_token: 'ExponentPushToken[abc]' });
    fetchMock.mockRejectedValue(new Error('offline'));
    await expect(service.sendToUser('u1', { title: 't', body: 'b' })).resolves.toBeUndefined();
  });
});
