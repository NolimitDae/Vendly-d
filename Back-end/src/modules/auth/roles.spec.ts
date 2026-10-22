import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AuthService, heldRoles } from './auth.service';

jest.mock('src/common/analytics', () => ({ track: jest.fn() }));

function setup(user: Record<string, any>) {
  const tx = { user: { update: jest.fn() }, vendorProfile: { create: jest.fn() } };
  const prisma: any = {
    user: { findUnique: jest.fn().mockResolvedValue(user) },
    $transaction: jest.fn((fn: any) => fn(tx)),
  };
  const jwt: any = { sign: jest.fn().mockReturnValue('token') };
  const userRepo: any = { getUserDetails: jest.fn().mockImplementation(async () => ({ ...user, type: tx.user.update.mock.calls.at(-1)?.[0].data.type ?? user.type })) };
  const redis: any = { set: jest.fn().mockResolvedValue('OK') };
  const identity: any = { status: jest.fn().mockResolvedValue({ data: { status: 'APPROVED', verified: true } }) };
  const service = new AuthService(jwt, prisma, {} as any, userRepo, {} as any, redis, identity);
  return { service, tx, jwt };
}

const base = { id: 'u1', email: 'a@b.co', status: 1, deleted_at: null, vendorProfile: null };

describe('heldRoles', () => {
  it('treats CLIENT as customer and includes the role in use', () => {
    expect(heldRoles({ type: 'VENDOR', roles: ['CLIENT'] })).toEqual(['CUSTOMER', 'VENDOR']);
    expect(heldRoles({ type: 'EVENT_PLANNER', roles: [] })).toEqual(['EVENT_PLANNER']);
  });
});

describe('AuthService.switchRole', () => {
  it('refuses to switch until the ID is verified', async () => {
    const { service, tx } = setup({ ...base, type: 'CUSTOMER', roles: ['CUSTOMER'], id_verified_at: null });
    await expect(service.switchRole('u1', 'VENDOR')).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('adds the vendor role, creates the vendor profile and returns tokens for it', async () => {
    const { service, tx, jwt } = setup({ ...base, type: 'CUSTOMER', roles: ['CUSTOMER'], id_verified_at: new Date() });
    const res: any = await service.switchRole('u1', 'VENDOR', { business_name: ' Bella Events ' });

    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { type: 'VENDOR', roles: ['CUSTOMER', 'VENDOR'] } });
    expect(tx.vendorProfile.create).toHaveBeenCalledWith({ data: { user_id: 'u1', license_status: 'PENDING', business_name: 'Bella Events' } });
    expect(jwt.sign).toHaveBeenCalledWith(expect.objectContaining({ sub: 'u1', type: 'VENDOR' }), expect.anything());
    expect(res).toMatchObject({ success: true, active: 'VENDOR', roles: ['CUSTOMER', 'VENDOR'], added: true });
    expect(res.authorization.access_token).toBe('token');
  });

  it('switches back to customer keeping the CLIENT spelling and the existing vendor profile', async () => {
    const { service, tx } = setup({ ...base, type: 'VENDOR', roles: ['CLIENT', 'VENDOR'], id_verified_at: new Date(), vendorProfile: { id: 'vp' } });
    const res: any = await service.switchRole('u1', 'CUSTOMER');
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { type: 'CLIENT', roles: ['CLIENT', 'VENDOR'] } });
    expect(tx.vendorProfile.create).not.toHaveBeenCalled();
    expect(res).toMatchObject({ active: 'CUSTOMER', added: false });
  });

  it('does nothing (but still works) when already in that role, even unverified', async () => {
    const { service, tx } = setup({ ...base, type: 'VENDOR', roles: ['VENDOR'], id_verified_at: null });
    const res: any = await service.switchRole('u1', 'VENDOR');
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(res).toMatchObject({ success: true, active: 'VENDOR' });
  });

  it('never lets an admin switch, and rejects unknown roles', async () => {
    await expect(setup({ ...base, type: 'ADMIN', roles: ['ADMIN'], id_verified_at: new Date() }).service.switchRole('u1', 'VENDOR')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(setup({ ...base, type: 'CUSTOMER', roles: [], id_verified_at: new Date() }).service.switchRole('u1', 'ADMIN')).rejects.toBeInstanceOf(BadRequestException);
  });
});
