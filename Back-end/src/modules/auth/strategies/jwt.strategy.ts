import { Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import appConfig from '../../../config/app.config';
import { PrismaService } from '../../../prisma/prisma.service';
import { resolveAuthToken } from '../auth-cookies';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      // Bearer header (the app, older website sessions) or the website's HttpOnly session cookie
      jwtFromRequest: (req: any) => resolveAuthToken(req)?.token ?? null,
      // Access tokens expire (JWT_ACCESS_EXPIRY); the web and mobile clients refresh them via
      // POST /auth/refresh-token.
      ignoreExpiration: false,
      secretOrKey: appConfig().jwt.secret,
    });
  }

  async validate(payload: any) {
    if (payload?.typ === 'refresh') {
      throw new UnauthorizedException('Refresh tokens cannot be used as access tokens');
    }
    // short-lived tokens handed to the website's socket connection only open sockets
    if (payload?.typ === 'socket') {
      throw new UnauthorizedException('Socket tokens cannot be used as access tokens');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, status: true, deleted_at: true, type: true },
    });
    // status 0 = deactivated (set on account deletion); also covers deleted or unknown users.
    if (!user || user.deleted_at || user.status === 0) {
      throw new UnauthorizedException('This account is no longer active');
    }
    // some controllers read user.id, others user.userId
    // The role comes from the database, not the token: a user who switches roles gets the new one
    // straight away on every token they still hold.
    // sid: which sign-in (device) the token belongs to; absent on tokens from before sessions
    return { id: payload.sub, userId: payload.sub, email: payload.email, type: user.type ?? payload.type, ...(typeof payload.sid === 'string' && { sid: payload.sid }) };
  }
}
