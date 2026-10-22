import { EmailCaseMiddleware } from './email-case.middleware';

describe('EmailCaseMiddleware', () => {
  const run = (body: any) => {
    const req = { body };
    const next = jest.fn();
    new EmailCaseMiddleware().use(req, {}, next);
    expect(next).toHaveBeenCalled();
    return req.body;
  };

  it('lower-cases and trims email and new_email', () => {
    expect(run({ email: ' David@Gmail.COM ', new_email: 'New@X.io', password: 'Secret' })).toEqual({
      email: 'david@gmail.com',
      new_email: 'new@x.io',
      password: 'Secret',
    });
  });

  it('leaves other fields and missing bodies alone', () => {
    expect(run({ client_email: 'A@B.com', name: 'Ann' })).toEqual({ client_email: 'A@B.com', name: 'Ann' });
    expect(run(undefined)).toBeUndefined();
    expect(run([{ email: 'A@B.com' }])).toEqual([{ email: 'A@B.com' }]);
  });
});
