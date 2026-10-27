import { UcodeRepository } from './ucode.repository';

describe('UcodeRepository.verifycheckToken (password reset code)', () => {
  const findFirst = jest.fn();
  const del = jest.fn().mockResolvedValue(undefined);
  const repo = new UcodeRepository({ ucode: { findFirst, delete: del } } as any, {} as any);
  const later = new Date(Date.now() + 5 * 60_000);

  beforeEach(() => {
    findFirst.mockReset();
    del.mockClear();
  });

  it('takes the code straight from the email, without verify-token first', async () => {
    findFirst.mockResolvedValue({ id: 'u1', token: '123456', email: 'a@b.co', verified_at: null, expired_at: later });
    expect(await repo.verifycheckToken({ email: 'a@b.co', token: '123456' })).toBe(true);
    expect(findFirst).toHaveBeenCalledWith({ where: { token: '123456', email: 'a@b.co' } });
  });

  it('refuses and deletes an expired code, even one verified earlier', async () => {
    findFirst.mockResolvedValue({ id: 'u1', token: '123456', email: 'a@b.co', verified_at: new Date(0), expired_at: new Date(Date.now() - 1000) });
    expect(await repo.verifycheckToken({ email: 'a@b.co', token: '123456' })).toBe(false);
    expect(del).toHaveBeenCalledWith({ where: { id: 'u1' } });
  });

  it('refuses an unknown code and anything that is not plain text', async () => {
    findFirst.mockResolvedValue(null);
    expect(await repo.verifycheckToken({ email: 'a@b.co', token: '000000' })).toBe(false);
    expect(await repo.verifycheckToken({ email: 'a@b.co', token: { not: '' } as any })).toBe(false);
  });
});
