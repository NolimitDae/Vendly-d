import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UserType } from 'prisma/generated/client';
import * as QRCode from 'qrcode';
import * as speakeasy from 'speakeasy';
import appConfig from '../../../config/app.config';
import { PrismaService } from '../../../prisma/prisma.service';
import { ArrayHelper } from '../../helper/array.helper';
import { TanvirStorage } from 'src/common/lib/Disk/TanvirStorage';
import { StringHelper } from 'src/common/helper/string.helper';

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}
  /**
   * get user by email
   * @param email
   * @returns
   */
  async getUserByEmail(email: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        email: email,
      },
    });
    return user;
  }

  // email varification
  async verifyEmail({ email }) {
    const user = await this.prisma.user.findFirst({
      where: {
        email: email,
      },
    });
    return user;
  }

  /**
   * get user details
   * @returns
   */
  async getUserDetails(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
      },
      include: {
        role_users: {
          include: {
            role: {
              include: {
                permission_roles: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    return user;
  }

  /**
   * Check existance
   * @returns
   */
  async exist({ field, value }) {
    const model = await this.prisma.user.findFirst({
      where: {
        [field]: value,
      },
    });
    return model;
  }

  /**
   * Create su admin user
   * @param param0
   * @returns
   */
  async createSuAdminUser({ username, email, password }) {
    try {
      password = await bcrypt.hash(password, appConfig().security.salt);

      const user = await this.prisma.user.create({
        data: {
          username: username,
          email: email,
          password: password,
          type: UserType.ADMIN,
        },
      });
      return user;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Invite user under tenant
   * @param param0
   * @returns
   */
  async inviteUser({
    name,
    username,
    email,
    role_id,
  }: {
    name: string;
    username: string;
    email: string;
    role_id: string;
  }) {
    try {
      const user = await this.prisma.user.create({
        data: {
          name: name,
          username: username,
          email: email,
        },
      });
      if (user) {
        // attach role
        await this.attachRole({
          user_id: user.id,
          role_id: role_id,
        });
        return user;
      } else {
        return false;
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Attach a role to a user
   * @param param0
   * @returns
   */
  async attachRole({ user_id, role_id }: { user_id: string; role_id: string }) {
    const role = await this.prisma.roleUser.create({
      data: {
        user_id: user_id,
        role_id: role_id,
      },
    });
    return role;
  }

  /**
   * update user role
   * @param param0
   * @returns
   */
  async syncRole({ user_id, role_id }: { user_id: string; role_id: string }) {
    const role = await this.prisma.roleUser.updateMany({
      where: {
        AND: [
          {
            user_id: user_id,
          },
        ],
      },
      data: {
        role_id: role_id,
      },
    });
    return role;
  }

  /**
   * create user under a tenant
   * @param param0
   * @returns
   */
  async createUser({
    first_name,
    last_name,
    name,
    address,
    phone,
    business_name,
    email,
    password,
    image,
    type,
    role_id,
  }: {
    first_name?: string;
    last_name?: string;
    name?: string;
    address?: string;
    phone?: string;
    business_name?: string;
    email: string;
    password: string;
    image?: Express.Multer.File;
    type?: string;
    role_id?: string;
  }) {
    try {
      // -------------------------
      // Step 1: Prepare basic user data
      // -------------------------
      const data: any = {};

      if (first_name) data.first_name = first_name;
      if (last_name) data.last_name = last_name;
      if (name) data.name = name;
      if (address) data.location = address;
      if (phone) data.phone_number = phone;

      // -------------------------
      // Step 2: Upload avatar if provided
      // -------------------------
      if (image) {
        const fileName = `${StringHelper.randomString()}_${image.originalname}`;
        await TanvirStorage.put(
          appConfig().storageUrl.avatar + '/' + fileName,
          image.buffer,
        );
        data.avatar = fileName;
      }

      // -------------------------
      // Step 3: Check email uniqueness
      // -------------------------
      if (email) {
        const userEmailExist = await this.exist({
          field: 'email',
          value: String(email),
        });
        if (userEmailExist) {
          return { success: false, message: 'Email already exists' };
        }
        data.email = email;
      }

      // -------------------------
      // Step 4: Hash password
      // -------------------------
      if (password) {
        data.password = await bcrypt.hash(password, appConfig().security.salt);
      }

      // -------------------------
      // Step 5: Validate user type
      // -------------------------
      if (type && ArrayHelper.inArray(type, Object.values(UserType))) {
        data.type = type as UserType;
      } else if (type) {
        return { success: false, message: 'Invalid user type' };
      }

      // -------------------------
      // Step 6: Prepare VendorProfile if user is VENDOR
      // -------------------------
      const createData: any = { ...data };
      if (data.type === UserType.VENDOR) {
        const vendorprofile: any = {};
        if (business_name) vendorprofile.business_name = business_name;

        createData.vendorProfile = {
          create: {
            ...vendorprofile,
            license_status: 'PENDING', // default
          },
        };
      }

      // -------------------------
      // Step 7: Create user with Prisma
      // -------------------------
      const user = await this.prisma.user.create({
        data: createData,
        include: {
          vendorProfile: true,
        },
      });

      // -------------------------
      // Step 8: Attach role if provided
      // -------------------------
      if (user && role_id) {
        await this.attachRole({ user_id: user.id, role_id });
      }

      // -------------------------
      // Step 9: Return response
      // -------------------------
      return {
        success: true,
        message: 'User created successfully',
        data: user,
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
  /**
   * create user under a tenant
   * @param param0
   * @returns
   */
  async updateUser(
    user_id: string,
    {
      name,
      email,
      password,
      role_id = null,
      type,
    }: {
      name?: string;
      email?: string;
      password?: string;
      role_id?: string;
      type?: string;
    },
  ) {
    try {
      const data = {};
      if (name) {
        data['name'] = name;
      }
      if (email) {
        // Check if email already exist
        const userEmailExist = await this.exist({
          field: 'email',
          value: String(email),
        });

        if (userEmailExist) {
          return {
            success: false,
            message: 'Email already exist',
          };
        }
        data['email'] = email;
      }
      if (password) {
        data['password'] = await bcrypt.hash(
          password,
          appConfig().security.salt,
        );
      }

      if (type && ArrayHelper.inArray(type, Object.values(UserType))) {
        data['type'] = type as UserType;
      } else if (type) {
        return {
          success: false,
          message: 'Invalid user type',
        };
      }

      const existUser = await this.prisma.user.findFirst({
        where: {
          id: user_id,
        },
      });

      if (!existUser) {
        return {
          success: false,
          message: 'User not found',
        };
      }

      const user = await this.prisma.user.update({
        where: {
          id: user_id,
        },
        data: {
          ...data,
        },
      });

      if (user) {
        if (role_id) {
          // attach role
          await this.attachRole({
            user_id: user.id,
            role_id: role_id,
          });
        }

        return {
          success: true,
          message: 'User updated successfully',
          data: user,
        };
      } else {
        return {
          success: false,
          message: 'User update failed',
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  /**
   * delete user
   * @param param0
   * @returns
   */
  async deleteUser(user_id: string) {
    try {
      // check if user exist
      const existUser = await this.prisma.user.findFirst({
        where: {
          id: user_id,
        },
      });
      if (!existUser) {
        return {
          success: false,
          message: 'User not found',
        };
      }

      await this.prisma.user.delete({
        where: {
          id: user_id,
        },
      });
      return {
        success: true,
        message: 'User deleted successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  // change password
  async changePassword({
    email,
    password,
  }: {
    email: string;
    password: string;
  }) {
    try {
      password = await bcrypt.hash(password, appConfig().security.salt);
      const user = await this.prisma.user.update({
        where: {
          email: email,
        },
        data: {
          password: password,
        },
      });
      return user;
    } catch (error) {
      throw error;
    }
  }

  // change email
  async changeEmail({
    user_id,
    new_email,
  }: {
    user_id: string;
    new_email: string;
  }) {
    try {
      const user = await this.prisma.user.update({
        where: {
          id: user_id,
        },
        data: {
          email: new_email,
        },
      });
      return user;
    } catch (error) {
      throw error;
    }
  }

  // validate password
  async validatePassword({
    email,
    password,
  }: {
    email: string;
    password: string;
  }) {
    const user = await this.prisma.user.findFirst({
      where: {
        email: email,
      },
    });
    if (user) {
      const isValid = await bcrypt.compare(password, user.password);
      return isValid;
    } else {
      return false;
    }
  }

  // convert user type to admin/vendor
  async convertTo(user_id: string, type: string = 'vendor') {
    try {
      const userDetails = await this.getUserDetails(user_id);
      if (!userDetails) {
        return {
          success: false,
          message: 'User not found',
        };
      }
      if (userDetails.type == UserType.EDITOR) {
        return {
          success: false,
          message: 'User is already an editor',
        };
      }
      await this.prisma.user.update({
        where: { id: user_id },
        data: { type: type as UserType },
      });

      return {
        success: true,
        message: 'Converted to ' + type + ' successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  // generate two factor secret
  async generate2FASecret(user_id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: user_id },
    });

    if (!user) {
      return {
        success: false,
        message: 'User not found',
      };
    }

    const secret = speakeasy.generateSecret();
    await this.prisma.user.update({
      where: { id: user_id },
      data: { two_factor_secret: secret.base32 },
    });

    const otpAuthUrl = secret.otpauth_url;

    const qrCode = await QRCode.toDataURL(otpAuthUrl);

    return {
      success: true,
      message: '2FA secret generated successfully',
      data: {
        secret: secret.base32,
        qrCode: qrCode,
      },
    };
  }

  // verify two factor
  async verify2FA(user_id: string, token: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: user_id } });

    if (!user || !user.two_factor_secret) return false;

    const isValid = speakeasy.totp.verify({
      secret: user.two_factor_secret,
      encoding: 'base32',
      token,
    });

    return isValid;
  }

  // enable two factor
  async enable2FA(user_id: string) {
    const user = await this.prisma.user.update({
      where: { id: user_id },
      data: { is_two_factor_enabled: 1 },
    });
    return user;
  }

  // disable two factor
  async disable2FA(user_id: string) {
    const user = await this.prisma.user.update({
      where: { id: user_id },
      data: { is_two_factor_enabled: 0, two_factor_secret: null },
    });
    return user;
  }
}
