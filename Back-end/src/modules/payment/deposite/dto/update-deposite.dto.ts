import { PartialType } from '@nestjs/swagger';
import { CreateDepositDto } from './create-deposite.dto';

export class UpdateDepositDto extends PartialType(CreateDepositDto) {}
