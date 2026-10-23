import { AuthService } from './auth.service';

describe('turning two-step login off', () => {
  const repo = { getUserDetails: jest.fn(), verify2FA: jest.fn(), disable2FA: jest.fn() };
  const service = new AuthService({} as any, {} as any, {} as any, repo as any, {} as any, {} as any, {} as any);
  beforeEach(() => {
    jest.clearAllMocks();
    repo.getUserDetails.mockResolvedValue({ id: 'u1' });
  });

  it('needs a current code', async () => {
    const res = await service.disable2FA('u1');
    expect(res.success).toBe(false);
    expect(repo.disable2FA).not.toHaveBeenCalled();
  });

  it('refuses a wrong code', async () => {
    repo.verify2FA.mockResolvedValue(false);
    const res = await service.disable2FA('u1', '123456');
    expect(res.success).toBe(false);
    expect(repo.disable2FA).not.toHaveBeenCalled();
  });

  it('turns it off with a right code', async () => {
    repo.verify2FA.mockResolvedValue(true);
    const res = await service.disable2FA('u1', ' 654321 ');
    expect(repo.verify2FA).toHaveBeenCalledWith('u1', '654321');
    expect(repo.disable2FA).toHaveBeenCalledWith('u1');
    expect(res.success).toBe(true);
  });
});

describe('turning two-step login on', () => {
  const repo = { getUserDetails: jest.fn(), verify2FA: jest.fn(), enable2FA: jest.fn() };
  const service = new AuthService({} as any, {} as any, {} as any, repo as any, {} as any, {} as any, {} as any);
  beforeEach(() => {
    jest.clearAllMocks();
    repo.getUserDetails.mockResolvedValue({ id: 'u1' });
  });

  it('needs a code from the authenticator app', async () => {
    const res = await service.enable2FA('u1');
    expect(res).toEqual({
      success: false,
      message: 'Enter the code from your authenticator app to turn on two-step login.',
    });
    expect(repo.enable2FA).not.toHaveBeenCalled();
  });

  it('refuses a wrong code', async () => {
    repo.verify2FA.mockResolvedValue(false);
    const res = await service.enable2FA('u1', '123456');
    expect(res.success).toBe(false);
    expect(repo.enable2FA).not.toHaveBeenCalled();
  });

  it('turns it on with a right code', async () => {
    repo.verify2FA.mockResolvedValue(true);
    const res = await service.enable2FA('u1', ' 654321 ');
    expect(repo.verify2FA).toHaveBeenCalledWith('u1', '654321');
    expect(repo.enable2FA).toHaveBeenCalledWith('u1');
    expect(res.success).toBe(true);
  });
});
