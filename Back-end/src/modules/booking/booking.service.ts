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
import { CreateBookingDto } from './dto/create-booking.dto';
import { CancelBookingDto, RejectBookingDto } from './dto/update-booking.dto';

@Injectable()
export class BookingService {
  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
    private pushService: PushService,
  ) {}

  private pushBooking(userId: string, bookingId: string, title: string, body: string) {
    void this.pushService.sendToUser(userId, {
      title,
      body,
      data: { type: 'booking', bookingId },
    });
  }

  async create(customerId: string, dto: CreateBookingDto) {
    const listing = await this.prisma.vendorListing.findFirst({
      where: { id: dto.listing_id, status: ListingStatus.ACTIVE, deleted_at: null },
      include: { vendor: { select: { id: true, name: true, email: true } } },
    });

    if (!listing) throw new NotFoundException('Listing not found or not active');
    if (listing.vendor_id !== dto.vendor_id)
      throw new BadRequestException('Vendor ID does not match listing');
    if (listing.vendor_id === customerId)
      throw new BadRequestException('You cannot book your own listing');

    const customer = await this.prisma.user.findUnique({
      where: { id: customerId },
      select: { id: true, name: true, email: true },
    });

    const booking = await this.prisma.booking.create({
      data: {
        customer_id: customerId,
        vendor_id: dto.vendor_id,
        listing_id: dto.listing_id,
        scheduled_at: dto.scheduled_at,
        message: dto.message,
        amount: listing.price,
        currency: 'usd',
        status: BookingStatus.PENDING,
      },
      include: this.bookingIncludes(),
    });

    // notify vendor via email
    const clientUrl = appConfig().app.client_app_url;
    await this.mailService.sendBookingNotification({
      to: listing.vendor.email,
      recipientName: listing.vendor.name,
      subject: `New booking request — ${listing.title}`,
      message: `${customer.name} has submitted a new booking request. Review and confirm or decline it.`,
      status: 'PENDING',
      listingTitle: listing.title,
      scheduledAt: booking.scheduled_at ? new Date(booking.scheduled_at).toLocaleString() : undefined,
      amount: Number(booking.amount),
      ctaUrl: `${clientUrl}/vendor/bookings`,
    }).catch(() => null);
    this.pushBooking(dto.vendor_id, booking.id, 'New booking request', `${customer.name} requested ${listing.title}`);

    return { success: true, data: this.formatBooking(booking) };
  }

  async confirm(bookingId: string, vendorId: string) {
    const booking = await this.getBookingOrFail(bookingId);

    if (booking.vendor_id !== vendorId)
      throw new ForbiddenException('Access denied');
    if (booking.status !== BookingStatus.PENDING)
      throw new BadRequestException(`Cannot confirm a booking in ${booking.status} status`);

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.CONFIRMED },
      include: this.bookingIncludes(),
    });

    const clientUrl = appConfig().app.client_app_url;
    await this.mailService.sendBookingNotification({
      to: booking.customer.email,
      recipientName: booking.customer.name,
      subject: `Booking confirmed — ${booking.listing?.title}`,
      message: 'Great news! Your booking has been confirmed by the vendor.',
      status: 'CONFIRMED',
      listingTitle: booking.listing?.title ?? 'Service',
      scheduledAt: booking.scheduled_at ? new Date(booking.scheduled_at).toLocaleString() : undefined,
      amount: Number(booking.amount),
      ctaUrl: `${clientUrl}/bookings`,
    }).catch(() => null);
    this.pushBooking(booking.customer_id, bookingId, 'Booking confirmed', `${booking.listing?.title ?? 'Your booking'} was confirmed`);

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

    const clientUrl = appConfig().app.client_app_url;
    await this.mailService.sendBookingNotification({
      to: booking.customer.email,
      recipientName: booking.customer.name,
      subject: `Booking declined — ${booking.listing?.title}`,
      message: 'Unfortunately, your booking request was not accepted by the vendor.',
      status: 'REJECTED',
      listingTitle: booking.listing?.title ?? 'Service',
      reason: dto.reason,
      ctaUrl: `${clientUrl}/marketplace`,
    }).catch(() => null);
    this.pushBooking(booking.customer_id, bookingId, 'Booking declined', `${booking.listing?.title ?? 'Your booking'} was declined`);

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
    this.pushBooking(booking.customer_id, bookingId, 'Work started', `The vendor has started on ${booking.listing?.title ?? 'your booking'}`);

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

    const clientUrl = appConfig().app.client_app_url;
    await this.mailService.sendBookingNotification({
      to: booking.customer.email,
      recipientName: booking.customer.name,
      subject: `Service completed — ${booking.listing?.title}`,
      message: 'Your service has been completed! We\'d love to hear your feedback.',
      status: 'COMPLETED',
      listingTitle: booking.listing?.title ?? 'Service',
      ctaUrl: `${clientUrl}/bookings`,
    }).catch(() => null);
    this.pushBooking(booking.customer_id, bookingId, 'Service completed', `${booking.listing?.title ?? 'Your booking'} is complete — leave a review`);

    return { success: true, data: this.formatBooking(updated) };
  }

  async cancel(bookingId: string, userId: string, dto: CancelBookingDto) {
    const booking = await this.getBookingOrFail(bookingId);

    const isCustomer = booking.customer_id === userId;
    const isVendor = booking.vendor_id === userId;
    if (!isCustomer && !isVendor) throw new ForbiddenException('Access denied');

    if (
      booking.status === BookingStatus.COMPLETED ||
      booking.status === BookingStatus.CANCELLED
    )
      throw new BadRequestException(`Cannot cancel a booking in ${booking.status} status`);

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.CANCELLED,
        cancelled_at: new Date(),
        cancel_reason: dto.reason,
      },
      include: this.bookingIncludes(),
    });

    // notify the other party
    const notifyUser = isCustomer ? booking.vendor : booking.customer;
    const clientUrl = appConfig().app.client_app_url;
    await this.mailService.sendBookingNotification({
      to: notifyUser.email,
      recipientName: notifyUser.name,
      subject: `Booking cancelled — ${booking.listing?.title}`,
      message: `The booking has been cancelled by the ${isCustomer ? 'customer' : 'vendor'}.`,
      status: 'CANCELLED',
      listingTitle: booking.listing?.title ?? 'Service',
      reason: dto.reason,
      ctaUrl: `${clientUrl}/bookings`,
    }).catch(() => null);
    this.pushBooking(
      isCustomer ? booking.vendor_id : booking.customer_id,
      bookingId,
      'Booking cancelled',
      `${booking.listing?.title ?? 'A booking'} was cancelled by the ${isCustomer ? 'customer' : 'vendor'}`,
    );

    return { success: true, data: this.formatBooking(updated) };
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
    if (booking.status !== BookingStatus.PENDING)
      throw new BadRequestException('Only pending bookings can be paid');
    if (!booking.amount || Number(booking.amount) <= 0)
      throw new BadRequestException('Booking has no payable amount');

    const clientUrl = appConfig().app.client_app_url;
    const successUrl = `${clientUrl}/bookings?payment=success&booking_id=${bookingId}`;
    const cancelUrl = `${clientUrl}/bookings?payment=cancelled&booking_id=${bookingId}`;

    const session = await StripePayment.createCheckoutSessionForBooking({
      amount: Number(booking.amount),
      currency: booking.currency ?? 'usd',
      bookingId: booking.id,
      listingTitle: booking.listing?.title ?? 'Service Booking',
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
        : null,
    };
  }
}
