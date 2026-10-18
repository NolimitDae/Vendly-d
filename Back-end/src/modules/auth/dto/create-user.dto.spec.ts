import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateUserDto } from './create-user.dto';

const base = { first_name: 'A', last_name: 'B', email: 'a@b.co', password: 'Password1!' };
const errorsFor = (accepted_terms: unknown) => validate(plainToInstance(CreateUserDto, { ...base, accepted_terms }));

describe('CreateUserDto accepted_terms', () => {
  it('accepts true and the text "true" from multipart forms', async () => {
    expect(await errorsFor(true)).toHaveLength(0);
    expect(await errorsFor('true')).toHaveLength(0);
  });

  it('rejects false, "false" and missing', async () => {
    expect(await errorsFor(false)).toHaveLength(1);
    expect(await errorsFor('false')).toHaveLength(1);
    expect(await errorsFor(undefined)).toHaveLength(1);
  });
});
