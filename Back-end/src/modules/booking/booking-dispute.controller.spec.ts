import { CanActivate, ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { PaymentsService } from 'src/modules/payments/payments.service';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';

jest.mock('./booking.service', () => ({ BookingService: class {}, VENDOR_BOOKING_FILTERS: ['refunds', 'complaints'] }));
jest.mock('src/modules/payments/payments.service', () => ({ PaymentsService: class {} }));

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]);

class FakeAuth implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    ctx.switchToHttp().getRequest().user = { id: 'c1' };
    return true;
  }
}

describe('POST /bookings/:id/dispute', () => {
  let app: INestApplication;
  const payments = { openDispute: jest.fn().mockResolvedValue({ success: true }) };
  const bookings = { getMyBookingsAsVendor: jest.fn().mockResolvedValue({ success: true, data: [] }) };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [BookingController],
      providers: [
        { provide: BookingService, useValue: bookings },
        { provide: PaymentsService, useValue: payments },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(FakeAuth)
      .compile();
    app = moduleRef.createNestApplication();
    // as in main.ts
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, transformOptions: { enableImplicitConversion: true } }));
    await app.init();
  });

  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('takes a multipart report with details and photos', async () => {
    const res = await request(app.getHttpServer())
      .post('/bookings/b1/dispute')
      .field('reason', 'The cake arrived smashed')
      .field('category', 'damage')
      .field('outcome', 'partial_refund')
      .field('requested_amount', '75.50')
      .attach('photos', JPEG, 'one.jpg')
      .attach('photos', JPEG, 'two.jpg');
    expect(res.status).toBe(201);
    const [id, user, dto, photos] = payments.openDispute.mock.calls[0];
    expect([id, user]).toEqual(['b1', 'c1']);
    expect(dto).toMatchObject({ reason: 'The cake arrived smashed', category: 'damage', outcome: 'partial_refund', requested_amount: 75.5 });
    expect(photos).toHaveLength(2);
    expect(Buffer.isBuffer(photos[0].buffer)).toBe(true);
  });

  it('still takes the old JSON body with only a reason', async () => {
    const res = await request(app.getHttpServer()).post('/bookings/b1/dispute').send({ reason: 'The DJ never showed up' });
    expect(res.status).toBe(201);
    expect(payments.openDispute).toHaveBeenCalledWith('b1', 'c1', expect.objectContaining({ reason: 'The DJ never showed up' }), []);
  });

  it('validates the fields', async () => {
    const short = await request(app.getHttpServer()).post('/bookings/b1/dispute').send({ reason: 'bad' });
    expect(short.status).toBe(400);
    const badCategory = await request(app.getHttpServer()).post('/bookings/b1/dispute').field('reason', 'Something went wrong here').field('category', 'aliens');
    expect(badCategory.status).toBe(400);
    const badOutcome = await request(app.getHttpServer()).post('/bookings/b1/dispute').send({ reason: 'Something went wrong here', outcome: 'free_stuff' });
    expect(badOutcome.status).toBe(400);
    const tooMany = request(app.getHttpServer()).post('/bookings/b1/dispute').field('reason', 'Something went wrong here');
    for (let i = 0; i < 11; i++) tooMany.attach('photos', JPEG, `${i}.jpg`);
    expect((await tooMany).status).toBe(400);
    expect(payments.openDispute).not.toHaveBeenCalled();
  });

  it('passes the vendor list filter through, and ignores unknown ones', async () => {
    await request(app.getHttpServer()).get('/bookings/my/vendor?filter=complaints');
    expect(bookings.getMyBookingsAsVendor).toHaveBeenLastCalledWith('c1', expect.objectContaining({ filter: 'complaints' }));
    await request(app.getHttpServer()).get('/bookings/my/vendor?filter=everything');
    expect(bookings.getMyBookingsAsVendor).toHaveBeenLastCalledWith('c1', expect.objectContaining({ filter: undefined }));
  });
});
