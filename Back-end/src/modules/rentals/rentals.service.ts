import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, PaymentPlan, Prisma, RentalItemStatus, RentalReservationStatus } from 'prisma/generated/client';
import { StringHelper } from 'src/common/helper/string.helper';
import { TanvirStorage } from 'src/common/lib/Disk/TanvirStorage';
import appConfig from 'src/config/app.config';
import { MailService } from 'src/mail/mail.service';
import { PaymentsService } from 'src/modules/payments/payments.service';
import { platformServiceFee } from 'src/modules/platform/platform-settings.service';
import { PushService } from 'src/modules/push/push.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateRentalItemDto, RentalBookDto, RentalQuoteDto, RentalReturnDto, UpdateRentalItemDto } from './dto/rentals.dto';
import { availabilityCalendar, availableQuantity, DAY_MS, parseDay, priceRental, rangeProblem, rentalDays, ReservationLike } from './rental-availability';
import { track } from 'src/common/analytics';

const round2 = (n: number) => Math.round(n * 100) / 100;
/** Bookings in these states no longer hold stock. */
const RELEASED_STATES: BookingStatus[] = [BookingStatus.CANCELLED, BookingStatus.REJECTED];
const IMAGE_DIR = 'rentals';
/** Hours the customer has to dispute damage or late fees before the vendor is paid. */
const FEE_DISPUTE_HOURS = 48;

type Item = { id: string; vendor_id: string; title: string; quantity: number; turnaround_hours: number; daily_rate: Prisma.Decimal; deposit_amount: Prisma.Decimal; category_id: string | null; status: RentalItemStatus; deleted_at: Date | null };

@Injectable()
export class RentalsService {
  constructor(
    private prisma: PrismaService,
    private payments: PaymentsService,
    private mail: MailService,
    private push: PushService,
  ) {}

  // ─── Formatting ───────────────────────────────────────────────────────────

  private format(item: any) {
    return {
      ...item,
      daily_rate: Number(item.daily_rate),
      deposit_amount: Number(item.deposit_amount),
      image_keys: item.images ?? [],
      images: (item.images ?? []).map((img: string) => TanvirStorage.url(`${IMAGE_DIR}/${img}`)),
      vendor: item.vendor
        ? { ...item.vendor, avatar_url: item.vendor.avatar ? TanvirStorage.url(`${appConfig().storageUrl.avatar}/${item.vendor.avatar}`) : null }
        : undefined,
    };
  }

  private async saveImages(files?: Express.Multer.File[]) {
    const names: string[] = [];
    for (const f of files ?? []) {
      const name = `${StringHelper.randomString()}_${f.originalname}`;
      await TanvirStorage.put(`${IMAGE_DIR}/${name}`, f.buffer);
      names.push(name);
    }
    return names;
  }

  /** Reservations still holding stock for these items that could touch [start, end] (turnaround included). */
  private holdingReservations(db: Prisma.TransactionClient | PrismaService, itemIds: string[], start: Date, end: Date, maxTurnaroundHours: number) {
    const pad = maxTurnaroundHours * 3600 * 1000;
    return db.rentalReservation.findMany({
      where: {
        item_id: { in: itemIds },
        status: RentalReservationStatus.ACTIVE,
        booking: { status: { notIn: RELEASED_STATES } },
        start_date: { lt: new Date(end.getTime() + DAY_MS + pad) },
        end_date: { gte: new Date(start.getTime() - DAY_MS - pad) },
      },
      select: { item_id: true, start_date: true, end_date: true, quantity: true },
    });
  }

  private byItem(rows: (ReservationLike & { item_id: string })[]) {
    const map = new Map<string, ReservationLike[]>();
    for (const r of rows) map.set(r.item_id, [...(map.get(r.item_id) ?? []), r]);
    return map;
  }

  // ─── Vendor inventory ─────────────────────────────────────────────────────

  async createItem(vendorId: string, dto: CreateRentalItemDto, images?: Express.Multer.File[]) {
    const names = await this.saveImages(images);
    const item = await this.prisma.rentalItem.create({
      data: {
        vendor_id: vendorId,
        title: dto.title,
        description: dto.description,
        daily_rate: dto.daily_rate,
        deposit_amount: dto.deposit_amount ?? 0,
        quantity: dto.quantity ?? 1,
        turnaround_hours: dto.turnaround_hours ?? 24,
        category_id: dto.category_id,
        location: dto.location,
        status: dto.status ?? RentalItemStatus.ACTIVE,
        images: names,
      },
    });
    return { success: true, data: this.format(item) };
  }

  private async ownedItem(id: string, vendorId: string) {
    const item = await this.prisma.rentalItem.findFirst({ where: { id, deleted_at: null } });
    if (!item) throw new NotFoundException('Rental item not found');
    if (item.vendor_id !== vendorId) throw new ForbiddenException('Access denied');
    return item;
  }

  async updateItem(id: string, vendorId: string, dto: UpdateRentalItemDto, images?: Express.Multer.File[]) {
    const item = await this.ownedItem(id, vendorId);
    const { keep_images, ...fields } = dto;
    let kept = item.images;
    if (keep_images) {
      const keepNames = new Set(keep_images.map((k) => decodeURIComponent(k.split('/').pop() ?? k)));
      kept = item.images.filter((n) => keepNames.has(n));
      for (const gone of item.images.filter((n) => !keepNames.has(n))) await TanvirStorage.delete(`${IMAGE_DIR}/${gone}`).catch(() => null);
    }
    const added = await this.saveImages(images);
    const updated = await this.prisma.rentalItem.update({ where: { id }, data: { ...fields, images: [...kept, ...added] } });
    return { success: true, data: this.format(updated) };
  }

  async removeItem(id: string, vendorId: string) {
    await this.ownedItem(id, vendorId);
    const upcoming = await this.prisma.rentalReservation.count({
      where: { item_id: id, status: RentalReservationStatus.ACTIVE, booking: { status: { notIn: [...RELEASED_STATES, BookingStatus.COMPLETED] } } },
    });
    if (upcoming > 0) throw new BadRequestException('This item has active rentals. Pause it instead, or wait until they are returned.');
    await this.prisma.rentalItem.update({ where: { id }, data: { deleted_at: new Date(), status: RentalItemStatus.PAUSED } });
    return { success: true };
  }

  async myItems(vendorId: string) {
    const items = await this.prisma.rentalItem.findMany({ where: { vendor_id: vendorId, deleted_at: null }, orderBy: { created_at: 'desc' } });
    const today = parseDay(new Date());
    const rows = await this.holdingReservations(this.prisma, items.map((i) => i.id), today, today, Math.max(0, ...items.map((i) => i.turnaround_hours)));
    const res = this.byItem(rows);
    return {
      success: true,
      data: items.map((i) => ({ ...this.format(i), available_today: availableQuantity(i, res.get(i.id) ?? [], today, today) })),
    };
  }

  /** Item detail for the vendor: 60-day stock calendar and upcoming reservations. */
  async myItem(id: string, vendorId: string, from?: string) {
    const item = await this.ownedItem(id, vendorId);
    const start = parseDay(from ?? new Date());
    const reservations = await this.prisma.rentalReservation.findMany({
      where: { item_id: id, status: { not: RentalReservationStatus.CANCELLED }, booking: { status: { notIn: RELEASED_STATES } }, end_date: { gte: new Date(start.getTime() - DAY_MS) } },
      orderBy: { start_date: 'asc' },
      include: { booking: { select: { id: true, status: true, customer: { select: { id: true, name: true } } } } },
    });
    const active = reservations.filter((r) => r.status === RentalReservationStatus.ACTIVE);
    return {
      success: true,
      data: {
        ...this.format(item),
        calendar: availabilityCalendar(item, active, start, 60),
        reservations: reservations.map((r) => ({ ...r, daily_rate: Number(r.daily_rate) })),
      },
    };
  }

  // ─── Customer browsing ────────────────────────────────────────────────────

  async browse(q: { search?: string; category_id?: string; vendor_id?: string; start_date?: string; end_date?: string; page?: number; limit?: number }) {
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(q.limit) || 20));
    const where: Prisma.RentalItemWhereInput = {
      status: RentalItemStatus.ACTIVE,
      deleted_at: null,
      ...(q.category_id ? { category_id: q.category_id } : {}),
      ...(q.vendor_id ? { vendor_id: q.vendor_id } : {}),
      ...(q.search ? { OR: [{ title: { contains: q.search, mode: 'insensitive' } }, { description: { contains: q.search, mode: 'insensitive' } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.rentalItem.findMany({ where, orderBy: { created_at: 'desc' }, skip: (page - 1) * limit, take: limit, include: { vendor: { select: { id: true, name: true, avatar: true } } } }),
      this.prisma.rentalItem.count({ where }),
    ]);
    let availability: Map<string, number> | null = null;
    if (q.start_date && q.end_date) {
      const start = parseDay(q.start_date);
      const end = parseDay(q.end_date);
      const rows = await this.holdingReservations(this.prisma, items.map((i) => i.id), start, end, Math.max(0, ...items.map((i) => i.turnaround_hours)));
      const res = this.byItem(rows);
      availability = new Map(items.map((i) => [i.id, availableQuantity(i, res.get(i.id) ?? [], start, end)]));
    }
    return {
      success: true,
      data: items.map((i) => ({ ...this.format(i), available: availability ? availability.get(i.id) : undefined })),
      meta: { page, limit, total },
    };
  }

  async getItem(id: string, from?: string) {
    const item = await this.prisma.rentalItem.findFirst({
      where: { id, deleted_at: null, status: RentalItemStatus.ACTIVE },
      include: { vendor: { select: { id: true, name: true, avatar: true } } },
    });
    if (!item) throw new NotFoundException('Rental item not found');
    const start = parseDay(from ?? new Date());
    const rows = await this.holdingReservations(this.prisma, [id], start, new Date(start.getTime() + 59 * DAY_MS), item.turnaround_hours);
    return { success: true, data: { ...this.format(item), calendar: availabilityCalendar(item, rows, start, 60) } };
  }

  // ─── Quote and book ───────────────────────────────────────────────────────

  /** Loads and checks the requested items; all lines must be from one vendor. */
  private async loadLines(db: Prisma.TransactionClient | PrismaService, dto: RentalQuoteDto) {
    const ids = [...new Set(dto.lines.map((l) => l.item_id))];
    if (ids.length !== dto.lines.length) throw new BadRequestException('Each item can only appear once.');
    const items = (await db.rentalItem.findMany({ where: { id: { in: ids } } })) as Item[];
    const byId = new Map(items.map((i) => [i.id, i]));
    const lines = dto.lines.map((l) => {
      const item = byId.get(l.item_id);
      if (!item || item.deleted_at || item.status !== RentalItemStatus.ACTIVE) throw new NotFoundException('One of these items is no longer available to rent.');
      return { item, quantity: l.quantity };
    });
    if (new Set(lines.map((l) => l.item.vendor_id)).size > 1) throw new BadRequestException('Rent items from one vendor per booking.');
    return lines;
  }

  private priceFor(lines: { item: Item; quantity: number }[], start: Date, end: Date) {
    const days = rentalDays(start, end);
    const { subtotal, deposit } = priceRental(
      lines.map((l) => ({ daily_rate: Number(l.item.daily_rate), deposit_amount: Number(l.item.deposit_amount), quantity: l.quantity })),
      days,
    );
    const fee = platformServiceFee(subtotal, lines[0].item.category_id);
    return { days, subtotal, service_fee: fee, security_deposit: deposit, due_on_accept: round2(subtotal + fee) };
  }

  private checkStock(lines: { item: Item; quantity: number }[], rows: (ReservationLike & { item_id: string })[], start: Date, end: Date) {
    const res = this.byItem(rows);
    return lines.map((l) => {
      const available = availableQuantity(l.item, res.get(l.item.id) ?? [], start, end);
      return { item_id: l.item.id, title: l.item.title, quantity: l.quantity, available, ok: available >= l.quantity, daily_rate: Number(l.item.daily_rate), deposit_amount: Number(l.item.deposit_amount) };
    });
  }

  async quote(dto: RentalQuoteDto) {
    const start = parseDay(dto.start_date);
    const end = parseDay(dto.end_date);
    const problem = rangeProblem(start, end);
    if (problem) throw new BadRequestException(problem);
    const lines = await this.loadLines(this.prisma, dto);
    const rows = await this.holdingReservations(this.prisma, lines.map((l) => l.item.id), start, end, Math.max(...lines.map((l) => l.item.turnaround_hours)));
    const stock = this.checkStock(lines, rows, start, end);
    return {
      success: true,
      data: { start_date: start, end_date: end, ...this.priceFor(lines, start, end), lines: stock, available: stock.every((s) => s.ok) },
    };
  }

  /**
   * Creates a rental booking request. The item rows are locked for the transaction, so two
   * customers checking out the last units at once can't both get them.
   */
  async book(customerId: string, dto: RentalBookDto) {
    const start = parseDay(dto.start_date);
    const end = parseDay(dto.end_date);
    const problem = rangeProblem(start, end);
    if (problem) throw new BadRequestException(problem);
    await this.payments.assertOwnsCard(customerId, dto.payment_method_id);

    const created = await this.prisma.$transaction(async (tx) => {
      const ids = dto.lines.map((l) => l.item_id);
      await tx.$queryRaw`SELECT id FROM rental_items WHERE id IN (${Prisma.join(ids)}) FOR UPDATE`;
      const lines = await this.loadLines(tx, dto);
      if (lines[0].item.vendor_id === customerId) throw new BadRequestException('You can’t rent your own items.');
      const rows = await this.holdingReservations(tx, ids, start, end, Math.max(...lines.map((l) => l.item.turnaround_hours)));
      const short = this.checkStock(lines, rows, start, end).filter((s) => !s.ok);
      if (short.length) {
        throw new ConflictException(short.map((s) => (s.available ? `Only ${s.available} × ${s.title} left for those dates.` : `${s.title} is booked for those dates.`)).join(' '));
      }
      const price = this.priceFor(lines, start, end);
      return tx.booking.create({
        data: {
          customer_id: customerId,
          vendor_id: lines[0].item.vendor_id,
          status: BookingStatus.PENDING,
          scheduled_at: start,
          event_start_at: start,
          event_end_at: new Date(end.getTime() + DAY_MS),
          venue_address: dto.venue_address,
          message: dto.message,
          amount: price.subtotal,
          service_fee: price.service_fee,
          security_deposit: price.security_deposit > 0 ? price.security_deposit : null,
          payment_plan: PaymentPlan.FULL_ON_ACCEPT,
          payment_method_id: dto.payment_method_id,
          rental_reservations: {
            create: lines.map((l) => ({ item_id: l.item.id, start_date: start, end_date: end, quantity: l.quantity, daily_rate: l.item.daily_rate })),
          },
        },
        include: { rental_reservations: { include: { item: { select: { title: true } } } }, vendor: { select: { email: true, name: true } }, customer: { select: { name: true } } },
      });
    });

    const title = rentalTitle(created.rental_reservations);
    track('rental_requested', customerId, { booking_id: created.id, items: created.rental_reservations.length, amount: Number(created.amount) });
    const clientUrl = appConfig().app.client_app_url;
    if (created.vendor.email) {
      await this.mail
        .sendBookingNotification({
          to: created.vendor.email,
          recipientName: created.vendor.name ?? '',
          subject: `New rental request — ${title}`,
          message: `${created.customer.name ?? 'A customer'} wants to rent ${title} from ${start.toDateString()} to ${end.toDateString()}. Accept or decline it in Vendly.`,
          status: 'PENDING',
          listingTitle: title,
          amount: Number(created.amount),
          ctaUrl: `${clientUrl}/vendor/bookings/${created.id}`,
        })
        .catch(() => null);
    }
    void this.push.sendToUser(created.vendor_id, { title: 'New rental request', body: `${created.customer.name ?? 'A customer'} requested ${title}`, data: { type: 'booking', bookingId: created.id } });
    return { success: true, data: { id: created.id, status: created.status, title } };
  }

  // ─── Returns ──────────────────────────────────────────────────────────────

  /**
   * Vendor checks the items back in. With no fees the deposit hold is released; damage / late
   * fees are taken from the hold (and charged on top if they exceed it). The customer then has
   * 48 hours to dispute before the vendor is paid.
   */
  async recordReturn(bookingId: string, vendorId: string, dto: RentalReturnDto, photos?: Express.Multer.File[]) {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, vendor_id: true, customer_id: true, status: true, released_at: true, release_at: true, rental_return: { select: { id: true } }, rental_reservations: { select: { id: true, item: { select: { title: true } } } }, customer: { select: { email: true, name: true } } },
    });
    if (!b) throw new NotFoundException('Booking not found');
    if (b.vendor_id !== vendorId) throw new ForbiddenException('Access denied');
    if (!b.rental_reservations.length) throw new BadRequestException('This booking is not a rental.');
    if (b.rental_return) throw new BadRequestException('The return has already been recorded.');
    if (!([BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED] as BookingStatus[]).includes(b.status)) {
      throw new BadRequestException(`Cannot record a return for a ${b.status.toLowerCase()} booking.`);
    }
    if (b.released_at) throw new BadRequestException('Payment for this booking has already been released.');
    const damage = round2(dto.damage_fee ?? 0);
    const late = round2(dto.late_fee ?? 0);
    if ((damage > 0 || late > 0) && !photos?.length && !dto.notes?.trim()) {
      throw new BadRequestException('Add photos or a note explaining the damage or late fee.');
    }

    const names: string[] = [];
    for (const f of photos ?? []) {
      const name = `${StringHelper.randomString()}_${f.originalname}`;
      await TanvirStorage.put(`proofs/${name}`, f.buffer);
      names.push(name);
    }
    await this.prisma.$transaction([
      this.prisma.rentalReturn.create({
        data: { booking_id: bookingId, photos: names, notes: dto.notes, damage_reported: !!dto.damage_reported || damage > 0, damage_fee: damage, late_fee: late, recorded_by: vendorId },
      }),
      this.prisma.rentalReservation.updateMany({ where: { booking_id: bookingId, status: RentalReservationStatus.ACTIVE }, data: { status: RentalReservationStatus.RETURNED } }),
    ]);
    const settlement = await this.payments.settleSecurityDeposit(bookingId, round2(damage + late));

    const fees = round2(damage + late);
    if (fees > 0 && b.status === BookingStatus.COMPLETED) {
      const window = new Date(Date.now() + FEE_DISPUTE_HOURS * 3600 * 1000);
      if (!b.release_at || b.release_at < window) await this.prisma.booking.update({ where: { id: bookingId }, data: { release_at: window } });
    }
    const title = rentalTitle(b.rental_reservations);
    const body = fees > 0
      ? `${title} was returned. The vendor reported $${fees.toFixed(2)} in ${[damage > 0 && 'damage', late > 0 && 'late'].filter(Boolean).join(' and ')} fees${dto.notes ? `: “${dto.notes}”` : ''}. If you disagree, open a dispute within ${FEE_DISPUTE_HOURS} hours.`
      : `${title} was returned in good shape. Your security deposit hold has been released.`;
    if (b.customer.email) {
      await this.mail
        .sendBookingNotification({ to: b.customer.email, recipientName: b.customer.name ?? '', subject: `Rental returned — ${title}`, message: body, status: 'RETURNED', listingTitle: title, amount: fees || undefined, ctaUrl: `${appConfig().app.client_app_url}/bookings/${bookingId}` })
        .catch(() => null);
    }
    void this.push.sendToUser(b.customer_id, { title: 'Rental returned', body, data: { type: 'booking', bookingId } });
    return { success: true, data: { fees, ...settlement } };
  }
}

export function rentalTitle(reservations: { item: { title: string } }[]) {
  if (!reservations.length) return 'Rental';
  const first = reservations[0].item.title;
  return reservations.length > 1 ? `${first} + ${reservations.length - 1} more` : first;
}
