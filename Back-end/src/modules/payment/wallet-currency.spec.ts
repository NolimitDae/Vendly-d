import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateDepositDto } from './deposite/dto/create-deposite.dto';
import { CreateWithdrawDto } from './withdraw/dto/create-withdraw.dto';

const errorsFor = async (cls: any, body: object) => (await validate(plainToInstance(cls, body))).map((e) => e.property);

describe('wallet currency', () => {
  it('takes deposits in US dollars only', async () => {
    expect(await errorsFor(CreateDepositDto, { amount: 50 })).toEqual([]);
    expect(await errorsFor(CreateDepositDto, { amount: 50, currency: 'usd' })).toEqual([]);
    expect(await errorsFor(CreateDepositDto, { amount: 50, currency: 'USD' })).toEqual([]);
    expect(await errorsFor(CreateDepositDto, { amount: 999999, currency: 'idr' })).toEqual(['currency']);
  });

  it('pays withdrawals out in US dollars only', async () => {
    expect(await errorsFor(CreateWithdrawDto, { amount: 20 })).toEqual([]);
    expect(await errorsFor(CreateWithdrawDto, { amount: 20, currency: 'usd' })).toEqual([]);
    expect(await errorsFor(CreateWithdrawDto, { amount: 20, currency: 'gbp' })).toEqual(['currency']);
  });
});
