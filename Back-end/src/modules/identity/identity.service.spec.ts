import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { IdentityService, imageKind } from './identity.service';
import { PrivateStorage, SignedUrl } from '../contracts/private-storage';

jest.mock('../contracts/private-storage', () => {
  const actual = jest.requireActual('../contracts/private-storage');
  return {
    ...actual,
    PrivateStorage: {
      newKey: jest.fn((folder: string, ext: string) => `${folder}/k${Math.random().toString(36).slice(2, 8)}.${ext}`),
      put: jest.fn().mockResolvedValue(undefined),
      get: jest.fn(),
      remove: jest.fn().mockResolvedValue(undefined),
    },
  };
});
jest.mock('../../config/app.config', () => ({ __esModule: true, default: () => ({ app: { url: 'https://api.test' } }) }));

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]);
const PDF = Buffer.from('%PDF-1.7 not an image at all');
const file = (buffer: Buffer) => ({ buffer, size: buffer.length });

function setup(user: any = { id_verified_at: null, type: 'CUSTOMER' }, pending: any[] = []) {
  const tx = { identityVerification: { deleteMany: jest.fn(), create: jest.fn().mockResolvedValue({ id: 'iv1', status: 'PENDING' }) } };
  const prisma: any = {
    user: { findUnique: jest.fn().mockResolvedValue(user), update: jest.fn().mockReturnValue('user-update') },
    identityVerification: {
      findMany: jest.fn().mockResolvedValue(pending),
      findUnique: jest.fn(),
      update: jest.fn().mockReturnValue('iv-update'),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn((arg: any) => (typeof arg === 'function' ? arg(tx) : Promise.all(arg))),
  };
  const push: any = { sendToUser: jest.fn().mockResolvedValue(undefined) };
  return { service: new IdentityService(prisma, push), prisma, push, tx };
}

beforeEach(() => jest.clearAllMocks());

describe('imageKind', () => {
  it('reads the real type from the bytes', () => {
    expect(imageKind(JPEG)).toBe('jpg');
    expect(imageKind(PNG)).toBe('png');
    expect(imageKind(PDF)).toBeNull();
  });
});

describe('IdentityService.submit', () => {
  const dto = { document_type: 'DRIVERS_LICENSE', legal_name: 'Jane Q Doe' };

  it('stores the photos privately and opens a check, replacing one still waiting', async () => {
    const old = { id: 'old', front_key: 'identity/u1/a.jpg', back_key: null, selfie_key: 'identity/u1/b.jpg' };
    const { service, tx } = setup(undefined, [old]);
    const res = await service.submit('u1', dto, { front: file(JPEG), back: file(PNG), selfie: file(JPEG) });

    expect(res.success).toBe(true);
    expect(PrivateStorage.put).toHaveBeenCalledTimes(3);
    const keys = (PrivateStorage.put as jest.Mock).mock.calls.map((c) => c[0]);
    expect(keys.every((k: string) => k.startsWith('identity/u1/'))).toBe(true);
    expect(tx.identityVerification.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['old'] } } });
    expect(tx.identityVerification.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ user_id: 'u1', legal_name: 'Jane Q Doe' }) }));
    expect(PrivateStorage.remove).toHaveBeenCalledWith('identity/u1/a.jpg');
  });

  it('rejects files that are not images, and cleans up what was stored', async () => {
    const { service } = setup();
    await expect(service.submit('u1', dto, { front: file(JPEG), back: file(PDF), selfie: file(JPEG) })).rejects.toThrow('JPEG, PNG, WebP or HEIC');
    expect(PrivateStorage.remove).toHaveBeenCalledTimes(1);
  });

  it('needs the back of a licence but not of a passport', async () => {
    await expect(setup().service.submit('u1', dto, { front: file(JPEG), selfie: file(JPEG) })).rejects.toThrow('back of your ID');
    await expect(setup().service.submit('u1', { ...dto, document_type: 'PASSPORT' }, { front: file(JPEG), selfie: file(JPEG) })).resolves.toMatchObject({ success: true });
  });

  it('refuses when already verified or for admins', async () => {
    await expect(setup({ id_verified_at: new Date(), type: 'VENDOR' }).service.submit('u1', dto, {})).rejects.toBeInstanceOf(BadRequestException);
    await expect(setup({ id_verified_at: null, type: 'ADMIN' }).service.submit('u1', dto, {})).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('IdentityService.adminReview', () => {
  it('approving marks the user verified and tells them', async () => {
    const { service, prisma, push } = setup();
    prisma.identityVerification.findUnique.mockResolvedValue({ id: 'iv1', user_id: 'u1', status: 'PENDING' });
    await service.adminReview('iv1', 'admin', { status: 'APPROVED' });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { id_verified_at: expect.any(Date) } });
    expect(push.sendToUser).toHaveBeenCalledWith('u1', expect.objectContaining({ title: 'Your ID is verified' }));
  });

  it('rejecting needs a reason and does not verify', async () => {
    const { service, prisma } = setup();
    prisma.identityVerification.findUnique.mockResolvedValue({ id: 'iv1', user_id: 'u1', status: 'PENDING' });
    await expect(service.adminReview('iv1', 'admin', { status: 'REJECTED' })).rejects.toThrow('Tell the user why');
    await service.adminReview('iv1', 'admin', { status: 'REJECTED', reason: 'The photo is blurry.' });
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.identityVerification.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'REJECTED', rejection_reason: 'The photo is blurry.' }) }));
  });

  it('a check can only be reviewed once', async () => {
    const { service, prisma } = setup();
    prisma.identityVerification.findUnique.mockResolvedValue({ id: 'iv1', user_id: 'u1', status: 'APPROVED' });
    await expect(service.adminReview('iv1', 'admin', { status: 'APPROVED' })).rejects.toThrow('already been reviewed');
  });
});

describe('IdentityService files', () => {
  beforeAll(() => (process.env.JWT_SECRET = 'test-secret'));

  it('serves identity images through signed links only', async () => {
    const { service } = setup();
    (PrivateStorage.get as jest.Mock).mockResolvedValue(JPEG);
    const url = service.fileUrl('identity/u1/front.jpg', 'admin', 'iv1', 'id-front');
    const token = url.split('/files/')[1];
    await expect(service.resolveFile(token)).resolves.toMatchObject({ type: 'image/jpeg', name: 'id-front.jpg' });
    // a valid link to something that isn't an ID photo is refused
    await expect(service.resolveFile(SignedUrl.sign({ key: 'contracts/x.pdf', uid: 'a', cid: 'c', name: 'x' }))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.resolveFile('garbage')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('deletes photos and checks with the account', async () => {
    const { service, prisma } = setup();
    prisma.identityVerification.findMany.mockResolvedValue([{ front_key: 'identity/u1/f.jpg', back_key: 'identity/u1/b.jpg', selfie_key: 'identity/u1/s.jpg' }]);
    await service.purgeForUser('u1');
    expect(prisma.identityVerification.deleteMany).toHaveBeenCalledWith({ where: { user_id: 'u1' } });
    expect(PrivateStorage.remove).toHaveBeenCalledTimes(3);
  });
});
