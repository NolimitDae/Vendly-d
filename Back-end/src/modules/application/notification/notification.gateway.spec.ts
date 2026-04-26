import { Test, TestingModule } from '@nestjs/testing';
import { NotificationGateway } from './notification.gateway';
import { NotificationService } from './notification.service';
import { PrismaService } from 'src/prisma/prisma.service';

const mockPrisma = {
  notificationEvent: { create: jest.fn() },
  notification: {
    create: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
};

const mockNotificationService = {
  remove: jest.fn(),
};

describe('NotificationGateway', () => {
  let gateway: NotificationGateway;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationGateway,
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    gateway = module.get<NotificationGateway>(NotificationGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
