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
    try {
      const token = req.body?.token as string | undefined;
      const user = await this.authService.validateUser(email, password, token);
      return user;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw new UnauthorizedException(error.message);
      }
    }
  }
}
