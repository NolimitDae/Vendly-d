import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from '../auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({ usernameField: 'email', passReqToCallback: true });
  }

  async validate(req: Request, email: string, password: string): Promise<any> {
    // plain text only: an object here would reach the database as a filter
    if (typeof email !== 'string' || typeof password !== 'string') throw new UnauthorizedException('Email or password is incorrect');
    try {
      const raw = req.body?.token;
      const token = typeof raw === 'string' ? raw : undefined;
      const user = await this.authService.validateUser(email, password, token);
      return user;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw new UnauthorizedException(error.message);
      }
    }
  }
}
