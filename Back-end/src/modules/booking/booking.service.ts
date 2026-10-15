import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus, ListingStatus } from 'prisma/generated/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { MailService } from 'src/mail/mail.service';
import { PushService } from 'src/modules/push/push.service';
import { StringHelper } from 'src/common/helper/string.helper';
import { TanvirStorage } from 'src/common/lib/Disk/TanvirStorage';
import appConfig from 'src/config/app.config';
import { StripePayment } from 'src/common/lib/Payment/stripe/StripePayment';
import { rentalTitle } from 'src/modules/rentals/rentals.service';
import { ChatExtrasService } from 'src/modules/chat/extras/chat-extras.service';
import { EventToolsService } from 'src/modules/events/tools/event-tools.service';
import { BookingContractsService, RequestMeta } from 'src/modules/contracts/booking-contracts.service';
import { SignedBookingRequestDto, VendorConfirmDto } from 'src/modules/contracts/dto/contracts.dto';
import { CancelBookingDto, RejectBookingDto } from './dto/update-booking.dto';
import { settleCancellation, Settlement } from './cancellation';
import { PaymentsService } from 'src/modules/payments/payments.service';
import { track } from 'src/common/analytics';

/** What the booking is for: the package title, or the rented items. */
function titleOf(booking: any): string | undefined {
  return booking?.listing?.title ?? (booking?.rental_reservations?.length ? rentalTitle(booking.rental_reservations) : undefined);
}

@Injectable()
export class BookingService {
  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
    private pushService: PushService,
    private contracts: BookingContractsService,
    private chatExtras: ChatExtrasService,
    private eventTools: EventToolsService,
    private payments: PaymentsService,
  ) {}

  private pushBooking(userId: string, bookingId: string, title: string, body: string) {
    void this.pushService.sendToUser(userId, {
      title,
      body,
      data: { type: 'booking', bookingId },
    });
  }

  async create(customerId: string, dto: SignedBookingRequestDto, meta: RequestMeta = {}) {
    // validates the listing, the signed contract and creates booking + contract atomically
    const created = await this.contracts.createSignedBooking(customerId, dto, meta);
    track('booking_requested', customerId, { booking_id: created.id, listing_id: dto.listing_id, with_quote: !!dto.quote_id, for_event: !!dto.event_id });
    const booking = await this.prisma.booking.findUniqueOrThrow({
      where: { id: created.id },
      include: this.bookingIncludes(),
    });
    const listing = { title: titleOf(booking) ?? 'Service', vendor: booking.vendor };
    const customer = booking.customer;

    // notify vendor via email
    const clientUrl = appConfig().app.client_app_url;
    await this.mailService.sendBookingNotification({
      to: listing.vendor.email,
      recipientName: listing.vendor.name,
      subject: `New booking request — ${listing.title}`,
      message: `${customer.name} signed the contract and sent a booking request. Review it, then Accept & Sign or decline.`,
      status: 'PENDING',
      listingTitle: listing.title,
      scheduledAt: booking.scheduled_at ? new Date(booking.scheduled_at).toLocaleString() : undefined,
      amount: Number(booking.amount),
      ctaUrl: `${clientUrl}/vendor/bookings/${booking.id}`,
    }).catch(() => null);
    this.pushBooking(booking.vendor_id, booking.id, 'New signed booking request', `${customer.name} requested ${listing.title}`);

    return { success: true, data: this.formatBooking(booking) };
  }

  async confirm(bookingId: string, vendorId: string, dto: VendorConfirmDto = {}, meta: RequestMeta = {}) {
    const booking = await this.getBookingOrFail(bookingId);

    if (booking.vendor_id !== vendorId)
      throw new ForbiddenException('Access denied');
    if (booking.status !== BookingStatus.PENDING)
      throw new BadRequestException(`Cannot confirm a booking in ${booking.status} status`);

    // Accept & Sign: the vendor's countersignature executes the contract and confirms the booking together
    const executed = await this.contracts.countersignForBooking(bookingId, vendorId, dto.signature, meta, (tx) =>
      tx.booking.update({ where: { id: bookingId }, data: { status: BookingStatus.CONFIRMED } }),
    );
    if (!executed) {
      await this.prisma.booking.update({ where: { id: bookingId }, data: { status: BookingStatus.CONFIRMED } });
    }
    // Phase B: snapshot the payment plan and charge the customer's saved card for what is due now
    await this.payments.scheduleForBooking(bookingId).catch((err) => console.error(`Payment schedule for ${bookingId} failed:`, err));
    // the vendor joins the group chat of any event this booking is for
    const events = await this.prisma.eventBooking.findMany({ where: { booking_id: bookingId }, select: { event_id: true } });
    for (const e of events) await this.chatExtras.syncEventChat(e.event_id).catch((err) => console.error(`Event chat for ${e.event_id} failed:`, err));
    // and it gets its own line in the event budget
    if (events.length) await this.eventTools.syncBookingBudget(bookingId).catch((err) => console.error(`Event budget for ${bookingId} failed:`, err));
    track('booking_accepted', vendorId, { booking_id: bookingId, amount: Number(booking.amount ?? 0) });
    const updated = await this.getBookingOrFail(bookingId);

    const clientUrl = appConfig().app.client_app_url;
    await this.mailService.sendBookingNotification({
      to: booking.customer.email,
      recipientName: booking.customer.name,
      subject: `Booking confirmed — ${titleOf(booking)}`,
      message: 'Great news! Your booking has been confirmed by the vendor.',
      status: 'CONFIRMED',
      listingTitle: titleOf(booking) ?? 'Service',
      scheduledAt: booking.scheduled_at ? new Date(booking.scheduled_at).toLocaleString() : undefined,
      amount: Number(booking.amount),
      ctaUrl: `${clientUrl}/bookings`,
    }).catch(() => null);
    this.pushBooking(booking.customer_id, bookingId, 'Booking confirmed', `${titleOf(booking) ?? 'Your booking'} was confirmed`);

    return { success: true, data: this.formatBooking(updated) };
  }

  async reject(bookingId: string, vendorId: string, dto: RejectBookingDto) {
    const booking = await this.getBookingOrFail(bookingId);

    if (booking.vendor_id !== vendorId)
      throw new ForbiddenException('Access denied');
    if (booking.status !== BookingStatus.PENDING)
      throw new BadRequestException(`Cannot reject a booking in ${booking.status} status`);

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.REJECTED, reject_reason: dto.reason },
      include: this.bookingIncludes(),
    });
    await this.contracts.voidPendingForBooking(bookingId, 'Vendor declined the booking', vendorId);

    const clientUrl = appConfig().app.client_app_url;
    await this.mailService.sendBookingNotification({
      to: booking.customer.email,
      recipientName: booking.customer.name,
      subject: `Booking declined — ${titleOf(booking)}`,
      message: 'Unfortunately, your booking request was not accepted by the vendor.',
      status: 'REJECTED',
      listingTitle: titleOf(booking) ?? 'Service',
      reason: dto.reason,
      ctaUrl: `${clientUrl}/marketplace`,
    }).catch(() => null);
    this.pushBooking(booking.customer_id, bookingId, 'Booking declined', `${titleOf(booking) ?? 'Your booking'} was declined`);

    return { success: true, data: this.formatBooking(updated) };
  }

  async startWork(bookingId: string, vendorId: string) {
    const booking = await this.getBookingOrFail(bookingId);

    if (booking.vendor_id !== vendorId)
      throw new ForbiddenException('Access denied');
    if (booking.status !== BookingStatus.CONFIRMED)
      throw new BadRequestException(`Cannot start work on a booking in ${booking.status} status`);

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.IN_PROGRESS },
      include: this.bookingIncludes(),
    });
    this.pushBooking(booking.customer_id, bookingId, 'Work started', `The vendor has started on ${titleOf(booking) ?? 'your booking'}`);

    return { success: true, data: this.formatBooking(updated) };
  }

  async complete(bookingId: string, vendorId: string) {
    const booking = await this.getBookingOrFail(bookingId);

    if (booking.vendor_id !== vendorId)
      throw new ForbiddenException('Access denied');
    if (booking.status !== BookingStatus.IN_PROGRESS)
      throw new BadRequestException(`Cannot complete a booking in ${booking.status} status`);

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.COMPLETED, completed_at: new Date() },
      include: this.bookingIncludes(),
    });
    await this.payments.onBookingCompleted(bookingId, updated.completed_at ?? new Date()).catch((err) => console.error(`Completion payments for ${bookingId} failed:`, err));

    const clientUrl = appConfig().app.client_app_url;
    await this.mailService.sendBookingNotification({
      to: booking.customer.email,
      recipientName: booking.customer.name,
      subject: `Service completed — ${titleOf(booking)}`,
      message: 'Your service has been completed! We\'d love to hear your feedback.',
      status: 'COMPLETED',
      listingTitle: titleOf(booking) ?? 'Service',
      ctaUrl: `${clientUrl}/bookings`,
    }).catch(() => null);
    this.pushBooking(booking.customer_id, bookingId, 'Service completed', `${titleOf(booking) ?? 'Your booking'} is complete — leave a review`);

    return { success: true, data: this.formatBooking(updated) };
  }

  /**
   * Records a paid Checkout session (called from the Stripe webhook). A second payment for an
   * already-paid booking is refunded; a retried webhook for the same session is a no-op.
   */
  async recordPayment(session: { id: string; payment_intent?: string | { id: string } | null; amount_total?: number | null; currency?: string | null; metadata?: Record<string, string> | null }) {
    const bookingId = session.metadata?.booking_id;
    if (!bookingId) return;
    const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;

    const outcome = await this.prisma.$transaction(async (tx) => {
      const seen = await tx.paymentTransaction.findFirst({ where: { reference_number: session.id } });
      if (seen) return 'retry' as const;
      const booking = await tx.booking.findUnique({ where: { id: bookingId }, select: { customer_id: true, currency: true, status: true } });
      if (!booking) return 'unknown' as const;
      // Paid on a checkout page opened before the booking was cancelled or declined: refund it all.
      if (booking.status === BookingStatus.CANCELLED || booking.status === BookingStatus.REJECTED) {
        await tx.paymentTransaction.create({
          data: {
            user_id: booking.customer_id,
            type: 'booking_payment_after_cancel',
            provider: 'stripe',
            reference_number: session.id,
            status: 'refund_pending',
            amount: (session.amount_total ?? 0) / 100,
            currency: booking.currency ?? session.currency ?? 'usd',
          },
        });
        return 'late' as const;
      }
      // row lock: a concurrent delivery waits here until the other transaction commits
      const claimed = await tx.booking.updateMany({ where: { id: bookingId, paid_at: null }, data: { paid_at: new Date() } });
      if (claimed.count === 0) {
        // re-check after the lock: the same session may have just been recorded by a concurrent delivery
        const recorded = await tx.paymentTransaction.findFirst({ where: { reference_number: session.id } });
        if (recorded) return 'retry' as const;
      }
      await tx.paymentTransaction.create({
        data: {
          user_id: booking.customer_id,
          type: claimed.count === 1 ? 'booking_payment' : 'booking_payment_duplicate',
          provider: 'stripe',
          reference_number: session.id,
          status: claimed.count === 1 ? 'succeeded' : 'refund_pending',
          amount: (session.amount_total ?? 0) / 100,
          currency: booking.currency ?? session.currency ?? 'usd',
        },
      });
      return claimed.count === 1 ? ('paid' as const) : ('duplicate' as const);
    });

    if ((outcome === 'duplicate' || outcome === 'late') && paymentIntentId) {
      await StripePayment.refundPaymentIntent(paymentIntentId, `${outcome}-${session.id}`);
      await this.prisma.paymentTransaction.updateMany({
        where: { reference_number: session.id },
        data: { status: 'refunded' },
      });
    }
    // paid after the vendor already marked the job complete
    if (outcome === 'paid') await this.creditVendorEarnings(bookingId);
  }

  /** Releases the vendor price (not the customer service fee) to the vendor's payout balance, once. */
  private async creditVendorEarnings(bookingId: string) {
    await this.prisma.$transaction(async (tx) => {
      const b = await tx.booking.findUnique({
        where: { id: bookingId },
        select: { status: true, paid_at: true, payout_credited_at: true, amount: true, currency: true, vendor_id: true },
      });
      if (!b?.paid_at || b.payout_credited_at || !b.amount || b.status !== BookingStatus.COMPLETED) return;
      const claimed = await tx.booking.updateMany({
        where: { id: bookingId, payout_credited_at: null },
        data: { payout_credited_at: new Date() },
      });
      if (claimed.count !== 1) return;
      await tx.user.update({ where: { id: b.vendor_id }, data: { balance: { increment: b.amount } } });
      await tx.paymentTransaction.create({
        data: {
          user_id: b.vendor_id,
          type: 'booking_earning',
          provider: 'stripe',
          reference_number: bookingId,
          status: 'succeeded',
          amount: b.amount,
          currency: b.currency ?? 'usd',
        },
      });
    });
  }

  async cancel(bookingId: string, userId: string, dto: CancelBookingDto) {
    const booking = await this.getBookingOrFail(bookingId);

    const isCustomer = booking.customer_id === userId;
    const isVendor = booking.vendor_id === userId;
    if (!isCustomer && !isVendor) throw new ForbiddenException('Access denied');

    const cancellable: BookingStatus[] = [BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS];
    if (!cancellable.includes(booking.status))
      throw new BadRequestException(`Cannot cancel a booking in ${booking.status} status`);

    // Claim the cancellation atomically so two simultaneous cancels can't both refund.
    const cancelledAt = new Date();
    const claimed = await this.prisma.booking.updateMany({
      where: { id: bookingId, status: { in: cancellable } },
      data: { status: BookingStatus.CANCELLED, cancelled_at: cancelledAt, cancel_reason: dto.reason },
    });
    if (claimed.count !== 1) throw new BadRequestException('This booking has already been cancelled or completed');
    await this.contracts.voidPendingForBooking(bookingId, 'Booking cancelled', userId);

    const settlement = booking.paid_at
      ? await this.settlePaidCancellation(booking, isCustomer ? 'CUSTOMER' : 'VENDOR', cancelledAt)
      : null;
    const updated = await this.getBookingOrFail(bookingId);

    // notify the other party
    const notifyUser = isCustomer ? booking.vendor : booking.customer;
    const clientUrl = appConfig().app.client_app_url;
    await this.mailService.sendBookingNotification({
      to: notifyUser.email,
      recipientName: notifyUser.name,
      subject: `Booking cancelled — ${titleOf(booking)}`,
      message: `The booking has been cancelled by the ${isCustomer ? 'customer' : 'vendor'}.${
        settlement && settlement.refundTotal > 0
          ? ` A refund of $${settlement.refundTotal.toFixed(2)} is on its way to the customer.`
          : ''
      }`,
      status: 'CANCELLED',
      listingTitle: titleOf(booking) ?? 'Service',
      reason: dto.reason,
      ctaUrl: `${clientUrl}/bookings`,
    }).catch(() => null);
    this.pushBooking(
      isCustomer ? booking.vendor_id : booking.customer_id,
      bookingId,
      'Booking cancelled',
      `${titleOf(booking) ?? 'A booking'} was cancelled by the ${isCustomer ? 'customer' : 'vendor'}`,
    );

    return { success: true, data: { ...this.formatBooking(updated), refund: settlement } };
  }

  /**
   * Refunds a paid booking that was just cancelled and credits the vendor what they keep
   * (rules in ./cancellation.ts). A failed Stripe refund is recorded as `refund_failed` for follow-up
   * rather than undoing the cancellation.
   */
  private async settlePaidCancellation(
    booking: Awaited<ReturnType<BookingService['getBookingOrFail']>>,
    cancelledBy: 'CUSTOMER' | 'VENDOR',
    cancelledAt: Date,
  ): Promise<Settlement> {
    const contract = await this.prisma.bookingContract.findFirst({
      where: { booking_id: booking.id, status: 'EXECUTED' },
      orderBy: { version: 'desc' },
      select: { merge_data: true },
    });
    const policy = (contract?.merge_data as Record<string, unknown> | null)?.cancellation_policy as string | undefined;
    const settlement = settleCancellation({
      cancelledBy,
      amount: Number(booking.amount ?? 0),
      serviceFee: Number(booking.service_fee ?? 0),
      policy,
      eventStart: booking.event_start_at ?? booking.scheduled_at,
      cancelledAt,
    });
    const currency = booking.currency ?? 'usd';

    const installmentCount = await this.prisma.bookingInstallment.count({ where: { booking_id: booking.id } });
    if (settlement.refundTotal > 0 && installmentCount > 0) {
      try {
        const refunded = await this.payments.refundBooking(booking.id, settlement.refundTotal, `cancel-${booking.id}`);
        if (refunded < settlement.refundTotal) console.error(`Refund for cancelled booking ${booking.id}: only ${refunded} of ${settlement.refundTotal} could be refunded`);
      } catch (err) {
        console.error(`Refund for cancelled booking ${booking.id} failed:`, err);
        await this.prisma.paymentTransaction.create({
          data: { user_id: booking.customer_id, type: 'booking_refund', provider: 'stripe', reference_number: `cancel-${booking.id}`, status: 'refund_failed', amount: settlement.refundTotal, currency },
        });
      }
    } else if (settlement.refundTotal > 0) {
      let status = 'refunded';
      let reference = `cancel-${booking.id}`;
      try {
        const session = booking.payment_transaction_id?.startsWith('cs_')
          ? await StripePayment.retrieveCheckoutSession(booking.payment_transaction_id)
          : null;
        const paymentIntentId =
          typeof session?.payment_intent === 'string' ? session.payment_intent : session?.payment_intent?.id;
        if (!paymentIntentId) throw new Error('No payment found to refund');
        const refund = await StripePayment.refundPaymentIntent(paymentIntentId, `cancel-${booking.id}`, settlement.refundTotal);
        reference = refund.id;
      } catch (err) {
        status = 'refund_failed';
        console.error(`Refund for cancelled booking ${booking.id} failed:`, err);
      }
      await this.prisma.paymentTransaction.create({
        data: {
          user_id: booking.customer_id,
          type: 'booking_refund',
          provider: 'stripe',
          reference_number: reference,
          status,
          amount: settlement.refundTotal,
          currency,
        },
      });
    }

    const early = Number((booking as { early_released_amount?: unknown }).early_released_amount ?? 0);
    const net = Math.round((settlement.vendorKeeps - early) * 100) / 100;
    if (net !== 0) {
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.booking.updateMany({
          where: { id: booking.id, payout_credited_at: null },
          data: { payout_credited_at: new Date() },
        });
        if (claimed.count !== 1) return;
        // a negative net is a deposit paid out early that the vendor now owes back; it comes off future payouts
        await tx.user.update({ where: { id: booking.vendor_id }, data: { balance: { increment: net } } });
        await tx.paymentTransaction.create({
          data: {
            user_id: booking.vendor_id,
            type: net > 0 ? 'booking_cancellation_earning' : 'payout_recovery',
            provider: 'stripe',
            reference_number: booking.id,
            status: 'succeeded',
            amount: net,
            currency,
          },
        });
      });
    }
    return settlement;
  }

  async getMyBookingsAsCustomer(
    customerId: string,
    query: { page?: number; limit?: number; status?: BookingStatus },
  ) {
    return this.getPaginatedBookings(
      { customer_id: customerId, ...(query.status ? { status: query.status } : {}) },
      query,
    );
  }

  async getMyBookingsAsVendor(
    vendorId: string,
    query: { page?: number; limit?: number; status?: BookingStatus },
  ) {
    return this.getPaginatedBookings(
      { vendor_id: vendorId, ...(query.status ? { status: query.status } : {}) },
      query,
    );
  }

  async getBooking(bookingId: string, userId: string) {
    const booking = await this.getBookingOrFail(bookingId);

    if (booking.customer_id !== userId && booking.vendor_id !== userId)
      throw new ForbiddenException('Access denied');

    return { success: true, data: this.formatBooking(booking) };
  }

  async createCheckoutSession(bookingId: string, customerId: string) {
    const booking = await this.getBookingOrFail(bookingId);

    if (booking.customer_id !== customerId)
      throw new ForbiddenException('Access denied');
    // customers pay after the vendor accepts and signs, never before
    const payable: BookingStatus[] = [BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED];
    if (!payable.includes(booking.status))
      throw new BadRequestException('You can pay once the vendor accepts and signs your booking.');
    if (booking.paid_at) throw new BadRequestException('This booking is already paid.');

    // reuse a checkout that's still open, so two tabs can't create two charges
    if (booking.payment_transaction_id?.startsWith('cs_')) {
      const existing = await StripePayment.retrieveCheckoutSession(booking.payment_transaction_id).catch(() => null);
      if (existing?.status === 'open' && existing.url) {
        return { success: true, data: { checkout_url: existing.url } };
      }
    }
    if (!booking.amount || Number(booking.amount) <= 0)
      throw new BadRequestException('Booking has no payable amount');

    const clientUrl = appConfig().app.client_app_url;
    const successUrl = `${clientUrl}/bookings?payment=success&booking_id=${bookingId}`;
    const cancelUrl = `${clientUrl}/bookings?payment=cancelled&booking_id=${bookingId}`;

    const session = await StripePayment.createCheckoutSessionForBooking({
      amount: Number(booking.amount),
      serviceFee: Number(booking.service_fee ?? 0),
      currency: booking.currency ?? 'usd',
      bookingId: booking.id,
      listingTitle: titleOf(booking) ?? 'Service Booking',
      successUrl,
      cancelUrl,
    });

    // store the session ID so the webhook can reconcile
    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { payment_transaction_id: session.id },
    });

    return { success: true, data: { checkout_url: session.url } };
  }

  async uploadProof(
    bookingId: string,
    userId: string,
    photos: Express.Multer.File[],
    notes?: string,
  ) {
    const booking = await this.getBookingOrFail(bookingId);
    if (booking.vendor_id !== userId && booking.customer_id !== userId)
      throw new ForbiddenException('Access denied');
    if (!photos || photos.length === 0)
      throw new BadRequestException('At least one photo is required');

    const fileNames: string[] = [];
    for (const photo of photos) {
      const fileName = `${StringHelper.randomString()}_${photo.originalname}`;
      await TanvirStorage.put(`proofs/${fileName}`, photo.buffer);
      fileNames.push(fileName);
    }

    const proof = await this.prisma.bookingProof.create({
      data: {
        booking_id: bookingId,
        uploader_id: userId,
        photos: fileNames,
        notes,
      },
    });
    if (userId === booking.vendor_id) await this.payments.onProofUploaded(bookingId, proof.created_at).catch(() => null);

    return {
      success: true,
      data: {
        ...proof,
        photos: fileNames.map((f) => TanvirStorage.url(`proofs/${f}`)),
      },
    };
  }

  async getProofs(bookingId: string, userId: string) {
    const booking = await this.getBookingOrFail(bookingId);
    if (booking.vendor_id !== userId && booking.customer_id !== userId)
      throw new ForbiddenException('Access denied');

    const proofs = await this.prisma.bookingProof.findMany({
      where: { booking_id: bookingId },
      include: {
        uploader: { select: { id: true, name: true, avatar: true } },
      },
      orderBy: { created_at: 'desc' },
    });

    return {
      success: true,
      data: proofs.map((p) => ({
        ...p,
        photos: (p.photos ?? []).map((f: string) => TanvirStorage.url(`proofs/${f}`)),
        uploader: p.uploader?.avatar
          ? {
              ...p.uploader,
              avatar_url: TanvirStorage.url(`${appConfig().storageUrl.avatar}/${p.uploader.avatar}`),
            }
          : p.uploader,
      })),
    };
  }

  async sendDeliverable(
    bookingId: string,
    vendorId: string,
    files: Express.Multer.File[],
    body: { title: string; message?: string; links?: string | string[] },
  ) {
    const booking = await this.getBookingOrFail(bookingId);
    if (booking.vendor_id !== vendorId) throw new ForbiddenException('Access denied');

    const fileNames: string[] = [];
    for (const file of files ?? []) {
      const fileName = `${StringHelper.randomString()}_${file.originalname}`;
      await TanvirStorage.put(`deliverables/${fileName}`, file.buffer);
      fileNames.push(fileName);
    }

    let links: string[] = [];
    if (Array.isArray(body.links)) {
      links = body.links;
    } else if (body.links) {
      try { links = JSON.parse(body.links); } catch { links = [body.links]; }
    }
    if (!Array.isArray(links)) links = [];
    // rendered as href / Linking.openURL on clients — block javascript: and other schemes
    links = links.filter((l) => typeof l === 'string' && /^https?:\/\//i.test(l.trim())).map((l) => l.trim());

    const deliverable = await this.prisma.bookingDeliverable.create({
      data: {
        booking_id: bookingId,
        vendor_id: vendorId,
        title: body.title,
        message: body.message,
        files: fileNames,
        links,
      },
    });
    this.pushBooking(booking.customer_id, bookingId, 'New deliverable', body.title);

    return {
      success: true,
      data: {
        ...deliverable,
        files: fileNames.map((f) => TanvirStorage.url(`deliverables/${f}`)),
      },
    };
  }

  async getDeliverables(bookingId: string, userId: string) {
    const booking = await this.getBookingOrFail(bookingId);
    if (booking.vendor_id !== userId && booking.customer_id !== userId)
      throw new ForbiddenException('Access denied');

    const deliverables = await this.prisma.bookingDeliverable.findMany({
      where: { booking_id: bookingId },
      orderBy: { created_at: 'desc' },
    });

    return {
      success: true,
      data: deliverables.map((d) => ({
        ...d,
        files: (d.files ?? []).map((f: string) => TanvirStorage.url(`deliverables/${f}`)),
      })),
    };
  }

  // Admin: get all bookings
  async getAllBookings(query: { page?: number; limit?: number; status?: BookingStatus }) {
    return this.getPaginatedBookings(
      query.status ? { status: query.status } : {},
      query,
    );
  }

  private async getPaginatedBookings(where: any, query: { page?: number; limit?: number }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const fullWhere = { ...where, deleted_at: null };

    const [total, bookings] = await Promise.all([
      this.prisma.booking.count({ where: fullWhere }),
      this.prisma.booking.findMany({
        where: fullWhere,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: this.bookingIncludes(),
      }),
    ]);

    return {
      success: true,
      data: bookings.map((b) => this.formatBooking(b)),
      meta: { total, page, limit, last_page: Math.ceil(total / limit) },
    };
  }

  private async getBookingOrFail(bookingId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, deleted_at: null },
      include: this.bookingIncludes(),
    });
    if (!booking) throw new NotFoundException('Booking not found');
    return booking;
  }

  private bookingIncludes() {
    return {
      customer: { select: { id: true, name: true, avatar: true, email: true } },
      vendor: { select: { id: true, name: true, avatar: true, email: true } },
      listing: { select: { id: true, title: true, price: true, images: true } },
      review: { select: { id: true, rating: true, comment: true } },
      rental_reservations: { select: { id: true, quantity: true, start_date: true, end_date: true, daily_rate: true, status: true, item: { select: { id: true, title: true, images: true } } } },
      rental_return: true,
      // the planner event this booking is part of (vendors open its run of show and files)
      event_bookings: { select: { event: { select: { id: true, name: true, date: true } } } },
    };
  }

  private formatBooking(booking: any) {
    const avatarUrl = (avatar: string | null) =>
      avatar
        ? TanvirStorage.url(`${appConfig().storageUrl.avatar}/${avatar}`)
        : null;

    return {
      ...booking,
      customer: booking.customer
        ? { ...booking.customer, avatar_url: avatarUrl(booking.customer.avatar) }
        : null,
      vendor: booking.vendor
        ? { ...booking.vendor, avatar_url: avatarUrl(booking.vendor.avatar) }
        : null,
      listing: booking.listing
        ? {
            ...booking.listing,
            images: (booking.listing.images ?? []).map((img: string) =>
              TanvirStorage.url(`listings/${img}`),
            ),
          }
        : booking.rental_reservations?.length
          ? {
              // rentals have no package: the apps show the rented items in its place
              id: null,
              title: rentalTitle(booking.rental_reservations),
              price: Number(booking.amount ?? 0),
              images: booking.rental_reservations.flatMap((r: any) => r.item?.images ?? []).slice(0, 1).map((img: string) => TanvirStorage.url(`rentals/${img}`)),
            }
          : null,
      rental_reservations: booking.rental_reservations?.map((r: any) => ({
        ...r,
        item: r.item ? { ...r.item, images: (r.item.images ?? []).map((img: string) => TanvirStorage.url(`rentals/${img}`)) } : r.item,
      })),
      is_rental: !!booking.rental_reservations?.length,
    };
  }
}
