import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req } from '@nestjs/common';
import { DepositeService } from './deposite.service';

import { UpdateDepositDto } from './dto/update-deposite.dto';
import { CreateDepositDto } from './dto/create-deposite.dto';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { ApiExcludeController } from '@nestjs/swagger';

@ApiExcludeController()
@UseGuards(JwtAuthGuard)
@Controller('deposite')
export class DepositeController {

  constructor(private readonly depositeService: DepositeService) {}

  // add deposite
  @Post('add-balance')
  create(
    @Body() createDepositDto: CreateDepositDto,
    @Req() req: any
  ) {
    const userId = req.user.userId;
    return this.depositeService.create(createDepositDto, userId);
  }
 
}
