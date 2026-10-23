import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { MailModule } from 'src/mail/mail.module';
import { PushModule } from 'src/modules/push/push.module';
import { PaymentsController } from './payments.controller';
import { DisputeFilesController } from './dispute-files.controller';
import { PaymentsService } from './payments.service';
import { InvoiceController } from './invoice.controller';
import { InvoiceService } from './invoice.service';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [PrismaModule, MailModule, PushModule],
  controllers: [PaymentsController, DisputeFilesController, InvoiceController],
  providers: [PaymentsService, InvoiceService, TransactionsService],
  exports: [PaymentsService, InvoiceService],
})
export class PaymentsModule {}
