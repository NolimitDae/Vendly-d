import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { CalendarFeedController } from './calendar-sync.controller';
import { CalendarSyncService } from './calendar-sync.service';

describe('CalendarFeedController', () => {
  let app: INestApplication;
  const service = { feed: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CalendarFeedController],
      providers: [{ provide: CalendarSyncService, useValue: service }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());

  it('serves the .ics without a login', async () => {
    service.feed.mockResolvedValueOnce('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n');
    const res = await request(app.getHttpServer()).get('/calendar/feed/abc_DEF-123.ics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/calendar; charset=utf-8/);
    expect(res.text).toBe('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n');
    expect(service.feed).toHaveBeenCalledWith('abc_DEF-123');
  });

  it('is not found without the .ics suffix or for an unknown token', async () => {
    expect((await request(app.getHttpServer()).get('/calendar/feed/abc')).status).toBe(404);
    service.feed.mockRejectedValueOnce(new NotFoundException());
    expect((await request(app.getHttpServer()).get('/calendar/feed/nope.ics')).status).toBe(404);
  });
});
