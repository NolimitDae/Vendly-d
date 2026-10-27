import { IsOptional, IsString, MaxLength } from 'class-validator';

/*
 * Request bodies for the auth endpoints that used to be typed inline (which the validation pipe skips).
 * Every field must be plain text: an object here would reach the database query as a filter, so a
 * crafted value like {"not": ""} could match someone else's reset code. Fields stay optional so each
 * handler keeps its own "not provided" messages.
 */

export class EmailBodyDto {
  @IsOptional() @IsString() @MaxLength(255) email?: string;
}

export class EmailTokenBodyDto extends EmailBodyDto {
  @IsOptional() @IsString() @MaxLength(64) token?: string;
}

/** Changing the sign-in email needs the current password, so a stolen session alone can't take the account. */
export class RequestEmailChangeBodyDto extends EmailBodyDto {
  @IsOptional() @IsString() @MaxLength(128) current_password?: string;
}

export class ChangeEmailBodyDto extends EmailTokenBodyDto {
  @IsOptional() @IsString() @MaxLength(128) current_password?: string;
}

export class ResetPasswordBodyDto extends EmailTokenBodyDto {
  @IsOptional() @IsString() @MaxLength(128) password?: string;
}

export class ChangePasswordBodyDto extends EmailBodyDto {
  @IsOptional() @IsString() @MaxLength(128) old_password?: string;
  @IsOptional() @IsString() @MaxLength(128) new_password?: string;
}

export class TokenBodyDto {
  @IsOptional() @IsString() @MaxLength(64) token?: string;
}

export class RefreshBodyDto {
  @IsOptional() @IsString() @MaxLength(4096) refresh_token?: string;
}

/** Sign-out: the app also sends this phone's push token, so the account stops pushing to it. */
export class LogoutBodyDto extends RefreshBodyDto {
  @IsOptional() @IsString() @MaxLength(255) push_token?: string;
}

export class DeleteAccountBodyDto {
  @IsOptional() @IsString() @MaxLength(20) confirm?: string;
}

export class PushTokenBodyDto {
  @IsOptional() @IsString() @MaxLength(255) token?: string;
  @IsOptional() @IsString() @MaxLength(20) platform?: string;
}
