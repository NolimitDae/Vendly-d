import { CanActivate, ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { PrivateStorage, SignedUrl } from 'src/modules/contracts/private-storage';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { PaymentsService } from 'src/modules/payments/payments.service';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { checkRequestPhotos, requestPhotoUrls, resolveRequestPhoto, storeRequestPhotos } from './request-photos';

const store = new Map<string, Buffer>();
jest.mock('src/modules/contracts/private-storage', () => {
  const actual = jest.requireActual('src/modules/contracts/private-storage');
  return {
    ...actual,
    PrivateStorage: {
      newKey: (folder: string, ext: string) => `${folder}/${Math.random().toString(36).slice(2)}.${ext}`,
      put: jest.fn(async (key: string, data: Buffer) => void store.set(key, data)),
      get: jest.fn(async (key: string) => {
        const b = store.get(key);
        if (!b) throw new Error('missing');
        return b;
      }),
      remove: jest.fn(async (key: string) => void store.delete(key)),
    },
  };
});
jest.mock('src/config/app.config', () => ({ __esModule: true, default: () => ({ app: { url: 'https://api.test', client_app_url: 'https://app.test' } }) }));
jest.mock('./booking.service', () => ({ BookingService: class {}, VENDOR_BOOKING_FILTERS: ['refunds', 'complaints'] }));
jest.mock('src/modules/payments/payments.service', () => ({ PaymentsService: class {} }));

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]);
const PDF = Buffer.from('%PDF-1.7 not a photo at all');
const photo = (buffer: Buffer) => ({ buffer, size: buffer.length });

describe('booking request photos', () => {
  beforeEach(() => {
    store.clear();
    jest.clearAllMocks();
  });

  it('checks every photo (type by content, size, at most 10) before anything is stored', () => {
    expect(checkRequestPhotos([photo(JPEG), photo(PNG)])).toEqual(['jpg', 'png']);
    expect(() => checkRequestPhotos([photo(JPEG), { ...photo(PDF), originalname: 'cake.jpg' } as any])).toThrow('JPEG, PNG, WebP or GIF');
    expect(() => checkRequestPhotos(Array.from({ length: 11 }, () => photo(JPEG)))).toThrow('up to 10 photos');
    expect(() => checkRequestPhotos([{ buffer: JPEG, size: 11 * 1024 * 1024 }])).toThrow('under 10 MB');
    expect(PrivateStorage.put).not.toHaveBeenCalled();
  });

  it('stores privately under the booking, and removes what it stored when one fails', async () => {
    const keys = await storeRequestPhotos('b1', [photo(JPEG), photo(PNG)], ['jpg', 'png']);
    expect(keys).toHaveLength(2);
    expect(keys.every((k) => k.startsWith('request-photos/b1/'))).toBe(true);
    store.clear();
    (PrivateStorage.put as jest.Mock).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('disk full'));
    await expect(storeRequestPhotos('b2', [photo(JPEG), photo(JPEG)], ['jpg', 'jpg'])).rejects.toThrow('disk full');
    expect(PrivateStorage.remove).toHaveBeenCalledTimes(1);
  });

  it('gives signed links that serve only request photos', async () => {
    store.set('request-photos/b1/a.png', PNG);
    const [url] = requestPhotoUrls(['request-photos/b1/a.png'], 'v1', 'b1');
    expect(url).toMatch(/^https:\/\/api\.test\/api\/request-photos\/[\w-]+\.[\w-]+$/);
    const f = await resolveRequestPhoto(url.split('/').pop()!);
    expect(f).toMatchObject({ type: 'image/png', name: 'inspiration-photo.png' });
    await expect(resolveRequestPhoto(SignedUrl.sign({ key: 'disputes/b1/a.png', uid: 'v1', cid: 'b1', name: 'x' }))).rejects.toThrow('expired');
    await expect(resolveRequestPhoto('forged.token')).rejects.toThrow('expired');
    expect(requestPhotoUrls(null, 'v1', 'b1')).toEqual([]);
  });
});

class FakeAuth implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    ctx.switchToHttp().getRequest().user = { id: 'c1' };
    return true;
  }
}

describe('POST /bookings/with-photos', () => {
  let app: INestApplication;
  const bookings = { create: jest.fn().mockResolvedValue({ success: true }) };
  const body = {
    listing_id: 'l1',
    vendor_id: 'v1',
    preview_token: 'token',
    message: 'Like these',
    add_ons: [{ add_on_id: 'a1', quantity: 2 }],
    signature: { legal_name: 'Cara Customer', consent: true, content_sha256: 'a'.repeat(64) },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [BookingController],
      providers: [
        { provide: BookingService, useValue: bookings },
        { provide: PaymentsService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(FakeAuth)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, transformOptions: { enableImplicitConversion: true } }));
    await app.init();
  });

  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('takes the request as JSON next to the photos', async () => {
    const res = await request(app.getHttpServer())
      .post('/bookings/with-photos')
      .field('request', JSON.stringify(body))
      .attach('photos', JPEG, 'one.jpg')
      .attach('photos', PNG, 'two.png');
    expect(res.status).toBe(201);
    const [user, dto, , photos] = bookings.create.mock.calls[0];
    expect(user).toBe('c1');
    expect(dto).toMatchObject({ listing_id: 'l1', message: 'Like these', signature: { legal_name: 'Cara Customer', consent: true } });
    expect(dto.add_ons[0]).toMatchObject({ add_on_id: 'a1', quantity: 2 });
    expect(photos).toHaveLength(2);
  });

  it('checks the request by the same rules as the JSON endpoint', async () => {
    const missing = await request(app.getHttpServer()).post('/bookings/with-photos').attach('photos', JPEG, 'one.jpg');
    expect(missing.status).toBe(400);
    const extra = await request(app.getHttpServer()).post('/bookings/with-photos').field('request', JSON.stringify({ ...body, request_photos: ['x'] }));
    expect(extra.status).toBe(400);
    const noConsent = await request(app.getHttpServer()).post('/bookings/with-photos').field('request', JSON.stringify({ ...body, signature: { ...body.signature, consent: false } }));
    expect(noConsent.status).toBe(400);
    const tooMany = request(app.getHttpServer()).post('/bookings/with-photos').field('request', JSON.stringify(body));
    for (let i = 0; i < 11; i++) tooMany.attach('photos', JPEG, `${i}.jpg`);
    expect((await tooMany).status).toBe(400);
    expect(bookings.create).not.toHaveBeenCalled();
  });
});
