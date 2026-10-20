import { createTransport } from 'nodemailer';
import { resendTransport } from './resend.transport';

describe('resendTransport', () => {
  afterEach(() => jest.restoreAllMocks());

  it('posts the rendered email to Resend with the API key', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'msg_1' }), { status: 200 }),
    );
    const info = await createTransport(resendTransport('re_key')).sendMail({
      from: 'Vendly <noreply@vendlymarketplace.com>',
      to: 'a@b.com',
      subject: 'Email Verification',
      html: '<p>123456</p>',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as any).Authorization).toBe('Bearer re_key');
    expect(JSON.parse(init.body as string)).toMatchObject({
      from: 'Vendly <noreply@vendlymarketplace.com>',
      to: ['a@b.com'],
      subject: 'Email Verification',
      html: '<p>123456</p>',
    });
    expect(info.messageId).toBe('msg_1');
  });

  it('fails the send when Resend rejects it, so the queue logs the error', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'domain not verified' }), { status: 403 }),
    );
    await expect(
      createTransport(resendTransport('re_key')).sendMail({ from: 'x@y.com', to: 'a@b.com', subject: 's', html: 'h' }),
    ).rejects.toThrow('Resend 403: domain not verified');
  });
});
