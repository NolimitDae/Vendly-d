import { BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { TanvirStorage } from '../../common/lib/Disk/TanvirStorage';

jest.mock('../../common/lib/Disk/TanvirStorage', () => ({
  TanvirStorage: { put: jest.fn(), delete: jest.fn(), url: (p: string) => `https://cdn.test/${p}` },
}));

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

  it('takes licence photos and PDFs under random names', async () => {
    const res = await service.addLicense('u1', [jpg, pdf]);
    const stored = prisma.vendorProfile.upsert.mock.calls[0][0].update.license_photo;
    expect(stored).toEqual([expect.stringMatching(/^[0-9a-f]{24}\.jpg$/), expect.stringMatching(/^[0-9a-f]{24}\.pdf$/)]);
    expect(res.success).toBe(true);
    expect(JSON.stringify(res)).not.toContain('avatar.html');
  });

  it('refuses a licence that is not a photo or PDF and keeps the one on file', async () => {
    await expect(service.addLicense('u1', [pdf, html])).rejects.toThrow(BadRequestException);
    expect(TanvirStorage.delete).not.toHaveBeenCalled();
    expect(TanvirStorage.put).not.toHaveBeenCalled();
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
