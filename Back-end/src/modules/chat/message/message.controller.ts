import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  Get,
  Query,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  Param,
  Delete,
} from '@nestjs/common';
import { MessageService } from './message.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { MessageGateway } from './message.gateway';
import { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { FileFieldsInterceptor, FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage, memoryStorage } from 'multer';
import appConfig from 'src/config/app.config';
import { log } from 'node:console';
import { PaginationDto } from 'src/common/pagination';

@ApiBearerAuth()
@ApiTags('Message')
@UseGuards(JwtAuthGuard)
@Controller('chat/message')
export class MessageController {
  constructor(
    private readonly messageService: MessageService,
    private readonly messageGateway: MessageGateway,
  ) { }


  //*send message
  @Post('send-message')
  @UseInterceptors(
    FilesInterceptor('attachments', 10, {
      storage: memoryStorage(),
      limits: {
        fileSize: 10 * 1024 * 1024, 
      },
    }),
  )
  async create(
    @Body() createMessageDto: CreateMessageDto,
    @Req() req: any,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    const user = req.user.userId;
    console.log(`User ID: ${user}`);
    return this.messageService.create(createMessageDto, user, files);
  }

  
  //*get all message for a conversation
  @Get('all-message/:conversationId')
  async findAll(
    @Param('conversationId') conversationId: string,
    @Query() paginationdto: PaginationDto,
    @Req() req: any,
  ) {
    const user = req.user.userId;
   return this.messageService.findAll(conversationId, user, paginationdto);
  }
 

  // delete message
  @Delete('delete-message/:messageId')
  async deleteMessage(
    @Param('messageId') messageId: string,
    @Req() req: any,
  ) {
    const user = req.user.userId;
    return this.messageService.deleteMessage(user, messageId);
  }
  

   // unread message count
  @Get('unread-message/:conversationId')
  async getUnreadMessageCount(
    @Param('conversationId') conversationId: string,
    @Req() req: any,
  ) {
    const user = req.user.userId;
    return this.messageService.getUnreadMessage(user, conversationId);
  }

  // read messages
  @Get('read-message/:conversationId')
  async readMessages(
    @Param('conversationId') conversationId: string,
    @Req() req: any,
  ) {
    const user = req.user.userId;
    return this.messageService.readMessages(user, conversationId);
  }

 
}
