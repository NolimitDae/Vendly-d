import { MailProcessor } from './mail.processor';

describe('MailProcessor', () => {
  it('returns the provider message id so the completed log can show it', async () => {
    const mailer = { sendMail: jest.fn().mockResolvedValue({ messageId: 're_123' }) };
    const processor = new MailProcessor(mailer as any);
    const job: any = { id: '9', name: 'sendOtpCodeToEmail', data: { to: 'a@b.com', subject: 'Code' } };
    await expect(processor.process(job)).resolves.toEqual({ messageId: 're_123' });
    expect(mailer.sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@b.com' }));
  });

  it('rethrows send failures so the job is marked failed', async () => {
    const mailer = { sendMail: jest.fn().mockRejectedValue(new Error('Resend 403: domain not verified')) };
    const processor = new MailProcessor(mailer as any);
    jest.spyOn((processor as any).logger, 'error').mockImplementation(() => undefined);
    await expect(processor.process({ id: '1', name: 'sendOtpCodeToEmail', data: {} } as any)).rejects.toThrow('Resend 403');
  });
});
