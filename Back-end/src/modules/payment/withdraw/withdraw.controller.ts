import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Req,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { WithdrawService } from './withdraw.service';
import { CreateWithdrawDto } from './dto/create-withdraw.dto';
import { UpdateWithdrawDto } from './dto/update-withdraw.dto';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { UserRepository } from 'src/common/repository/user/user.repository';
import { ApiExcludeController } from '@nestjs/swagger';

@ApiExcludeController()
@Controller('withdraw')
export class WithdrawController {
  constructor(private readonly withdrawService: WithdrawService) {}

  // Stripe Connected Account 
  @UseGuards(JwtAuthGuard)
  @Post('create-connected-account')
  async createConnectedAccount(@Req() req: any) {
    try {
   
      const userId = req.user.userId;
      const email = req.user.email;

      const result = await this.withdrawService.createConnectedAccount(
        userId,
        email,
      );

      return {
        success: true,
        message: 'Connected account created successfully',
        data: result,
      };
    } catch (error) {
      throw error;
    }
  }

  // Stripe Connect Onboarding Link
  @Post('onboarding/:accountId')
  async getOnboardingLink(@Param('accountId') accountId: string) {
    try {
      const result = await this.withdrawService.createOnboardingLink(accountId);

      return {
        success: true,
        message: 'Onboarding link created successfully',
        data: result,
      };
    } catch (error) {
      throw error;
    }
  }

  //Withdraw Request 
  @UseGuards(JwtAuthGuard)
  @Post('request')
  async requestWithdraw(
    @Req() req: any,
    @Body() withdrawDto: CreateWithdrawDto,
  ) {
    try {
      const userId = req.user.userId;
  
      const result = await this.withdrawService.processWithdraw(
        userId,
        withdrawDto,
      );

      return result;
    } catch (error) {
      throw error;
    }
  }


  //Check Connected Account Balance
  @UseGuards(JwtAuthGuard)
  @Get('balance')
  async checkBalance(@Req() req: any) {
    try {
      const userId = req.user.userId;
      const result = await this.withdrawService.checkAccountBalance(userId);
      return result;
    } catch (error) {
      throw error;
    }
  }

 //Withdraw History
  @UseGuards(JwtAuthGuard)
  @Get('history')
  async getWithdrawHistory(@Req() req: any) {
    try {
      const userId = req.user.userId;
      const result = await this.withdrawService.getWithdrawHistory(userId);

      return result;
    } catch (error) {
      throw error;
    }
  }

  //Get Connected Account Info
  @UseGuards(JwtAuthGuard)
  @Get('account-info')
  async getAccountInfo(@Req() req: any) {
    try {
      const userId = req.user.userId;
      const result = await this.withdrawService.getConnectedAccountInfo(userId);

      return result;
    } catch (error) {
      throw error;
    }
  }


}
