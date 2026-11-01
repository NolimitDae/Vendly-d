import { Test, TestingModule } from '@nestjs/testing';
import { ContactService } from './contact.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { MailService } from 'src/mail/mail.service';

const mockPrisma = {
  contact: {
    create: jest.fn(),
  },
};
const mockMail = { sendContactMessage: jest.fn().mockResolvedValue(true) };

describe('ContactService', () => {
  let service: ContactService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MailService, useValue: mockMail },
      ],
    }).compile();

    service = module.get<ContactService>(ContactService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a contact and return success', async () => {
      mockPrisma.contact.create.mockResolvedValue({ id: 'contact-1' });

      const dto = {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        phone_number: '1234567890',
        message: 'Hello there',
      };

      const result = await service.create(dto);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Submitted successfully');
      expect(mockPrisma.contact.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            first_name: 'John',
            email: 'john@example.com',
          }),
        }),
      );
    });

    it('sends the message to the support inbox, and still saves it when email fails', async () => {
      mockPrisma.contact.create.mockResolvedValue({ id: 'contact-3' });
      await service.create({ first_name: 'Ada', last_name: 'Obi', email: 'ada@example.com', phone_number: '555', message: 'Help with my booking' });
      expect(mockMail.sendContactMessage).toHaveBeenCalledWith({ name: 'Ada Obi', email: 'ada@example.com', phone: '555', message: 'Help with my booking' });

      mockMail.sendContactMessage.mockRejectedValueOnce(new Error('mail down'));
      expect((await service.create({ email: 'b@example.com', message: 'Hi' })).success).toBe(true);
    });

    it('should return success false when prisma throws', async () => {
      mockPrisma.contact.create.mockRejectedValue(new Error('DB error'));

      const result = await service.create({
        first_name: 'Jane',
        email: 'jane@example.com',
        message: 'Hello',
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('DB error');
    });

    it('should only include provided fields in the data object', async () => {
      mockPrisma.contact.create.mockResolvedValue({ id: 'contact-2' });

      const dto = { email: 'partial@example.com', message: 'Question' };
      await service.create(dto);

      expect(mockPrisma.contact.create).toHaveBeenCalledWith({
        data: { email: 'partial@example.com', message: 'Question' },
      });
    });
  });
});
