import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { MessageController } from './message.controller';
import { MessageService } from './message.service';
import { MessageGateway } from './message.gateway';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';

const mockMessageService = {
  create: jest.fn(),
  findAll: jest.fn(),
  deleteMessage: jest.fn(),
  getUnreadMessage: jest.fn(),
  readMessages: jest.fn(),
};

const mockMessageGateway = {
  clients: new Map<string, string>(),
  server: { to: jest.fn().mockReturnThis(), emit: jest.fn() },
};

const mockReq = (userId: string) => ({ user: { userId } });

describe('MessageController', () => {
  let controller: MessageController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MessageController],
      providers: [
        { provide: MessageService, useValue: mockMessageService },
        { provide: MessageGateway, useValue: mockMessageGateway },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<MessageController>(MessageController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should send a message and return success', async () => {
      const dto = { text: 'Hello', conversationId: 'conv-1' };
      const expected = {
        success: true,
        message: 'Message sent successfully',
        data: { id: 'msg-1', text: 'Hello' },
      };
      mockMessageService.create.mockResolvedValue(expected);

      const result = await controller.create(dto, mockReq('user-1'));

      expect(result).toEqual(expected);
      expect(mockMessageService.create).toHaveBeenCalledWith(dto, 'user-1', undefined);
    });

    it('should propagate UnauthorizedException when user is not a participant', async () => {
      mockMessageService.create.mockRejectedValue(
        new UnauthorizedException('You are not a participant of this conversation.'),
      );

      await expect(
        controller.create({ text: 'Hi', conversationId: 'conv-1' }, mockReq('outsider')),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('findAll', () => {
    it('should return paginated messages for a conversation', async () => {
      const expected = {
        success: true,
        message: 'Messages retrieved successfully',
        data: [{ id: 'msg-1', text: 'Hello' }],
      };
      mockMessageService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll('conv-1', { page: 1, perPage: 10 }, mockReq('user-1'));

      expect(result).toEqual(expected);
      expect(mockMessageService.findAll).toHaveBeenCalledWith('conv-1', 'user-1', { page: 1, perPage: 10 });
    });

    it('should propagate NotFoundException when conversation does not exist', async () => {
      mockMessageService.findAll.mockRejectedValue(
        new NotFoundException('Conversation not found'),
      );

      await expect(
        controller.findAll('bad-conv', { page: 1, perPage: 10 }, mockReq('user-1')),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteMessage', () => {
    it('should delete a message and return success', async () => {
      const expected = { success: true, message: 'Message deleted successfully' };
      mockMessageService.deleteMessage.mockResolvedValue(expected);

      const result = await controller.deleteMessage('msg-1', mockReq('user-1'));

      expect(result).toEqual(expected);
      expect(mockMessageService.deleteMessage).toHaveBeenCalledWith('user-1', 'msg-1');
    });

    it('should propagate NotFoundException when message does not exist', async () => {
      mockMessageService.deleteMessage.mockRejectedValue(
        new NotFoundException('Message not found'),
      );

      await expect(
        controller.deleteMessage('bad-msg', mockReq('user-1')),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getUnreadMessageCount', () => {
    it('should return unread message count for a conversation', async () => {
      const expected = {
        success: true,
        data: { count: 3, messages: [] },
      };
      mockMessageService.getUnreadMessage.mockResolvedValue(expected);

      const result = await controller.getUnreadMessageCount('conv-1', mockReq('user-1'));

      expect(result).toEqual(expected);
      expect(mockMessageService.getUnreadMessage).toHaveBeenCalledWith('user-1', 'conv-1');
    });

    it('should propagate UnauthorizedException when user is not a participant', async () => {
      mockMessageService.getUnreadMessage.mockRejectedValue(
        new UnauthorizedException('You are not a participant of this conversation.'),
      );

      await expect(
        controller.getUnreadMessageCount('conv-1', mockReq('outsider')),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('readMessages', () => {
    it('should mark messages as read and return success', async () => {
      const expected = { success: true, message: 'Messages marked as read successfully' };
      mockMessageService.readMessages.mockResolvedValue(expected);

      const result = await controller.readMessages('conv-1', mockReq('user-1'));

      expect(result).toEqual(expected);
      expect(mockMessageService.readMessages).toHaveBeenCalledWith('user-1', 'conv-1');
    });

    it('should propagate UnauthorizedException when user is not a participant', async () => {
      mockMessageService.readMessages.mockRejectedValue(
        new UnauthorizedException('You are not a participant of this conversation.'),
      );

      await expect(
        controller.readMessages('conv-1', mockReq('outsider')),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
