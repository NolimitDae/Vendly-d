import { BadRequestException, HttpException, UnauthorizedException } from '@nestjs/common';
import { errorMessage } from './custom-exception.filter';

describe('errorMessage', () => {
  it('gives the apps plain text, not the nested Nest object', () => {
    expect(errorMessage(new UnauthorizedException('Email not found'))).toBe('Email not found');
    expect(errorMessage(new HttpException('Too many requests', 429))).toBe('Too many requests');
  });

  it('joins validation errors into one line', () => {
    expect(errorMessage(new BadRequestException(['email must be an email', 'password is too short']))).toBe(
      'email must be an email, password is too short',
    );
  });
});
