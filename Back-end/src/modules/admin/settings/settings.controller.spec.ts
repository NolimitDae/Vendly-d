import { BadRequestException } from '@nestjs/common';
import { SettingsController } from './settings.controller';

const makePrisma = () => ({
  user: {
    findUnique: jest.fn(),
    update: jest.fn().mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, name: 'Jane', email: 'j@x.com', status: data.status })),
  },
  notification: { create: jest.fn() },
  notificationEvent: { create: jest.fn().mockResolvedValue({ id: 'ev1' }) },
});

describe('SettingsController account status', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let controller: SettingsController;
  const admin = { userId: 'admin-1' };
  const sockets = { disconnectUser: jest.fn() };

  beforeEach(() => {
    prisma = makePrisma();
    controller = new SettingsController({} as any, {} as any, {} as any, prisma as any, sockets as any);
  });

  it('suspends and keeps the reason in the user’s inbox', async () => {
    prisma.user.findUnique.mockResolvedValue({ type: 'EVENT_PLANNER', status: 1 });
    const res = await controller.userStatus(admin, 'p1', { status: 0, reason: 'Fake reviews' });
    expect(res.data.status).toBe(0);
    // live chat and notifications stop straight away too
    expect(sockets.disconnectUser).toHaveBeenCalledWith('p1');
    expect(prisma.notificationEvent.create).toHaveBeenCalledWith({
      data: { type: 'account_suspended', text: 'Your account was suspended: Fake reviews' },
    });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: { receiver_id: 'p1', sender_id: 'admin-1', notification_event_id: 'ev1' },
    });
  });

  it('restores without a reason', async () => {
    prisma.user.findUnique.mockResolvedValue({ type: 'VENDOR', status: 0 });
    await controller.userStatus(admin, 'v1', { status: 1 });
    expect(prisma.notificationEvent.create.mock.calls[0][0].data.type).toBe('account_restored');
  });

  it('records nothing when the status does not change (a null status is active)', async () => {
    prisma.user.findUnique.mockResolvedValue({ type: 'CUSTOMER', status: null });
    await controller.userStatus(admin, 'c1', { status: 1 });
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('still refuses suspending yourself or an admin', async () => {
    await expect(controller.userStatus(admin, 'admin-1', { status: 0 })).rejects.toThrow(BadRequestException);
    prisma.user.findUnique.mockResolvedValue({ type: 'ADMIN', status: 1 });
    await expect(controller.userStatus(admin, 'a2', { status: 0 })).rejects.toThrow(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
