import { PartialType } from '@nestjs/swagger';
import { CreateUserDto2 } from './create-user.dto';

export class UpdateUserDto extends PartialType(CreateUserDto2) {}
2