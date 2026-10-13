import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

jest.mock('../../../config/app.config', () => ({
  __esModule: true,
  default: jest.fn(() => ({ jwt: { secret: 'test-secret' } })),
}));

describe('JwtStrategy.validate', () => {
  const findUnique = jest.fn();
  const strategy = new JwtStrategy({ user: { findUnique } } as any);
  const payload = { sub: 'user-1', email: 'a@b.co', type: 'CLIENT' };

  beforeEach(() => findUnique.mockReset());

  it('accepts an active account and returns both id shapes', async () => {
    findUnique.mockResolvedValue({ id: 'user-1', status: 1, deleted_at: null });
    await expect(strategy.validate(payload)).resolves.toEqual({
      id: 'user-1',
      userId: 'user-1',
      email: 'a@b.co',
      type: 'CLIENT',
    });
  });

  it.each([
    ['deleted', { id: 'user-1', status: 1, deleted_at: new Date() }],
    ['deactivated', { id: 'user-1', status: 0, deleted_at: null }],
    ['unknown', null],
  ])('rejects a %s account', async (_label, user) => {
    findUnique.mockResolvedValue(user);
    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
