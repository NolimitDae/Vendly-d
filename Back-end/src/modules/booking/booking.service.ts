import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus, ListingStatus } from 'prisma/generated/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { MailService } from 'src/mail/mail.service';
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
  ) {}

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
    await this.mailService.sendOtpCodeToEmail({
      email: listing.vendor.email,
      name: listing.vendor.name,
      otp: `New booking request from ${customer.name} for "${listing.title}"`,
    }).catch(() => null);

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

    await this.mailService.sendOtpCodeToEmail({
      email: booking.customer.email,
      name: booking.customer.name,
      otp: `Your booking for "${booking.listing?.title}" has been confirmed!`,
    }).catch(() => null);

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

    await this.mailService.sendOtpCodeToEmail({
      email: booking.customer.email,
      name: booking.customer.name,
      otp: `Your booking for "${booking.listing?.title}" was not accepted${dto.reason ? `: ${dto.reason}` : '.'}`,
    }).catch(() => null);

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

    await this.mailService.sendOtpCodeToEmail({
      email: booking.customer.email,
      name: booking.customer.name,
      otp: `Your booking for "${booking.listing?.title}" is complete! Please leave a review.`,
    }).catch(() => null);

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
    await this.mailService.sendOtpCodeToEmail({
      email: notifyUser.email,
      name: notifyUser.name,
      otp: `Booking for "${booking.listing?.title}" has been cancelled${dto.reason ? `: ${dto.reason}` : '.'}`,
    }).catch(() => null);

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

    const clientUrl = process.env.CLIENT_APP_URL ?? 'http://localhost:3000';
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
