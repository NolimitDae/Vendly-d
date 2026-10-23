import { BadRequestException } from '@nestjs/common';
import { AdminBookingController } from './admin-booking.controller';
import { BookingService } from 'src/modules/booking/booking.service';

describe('AdminBookingController', () => {
  const bookingService = { getAllBookings: jest.fn().mockResolvedValue({ success: true }) };
  const controller = new AdminBookingController(bookingService as any);

  beforeEach(() => jest.clearAllMocks());

  it('passes "from" through as a date (bookings created today)', async () => {
    await controller.getAll(1, 1, undefined, '2026-10-23T04:00:00.000Z');
    expect(bookingService.getAllBookings).toHaveBeenCalledWith({ page: 1, limit: 1, status: undefined, from: new Date('2026-10-23T04:00:00.000Z') });
  });

  it('lists every booking without "from"', async () => {
    await controller.getAll(1, 10, 'PENDING' as any);
    expect(bookingService.getAllBookings).toHaveBeenCalledWith({ page: 1, limit: 10, status: 'PENDING', from: undefined });
  });

  it('rejects a bad date', () => {
    expect(() => controller.getAll(1, 1, undefined, 'not-a-date')).toThrow(BadRequestException);
  });
});

describe('BookingService.getAllBookings', () => {
  it('filters on created_at when "from" is given', async () => {
    const prisma = { booking: { count: jest.fn().mockResolvedValue(3), findMany: jest.fn().mockResolvedValue([]) } };
    const service = Object.create(BookingService.prototype);
    service.prisma = prisma;
    service.bookingIncludes = () => ({});
    service.formatBooking = (b: any) => b;
    const from = new Date('2026-10-23T00:00:00Z');

    const res = await service.getAllBookings({ limit: 1, status: 'CANCELLED', from });

    expect(prisma.booking.count).toHaveBeenCalledWith({ where: { status: 'CANCELLED', created_at: { gte: from }, deleted_at: null } });
    expect(res.meta.total).toBe(3);

    await service.getAllBookings({ limit: 1 });
    expect(prisma.booking.count).toHaveBeenLastCalledWith({ where: { deleted_at: null } });
  });
});
