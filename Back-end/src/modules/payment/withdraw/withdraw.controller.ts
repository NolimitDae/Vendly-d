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

      // The service already returns { success, message, data: { accountId } }.
      return await this.withdrawService.createConnectedAccount(
        userId,
        email,
      );
    } catch (error) {
      throw error;
    }
  }

  // Stripe Connect Onboarding Link
  @UseGuards(JwtAuthGuard)
  @Post('onboarding/:accountId')
  async getOnboardingLink(@Req() req: any, @Param('accountId') accountId: string) {
    try {
      // The service already returns { success, message, data: { url } }.
      return await this.withdrawService.createOnboardingLink(accountId, req.user.userId);
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
