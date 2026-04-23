import { Module } from '@nestjs/common';
import { BookingModule } from 'src/modules/booking/booking.module';
import { AdminBookingController } from './admin-booking.controller';

@Module({
  imports: [BookingModule],
  controllers: [AdminBookingController],
})
export class AdminBookingModule {}
