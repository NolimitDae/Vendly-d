import { Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import appConfig from '../../../config/app.config';
import { PrismaService } from '../../../prisma/prisma.service';
import { resolveAuthToken } from '../auth-cookies';
import { sessionKeys } from '../session-keys';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectRedis() private readonly redis: Redis,
  ) {
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
    if (!(await this.sessionIsLive(payload))) {
      throw new UnauthorizedException('This sign-in has ended. Please sign in again.');
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

  /**
   * The sign-in the token came from must still exist: signing out, a password reset or change, and
   * "sign out everywhere" delete its refresh token, and its access tokens stop working with it.
   * Tokens from before sessions (no `sid`) belong to the user's single old slot.
   */
  private async sessionIsLive(payload: any): Promise<boolean> {
    if (typeof payload?.sub !== 'string' || !payload.sub) return false;
    const sid = typeof payload.sid === 'string' && payload.sid ? payload.sid : undefined;
    try {
      return (await this.redis.exists(sessionKeys(payload.sub, sid).current)) === 1;
    } catch (err) {
      // Redis unreachable: keep signed-in users working (refreshing and signing in fail anyway
      // until it's back) rather than signing everyone out.
      this.logger.warn(`Session check skipped: ${(err as Error)?.message}`);
      return true;
    }
  }
}
