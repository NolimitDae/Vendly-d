import { Test } from '@nestjs/testing';
import { PushService } from './push.service';
import { PrismaService } from 'src/prisma/prisma.service';

const mockPrisma = {
  user: { findUnique: jest.fn(), update: jest.fn() },
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

  it('does nothing when the user has no push token', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ push_token: null });
    await service.sendToUser('u1', { title: 't', body: 'b' });
    expect(fetchMock).not.toHaveBeenCalled();
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
