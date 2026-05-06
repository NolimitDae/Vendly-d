import { Test, TestingModule } from '@nestjs/testing';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/role/roles.guard';

const mockContactService = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

const mockContact = {
  id: 'contact-1',
  first_name: 'John',
  last_name: 'Doe',
  email: 'john@test.com',
  phone_number: '+1234567890',
  message: 'Hello there',
};

describe('ContactController', () => {
  let controller: ContactController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContactController],
      providers: [
        { provide: ContactService, useValue: mockContactService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ContactController>(ContactController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should call service.create with dto and return result', async () => {
      const dto = {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@test.com',
        phone_number: '+1234567890',
        message: 'Hello there',
      };
      const expected = { success: true, message: 'Contact created successfully' };
      mockContactService.create.mockResolvedValue(expected);

      const result = await controller.create(dto as any);

      expect(mockContactService.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expected);
    });

    it('should return error object when service throws', async () => {
      mockContactService.create.mockRejectedValue(new Error('DB error'));

      const result = await controller.create({} as any);

      expect(result).toEqual({ success: false, message: 'DB error' });
    });
  });

  describe('findAll', () => {
    it('should call service.findAll with query params and return contacts', async () => {
      const expected = { success: true, data: [mockContact] };
      mockContactService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll({ q: 'John', status: undefined });

      expect(mockContactService.findAll).toHaveBeenCalledWith({
        q: 'John',
        status: undefined,
      });
      expect(result).toEqual(expected);
    });

    it('should return empty data when no contacts match', async () => {
      mockContactService.findAll.mockResolvedValue({ success: true, data: [] });

      const result = await controller.findAll({ q: 'nobody' });

      expect(result).toEqual({ success: true, data: [] });
    });
  });

  describe('findOne', () => {
    it('should call service.findOne with id and return contact', async () => {
      const expected = { success: true, data: mockContact };
      mockContactService.findOne.mockResolvedValue(expected);

      const result = await controller.findOne('contact-1');

      expect(mockContactService.findOne).toHaveBeenCalledWith('contact-1');
      expect(result).toEqual(expected);
    });

    it('should return error object when service throws', async () => {
      mockContactService.findOne.mockRejectedValue(new Error('Not found'));

      const result = await controller.findOne('bad-id');

      expect(result).toEqual({ success: false, message: 'Not found' });
    });
  });

  describe('update', () => {
    it('should call service.update with id and dto and return result', async () => {
      const dto = { first_name: 'Jane' };
      const expected = { success: true, message: 'Contact updated successfully' };
      mockContactService.update.mockResolvedValue(expected);

      const result = await controller.update('contact-1', dto as any);

      expect(mockContactService.update).toHaveBeenCalledWith('contact-1', dto);
      expect(result).toEqual(expected);
    });

    it('should return error object when service throws', async () => {
      mockContactService.update.mockRejectedValue(new Error('Update failed'));

      const result = await controller.update('bad-id', {} as any);

      expect(result).toEqual({ success: false, message: 'Update failed' });
    });
  });

  describe('remove', () => {
    it('should call service.remove with id and return result', async () => {
      const expected = { success: true, message: 'Contact deleted successfully' };
      mockContactService.remove.mockResolvedValue(expected);

      const result = await controller.remove('contact-1');

      expect(mockContactService.remove).toHaveBeenCalledWith('contact-1');
      expect(result).toEqual(expected);
    });

    it('should return error object when service throws', async () => {
      mockContactService.remove.mockRejectedValue(new Error('Delete failed'));

      const result = await controller.remove('bad-id');

      expect(result).toEqual({ success: false, message: 'Delete failed' });
    });
  });
});
