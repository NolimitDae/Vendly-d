import { ValidationPipe } from '@nestjs/common';
import { Prisma } from 'prisma/generated/client';
import { AuthService } from './auth.service';
import { UpdateUserDto } from './dto/update-user.dto';

jest.mock('../../common/lib/Disk/TanvirStorage', () => ({
  TanvirStorage: { put: jest.fn(), delete: jest.fn(), url: (p: string) => `https://cdn.test/${p}` },
}));

const nineToFive = { open: '09:00', close: '17:00' };
const hours = { mon: nineToFive, tue: nineToFive, wed: nineToFive, thu: nineToFive, fri: nineToFive, sat: { open: '10:00', close: '14:00' }, sun: null };

/** PATCH /auth/update: vendors set their weekly working hours. */
describe('vendor working hours on the profile update', () => {
  const prisma: any = {
    vendorProfile: { findUnique: jest.fn(), findFirst: jest.fn(), upsert: jest.fn().mockResolvedValue({}) },
    user: { findFirst: jest.fn(), update: jest.fn().mockResolvedValue({}), findUnique: jest.fn() },
  };
  const repo = { getUserDetails: jest.fn() };
  const service = new AuthService({} as any, prisma, {} as any, repo as any, {} as any, {} as any, {} as any);

  beforeEach(() => {
    jest.clearAllMocks();
    repo.getUserDetails.mockResolvedValue({ id: 'v1', type: 'VENDOR' });
  });

  it('saves valid hours on the vendor profile', async () => {
    const res = await service.updateUser('v1', { working_hours: hours } as any);
    expect(res.success).toBe(true);
    const { update, create } = prisma.vendorProfile.upsert.mock.calls[0][0];
    expect(update).toEqual({ working_hours: hours });
    expect(create).toMatchObject({ user_id: 'v1', working_hours: hours });
  });

  it('takes the hours as a JSON string from a multipart form', async () => {
    await service.updateUser('v1', { working_hours: JSON.stringify(hours) } as any);
    expect(prisma.vendorProfile.upsert.mock.calls[0][0].update).toEqual({ working_hours: hours });
  });

  it('clears the hours with null', async () => {
    await service.updateUser('v1', { working_hours: null } as any);
    expect(prisma.vendorProfile.upsert.mock.calls[0][0].update).toEqual({ working_hours: Prisma.DbNull });
  });

  it('refuses bad hours before changing anything', async () => {
    const res = await service.updateUser('v1', { name: 'New', working_hours: { ...hours, sat: { open: '14:00', close: '10:00' } } } as any);
    expect(res).toEqual({ success: false, message: 'Saturday: the closing time must be after the opening time.' });
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.vendorProfile.upsert).not.toHaveBeenCalled();

    const missing = await service.updateUser('v1', { working_hours: { mon: nineToFive } } as any);
    expect(missing).toEqual({ success: false, message: 'Working hours need all 7 days (missing tue). Use null for a closed day.' });
  });

  it('ignores working hours from someone who is not a vendor', async () => {
    repo.getUserDetails.mockResolvedValue({ id: 'c1', type: 'CUSTOMER' });
    const res = await service.updateUser('c1', { working_hours: hours } as any);
    expect(res.success).toBe(true);
    expect(prisma.vendorProfile.upsert).not.toHaveBeenCalled();
  });

  it('is allowed through the request validation (object or JSON string)', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } });
    const dto = await pipe.transform({ working_hours: hours }, { type: 'body', metatype: UpdateUserDto });
    expect(dto.working_hours).toEqual(hours);
    const fromForm = await pipe.transform({ working_hours: JSON.stringify(hours) }, { type: 'body', metatype: UpdateUserDto });
    expect(fromForm.working_hours).toBe(JSON.stringify(hours));
  });
});
