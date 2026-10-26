import { Body, Controller, Delete, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guard/role/roles.guard';
import { Roles } from '../../../common/guard/role/roles.decorator';
import { Role } from '../../../common/guard/role/role.enum';
import { TestDataService } from './test-data.service';

class CreateTestDataDto {
  // "Atlanta, GA": the test vendors are placed a few miles around it (left out: where they already are)
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  near?: string;

  // the position, when the place was picked from address suggestions
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  @IsOptional()
  @IsBoolean()
  reset_password?: boolean;
}

/** Admin -> Settings -> Test vendors: demo vendors and packages for trying the live app. */
@ApiTags('admin-test-data')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/test-data')
export class TestDataController {
  constructor(private readonly testData: TestDataService) {}

  @ApiOperation({ summary: 'The test vendors there are now' })
  @Get()
  status() {
    return this.testData.status();
  }

  @ApiOperation({ summary: 'Create test vendors and packages for every service category (running it again only fills gaps)' })
  @Post()
  create(@Body() dto: CreateTestDataDto) {
    return this.testData.create(dto);
  }

  @ApiOperation({ summary: 'Cancel test vendors’ open bookings, remove their packages and delete the accounts' })
  @Delete()
  remove() {
    return this.testData.remove();
  }
}
