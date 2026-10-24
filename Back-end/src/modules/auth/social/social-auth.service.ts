import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import appConfig from 'src/config/app.config';
import { UserRepository } from 'src/common/repository/user/user.repository';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthService } from '../auth.service';
import { SocialIdentity, SocialTokenError, verifyApple, verifyGoogle } from './social-tokens';
import { track } from 'src/common/analytics';

export type SocialRole = 'CLIENT' | 'VENDOR' | 'EVENT_PLANNER';
const ROLES: SocialRole[] = ['CLIENT', 'VENDOR', 'EVENT_PLANNER'];

/**
 * Sign in (or sign up) with Google or Apple. Finds the linked account, else links an existing user
 * with the same verified email, else creates a user with the chosen role. New users without a role
 * get `needs_role` so the app can ask and try again.
 */
@Injectable()
export class SocialAuthService {
  constructor(
    private prisma: PrismaService,
    private users: UserRepository,
    private auth: AuthService,
  ) {}

  private async identity(provider: string, idToken: string): Promise<SocialIdentity> {
    try {
      if (provider === 'google') return await verifyGoogle(idToken);
      if (provider === 'apple') return await verifyApple(idToken);
    } catch (e) {
      if (e instanceof SocialTokenError) throw new UnauthorizedException(e.message);
      throw e;
    }
    throw new BadRequestException('Unknown sign-in provider');
  }

  /**
   * `token`: the 6-digit code from an authenticator app. Accounts with two-step sign-in get
   * "Token is required" first (as with a password), and the app calls again with the code and a
   * Google / Apple token, which is checked again.
   */
  async signIn(dto: { provider: 'google' | 'apple'; id_token: string; role?: SocialRole; name?: string; accepted_terms?: boolean; token?: string }) {
    const id = await this.identity(dto.provider, dto.id_token);

    let userId: string | null = null;
    // an existing email account is linked once the sign-in has fully gone through (code included)
    let linkExisting = false;
    const linked = await this.prisma.account.findUnique({ where: { provider_provider_account_id: { provider: id.provider, provider_account_id: id.sub } }, select: { user_id: true } });
    if (linked) userId = linked.user_id;

    if (!userId) {
      // only an email the provider has verified may reach (or link to) an account
      if (!id.email || !id.email_verified) {
        throw new BadRequestException(id.provider === 'apple' ? 'Apple didn’t share an email for this account. Sign up with email instead, or allow Apple to share it.' : 'Your Google email isn’t verified.');
      }
      const existing = await this.prisma.user.findFirst({ where: { email: { equals: id.email, mode: 'insensitive' }, deleted_at: null }, select: { id: true } });
      if (existing) {
        userId = existing.id;
        linkExisting = true;
      } else {
        if (!dto.role) return { success: false, needs_role: true, message: 'Choose how you’ll use Vendly to finish signing up.' };
        if (!ROLES.includes(dto.role)) throw new BadRequestException('Invalid account type');
        if (dto.accepted_terms !== true) throw new BadRequestException('You must accept the Terms of Service and Privacy Policy');
        const name = dto.name?.trim() || id.name || id.email.split('@')[0];
        const created = await this.users.createUser({
          email: id.email,
          name,
          // social accounts sign in without a password; this random one only exists so the column is set
          password: randomBytes(32).toString('hex'),
          type: dto.role,
          accepted_terms: true,
        });
        if (!created?.data?.id) throw new BadRequestException(created?.message ?? 'Could not create your account');
        userId = created.data.id;
        track('signup', userId, { type: dto.role, method: id.provider });
        await this.link(userId, id);
      }
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId! }, select: { id: true, email: true, status: true, deleted_at: true, email_verified_at: true, type: true, is_two_factor_enabled: true } });
    if (!user || user.deleted_at) throw new UnauthorizedException('This account no longer exists');
    if (user.status === 0) throw new ForbiddenException('This account is suspended. Contact Vendly support.');
    if (user.type === 'ADMIN') throw new ForbiddenException('Admins sign in with email and password.');
    // an existing account whose email was never verified may have been set up by someone else
    const unverifiedLink = linkExisting && !user.email_verified_at;
    // two-step sign-in applies here too: the same answers as signing in with a password
    // (not on an unverified account: that two-step sign-in is dropped below)
    if (user.is_two_factor_enabled && !unverifiedLink) {
      if (!dto.token) throw new UnauthorizedException('Token is required');
      if (!(await this.users.verify2FA(user.id, dto.token))) throw new UnauthorizedException('Invalid token');
    }
    if (unverifiedLink) await this.dropUnverifiedSignIn(user.id);
    if (linkExisting) await this.link(user.id, id);
    // Google / Apple have already verified the email
    if (!user.email_verified_at) await this.prisma.user.update({ where: { id: user.id }, data: { email_verified_at: new Date() } });

    return this.auth.login({ email: user.email, userId: user.id });
  }

  /**
   * Anyone can sign up with someone else's email and a password and never verify it. When the real
   * owner then signs in with Google / Apple (which proves the email is theirs), that password would
   * start working too. So before such an account is linked, whatever the sign-up set is dropped:
   * the password (now a random one nobody knows; "forgot password" sets a new one), two-step
   * sign-in, any one-time codes and every session. Runs before the email is marked verified, so a
   * failure here is simply tried again on the next sign-in.
   */
  private async dropUnverifiedSignIn(userId: string) {
    const password = await bcrypt.hash(randomBytes(32).toString('hex'), appConfig().security.salt);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { password, two_factor_secret: null, is_two_factor_enabled: 0 } }),
      this.prisma.ucode.deleteMany({ where: { user_id: userId } }),
    ]);
    await this.auth.revokeAllSessions(userId);
  }

  private link(userId: string, id: SocialIdentity) {
    return this.prisma.account.create({ data: { user_id: userId, type: 'oauth', provider: id.provider, provider_account_id: id.sub } });
  }
}
