import { BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { TanvirStorage } from '../../common/lib/Disk/TanvirStorage';
import { PrivateStorage, SignedUrl } from '../contracts/private-storage';

jest.mock('../../common/lib/Disk/TanvirStorage', () => ({
  TanvirStorage: { put: jest.fn(), delete: jest.fn(), url: (p: string) => `https://cdn.test/${p}` },
}));
jest.mock('src/modules/contracts/private-storage', () => {
  const actual = jest.requireActual('src/modules/contracts/private-storage');
  return { ...actual, PrivateStorage: { ...actual.PrivateStorage, put: jest.fn(), remove: jest.fn().mockResolvedValue(undefined) } };
});

const jpg = { originalname: '../avatar.html', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]) } as Express.Multer.File;
const pdf = { originalname: 'licence.pdf', buffer: Buffer.from('%PDF-1.4\n') } as Express.Multer.File;
const html = { originalname: 'photo.jpg', buffer: Buffer.from('<html><script>alert(1)</script>') } as Express.Multer.File;

describe('profile and licence uploads', () => {
  const prisma: any = {
    vendorProfile: { findUnique: jest.fn(), upsert: jest.fn() },
    user: { findFirst: jest.fn(), update: jest.fn() },
  };
  const repo = { getUserDetails: jest.fn() };
  const service = new AuthService({} as any, prisma, {} as any, repo as any, {} as any, {} as any, {} as any);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.vendorProfile.findUnique.mockResolvedValue({ license_photo: ['old.pdf'], banner: null, logo: null });
    prisma.vendorProfile.upsert.mockImplementation(({ update }: any) =>
      Promise.resolve({ license_photo: update.license_photo, user: { id: 'u1', name: 'V', email: 'v@x.com', avatar: null, address: null, type: 'VENDOR' } }),
    );
    prisma.user.findFirst.mockResolvedValue({ avatar: 'old.jpg' });
    repo.getUserDetails.mockResolvedValue({ id: 'u1', type: 'CUSTOMER' });
  });

  it('keeps licence photos and PDFs in private storage under random per-vendor keys', async () => {
    const res = await service.addLicense('u1', [jpg, pdf]);
    const stored = prisma.vendorProfile.upsert.mock.calls[0][0].update.license_photo;
    expect(stored).toEqual([expect.stringMatching(/^licences\/vendor\/u1\/\d+-[0-9a-f]{24}\.jpg$/), expect.stringMatching(/^licences\/vendor\/u1\/\d+-[0-9a-f]{24}\.pdf$/)]);
    expect(PrivateStorage.put).toHaveBeenCalledWith(stored[0], jpg.buffer);
    expect(TanvirStorage.put).not.toHaveBeenCalled();
    expect(res.success).toBe(true);
    expect(JSON.stringify(res)).not.toContain('avatar.html');
    // the vendor gets signed links to their own files, not storage addresses
    expect(res.data.license_photo).toHaveLength(2);
    expect(SignedUrl.verify(res.data.license_photo[1].split('/').pop()!)).toMatchObject({ key: stored[1], uid: 'u1', cid: 'u1' });
  });

  it('deletes the replaced licence only after the new one is saved', async () => {
    await service.addLicense('u1', [pdf]);
    expect(TanvirStorage.delete).toHaveBeenCalledWith('/license/old.pdf');
    expect((TanvirStorage.delete as jest.Mock).mock.invocationCallOrder[0]).toBeGreaterThan(prisma.vendorProfile.upsert.mock.invocationCallOrder[0]);
  });

  it('keeps the licence on file and drops the new files when saving fails', async () => {
    prisma.vendorProfile.upsert.mockRejectedValue(new Error('db down'));
    await expect(service.addLicense('u1', [pdf])).rejects.toThrow('db down');
    const [key] = (PrivateStorage.put as jest.Mock).mock.calls[0];
    expect(PrivateStorage.remove).toHaveBeenCalledWith(key);
    expect(TanvirStorage.delete).not.toHaveBeenCalled();
  });

  it('refuses a licence that is not a photo or PDF and keeps the one on file', async () => {
    await expect(service.addLicense('u1', [pdf, html])).rejects.toThrow(BadRequestException);
    expect(TanvirStorage.delete).not.toHaveBeenCalled();
    expect(TanvirStorage.put).not.toHaveBeenCalled();
    expect(PrivateStorage.put).not.toHaveBeenCalled();
  });

  it('stores a new profile photo under a random name', async () => {
    const res = await service.updateUser('u1', {} as any, jpg);
    expect(res.success).toBe(true);
    const avatar = prisma.user.update.mock.calls[0][0].data.avatar;
    expect(avatar).toMatch(/^[0-9a-f]{24}\.jpg$/);
    expect(TanvirStorage.put).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`avatar/${avatar}$`)), jpg.buffer);
  });

  it('says what is allowed when a picture is not really an image, without changing anything', async () => {
    const res = await service.updateUser('u1', { name: 'New' } as any, jpg, { banner: html });
    expect(res).toEqual({ success: false, message: "That file type isn't allowed. You can upload photos (JPG, PNG, GIF, WebP or HEIC)." });
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(TanvirStorage.delete).not.toHaveBeenCalled();
  });
});
