import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/role/roles.guard';

const mockConversationService = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  remove: jest.fn(),
  findAllUserInfo: jest.fn(),
};

const mockReq = (userId: string) => ({ user: { userId } });

describe('ConversationController', () => {
  let controller: ConversationController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConversationController],
      providers: [
        { provide: ConversationService, useValue: mockConversationService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ConversationController>(ConversationController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should call service.create with dto and userId from request', async () => {
      const dto = { participant_id: 'user-2' };
      const expected = {
        success: true,
        message: 'Conversation created successfully',
        conversation: { id: 'conv-1' },
      };
      mockConversationService.create.mockResolvedValue(expected);

      const result = await controller.create(dto, mockReq('user-1'));

      expect(result).toEqual(expected);
      expect(mockConversationService.create).toHaveBeenCalledWith(dto, 'user-1');
    });

    it('should propagate ConflictException when service throws', async () => {
      mockConversationService.create.mockRejectedValue(
        new ConflictException('Cannot create conversation with yourself'),
      );

      await expect(
        controller.create({ participant_id: 'user-1' }, mockReq('user-1')),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('should return conversations for the authenticated user', async () => {
      const expected = {
        success: true,
        conversations: [{ conversation_id: 'conv-1' }],
      };
      mockConversationService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll(mockReq('user-1'));

      expect(result).toEqual(expected);
      expect(mockConversationService.findAll).toHaveBeenCalledWith('user-1');
    });

    it('should return empty conversations array when user has none', async () => {
      mockConversationService.findAll.mockResolvedValue({
        success: true,
        conversations: [],
      });

      const result = await controller.findAll(mockReq('lonely-user'));

      expect(result.conversations).toHaveLength(0);
    });
  });

  describe('asyncfindOne', () => {
    it('should return conversation by id for the authenticated user', async () => {
      const expected = {
        success: true,
        conversation: { id: 'conv-1', participants: [], messages: [] },
      };
      mockConversationService.findOne.mockResolvedValue(expected);

      const result = await controller.asyncfindOne('conv-1', mockReq('user-1'));

      expect(result).toEqual(expected);
      expect(mockConversationService.findOne).toHaveBeenCalledWith('conv-1', 'user-1');
    });

    it('should propagate NotFoundException when conversation is missing', async () => {
      mockConversationService.findOne.mockRejectedValue(
        new NotFoundException('Conversation not found'),
      );

      await expect(
        controller.asyncfindOne('bad-id', mockReq('user-1')),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete a conversation and return success message', async () => {
      const expected = {
        success: true,
        message: 'Conversation deleted successfully',
      };
      mockConversationService.remove.mockResolvedValue(expected);

      const result = await controller.remove('conv-1', mockReq('user-1'));

      expect(result).toEqual(expected);
      expect(mockConversationService.remove).toHaveBeenCalledWith('conv-1', 'user-1');
    });

    it('should propagate NotFoundException when conversation does not belong to user', async () => {
      mockConversationService.remove.mockRejectedValue(
        new NotFoundException('Conversation not found or you are not a participant.'),
      );

      await expect(controller.remove('bad-id', mockReq('user-1'))).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAllUser', () => {
    it('should return all users except the requesting user', async () => {
      const expected = {
        success: true,
        data: [{ id: 'user-2', name: 'User 2' }],
      };
      mockConversationService.findAllUserInfo.mockResolvedValue(expected);

      const result = await controller.findAllUser(mockReq('user-1'));

      expect(result).toEqual(expected);
      expect(mockConversationService.findAllUserInfo).toHaveBeenCalledWith('user-1');
    });

    it('should return empty data when no other users exist', async () => {
      mockConversationService.findAllUserInfo.mockResolvedValue({
        success: true,
        data: [],
      });

      const result = await controller.findAllUser(mockReq('only-user'));

      expect(result.data).toHaveLength(0);
    });
  });
});
