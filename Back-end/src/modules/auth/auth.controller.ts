import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { UserType } from 'prisma/generated/enums';
import { LocalAuthGuard } from 'src/modules/auth/guards/local-auth.guard';
import { AuthService } from './auth.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiBearerAuth('admin-token')
@ApiBearerAuth('customer-token')
@ApiBearerAuth('vendor-token')
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // *get user details
  @ApiOperation({
    summary: 'Get current user',
    description:
      "Returns the authenticated user's profile information. Requires a valid Bearer token.",
  })
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Req() req: Request) {
    try {
      const user_id = req.user.userId;

      const response = await this.authService.me(user_id);

      return response;
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch user details',
      };
    }
  }

  // *register user
  @Post('register')
  @ApiOperation({
    summary: 'Register a new user',
    description: 'Creates a new user account. Sends an OTP code.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'User registration payload with optional profile image',
    type: CreateUserDto,
  })
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async create(
    @Body() data: CreateUserDto,
    @UploadedFile() image: Express.Multer.File,
  ) {
    try {
      const first_name = data.first_name;
      const last_name = data.last_name;
      const email = data.email;
      const name = `${first_name} ${last_name}`;
      const address = data.address;
      const phone = data.phone;
      const business_name = data.business_name;
      const password = data.password;
      const type = data.type;

      if (!first_name) {
        throw new HttpException(
          'First name not provided',
          HttpStatus.UNAUTHORIZED,
        );
      }

      if (!last_name) {
        throw new HttpException(
          'Last name not provided',
          HttpStatus.UNAUTHORIZED,
        );
      }

      if (!email) {
        throw new HttpException('Email not provided', HttpStatus.UNAUTHORIZED);
      }

      if (!password) {
        throw new HttpException(
          'Password not provided',
          HttpStatus.UNAUTHORIZED,
        );
      }

      const response = await this.authService.register({
        first_name: first_name,
        last_name: last_name,
        name: name,
        address: address,
        phone: phone,
        business_name: business_name,
        email: email,
        password: password,
        type: type,
        image: image,
      });

      return response;
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }


  // *login user
  @ApiOperation({
    summary: 'Login user',
    description: 'Authenticates a user with email and password.',
  })
  @ApiBody({
    description: 'User login credentials',
    schema: {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email: {
          type: 'string',
          format: 'email',
          example: 'john@example.com',
          description: 'Registered email address',
        },
        password: {
          type: 'string',
          format: 'password',
          example: 'P@ssw0rd123',
          description: 'Account password',
        },
      },
    },
  })
  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(@Req() req: Request, @Res() res: Response) {
    try {
      const user_id = req.user.id;
      const user_email = req.user.email;

      const response = await this.authService.login({
        userId: user_id,
        email: user_email,
      });

      // store to secure cookies
      res.cookie('refresh_token', response.authorization.refresh_token, {
        httpOnly: true,
        secure: true,
        maxAge: 1000 * 60 * 60 * 24 * 7,
      });
      res.json(response);
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  // *add documentation  
  @UseGuards(JwtAuthGuard)
  @Post('add-license')
  @UseInterceptors(
    FilesInterceptor('license',2, {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async addLicense(
    @Req() req: Request,
    @UploadedFiles() license: Express.Multer.File[],
  ) {
      const user_id = req.user.userId;
      return await this.authService.addLicense(user_id, license);
  }  

  

  // *update user
  @ApiOperation({
    summary: 'Update user profile',
    description:
      "Updates the authenticated user's profile. Supports optional profile image upload (max 5MB). Only provided fields will be updated.",
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'User profile update payload with optional image',
    type: UpdateUserDto,
  })
  @UseGuards(JwtAuthGuard)
  @Patch('update')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async updateUser(
    @Req() req: Request,
    @Body() data: UpdateUserDto,
    @UploadedFile() image: Express.Multer.File,
  ) {
    try {
      const user_id = req.user.userId;
      const response = await this.authService.updateUser(user_id, data, image);
      return response;
    } catch (error) {
      return {
        success: false,
        message: 'Failed to update user',
      };
    }
  }

  // *forgot password
  @ApiOperation({
    summary: 'Forgot password',
    description:
      'Sends a password reset OTP to the provided email address if it is registered.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email'],
      properties: {
        email: {
          type: 'string',
          format: 'email',
          example: 'john@example.com',
          description: 'Registered email address',
        },
      },
    },
  })
  @Post('forgot-password')
  async forgotPassword(@Body() data: { email: string }) {
    try {
      const email = data.email;
      if (!email) {
        throw new HttpException('Email not provided', HttpStatus.UNAUTHORIZED);
      }
      return await this.authService.forgotPassword(email);
    } catch (error) {
      return {
        success: false,
        message: 'Something went wrong',
      };
    }
  }

  // *verify email
  @ApiOperation({
    summary: 'Verify email',
    description:
      "Verifies a user's email using the OTP code sent during registration.",
  })
  @ApiBody({
    type: VerifyEmailDto,
    description: 'Email and OTP token for verification',
  })
  @Post('verify-email')
  async verifyEmail(@Body() data: VerifyEmailDto) {
    try {
      const email = data.email;
      const token = data.token;
      if (!email) {
        throw new HttpException('Email not provided', HttpStatus.UNAUTHORIZED);
      }
      if (!token) {
        throw new HttpException('Token not provided', HttpStatus.UNAUTHORIZED);
      }
      return await this.authService.verifyEmail({
        email: email,
        token: token,
      });
    } catch (error) {
      return {
        success: false,
        message: 'Failed to verify email',
      };
    }
  }

  // *resend verification email to verify the email
  @ApiOperation({
    summary: 'Resend verification email',
    description:
      'Resends the email verification OTP to the provided email address.',
  })
  @ApiBody({
    description: 'Email address to resend verification OTP',
    schema: {
      type: 'object',
      required: ['email'],
      properties: {
        email: {
          type: 'string',
          format: 'email',
          example: 'john@example.com',
          description: 'Email to resend OTP to',
        },
      },
    },
  })
  @Post('resend-verification-email')
  async resendVerificationEmail(@Body() data: { email: string }) {
    try {
      const email = data.email;
      if (!email) {
        throw new HttpException('Email not provided', HttpStatus.UNAUTHORIZED);
      }
      return await this.authService.resendVerificationEmail(email);
    } catch (error) {
      return {
        success: false,
        message: 'Failed to resend verification email',
      };
    }
  }

  // *reset password if user forget the password
  @ApiOperation({
    summary: 'Reset password',
    description:
      "Resets the user's password using the OTP token received via email.",
  })
  @ApiBody({
    description: 'Email, OTP token, and new password',
    schema: {
      type: 'object',
      required: ['email', 'token', 'password'],
      properties: {
        email: {
          type: 'string',
          format: 'email',
          example: 'john@example.com',
          description: 'Registered email address',
        },
        token: {
          type: 'string',
          example: '123456',
          description: 'OTP token received via email',
        },
        password: {
          type: 'string',
          format: 'password',
          example: 'NewP@ssw0rd123',
          description: 'New password (min 8 characters)',
          minLength: 8,
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Password reset successfully.' })
  @ApiResponse({
    status: 400,
    description: 'Invalid token or email not found.',
  })
  @Post('reset-password')
  async resetPassword(
    @Body() data: { email: string; token: string; password: string },
  ) {
    try {
      const email = data.email;
      const token = data.token;
      const password = data.password;
      if (!email) {
        throw new HttpException('Email not provided', HttpStatus.UNAUTHORIZED);
      }
      if (!token) {
        throw new HttpException('Token not provided', HttpStatus.UNAUTHORIZED);
      }
      if (!password) {
        throw new HttpException(
          'Password not provided',
          HttpStatus.UNAUTHORIZED,
        );
      }
      return await this.authService.resetPassword({
        email: email,
        token: token,
        password: password,
      });
    } catch (error) {
      return {
        success: false,
        message: 'Something went wrong',
      };
    }
  }

  // *resend token
  @ApiOperation({
    summary: 'Resend reset password token',
    description:
      'Resends the password reset OTP token to the provided email address.',
  })
  @ApiBody({
    description: 'Email address to resend reset OTP',
    schema: {
      type: 'object',
      required: ['email'],
      properties: {
        email: {
          type: 'string',
          format: 'email',
          example: 'john@example.com',
          description: 'Registered email address',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Reset token resent to email.' })
  @Post('resend-token')
  async resendToken(@Body() data: { email: string }) {
    try {
      const email = data.email;
      if (!email) {
        throw new HttpException('Email not provided', HttpStatus.UNAUTHORIZED);
      }
      return await this.authService.resendToken(email);
    } catch (error) {
      return {
        success: false,
        message: 'Failed to resend password reset token',
      };
    }
  }

  // *verify token
  @ApiOperation({
    summary: 'Verify reset password token',
    description:
      'Validates the password reset OTP token before allowing the password reset.',
  })
  @ApiBody({
    description: 'Email and OTP token to verify',
    schema: {
      type: 'object',
      required: ['email', 'token'],
      properties: {
        email: {
          type: 'string',
          format: 'email',
          example: 'john@example.com',
          description: 'Registered email address',
        },
        token: {
          type: 'string',
          example: '123456',
          description: 'OTP token received via email',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Token verified successfully.' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token.' })
  @Post('verify-token')
  async verifyToken(@Body() data: { email: string; token: string }) {
    try {
      const email = data.email;
      const token = data.token;
      if (!email) {
        throw new HttpException('Email not provided', HttpStatus.UNAUTHORIZED);
      }
      if (!token) {
        throw new HttpException('Token not provided', HttpStatus.UNAUTHORIZED);
      }
      return await this.authService.verifyToken({
        email: email,
        token: token,
      });
    } catch (error) {
      return {
        success: false,
        message: 'Failed to verify token',
      };
    }
  }

  // change password if user want to change the password
  @ApiOperation({
    summary: 'Change password',
    description:
      "Changes the authenticated user's password. Requires the current (old) password for verification.",
  })
  @ApiBody({
    description: 'Old and new password for password change',
    schema: {
      type: 'object',
      required: ['old_password', 'new_password'],
      properties: {
        old_password: {
          type: 'string',
          format: 'password',
          example: 'OldP@ssw0rd123',
          description: 'Current password',
        },
        new_password: {
          type: 'string',
          format: 'password',
          example: 'NewP@ssw0rd456',
          description: 'New password (min 8 characters)',
          minLength: 8,
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Password changed successfully.' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized or incorrect old password.',
  })
  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  async changePassword(
    @Req() req: Request,
    @Body() data: { email: string; old_password: string; new_password: string },
  ) {
    try {
      // const email = data.email;
      const user_id = req.user.userId;

      const oldPassword = data.old_password;
      const newPassword = data.new_password;
      // if (!email) {
      //   throw new HttpException('Email not provided', HttpStatus.UNAUTHORIZED);
      // }
      if (!oldPassword) {
        throw new HttpException(
          'Old password not provided',
          HttpStatus.UNAUTHORIZED,
        );
      }
      if (!newPassword) {
        throw new HttpException(
          'New password not provided',
          HttpStatus.UNAUTHORIZED,
        );
      }
      return await this.authService.changePassword({
        // email: email,
        user_id: user_id,
        oldPassword: oldPassword,
        newPassword: newPassword,
      });
    } catch (error) {
      return {
        success: false,
        message: 'Failed to change password',
      };
    }
  }
  //-----------------------------------------------(end)----------------------------------------------------------------------

  @ApiOperation({
    summary: 'Refresh access token',
    description:
      'Generates a new access token using a valid refresh token. The user must be authenticated.',
  })
  @ApiBody({
    description: 'Refresh token to generate new access token',
    schema: {
      type: 'object',
      required: ['refresh_token'],
      properties: {
        refresh_token: {
          type: 'string',
          example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          description: 'Valid refresh token received during login',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'New access token generated.' })
  @ApiResponse({
    status: 401,
    description: 'Invalid or expired refresh token.',
  })
  @UseGuards(JwtAuthGuard)
  @Post('refresh-token')
  async refreshToken(
    @Req() req: Request,
    @Body() body: { refresh_token: string },
  ) {
    try {
      const user_id = req.user.userId;

      const response = await this.authService.refreshToken(
        user_id,
        body.refresh_token,
      );

      return response;
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  @ApiOperation({
    summary: 'Logout user',
    description:
      'Revokes the current refresh token and logs out the authenticated user.',
  })
  @ApiResponse({ status: 200, description: 'Logged out successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@Req() req: Request) {
    try {
      const userId = req.user.userId;
      const response = await this.authService.revokeRefreshToken(userId);
      return response;
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleLogin(): Promise<any> {
    return HttpStatus.OK;
  }

  @Get('google/redirect')
  @UseGuards(AuthGuard('google'))
  async googleLoginRedirect(@Req() req: Request): Promise<any> {
    return {
      statusCode: HttpStatus.OK,
      data: req.user,
    };
  }

  // --------------change password---------

  // --------------end change password---------

  // -------change email address------
  @ApiOperation({
    summary: 'Request email change',
    description:
      'Sends an OTP to the new email address to initiate an email change request.',
  })
  @ApiBody({
    description: 'New email address for the change request',
    schema: {
      type: 'object',
      required: ['email'],
      properties: {
        email: {
          type: 'string',
          format: 'email',
          example: 'newemail@example.com',
          description: 'New email address to change to',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'OTP sent to new email address.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @UseGuards(JwtAuthGuard)
  @Post('request-email-change')
  async requestEmailChange(
    @Req() req: Request,
    @Body() data: { email: string },
  ) {
    try {
      const user_id = req.user.userId;
      const email = data.email;
      if (!email) {
        throw new HttpException('Email not provided', HttpStatus.UNAUTHORIZED);
      }
      return await this.authService.requestEmailChange(user_id, email);
    } catch (error) {
      return {
        success: false,
        message: 'Something went wrong',
      };
    }
  }

  @ApiOperation({
    summary: 'Change email address',
    description:
      'Confirms email change using the OTP token sent to the new email address.',
  })
  @ApiBody({
    description: 'New email address and OTP token for confirmation',
    schema: {
      type: 'object',
      required: ['email', 'token'],
      properties: {
        email: {
          type: 'string',
          format: 'email',
          example: 'newemail@example.com',
          description: 'New email address to change to',
        },
        token: {
          type: 'string',
          example: '123456',
          description: 'OTP token received at new email address',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Email changed successfully.' })
  @ApiResponse({ status: 400, description: 'Invalid token.' })
  @UseGuards(JwtAuthGuard)
  @Post('change-email')
  async changeEmail(
    @Req() req: Request,
    @Body() data: { email: string; token: string },
  ) {
    try {
      const user_id = req.user.userId;
      const email = data.email;

      const token = data.token;
      if (!email) {
        throw new HttpException('Email not provided', HttpStatus.UNAUTHORIZED);
      }
      if (!token) {
        throw new HttpException('Token not provided', HttpStatus.UNAUTHORIZED);
      }
      return await this.authService.changeEmail({
        user_id: user_id,
        new_email: email,
        token: token,
      });
    } catch (error) {
      return {
        success: false,
        message: 'Something went wrong',
      };
    }
  }
  // -------end change email address------

  // --------- 2FA ---------
  @ApiOperation({
    summary: 'Generate 2FA secret',
    description:
      'Generates a new TOTP secret key and QR code for setting up Two-Factor Authentication (2FA).',
  })
  @ApiResponse({ status: 200, description: '2FA secret and QR code returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @UseGuards(JwtAuthGuard)
  @Post('generate-2fa-secret')
  async generate2FASecret(@Req() req: Request) {
    try {
      const user_id = req.user.userId;
      return await this.authService.generate2FASecret(user_id);
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  @ApiOperation({
    summary: 'Verify 2FA token',
    description:
      'Verifies a TOTP token from the authenticator app to validate 2FA setup.',
  })
  @ApiBody({
    description: '2FA OTP token from authenticator app',
    schema: {
      type: 'object',
      required: ['token'],
      properties: {
        token: {
          type: 'string',
          example: '123456',
          description: '6-digit TOTP code from authenticator app',
          minLength: 6,
          maxLength: 6,
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: '2FA token verified.' })
  @ApiResponse({ status: 401, description: 'Invalid 2FA token.' })
  @UseGuards(JwtAuthGuard)
  @Post('verify-2fa')
  async verify2FA(@Req() req: Request, @Body() data: { token: string }) {
    try {
      const user_id = req.user.userId;
      const token = data.token;
      return await this.authService.verify2FA(user_id, token);
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  @ApiOperation({
    summary: 'Enable 2FA',
    description:
      'Enables Two-Factor Authentication for the authenticated user. Requires 2FA to have been set up first.',
  })
  @ApiResponse({ status: 200, description: '2FA enabled successfully.' })
  @UseGuards(JwtAuthGuard)
  @Post('enable-2fa')
  async enable2FA(@Req() req: Request) {
    try {
      const user_id = req.user.userId;
      return await this.authService.enable2FA(user_id);
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  @ApiOperation({
    summary: 'Disable 2FA',
    description:
      'Disables Two-Factor Authentication for the authenticated user.',
  })
  @ApiResponse({ status: 200, description: '2FA disabled successfully.' })
  @UseGuards(JwtAuthGuard)
  @Post('disable-2fa')
  async disable2FA(@Req() req: Request) {
    try {
      const user_id = req.user.userId;
      return await this.authService.disable2FA(user_id);
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }
  // --------- end 2FA ---------
}
