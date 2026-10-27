import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

jest.mock('../../../config/app.config', () => ({
  __esModule: true,
  default: jest.fn(() => ({ jwt: { secret: 'test-secret' } })),
}));

describe('JwtStrategy.validate', () => {
  const findUnique = jest.fn();
  const exists = jest.fn();
  const strategy = new JwtStrategy({ user: { findUnique } } as any, { exists } as any);
  const payload = { sub: 'user-1', email: 'a@b.co', type: 'CLIENT' };

  beforeEach(() => {
    findUnique.mockReset();
    exists.mockReset().mockResolvedValue(1);
  });

  it('accepts an active account and returns both id shapes', async () => {
    findUnique.mockResolvedValue({ id: 'user-1', status: 1, deleted_at: null });
    await expect(strategy.validate(payload)).resolves.toEqual({
      id: 'user-1',
      userId: 'user-1',
      email: 'a@b.co',
      type: 'CLIENT',
    });
  });

  it('uses the role from the database, so a role switch applies to older tokens', async () => {
    findUnique.mockResolvedValue({ id: 'user-1', status: 1, deleted_at: null, type: 'VENDOR' });
    await expect(strategy.validate(payload)).resolves.toMatchObject({ type: 'VENDOR' });
  });

  it.each([
    ['deleted', { id: 'user-1', status: 1, deleted_at: new Date() }],
    ['deactivated', { id: 'user-1', status: 0, deleted_at: null }],
    ['unknown', null],
  ])('rejects a %s account', async (_label, user) => {
    findUnique.mockResolvedValue(user);
    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts a token while its sign-in is live, and refuses it once that sign-in has ended', async () => {
    findUnique.mockResolvedValue({ id: 'user-1', status: 1, deleted_at: null });
    await expect(strategy.validate({ ...payload, sid: 's1' })).resolves.toMatchObject({ sid: 's1' });
    expect(exists).toHaveBeenLastCalledWith('refresh_token:user-1:s1');
    // signed out, password reset or changed elsewhere: that session's refresh token is gone
    exists.mockResolvedValue(0);
    await expect(strategy.validate({ ...payload, sid: 's1' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('checks the single old slot for tokens from before sessions', async () => {
    findUnique.mockResolvedValue({ id: 'user-1', status: 1, deleted_at: null });
    exists.mockResolvedValue(0);
    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(exists).toHaveBeenLastCalledWith('refresh_token:user-1');
  });

  it('keeps signed-in users working when Redis is unreachable', async () => {
    findUnique.mockResolvedValue({ id: 'user-1', status: 1, deleted_at: null });
    exists.mockRejectedValue(new Error('connection refused'));
    await expect(strategy.validate({ ...payload, sid: 's1' })).resolves.toMatchObject({ id: 'user-1' });
  });
});
