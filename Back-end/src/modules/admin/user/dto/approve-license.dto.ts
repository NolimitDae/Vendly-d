// approve-license.dto.ts
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

export enum ADMIN_APPROVE_STATUS {
  APPROVED = 'APPROVED',
  SUSPENDED = 'SUSPENDED',
}

export class ApproveLicenseDto {
 
  @IsEnum(ADMIN_APPROVE_STATUS)
  @IsNotEmpty()
  licenseStatus: ADMIN_APPROVE_STATUS;
}