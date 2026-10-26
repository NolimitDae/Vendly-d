// external imports
import { InjectRedis } from '@nestjs-modules/ioredis';
import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import Redis from 'ioredis';

//internal imports
import { DateHelper } from '../../common/helper/date.helper';
import { PHOTOS, safeStoredName, sniffUpload, uploadRefusedMessage } from '../../common/helper/upload-files';
import { checkLicenceFiles, licenceFileUrls, removeLicenceFiles, storeLicenceFiles } from '../licence-files/licence-files';
import { TanvirStorage } from '../../common/lib/Disk/TanvirStorage';
import { StripePayment } from '../../common/lib/Payment/stripe/StripePayment';
import { UcodeRepository } from '../../common/repository/ucode/ucode.repository';
import { UserRepository } from '../../common/repository/user/user.repository';
import appConfig from '../../config/app.config';
import { MailService } from '../../mail/mail.service';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, UserType } from 'prisma/generated/client';
import { UpdateUserDto } from './dto/update-user.dto';
import { track } from 'src/common/analytics';
import { normalizeHandle, shopImageUrl } from '../../common/helper/handle';
import { normalizeSocial, readSocials, SOCIAL_KEYS, SOCIALS_SELECT } from '../../common/helper/social-links';
import { IdentityService } from '../identity/identity.service';
import { parseWorkingHours, readWorkingHours, type WorkingHours } from '../vendor/working-hours';
import { NOTIFICATION_PREF_KEYS, NotificationPrefKey, readPrefs } from '../../common/helper/notification-prefs';

/** Roles a person can hold on one login and switch between (CLIENT is the older name for CUSTOMER). */
export const SWITCHABLE_ROLES = ['CUSTOMER', 'VENDOR', 'EVENT_PLANNER'] as const;
export type SwitchableRole = (typeof SWITCHABLE_ROLES)[number];
const asRole = (t: string | null | undefined): SwitchableRole | null =>
  t === 'CLIENT' || t === 'CUSTOMER' ? 'CUSTOMER' : t === 'VENDOR' || t === 'EVENT_PLANNER' ? t : null;
/** The roles an account holds, as switchable roles (its current one included). */
export function heldRoles(user: { type?: string | null; roles?: string[] | null }): SwitchableRole[] {
  const held = new Set<SwitchableRole>();
  for (const t of [...(user.roles ?? []), user.type]) {
    const r = asRole(t);
    if (r) held.add(r);
  }
  return SWITCHABLE_ROLES.filter((r) => held.has(r));
}

const MAX_CODE_TRIES = 5;
const CODE_TRIES_WINDOW_SECONDS = 15 * 60;
export const TOO_MANY_CODE_TRIES = 'Too many wrong codes. Please request a new code.';

/** Sign-in with an unknown email or a wrong password gets the same answer. */
export const WRONG_LOGIN = 'Email or password is incorrect';
/** A bcrypt hash of nothing in particular: compared against for unknown emails so both cases take as long. */
const DUMMY_HASH = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8.AnjT4M0nOhUvYbRKrYFnAoK9nzMa';

/** How long a refresh token lives in Redis (matches JWT_REFRESH_EXPIRY's default of 7 days). */
const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 7;
/** How long a just-replaced refresh token still works (another tab refreshing at the same moment). */
export const REFRESH_GRACE_SECONDS = 30;
/**
 * Rotates the user's refresh token only if KEYS[1] still holds the one presented (ARGV[1]): stores
 * the new one (ARGV[2], ttl ARGV[3]) and keeps the old one in KEYS[2] for the grace window (ARGV[4]).
 */
const ROTATE_REFRESH_TOKEN = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  redis.call('SET', KEYS[1], ARGV[2], 'EX', tonumber(ARGV[3]))
  redis.call('SET', KEYS[2], ARGV[1], 'EX', tonumber(ARGV[4]))
  return 1
end
return 0`;

/**
 * Where a sign-in's refresh token lives. Every sign-in is its own session (`sid`, carried in its
 * tokens), so signing in on one device never signs another out. Tokens issued before sessions
 * existed have no `sid` and keep the user's single old slot until they expire or sign out.
 */
export function sessionKeys(userId: string, sid?: string | null) {
  return sid
    ? { current: `refresh_token:${userId}:${sid}`, previous: `refresh_token_prev:${userId}:${sid}` }
    : { current: `refresh_token:${userId}`, previous: `refresh_token_prev:${userId}` };
}
/** The user's session ids, so deleting the account can end every one. */
const sessionsKey = (userId: string) => `refresh_sessions:${userId}`;
const newSessionId = () => randomBytes(12).toString('hex');
/** Added to the answer after a password reset or change, which end the other sessions. */
export const SIGNED_OUT_ELSEWHERE = 'You’ve been signed out on your other devices.';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    private mailService: MailService,
    private userRepository: UserRepository,
    private ucodeRepository: UcodeRepository,
    @InjectRedis() private readonly redis: Redis,
    private identity: IdentityService,
  ) { }

  //
  async me(userId: string) {
    try {
      const user = await this.prisma.user.findFirst({
        where: {
          id: userId,
        },
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
          address: true,
          type: true,
          roles: true,
          id_verified_at: true,
          first_name: true,
          last_name: true,
          bio: true,
          // vendors: business details and where their licence check stands
          vendorProfile: { select: { business_name: true, about_me: true, license_status: true, license_photo: true, handle: true, banner: true, logo: true, working_hours: true, ...SOCIALS_SELECT } },
        },
      });

      if (!user) {
        return {
          success: false,
          message: 'User not found',
        };
      }

      if (user.avatar) {
        user['avatar_url'] = TanvirStorage.url(
          appConfig().storageUrl.avatar + '/' + user.avatar,
        );
      }

      if (user) {
        const { vendorProfile, roles, id_verified_at, ...rest } = user;
        return {
          success: true,
          data: {
            ...rest,
            // one login, several roles: what this account holds and whether it may switch
            roles: heldRoles({ type: user.type, roles }),
            id_verified: !!id_verified_at,
            vendorProfile: vendorProfile ? { business_name: vendorProfile.business_name, about_me: vendorProfile.about_me, license_status: vendorProfile.license_status } : null,
            ...(vendorProfile && {
              business_name: vendorProfile.business_name,
              about_me: vendorProfile.about_me,
              license_status: vendorProfile.license_status,
              license_uploaded: (vendorProfile.license_photo?.length ?? 0) > 0,
              handle: vendorProfile.handle,
              banner_url: shopImageUrl(vendorProfile.banner),
              logo_url: shopImageUrl(vendorProfile.logo),
              // weekly hours customers can book in; null = not set (any time)
              working_hours: readWorkingHours(vendorProfile.working_hours),
              // social accounts shown on the shop page (full links)
              socials: readSocials(vendorProfile),
            }),
          },
        };
      } else {
        return {
          success: false,
          message: 'User not found',
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }
  // done
  async register({
    first_name,
    last_name,
    name,
    address,
    phone,
    business_name,
    email,
    password,
    type,
    image,
    accepted_terms,
  }: {
    first_name: string;
    last_name: string;
    name: string;
    address?: string;
    email: string;
    phone?: string;
    business_name?: string;
    password: string;
    type?: string;
    image?: Express.Multer.File;
    accepted_terms?: boolean;
  }) {
    try {
      // Check if email already exist
      const userEmailExist = await this.userRepository.exist({
        field: 'email',
        value: String(email),
      });

      if (userEmailExist) {
        return {
          statusCode: 401,
          message: 'Email already exist',
        };
      }

      const user = await this.userRepository.createUser({
        first_name: first_name,
        last_name: last_name,
        name: name,
        email: email,
        address: address,
        phone: phone,
        business_name: business_name,
        password: password,
        image: image,
        type: type,
        accepted_terms,
      });

      if (!user || user.success === false || !user.data?.id) {
        return {
          success: false,
          message: user?.message || 'Failed to create account',
        };
      }

      const userId = user.data.id;
      track('signup', userId, { type, method: 'email' });

      // create stripe customer account
      const stripeCustomer = await StripePayment.createCustomer({
        user_id: userId,
        email: email,
        name: name,
      });

      if (stripeCustomer) {
        await this.prisma.user.update({
          where: {
            id: userId,
          },
          data: {
            billing_id: stripeCustomer.id,
          },
        });
      }

      // ----------------------------------------------------
      // create otp code
      const token = await this.ucodeRepository.createToken({
        userId: userId,
        isOtp: true,
        time: 2,
      });

      // send otp code to email
      await this.mailService.sendOtpCodeToEmail({
        email: email,
        name: name,
        otp: token,
      });

      return {
        success: true,
        message: 'We have sent an OTP code to your email',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }
  // done
  /** Signs the user in as a new session, or renews the tokens of `sid` (switching roles on that device). */
  async login({ email, userId, sid }: { email: string; userId: string; sid?: string | null }) {
    try {
      const user = await this.userRepository.getUserDetails(userId);

      const payload = { email: email, sub: userId, type: user?.type, sid: sid || newSessionId() };


      const accessToken = this.jwtService.sign(payload, {
        expiresIn: (process.env.JWT_ACCESS_EXPIRY ?? '1h') as any,
      });
      const refreshToken = await this.issueRefreshToken(payload);

      return {
        success: true,
        message: 'Logged in successfully',
        authorization: {
          type: 'bearer',
          access_token: accessToken,
          refresh_token: refreshToken,
        },
        type: user.type,
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  // add license (photos or PDFs), kept in private storage
  async addLicense(
    userId: string,
    license: Express.Multer.File[],
  ) {
    const data: any = {};
    let replaced: string[] = [];

    if (license && license.length > 0) {
      // check every file is a photo or PDF before touching the ones on file
      const exts = checkLicenceFiles(license);
      const existingProfile = await this.prisma.vendorProfile.findUnique({
        where: { user_id: userId },
        select: { license_photo: true },
      });
      replaced = existingProfile?.license_photo ?? [];
      data.license_photo = await storeLicenceFiles('vendor', userId, license, exts);
      // a new document goes back in the review queue (e.g. after a rejection)
      data.license_status = 'PENDING';
    }

    let updatedVendorProfile;
    try {
      updatedVendorProfile = await this.prisma.vendorProfile.upsert({
        where: { user_id: userId },
        create: {
          user_id: userId,
          license_photo: data.license_photo || [],
        },
        update: {
          ...data,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
              address: true,
              type: true,
            },
          },
        },
      });
    } catch (err) {
      await removeLicenceFiles('vendor', data.license_photo);
      throw err;
    }
    // the old documents go only once the new ones are saved
    await removeLicenceFiles('vendor', replaced);

    const user = updatedVendorProfile.user;
    
    return {
      success: true,
      message: 'License added successfully',
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar
          ? TanvirStorage.url(
              appConfig().storageUrl.avatar + '/' + user.avatar,
            )
          : null,
        address: user.address,
        type: user.type,
        // short-lived signed links, for this vendor only
        license_photo: licenceFileUrls('vendor', userId, updatedVendorProfile.license_photo, userId),
      },
    };

  }

  // update user 
  /** Stores an image in the avatar dir (deleting the one it replaces) and returns its filename. */
  private async replaceImage(file: Express.Multer.File, old?: string | null) {
    const fileName = safeStoredName(file.buffer, PHOTOS);
    if (old) await TanvirStorage.delete(appConfig().storageUrl.avatar + '/' + old);
    await TanvirStorage.put(appConfig().storageUrl.avatar + '/' + fileName, file.buffer);
    return fileName;
  }

  async updateUser(
    userId: string,
    updateUserDto: UpdateUserDto,
    image?: Express.Multer.File,
    shop: { banner?: Express.Multer.File; logo?: Express.Multer.File } = {},
  ) {
    // refused before anything changes when a picture isn't really an image (this endpoint answers
    // failures as { success: false, message }, which the website and app show)
    for (const f of [image, shop.banner, shop.logo]) {
      if (f && !sniffUpload(f.buffer, PHOTOS)) return { success: false, message: uploadRefusedMessage(PHOTOS) };
    }
    try {
      const data: any = {};

      if (updateUserDto.name) data.name = updateUserDto.name;

      if (updateUserDto.first_name) data.first_name = updateUserDto.first_name;

      if (updateUserDto.last_name) data.last_name = updateUserDto.last_name;

      if (updateUserDto.address) data.address = updateUserDto.address;

      if (updateUserDto.about_me !== undefined) data.bio = updateUserDto.about_me;

      const user = await this.userRepository.getUserDetails(userId);
      if (user) {
        let handle: string | null | undefined;
        if (user.type === UserType.VENDOR && updateUserDto.handle !== undefined) {
          const result = normalizeHandle(updateUserDto.handle);
          if ('error' in result) return { success: false, message: result.error };
          handle = result.handle;
          if (handle) {
            const taken = await this.prisma.vendorProfile.findFirst({
              where: { handle, user_id: { not: userId } },
              select: { id: true },
            });
            if (taken) return { success: false, message: 'That shop link is taken. Try another.' };
          }
        }

        // vendors' weekly working hours: checked before anything is saved
        let workingHours: WorkingHours | null | undefined;
        if (user.type === UserType.VENDOR && updateUserDto.working_hours !== undefined) {
          const parsed = parseWorkingHours(updateUserDto.working_hours);
          if ('error' in parsed) return { success: false, message: parsed.error };
          workingHours = parsed.hours;
        }

        // vendors' social links: each turned into a full link, or refused with a message
        const socials: Record<string, string | null> = {};
        if (user.type === UserType.VENDOR) {
          for (const key of SOCIAL_KEYS) {
            if (updateUserDto[key] === undefined) continue;
            const result = normalizeSocial(key, updateUserDto[key]);
            if ('error' in result) return { success: false, message: result.error };
            socials[key] = result.link;
          }
        }

        if (image) {
          const oldImage = await this.prisma.user.findFirst({
            where: { id: userId },
            select: { avatar: true },
          });
          data.avatar = await this.replaceImage(image, oldImage?.avatar);
        }

        await this.prisma.user.update({
          where: { id: userId },
          data: { ...data },
        });

        if (user.type === UserType.VENDOR) {
          const vendorProfilePatch: Record<string, any> = {};
          if (updateUserDto.business_name !== undefined)
            vendorProfilePatch.business_name = updateUserDto.business_name;
          if (updateUserDto.about_me !== undefined)
            vendorProfilePatch.about_me = updateUserDto.about_me;
          if (updateUserDto.address !== undefined)
            vendorProfilePatch.address = updateUserDto.address;
          if (handle !== undefined) vendorProfilePatch.handle = handle;
          if (workingHours !== undefined) vendorProfilePatch.working_hours = workingHours ?? Prisma.DbNull;
          Object.assign(vendorProfilePatch, socials);
          if (shop.banner || shop.logo) {
            const old = await this.prisma.vendorProfile.findUnique({
              where: { user_id: userId },
              select: { banner: true, logo: true },
            });
            if (shop.banner) vendorProfilePatch.banner = await this.replaceImage(shop.banner, old?.banner);
            if (shop.logo) vendorProfilePatch.logo = await this.replaceImage(shop.logo, old?.logo);
          }

          if (Object.keys(vendorProfilePatch).length > 0) {
            await this.prisma.vendorProfile.upsert({
              where: { user_id: userId },
              create: { user_id: userId, license_photo: [], ...vendorProfilePatch },
              update: vendorProfilePatch,
            });
          }
        }

        return {
          success: true,
          message: 'User updated successfully',
        };
      } else {
        return {
          success: false,
          message: 'User not found',
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  // done
  async forgotPassword(email) {
    try {
      const user = await this.userRepository.exist({
        field: 'email',
        value: email,
      });

      if (user) {
        await this.clearCodeTries(email);
        const token = await this.ucodeRepository.createToken({
          userId: user.id,
          isOtp: true,
        });

        await this.mailService.sendOtpCodeToEmail({
          email: email,
          name: user.name,
          otp: token,
        });

        return {
          success: true,
          message: 'We have sent an OTP code to your email',
        };
      }
      // same response either way, so the endpoint can't be used to discover which emails have accounts
      return {
        success: true,
        message: 'We have sent an OTP code to your email',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  // done
  async resendToken(email: string) {
    try {
      const user = await this.userRepository.getUserByEmail(email);

      if (user) {
        await this.clearCodeTries(email);
        // create otp code
        const token = await this.ucodeRepository.createToken({
          userId: user.id,
          isOtp: true,
          time: 2,
        });

        // send otp code to email
        await this.mailService.sendOtpCodeToEmail({
          email: email,
          name: user.name,
          otp: token,
        });

        return {
          success: true,
          message: 'We have sent a token code to your email',
        };
      } else {
        return {
          success: false,
          message: 'Email not found',
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  // done
  async verifyToken({ email, token }) {
    try {
      const user = await this.userRepository.exist({
        field: 'email',
        value: email,
      });

      if (user) {
        if (await this.tooManyCodeTries(email)) return { success: false, message: TOO_MANY_CODE_TRIES };
        const result = await this.ucodeRepository.verifyToken({
          email: email,
          token: token,
        });

        // Check the actual success property, not just if object exists
        if (result && result.success) {
          await this.clearCodeTries(email);
          return {
            success: true,
            message: result.message || 'Token verified successfully',
          };
        } else {
          return {
            success: false,
            message: result?.message || 'Invalid token',
          };
        }
      } else {
        return {
          success: false,
          message: 'Email not found',
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  //done
  async verifyEmail({ email, token }) {
    try {
      const user = await this.userRepository.exist({
        field: 'email',
        value: email,
      });

      if (user) {
        if (await this.tooManyCodeTries(email)) return { success: false, message: TOO_MANY_CODE_TRIES };
        const existToken = await this.ucodeRepository.validateToken({
          email: email,
          token: token,
        });

        if (existToken) {
          await this.clearCodeTries(email);
          await this.prisma.user.update({
            where: {
              id: user.id,
            },
            data: {
              email_verified_at: new Date(Date.now()),
            },
          });

          return {
            success: true,
            message: 'Email verified successfully',
          };
        } else {
          return {
            success: false,
            message: 'Invalid token',
          };
        }
      } else {
        return {
          success: false,
          message: 'Email not found',
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }
  // done
  async resendVerificationEmail(email: string) {
    try {
      const user = await this.userRepository.getUserByEmail(email);

      if (user) {
        await this.clearCodeTries(email);
        // create otp code
        const token = await this.ucodeRepository.createToken({
          userId: user.id,
          isOtp: true,
        });

        // send otp code to email
        await this.mailService.sendOtpCodeToEmail({
          email: email,
          name: user.name,
          otp: token,
        });

        return {
          success: true,
          message: 'We have sent a verification code to your email',
        };
      } else {
        return {
          success: false,
          message: 'Email not found',
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async resetPassword({ email, token, password }) {
    try {
      const user = await this.userRepository.exist({
        field: 'email',
        value: email,
      });

      if (user) {
        const existToken = await this.ucodeRepository.verifycheckToken({
          email: email,
          token: token,
        });

        if (existToken) {
          await this.userRepository.changePassword({
            email: email,
            password: password,
          });

          // delete otp code
          await this.ucodeRepository.deleteToken({
            email: email,
            token: token,
          });
          // whoever else holds a session (a stolen one included) has to sign in with the new password
          await this.revokeAllSessions(user.id).catch(() => null);

          return {
            success: true,
            message: `Password updated successfully. ${SIGNED_OUT_ELSEWHERE}`,
          };
        } else {
          return {
            success: false,
            message: 'Invalid token',
          };
        }
      } else {
        return {
          success: false,
          message: 'Email not found',
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  /** `sid`: the session making the change, which stays signed in; every other one ends. */
  async changePassword({ user_id, oldPassword, newPassword, sid }: { user_id: string; oldPassword: string; newPassword: string; sid?: string }) {
    try {
      const user = await this.userRepository.getUserDetails(user_id);

      if (user) {
        const _isValidPassword = await this.userRepository.validatePassword({
          email: user.email,
          password: oldPassword,
        });
        if (_isValidPassword) {
          await this.userRepository.changePassword({
            email: user.email,
            password: newPassword,
          });
          await this.revokeAllSessions(user_id, { sid }).catch(() => null);

          return {
            success: true,
            message: `Password updated successfully. ${SIGNED_OUT_ELSEWHERE}`,
          };
        } else {
          return {
            success: false,
            message: 'Invalid password',
          };
        }
      } else {
        return {
          success: false,
          message: 'Email not found',
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  // ---------------------------------(end)---------------------------------------

  /**
   * Wrong 6-digit codes per email: after 5 in 15 minutes the code stops working until a new one is
   * requested, so codes can't be guessed (the per-IP rate limit alone allows many tries from many IPs).
   */
  private async tooManyCodeTries(email: unknown) {
    if (typeof email !== 'string' || !email) return false;
    const key = `code_tries:${email.trim().toLowerCase()}`;
    const tries = await this.redis.incr(key);
    if (tries === 1) await this.redis.expire(key, CODE_TRIES_WINDOW_SECONDS);
    return tries > MAX_CODE_TRIES;
  }

  /** A new code (or the right one) starts the count again. */
  private async clearCodeTries(email: unknown) {
    if (typeof email === 'string' && email) await this.redis.del(`code_tries:${email.trim().toLowerCase()}`).catch(() => null);
  }

  /** Signs a refresh token (marked `typ: 'refresh'` so it can't be used as an access token). */
  private signRefreshToken(payload: { email: string; sub: string; type: unknown; sid?: string }) {
    return this.jwtService.sign(
      { ...payload, typ: 'refresh' },
      { expiresIn: (process.env.JWT_REFRESH_EXPIRY ?? '7d') as any },
    );
  }

  /** Signs a refresh token and stores it as its session's current one. */
  private async issueRefreshToken(payload: { email: string; sub: string; type: unknown; sid: string }) {
    const refreshToken = this.signRefreshToken(payload);
    await this.redis.set(sessionKeys(payload.sub, payload.sid).current, refreshToken, 'EX', REFRESH_TTL_SECONDS);
    await this.redis.sadd(sessionsKey(payload.sub), payload.sid);
    await this.redis.expire(sessionsKey(payload.sub), REFRESH_TTL_SECONDS);
    return refreshToken;
  }

  /**
   * Exchanges a refresh token for a new access token. Authenticates with the refresh token itself
   * (signature, expiry, `typ`, and a match against the stored copy), so it works after the access
   * token has expired. Rotates the refresh token, so active sessions slide and idle ones end.
   */
  async refreshToken(refreshToken: string) {
    try {
      let claims: { sub?: string; typ?: string; sid?: string };
      try {
        claims = this.jwtService.verify(refreshToken);
      } catch {
        return { success: false, message: 'Invalid or expired refresh token' };
      }
      const user_id = claims?.sub;
      if (!user_id || claims.typ !== 'refresh') {
        return { success: false, message: 'Invalid or expired refresh token' };
      }

      const sid = typeof claims.sid === 'string' && claims.sid ? claims.sid : undefined;
      const { current: currentKey, previous: previousKey } = sessionKeys(user_id, sid);
      const storedToken = await this.redis.get(currentKey);
      // Two tabs (or a tab and a retry) refreshing at once: the first rotates, the second arrives with
      // the token just replaced. Within a short grace window that one still gets in, with the
      // current refresh token (no second rotation), instead of signing the user out.
      const justRotated = !!storedToken && storedToken !== refreshToken && (await this.redis.get(previousKey)) === refreshToken;
      if (!storedToken || (storedToken !== refreshToken && !justRotated)) {
        return { success: false, message: 'Invalid or expired refresh token' };
      }

      const userDetails = await this.userRepository.getUserDetails(user_id);
      if (!userDetails || userDetails.deleted_at || userDetails.status === 0) {
        return { success: false, message: 'User not found' };
      }

      const payload = {
        email: userDetails.email,
        sub: userDetails.id,
        type: userDetails.type,
        ...(sid && { sid }),
      };
      const accessToken = this.jwtService.sign(payload, {
        expiresIn: (process.env.JWT_ACCESS_EXPIRY ?? '1h') as any,
      });
      let refreshTokenOut = storedToken;
      if (!justRotated) {
        // rotate only if the token is still the current one (atomic: a concurrent refresh can't
        // rotate it a second time), remembering the old one for the grace window
        const newRefreshToken = this.signRefreshToken(payload);
        const rotated = await this.redis.eval(ROTATE_REFRESH_TOKEN, 2, currentKey, previousKey, refreshToken, newRefreshToken, REFRESH_TTL_SECONDS, REFRESH_GRACE_SECONDS);
        if (rotated === 1) {
          refreshTokenOut = newRefreshToken;
          if (sid) await this.redis.expire(sessionsKey(user_id), REFRESH_TTL_SECONDS);
        } else {
          // another refresh rotated it a moment ago: hand out what it stored
          const now = await this.redis.get(currentKey);
          if (!now || (await this.redis.get(previousKey)) !== refreshToken) {
            return { success: false, message: 'Invalid or expired refresh token' };
          }
          refreshTokenOut = now;
        }
      }

      return {
        success: true,
        authorization: {
          type: 'bearer',
          access_token: accessToken,
          refresh_token: refreshTokenOut,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  /**
   * The user a sign-out is for: from a valid access token, else from a valid refresh token. Null
   * when neither verifies (nothing to revoke).
   */
  userFromTokens(tokens: { access?: string | null; refresh?: string | null }): string | null {
    return this.sessionFromTokens(tokens)?.userId ?? null;
  }

  /** The user and session (device) a sign-out is for; `sid` is absent for tokens from before sessions. */
  sessionFromTokens({ access, refresh }: { access?: string | null; refresh?: string | null }): { userId: string; sid?: string } | null {
    for (const [token, want] of [[access, 'access'], [refresh, 'refresh']] as const) {
      if (!token) continue;
      try {
        const claims: any = this.jwtService.verify(token);
        const typ = claims?.typ === 'refresh' ? 'refresh' : claims?.typ ? 'other' : 'access';
        if (claims?.sub && typ === want) return { userId: claims.sub, ...(typeof claims.sid === 'string' && claims.sid && { sid: claims.sid }) };
      } catch {
        // expired or not ours: try the next one
      }
    }
    return null;
  }

  /** A two-minute token that only opens the website's socket connection (see JwtStrategy). */
  socketToken(user_id: string) {
    const expiresIn = 120;
    const token = this.jwtService.sign({ sub: user_id, typ: 'socket' }, { expiresIn });
    return { success: true, data: { token, user_id, expires_in: expiresIn } };
  }

  /** Ends one session (this device's sign-in); other devices stay signed in. */
  async revokeRefreshToken(user_id: string, sid?: string) {
    try {
      const keys = sessionKeys(user_id, sid);
      const storedToken = await this.redis.get(keys.current);
      if (!storedToken) {
        return {
          success: false,
          message: 'Refresh token not found',
        };
      }

      await this.redis.del(keys.current, keys.previous);
      if (sid) await this.redis.srem(sessionsKey(user_id), sid);

      return {
        success: true,
        message: 'Refresh token revoked successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async requestEmailChange(user_id: string, email: string) {
    try {
      const user = await this.userRepository.getUserDetails(user_id);
      if (user) {
        const token = await this.ucodeRepository.createToken({
          userId: user.id,
          isOtp: true,
          email: email,
        });

        await this.mailService.sendOtpCodeToEmail({
          email: email,
          name: email,
          otp: token,
        });

        return {
          success: true,
          message: 'We have sent an OTP code to your email',
        };
      } else {
        return {
          success: false,
          message: 'User not found',
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async changeEmail({
    user_id,
    new_email,
    token,
  }: {
    user_id: string;
    new_email: string;
    token: string;
  }) {
    try {
      const user = await this.userRepository.getUserDetails(user_id);

      if (user) {
        const existToken = await this.ucodeRepository.validateToken({
          email: new_email,
          token: token,
          forEmailChange: true,
        });

        if (existToken) {
          await this.userRepository.changeEmail({
            user_id: user.id,
            new_email: new_email,
          });

          // delete otp code
          await this.ucodeRepository.deleteToken({
            email: new_email,
            token: token,
          });

          return {
            success: true,
            message: 'Email updated successfully',
          };
        } else {
          return {
            success: false,
            message: 'Invalid token',
          };
        }
      } else {
        return {
          success: false,
          message: 'User not found',
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async validateUser(
    email: string,
    pass: string,
    token?: string,
  ): Promise<any> {
    const _password = pass;
    const user = await this.prisma.user.findFirst({
      where: {
        email: email,
      },
    });

    if (user) {
      const _isValidPassword = await this.userRepository.validatePassword({
        email: email,
        password: _password,
      });
      if (_isValidPassword) {
        // a suspended account gets no tokens at all (they'd stop working on the first request anyway)
        if (user.status === 0) {
          throw new UnauthorizedException('This account is suspended. Contact Vendly support.');
        }
        // Check if email is verified
        if (!user.email_verified_at) {
          throw new UnauthorizedException(
            'Please verify your email before logging in',
          );
        }
        const { password, ...result } = user;
        if (user.is_two_factor_enabled) {
          if (token) {
            const isValid = await this.userRepository.verify2FA(user.id, token);
            if (!isValid) {
              throw new UnauthorizedException('Invalid token');
              // return {
              //   success: false,
              //   message: 'Invalid token',
              // };
            }
          } else {
            throw new UnauthorizedException('Token is required');
            // return {
            //   success: false,
            //   message: 'Token is required',
            // };
          }
        }
        return result;
      } else {
        throw new UnauthorizedException(WRONG_LOGIN);
      }
    } else {
      // same answer and about the same time as a wrong password, so sign-in can't reveal who has an account
      await bcrypt.compare(_password ?? '', DUMMY_HASH).catch(() => false);
      throw new UnauthorizedException(WRONG_LOGIN);
    }
  }

  // --------- 2FA ---------
  async generate2FASecret(user_id: string) {
    try {
      return await this.userRepository.generate2FASecret(user_id);
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async verify2FA(user_id: string, token: string) {
    try {
      const isValid = await this.userRepository.verify2FA(user_id, token);
      if (!isValid) {
        return {
          success: false,
          message: 'Invalid token',
        };
      }
      return {
        success: true,
        message: '2FA verified successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async enable2FA(user_id: string, token?: string) {
    try {
      const user = await this.userRepository.getUserDetails(user_id);
      if (user) {
        // only switch on once the person proves their authenticator app holds the secret,
        // otherwise they could lock themselves out at the next login
        if (!token?.trim() || !(await this.userRepository.verify2FA(user_id, token.trim()))) {
          return {
            success: false,
            message: 'Enter the code from your authenticator app to turn on two-step login.',
          };
        }
        await this.userRepository.enable2FA(user_id);
        return {
          success: true,
          message: '2FA enabled successfully',
        };
      } else {
        return {
          success: false,
          message: 'User not found',
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async disable2FA(user_id: string, token?: string) {
    try {
      const user = await this.userRepository.getUserDetails(user_id);
      if (user) {
        if (!token?.trim() || !(await this.userRepository.verify2FA(user_id, token.trim()))) {
          return {
            success: false,
            message: 'Enter the current code from your authenticator app to turn off two-step login.',
          };
        }
        await this.userRepository.disable2FA(user_id);
        return {
          success: true,
          message: '2FA disabled successfully',
        };
      } else {
        return {
          success: false,
          message: 'User not found',
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }
  async get2FAStatus(userId: string) {
    try {
      const user = await this.prisma.user.findFirst({
        where: { id: userId },
        select: { is_two_factor_enabled: true },
      });
      if (!user) return { success: false, message: 'User not found' };
      return { success: true, data: { enabled: !!user.is_two_factor_enabled } };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
  // --------- end 2FA ---------

  async savePushToken(userId: string, token: string) {
    // one phone, one account: someone else signing in on a shared phone takes its pushes over
    if (token) await this.prisma.user.updateMany({ where: { push_token: token, id: { not: userId } }, data: { push_token: null } });
    await this.prisma.user.update({
      where: { id: userId },
      data: { push_token: token },
    });
  }

  /** After signing out on a phone: stop pushing to it, unless another phone has registered since. */
  async forgetPushToken(userId: string, token: string) {
    await this.prisma.user.updateMany({ where: { id: userId, push_token: token }, data: { push_token: null } });
  }

  /** Which optional pushes and emails this user gets; every switch is on until they change it. */
  async notificationPrefs(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { notification_prefs: true } });
    if (!user) throw new UnauthorizedException('User not found');
    return { success: true, data: readPrefs(user.notification_prefs) };
  }

  /** Changes only the switches sent; the rest keep their value. */
  async updateNotificationPrefs(userId: string, changes: Partial<Record<NotificationPrefKey, boolean>>) {
    const current = await this.notificationPrefs(userId);
    const next = { ...current.data };
    for (const k of NOTIFICATION_PREF_KEYS) if (typeof changes[k] === 'boolean') next[k] = changes[k];
    await this.prisma.user.update({ where: { id: userId }, data: { notification_prefs: next } });
    return { success: true, data: next };
  }

  /** The roles this login holds, the one in use, and whether it may switch (ID verified). */
  async roles(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { type: true, roles: true } });
    if (!user) throw new UnauthorizedException('User not found');
    const id = await this.identity.status(userId);
    return {
      success: true,
      data: {
        active: asRole(user.type),
        roles: heldRoles(user),
        available: SWITCHABLE_ROLES,
        id_verification: id.data,
      },
    };
  }

  /**
   * Switches the role in use (adding it first if the account doesn't hold it yet) and returns fresh
   * tokens carrying it. Needs an approved ID check. Becoming a vendor creates the vendor profile,
   * whose licence still goes through admin approval as for any new vendor.
   */
  async switchRole(userId: string, role: string, opts: { business_name?: string; sid?: string } = {}) {
    const target = asRole(role);
    if (!target) throw new BadRequestException('Choose customer, vendor or planner.');
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, type: true, roles: true, id_verified_at: true, status: true, deleted_at: true, vendorProfile: { select: { id: true } } },
    });
    if (!user || user.deleted_at || user.status === 0) throw new UnauthorizedException('This account is no longer active');
    if (user.type === 'ADMIN') throw new ForbiddenException('Admin accounts can’t switch roles.');

    const held = heldRoles(user);
    if (asRole(user.type) === target) {
      return { ...(await this.login({ email: user.email, userId, sid: opts.sid })), active: target, roles: held, added: false };
    }
    if (!user.id_verified_at) {
      throw new ForbiddenException('Verify your ID before switching between customer, vendor and planner.');
    }

    // keep the stored spelling for customers who signed up as CLIENT
    const newType: UserType =
      target === 'CUSTOMER' ? ((user.roles ?? []).includes('CLIENT' as UserType) || user.type === 'CLIENT' ? 'CLIENT' : 'CUSTOMER') : target;
    const adding = !held.includes(target);
    const roles = Array.from(new Set<UserType>([...(user.roles ?? []), ...(user.type ? [user.type] : []), newType]));
    const businessName = opts.business_name?.trim().slice(0, 255) || undefined;

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { type: newType, roles } });
      if (target === 'VENDOR' && !user.vendorProfile) {
        await tx.vendorProfile.create({ data: { user_id: userId, license_status: 'PENDING', ...(businessName && { business_name: businessName }) } });
      }
    });
    track(adding ? 'role_added' : 'role_switched', userId, { role: target });

    // The switch is saved. Fresh tokens are a convenience: existing ones already carry the new role,
    // since the role on each request is read from the database.
    const tokens = await this.login({ email: user.email, userId, sid: opts.sid });
    return { ...tokens, success: true, message: adding ? `You can now use Vendly as a ${target === 'EVENT_PLANNER' ? 'planner' : target.toLowerCase()}.` : 'Switched.', active: target, roles: heldRoles({ type: newType, roles }), added: adding };
  }

  async deleteAccount(userId: string) {
    // bookings with money still unsettled keep the account (and its ID check) as it is
    const blocker = await this.userRepository.deletionBlocker(userId);
    if (blocker) return { success: false, message: blocker };
    // ID photos are deleted with the account, never kept
    await this.identity.purgeForUser(userId).catch(() => undefined);
    const result = await this.userRepository.deleteUser(userId);
    if (result.success) await this.revokeAllSessions(userId).catch(() => null);
    return result;
  }

  /**
   * Signs the user out everywhere: every session, and the old single slot. With `except`, the
   * caller's own session stays (no `sid` means they're on the old single slot, so that one stays).
   */
  async revokeAllSessions(userId: string, except?: { sid?: string }) {
    const sids: string[] = (await this.redis.smembers(sessionsKey(userId))) ?? [];
    if (!except) {
      const keys = [undefined, ...sids].flatMap((sid) => Object.values(sessionKeys(userId, sid)));
      await this.redis.del(...keys, sessionsKey(userId));
      return;
    }
    const ending = [undefined, ...sids].filter((sid) => sid !== except.sid);
    await this.redis.del(...ending.flatMap((sid) => Object.values(sessionKeys(userId, sid))));
    const ended = ending.filter((sid): sid is string => !!sid);
    if (ended.length) await this.redis.srem(sessionsKey(userId), ...ended);
  }
}
