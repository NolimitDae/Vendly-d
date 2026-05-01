import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { EventStatus } from 'prisma/generated/client';
import { GetUser } from 'src/modules/auth/decorators/get-user.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { EventsService } from './events.service';
import {
  CreateBudgetItemDto,
  CreateEventDto,
  CreateEventTaskDto,
  LinkBookingDto,
} from './dto/create-event.dto';
import { UpdateEventDto, UpdateTaskDto } from './dto/update-event.dto';

@ApiTags('events')
@ApiBearerAuth('event-planner-token')
@UseGuards(JwtAuthGuard)
@Controller('events')
export class EventsController {
  constructor(private readonly service: EventsService) {}

  @Get()
  list(
    @GetUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: EventStatus,
  ) {
    return this.service.list(user.id, { page, limit, status });
  }

  @Post()
  create(@GetUser() user: any, @Body() dto: CreateEventDto) {
    return this.service.create(user.id, dto);
  }

  @Get(':id')
  findOne(@GetUser() user: any, @Param('id') id: string) {
    return this.service.findOne(id, user.id);
  }

  @Patch(':id')
  update(
    @GetUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
  ) {
    return this.service.update(id, user.id, dto);
  }

  @Delete(':id')
  cancel(@GetUser() user: any, @Param('id') id: string) {
    return this.service.cancel(id, user.id);
  }

  @Post(':id/bookings')
  linkBooking(
    @GetUser() user: any,
    @Param('id') id: string,
    @Body() dto: LinkBookingDto,
  ) {
    return this.service.linkBooking(id, dto.booking_id, user.id);
  }

  @Get(':id/budget')
  getBudget(@GetUser() user: any, @Param('id') id: string) {
    return this.service.getBudget(id, user.id);
  }

  @Post(':id/budget')
  addBudgetItem(
    @GetUser() user: any,
    @Param('id') id: string,
    @Body() dto: CreateBudgetItemDto,
  ) {
    return this.service.addBudgetItem(id, user.id, dto);
  }

  @Post(':id/tasks')
  addTask(
    @GetUser() user: any,
    @Param('id') id: string,
    @Body() dto: CreateEventTaskDto,
  ) {
    return this.service.addTask(id, user.id, dto);
  }

  @Patch(':id/tasks/:taskId')
  updateTask(
    @GetUser() user: any,
    @Param('id') id: string,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.service.updateTask(id, taskId, user.id, dto);
  }
}
