import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { SignedUrl } from 'src/modules/contracts/private-storage';
import {
  checkLicenceFiles,
  isLicenceKey,
  legacyPublicKey,
  licenceFileUrl,
  licenceFileUrls,
  licenceSource,
  movedLicenceKey,
  readPublicFile,
  removeLicenceFiles,
  storeLicenceFiles,
} from './licence-files';
import { LicenceFilesService } from './licence-files.service';
import { LicenceFilesController } from './licence-files.controller';

// in-memory public bucket (S3 driver) and private bucket
const mockPublic = new Map<string, Buffer>();
const mockPrivate = new Map<string, Buffer>();
let mockDriver: { driver: string; connection: { rootUrl?: string } } = { driver: 's3', connection: {} };
const mockFailPrivatePut = { on: null as string | null };

jest.mock('src/common/lib/Disk/TanvirStorage', () => ({
  TanvirStorage: {
    getConfig: () => mockDriver,
    get: jest.fn(async (key: string) => {
      const b = mockPublic.get(key);
      if (!b) throw new Error(`Failed to get object ${key}`);
      return { transformToByteArray: async () => new Uint8Array(b) };
    }),
    delete: jest.fn(async (key: string) => mockPublic.delete(key)),
    put: jest.fn(),
    url: (k: string) => `https://cdn.test/${k}`,
  },
}));
jest.mock('src/modules/contracts/private-storage', () => {
  const actual = jest.requireActual('src/modules/contracts/private-storage');
  return {
    ...actual,
    PrivateStorage: {
      newKey: actual.PrivateStorage.newKey,
      put: jest.fn(async (key: string, data: Buffer) => {
        if (mockFailPrivatePut.on && key.includes(mockFailPrivatePut.on)) throw new Error('bucket unavailable');
        mockPrivate.set(key, Buffer.from(data));
      }),
      get: jest.fn(async (key: string) => {
        const b = mockPrivate.get(key);
        if (!b) throw new Error('NoSuchKey');
        return b;
      }),
      remove: jest.fn(async (key: string) => void mockPrivate.delete(key)),
    },
  };
});

const PDF = Buffer.from('%PDF-1.4\n');
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const HTML = Buffer.from('<html><script>alert(1)</script></html>');
const tokenOf = (url: string) => url.split('/').pop()!;

beforeEach(() => {
  jest.clearAllMocks();
  mockPublic.clear();
  mockPrivate.clear();
  mockFailPrivatePut.on = null;
  mockDriver = { driver: 's3', connection: {} };
});

describe('licence keys', () => {
  it('stores photos and PDFs under random per-owner private keys', async () => {
    const exts = checkLicenceFiles([{ buffer: JPG }, { buffer: PDF }]);
    expect(exts).toEqual(['jpg', 'pdf']);
    const keys = await storeLicenceFiles('vendor', 'u1', [{ buffer: JPG }, { buffer: PDF }], exts);
    expect(keys).toEqual([expect.stringMatching(/^licences\/vendor\/u1\/\d+-[0-9a-f]{24}\.jpg$/), expect.stringMatching(/^licences\/vendor\/u1\/\d+-[0-9a-f]{24}\.pdf$/)]);
    expect(keys.every(isLicenceKey)).toBe(true);
    expect(mockPrivate.get(keys[1])).toEqual(PDF);
  });

  it('refuses anything that is not a photo or PDF', () => {
    expect(() => checkLicenceFiles([{ buffer: PDF }, { buffer: HTML }])).toThrow(BadRequestException);
  });

  it('removes what it stored when one file fails', async () => {
    mockFailPrivatePut.on = '.pdf';
    await expect(storeLicenceFiles('planner', 'p1', [{ buffer: JPG }, { buffer: PDF }], ['jpg', 'pdf'])).rejects.toThrow('bucket unavailable');
    expect(mockPrivate.size).toBe(0);
  });

  it('removes private keys and legacy public names from the right place', async () => {
    mockPublic.set('event-planner/license/old.pdf', PDF);
    mockPrivate.set('licences/planner/p1/1-a.pdf', PDF);
    await removeLicenceFiles('planner', ['old.pdf', 'licences/planner/p1/1-a.pdf', '../x']);
    expect(mockPublic.size).toBe(0);
    expect(mockPrivate.size).toBe(0);
  });

  it('knows where the old upload paths put the public copies', () => {
    expect(legacyPublicKey('vendor', 'a.pdf')).toBe('/license/a.pdf');
    expect(legacyPublicKey('planner', 'a.pdf')).toBe('event-planner/license/a.pdf');
    expect(movedLicenceKey('vendor', 'u1', 'My licence (1).pdf')).toBe('licences/vendor/u1/legacy-My_licence__1_.pdf');
  });

  it('signs links that point at private keys or, for old rows, the legacy name', () => {
    const priv = SignedUrl.verify(tokenOf(licenceFileUrl('vendor', 'u1', 'licences/vendor/u1/1-a.pdf', 'admin-1')!));
    expect(priv).toMatchObject({ key: 'licences/vendor/u1/1-a.pdf', uid: 'admin-1', cid: 'u1' });
    const legacy = SignedUrl.verify(tokenOf(licenceFileUrl('planner', 'p1', 'old.pdf', 'p1')!));
    expect(legacy).toMatchObject({ key: 'licences/legacy/planner/old.pdf', uid: 'p1', cid: 'p1' });
    // a value that isn't a bare name never becomes a link
    expect(licenceFileUrls('vendor', 'u1', ['../../etc/passwd', 'a/b.pdf'], 'u1')).toEqual([]);
  });

  it('only resolves licence keys that belong to the owner named in the link', () => {
    expect(licenceSource({ key: 'licences/vendor/u1/1-a.pdf', cid: 'u1' })).toEqual({ at: 'private', key: 'licences/vendor/u1/1-a.pdf' });
    expect(licenceSource({ key: 'licences/vendor/u2/1-a.pdf', cid: 'u1' })).toBeNull();
    expect(licenceSource({ key: 'licences/legacy/vendor/a.pdf', cid: 'u1' })).toEqual({ at: 'public', key: '/license/a.pdf', moved: 'licences/vendor/u1/legacy-a.pdf' });
    expect(licenceSource({ key: 'licences/legacy/vendor/../a.pdf', cid: 'u1' })).toBeNull();
    expect(licenceSource({ key: 'licences/legacy/other/a.pdf', cid: 'u1' })).toBeNull();
    expect(licenceSource({ key: 'contracts/c1/x.pdf', cid: 'u1' })).toBeNull();
    expect(licenceSource({ key: 'identity/u1/front.jpg', cid: 'u1' })).toBeNull();
  });

  it('reads public files as bytes from disk too', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'licence-'));
    await fs.mkdir(path.join(dir, 'license'));
    await fs.writeFile(path.join(dir, 'license', 'a.jpg'), JPG);
    mockDriver = { driver: 'local', connection: { rootUrl: dir } };
    await expect(readPublicFile('/license/a.jpg')).resolves.toEqual(JPG);
    await expect(readPublicFile('/license/missing.jpg')).rejects.toThrow();
    await fs.rm(dir, { recursive: true, force: true });
  });
});

function setup(rows: { vendor?: any[]; planner?: any[] } = {}, users: Record<string, { type: string; deleted_at?: Date | null }> = {}) {
  const table = (list: any[]) => ({
    findMany: jest.fn(async () => list.map((r) => ({ ...r, license_photo: [...r.license_photo] }))),
    updateMany: jest.fn(async ({ where, data }: any) => {
      const row = list.find((r) => r.user_id === where.user_id && JSON.stringify(r.license_photo) === JSON.stringify(where.license_photo.equals));
      if (!row) return { count: 0 };
      row.license_photo = data.license_photo;
      return { count: 1 };
    }),
  });
  const vendor = rows.vendor ?? [];
  const planner = rows.planner ?? [];
  const prisma: any = {
    vendorProfile: table(vendor),
    eventPlannerProfile: table(planner),
    user: { findUnique: jest.fn(async ({ where }: any) => users[where.id] ?? null) },
  };
  return { service: new LicenceFilesService(prisma), prisma, vendor, planner };
}

describe('moving legacy licences to private storage', () => {
  it('copies each public file privately, saves the new key, then deletes the public copy', async () => {
    mockPublic.set('/license/v.pdf', PDF);
    mockPublic.set('event-planner/license/p.jpg', JPG);
    const { service, vendor, planner } = setup({
      vendor: [{ user_id: 'u1', license_photo: ['v.pdf'] }],
      planner: [{ user_id: 'p1', license_photo: ['licences/planner/p1/1-a.pdf', 'p.jpg'] }],
    });
    await expect(service.moveLegacy()).resolves.toEqual({ rows: 2, moved: 2, failed: 0 });
    expect(vendor[0].license_photo).toEqual(['licences/vendor/u1/legacy-v.pdf']);
    expect(planner[0].license_photo).toEqual(['licences/planner/p1/1-a.pdf', 'licences/planner/p1/legacy-p.jpg']);
    expect(mockPrivate.get('licences/vendor/u1/legacy-v.pdf')).toEqual(PDF);
    expect(mockPrivate.get('licences/planner/p1/legacy-p.jpg')).toEqual(JPG);
    expect(mockPublic.size).toBe(0);
  });

  it('keeps the public copy and the old name when the private write fails, and retries next time', async () => {
    mockPublic.set('/license/v.pdf', PDF);
    mockFailPrivatePut.on = 'legacy-v.pdf';
    const { service, vendor } = setup({ vendor: [{ user_id: 'u1', license_photo: ['v.pdf'] }] });
    await expect(service.moveLegacy()).resolves.toEqual({ rows: 1, moved: 0, failed: 1 });
    expect(vendor[0].license_photo).toEqual(['v.pdf']);
    expect(mockPublic.get('/license/v.pdf')).toEqual(PDF);

    mockFailPrivatePut.on = null;
    await expect(service.moveLegacy()).resolves.toEqual({ rows: 1, moved: 1, failed: 0 });
    expect(vendor[0].license_photo).toEqual(['licences/vendor/u1/legacy-v.pdf']);
  });

  it('keeps a missing public file listed and moves the rest of the row', async () => {
    mockPublic.set('/license/b.pdf', PDF);
    const { service, vendor } = setup({ vendor: [{ user_id: 'u1', license_photo: ['gone.pdf', 'b.pdf'] }] });
    await expect(service.moveLegacy()).resolves.toEqual({ rows: 1, moved: 1, failed: 1 });
    expect(vendor[0].license_photo).toEqual(['gone.pdf', 'licences/vendor/u1/legacy-b.pdf']);
  });

  it('is a no-op the second time', async () => {
    mockPublic.set('/license/v.pdf', PDF);
    const { service, prisma } = setup({ vendor: [{ user_id: 'u1', license_photo: ['v.pdf'] }] });
    await service.moveLegacy();
    prisma.vendorProfile.updateMany.mockClear();
    await expect(service.moveLegacy()).resolves.toEqual({ rows: 0, moved: 0, failed: 0 });
    expect(prisma.vendorProfile.updateMany).not.toHaveBeenCalled();
    expect(mockPrivate.size).toBe(1);
  });

  it('leaves everything alone when the owner uploaded new files meanwhile', async () => {
    mockPublic.set('/license/v.pdf', PDF);
    const { service, vendor, prisma } = setup({ vendor: [{ user_id: 'u1', license_photo: ['v.pdf'] }] });
    prisma.vendorProfile.updateMany.mockImplementationOnce(async () => {
      vendor[0].license_photo = ['licences/vendor/u1/2-new.pdf'];
      return { count: 0 };
    });
    await expect(service.moveLegacy()).resolves.toEqual({ rows: 1, moved: 0, failed: 1 });
    expect(mockPublic.get('/license/v.pdf')).toEqual(PDF);
    expect(mockPrivate.has('licences/vendor/u1/legacy-v.pdf')).toBe(false);
  });
});

describe('licence file links', () => {
  const users = { 'admin-1': { type: 'ADMIN' }, 'old-admin': { type: 'ADMIN', deleted_at: new Date() }, u2: { type: 'VENDOR' } };

  it('serve the owner and admins', async () => {
    mockPrivate.set('licences/vendor/u1/1-a.pdf', PDF);
    const { service } = setup({}, users);
    const own = await service.resolve(tokenOf(licenceFileUrl('vendor', 'u1', 'licences/vendor/u1/1-a.pdf', 'u1')!));
    expect(own).toMatchObject({ type: 'application/pdf', name: 'licence.pdf', inline: true });
    expect(own.buffer).toEqual(PDF);
    const admin = await service.resolve(tokenOf(licenceFileUrl('vendor', 'u1', 'licences/vendor/u1/1-a.pdf', 'admin-1')!));
    expect(admin.type).toBe('application/pdf');
  });

  it('refuse a link issued to someone who is neither the owner nor still an admin', async () => {
    mockPrivate.set('licences/vendor/u1/1-a.pdf', PDF);
    const { service } = setup({}, users);
    for (const viewer of ['u2', 'old-admin', 'nobody']) {
      await expect(service.resolve(tokenOf(licenceFileUrl('vendor', 'u1', 'licences/vendor/u1/1-a.pdf', viewer)!))).rejects.toThrow(ForbiddenException);
    }
  });

  it('refuse expired, tampered and non-licence links', async () => {
    mockPrivate.set('licences/vendor/u1/1-a.pdf', PDF);
    const { service } = setup({}, users);
    const expired = SignedUrl.sign({ key: 'licences/vendor/u1/1-a.pdf', uid: 'u1', cid: 'u1', name: 'licence' }, -1);
    await expect(service.resolve(expired)).rejects.toThrow(ForbiddenException);
    const good = tokenOf(licenceFileUrl('vendor', 'u1', 'licences/vendor/u1/1-a.pdf', 'u1')!);
    await expect(service.resolve(`${good}x`)).rejects.toThrow(ForbiddenException);
    // links for contracts, ID checks or disputes share the secret but are not served here
    for (const key of ['contracts/c1/a.pdf', 'identity/u1/front.jpg', 'disputes/b1/x.jpg']) {
      await expect(service.resolve(SignedUrl.sign({ key, uid: 'u1', cid: 'u1', name: 'licence' }))).rejects.toThrow(ForbiddenException);
    }
    // another owner's key with this owner's name on the link
    await expect(service.resolve(SignedUrl.sign({ key: 'licences/vendor/u9/1-a.pdf', uid: 'u1', cid: 'u1', name: 'licence' }))).rejects.toThrow(ForbiddenException);
  });

  it('serve not-yet-moved files from public storage, and keep working after the move', async () => {
    mockPublic.set('/license/v.jpg', JPG);
    const { service } = setup({ vendor: [{ user_id: 'u1', license_photo: ['v.jpg'] }] }, users);
    const token = tokenOf(licenceFileUrl('vendor', 'u1', 'v.jpg', 'admin-1')!);
    await expect(service.resolve(token)).resolves.toMatchObject({ type: 'image/jpeg', name: 'licence.jpg' });
    await service.moveLegacy();
    expect(mockPublic.size).toBe(0);
    const after = await service.resolve(token);
    expect(after.buffer).toEqual(JPG);
  });

  it('offer an old upload that is not a photo or PDF only as a download', async () => {
    mockPublic.set('event-planner/license/page.html', HTML);
    const { service } = setup({}, users);
    const f = await service.resolve(tokenOf(licenceFileUrl('planner', 'p1', 'page.html', 'p1')!));
    expect(f).toMatchObject({ type: 'application/octet-stream', inline: false });
  });

  it('say the file is gone when it is', async () => {
    const { service } = setup({}, users);
    await expect(service.resolve(tokenOf(licenceFileUrl('vendor', 'u1', 'licences/vendor/u1/1-a.pdf', 'u1')!))).rejects.toThrow(NotFoundException);
  });
});

describe('start-up move', () => {
  it('runs under the job lock, so only the server holding it moves files', async () => {
    const { service, prisma } = setup();
    const move = jest.spyOn(service, 'moveLegacy').mockResolvedValue({ rows: 0, moved: 0, failed: 0 });
    let locked = false;
    prisma.$transaction = jest.fn(async (fn: any) => fn({ $queryRaw: async () => [{ locked }] }));
    await service.runLegacyMove();
    expect(move).not.toHaveBeenCalled();
    locked = true;
    await service.runLegacyMove();
    expect(move).toHaveBeenCalledTimes(1);
  });

  it('never throws when the move fails', async () => {
    const { service, prisma } = setup();
    prisma.$transaction = jest.fn(async () => {
      throw new Error('db down');
    });
    await expect(service.runLegacyMove()).resolves.toBeUndefined();
  });
});

describe('LicenceFilesController', () => {
  const res = () => {
    const headers: Record<string, string> = {};
    return { headers, setHeader: (k: string, v: string) => (headers[k] = v), send: jest.fn() } as any;
  };
  const controller = (f: object) => new LicenceFilesController({ resolve: async () => f } as any);

  it('shows photos and PDFs in the tab, never cached', async () => {
    const r = res();
    await controller({ buffer: PDF, type: 'application/pdf', name: 'licence.pdf', inline: true }).file('t', r);
    expect(r.headers).toMatchObject({ 'Content-Type': 'application/pdf', 'Cache-Control': 'private, no-store', 'Content-Disposition': 'inline; filename="licence.pdf"' });
    expect(r.send).toHaveBeenCalledWith(PDF);
  });

  it('only downloads anything else', async () => {
    const r = res();
    await controller({ buffer: HTML, type: 'application/octet-stream', name: 'licence', inline: false }).file('t', r);
    expect(r.headers['Content-Disposition']).toBe('attachment; filename="licence"');
    expect(r.headers['X-Content-Type-Options']).toBe('nosniff');
  });
});
