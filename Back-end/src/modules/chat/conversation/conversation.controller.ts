import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  Req,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { RolesGuard } from '../../../common/guard/role/roles.guard';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Role } from '../../../common/guard/role/role.enum';
import { Roles } from '../../../common/guard/role/roles.decorator';
import { ApiExcludeController, ApiQuery } from '@nestjs/swagger';
import { INBOX_TABS, InboxTab } from '../extras/inbox';


@ApiTags('Conversation')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('chat/conversation')
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  // *create conversation
  @Post('create-conversation')
  @ApiOperation({ summary: 'Create a new conversation' })
  async create(
    @Body() createConversationDto: CreateConversationDto,
    @Req() req,
  ) {
    const user = req.user.userId;
    return this.conversationService.create(createConversationDto, user);
  }

  //  *conversation list of user
  @Get('conversation-list') 
  @ApiOperation({ summary: 'Get all conversations for the authenticated user' })
  @ApiQuery({ name: 'tab', required: false, enum: INBOX_TABS, description: 'Vendors: one inbox tab, with counts for both' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'perPage', required: false })
  async findAll(@Req() req, @Query('tab') tab?: string, @Query('page') page?: string, @Query('perPage') perPage?: string) { 
  
    const user = req.user.userId; 

    // without a tab: the whole list, as before
    if (!tab) return this.conversationService.findAll(user);
    if (!INBOX_TABS.includes(tab as InboxTab)) throw new BadRequestException(`tab must be one of: ${INBOX_TABS.join(', ')}`);
    const num = (v: string | undefined, max: number) => {
      if (v === undefined || v === '') return undefined;
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1) throw new BadRequestException('page and perPage must be whole numbers from 1');
      return Math.min(n, max);
    };
    return this.conversationService.findAll(user, { tab: tab as InboxTab, page: num(page, 100000), perPage: num(perPage, 100) });
  }

  // get conversation by id
  @Get('single-conversation/:id')
  @ApiOperation({ summary: 'Get a single conversation by ID' })
  asyncfindOne(@Param('id') id: string, @Req() req) {
    const user = req.user.userId;
    return this.conversationService.findOne(id, user);
  }

  // delete conversation
  // Delete a conversation by ID
  @Delete('delete-conversation/:id')
  @ApiOperation({ summary: 'Delete a conversation by ID' })
  async remove(@Param('id') id: string, @Req() req) {
    const user = req.user.userId;
    return this.conversationService.remove(id, user);
  }


  // user information
  @Get('all-user')
  async findAllUser(
    @Req() req,
  ) {
    const user = req.user.userId;
    return this.conversationService.findAllUserInfo(user);
  }


}
