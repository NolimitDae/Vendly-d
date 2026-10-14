import { contactReasons } from './contact-warning';

describe('contactReasons', () => {
  it.each([
    ['email me at nia.bloom@gmail.com', ['email']],
    ['nia (at) gmail (dot) com', ['email']],
    ['call 713-555-0182 tomorrow', ['phone']],
    ['+1 (713) 555 0182', ['phone']],
    ['+44 7700 900123', ['phone']],
    ['just pay me on Zelle instead', ['off_platform']],
    ['WhatsApp me', ['off_platform']],
  ])('flags %s', (text, expected) => {
    expect(contactReasons(text)).toEqual(expected);
  });

  it.each([
    'The package is $1,250.00 for 6 hours',
    'Event on 2026-11-14 at 5pm',
    'See you on 11/14/2026',
    'We need 120 chairs and 12 tables',
    'Order #4821',
    '',
  ])('does not flag %s', (text) => {
    expect(contactReasons(text)).toEqual([]);
  });
});
