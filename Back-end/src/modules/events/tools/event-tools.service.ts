import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, InstallmentStatus, ListingStatus, UserType } from 'prisma/generated/enums';
import { TanvirStorage } from 'src/common/lib/Disk/TanvirStorage';
import appConfig from 'src/config/app.config';
import { MailService } from 'src/mail/mail.service';
import { MessageGateway } from 'src/modules/chat/message/message.gateway';
import { formatMessage, messageInclude } from 'src/modules/chat/extras/format';
import { blockSets } from 'src/modules/chat/safety/block';
import { PrivateStorage, SignedUrl } from 'src/modules/contracts/private-storage';
import { PushService } from 'src/modules/push/push.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { summariseBudget } from './budget-summary';
import { assertNotCancelled } from '../event-rules';

export type EventRole = 'planner' | 'vendor' | 'client';
/** Bookings that make a vendor part of the event. */
const ACTIVE: BookingStatus[] = [BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED];
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const FILE_LINK_TTL = 10 * 60;
/** Most vendors one saved team can hold (an invite messages each of them). */
export const MAX_TEAM_SIZE = 50;

/** A vendor a planner can put in a team: a vendor account that isn't deleted or suspended (status 0). */
const activeVendorWhere = (...more: object[]) => ({
  deleted_at: null,
  AND: [{ OR: [{ type: UserType.VENDOR }, { roles: { has: UserType.VENDOR } }] }, { OR: [{ status: null }, { status: { not: 0 } }] }, ...more],
});

const TEAM_VENDOR_SELECT = {
  id: true,
  name: true,
  avatar: true,
  vendorProfile: { select: { business_name: true } },
  // the first package's category, shown under the name ("Catering")
  vendorListings: { where: { status: ListingStatus.ACTIVE, deleted_at: null }, orderBy: { created_at: 'asc' as const }, take: 1, select: { category: { select: { name: true } } } },
};

type TeamVendorRow = { id: string; name: string | null; avatar: string | null; vendorProfile: { business_name: string | null } | null; vendorListings: { category: { name: string } | null }[] };

const teamVendorCard = (v: TeamVendorRow) => ({
  id: v.id,
  name: v.vendorProfile?.business_name || v.name || 'Vendor',
  avatar_url: v.avatar ? TanvirStorage.url(`${appConfig().storageUrl.avatar}/${v.avatar}`) : null,
  category: v.vendorListings?.[0]?.category?.name ?? null,
});

export interface TimelineInput {
  starts_at: string;
  ends_at?: string | null;
  title: string;
  notes?: string | null;
  location?: string | null;
  vendor_id?: string | null;
}

@Injectable()
export class EventToolsService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private push: PushService,
    private gateway: MessageGateway,
  ) {}

  // ─── Access ───────────────────────────────────────────────────────────────

  /** Who the user is on this event: the planner, a booked vendor, or the planner's client. */
  async access(eventId: string, userId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true, name: true, date: true, venue: true, status: true, event_planner_id: true, client_email: true, client_sees_budget: true, total_budget: true,
        bookings: { where: { booking: { status: { in: ACTIVE }, deleted_at: null } }, select: { booking: { select: { vendor_id: true } } } },
      },
    });
    if (!event) throw new NotFoundException('Event not found');
    let role: EventRole | null = null;
    if (event.event_planner_id === userId) role = 'planner';
    else if (event.bookings.some((b) => b.booking.vendor_id === userId)) role = 'vendor';
    else if (event.client_email) {
      const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
      if (u?.email && u.email.toLowerCase() === event.client_email.toLowerCase()) role = 'client';
    }
    if (!role) throw new ForbiddenException('You do not have access to this event');
    return { event, role, vendorIds: event.bookings.map((b) => b.booking.vendor_id) };
  }

  private async planner(eventId: string, userId: string) {
    const a = await this.access(eventId, userId);
    if (a.role !== 'planner') throw new ForbiddenException('Only the planner can change this');
    return a;
  }

  /** Access for a change: like `access`, but a cancelled event is read-only. */
  private async accessToChange(eventId: string, userId: string) {
    const a = await this.access(eventId, userId);
    assertNotCancelled(a.event);
    return a;
  }

  // ─── Overview (what vendors and the client see) ───────────────────────────

  async overview(eventId: string, userId: string) {
    const { event, role } = await this.access(eventId, userId);
    const showMoney = role === 'planner' || (role === 'client' && event.client_sees_budget);
    const [planner, bookings, timeline, files] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: event.event_planner_id }, select: { id: true, name: true } }),
      this.prisma.eventBooking.findMany({
        where: { event_id: eventId, booking: { deleted_at: null, status: { notIn: [BookingStatus.CANCELLED, BookingStatus.REJECTED] } } },
        select: { booking: { select: { id: true, status: true, amount: true, service_fee: true, event_start_at: true, vendor: { select: { id: true, name: true } }, listing: { select: { title: true } } } } },
      }),
      this.timeline(eventId, userId, true),
      this.prisma.eventFile.count({ where: { event_id: eventId } }),
    ]);
    return {
      success: true,
      data: {
        id: event.id,
        name: event.name,
        date: event.date,
        venue: event.venue,
        // CANCELLED: read-only for everyone
        status: event.status,
        role,
        planner,
        client_sees_budget: event.client_sees_budget,
        vendors: bookings.map(({ booking: b }) => ({
          booking_id: b.id,
          status: b.status,
          vendor: b.vendor,
          service: b.listing?.title ?? 'Rental',
          starts_at: b.event_start_at,
          total: showMoney ? Math.round((Number(b.amount ?? 0) + Number(b.service_fee ?? 0)) * 100) / 100 : undefined,
        })),
        timeline: timeline.data,
        file_count: files,
      },
    };
  }

  /** Events shared with this user as the planner's client. */
  async sharedWithMe(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!u?.email) return { success: true, data: [] };
    const events = await this.prisma.event.findMany({
      where: { client_email: { equals: u.email, mode: 'insensitive' } },
      orderBy: { date: 'asc' },
      select: { id: true, name: true, date: true, venue: true, status: true, event_planner: { select: { id: true, name: true } } },
    });
    return { success: true, data: events };
  }

  // ─── Run of show ──────────────────────────────────────────────────────────

  async timeline(eventId: string, userId: string, skipAccess = false) {
    if (!skipAccess) await this.access(eventId, userId);
    const items = await this.prisma.eventTimelineItem.findMany({
      where: { event_id: eventId },
      orderBy: [{ starts_at: 'asc' }, { created_at: 'asc' }],
      include: { vendor: { select: { id: true, name: true } } },
    });
    return { success: true, data: items };
  }

  private async checkTimelineVendor(eventId: string, vendorIds: string[], vendorId?: string | null) {
    if (vendorId && !vendorIds.includes(vendorId)) throw new BadRequestException('Assign the item to a vendor booked for this event.');
  }

  private times(input: Partial<TimelineInput>) {
    const starts = input.starts_at ? new Date(input.starts_at) : undefined;
    const ends = input.ends_at ? new Date(input.ends_at) : input.ends_at === null ? null : undefined;
    if (starts && Number.isNaN(starts.getTime())) throw new BadRequestException('Invalid start time');
    if (ends && Number.isNaN(ends.getTime())) throw new BadRequestException('Invalid end time');
    if (starts && ends && ends < starts) throw new BadRequestException('The end time must be after the start.');
    return { starts, ends };
  }

  async addTimelineItem(eventId: string, userId: string, input: TimelineInput) {
    const { vendorIds, event } = await this.planner(eventId, userId);
    assertNotCancelled(event);
    await this.checkTimelineVendor(eventId, vendorIds, input.vendor_id);
    const { starts, ends } = this.times(input);
    if (!starts) throw new BadRequestException('A start time is required');
    const item = await this.prisma.eventTimelineItem.create({
      data: { event_id: eventId, starts_at: starts, ends_at: ends ?? null, title: input.title.trim(), notes: input.notes?.trim() || null, location: input.location?.trim() || null, vendor_id: input.vendor_id || null },
      include: { vendor: { select: { id: true, name: true } } },
    });
    if (item.vendor_id) void this.push.sendToUser(item.vendor_id, { title: 'Run of show updated', body: `${item.title} · ${item.starts_at.toISOString().slice(11, 16)} UTC`, data: { type: 'event', eventId } }, 'booking_updates');
    return { success: true, data: item };
  }

  async updateTimelineItem(eventId: string, itemId: string, userId: string, input: Partial<TimelineInput> & { done?: boolean }) {
    const { role, vendorIds } = await this.accessToChange(eventId, userId);
    const item = await this.prisma.eventTimelineItem.findFirst({ where: { id: itemId, event_id: eventId } });
    if (!item) throw new NotFoundException('Timeline item not found');
    if (role !== 'planner') {
      // the vendor running an item can tick it off; nothing else
      const onlyDone = Object.keys(input).every((k) => k === 'done');
      if (!(role === 'vendor' && item.vendor_id === userId && onlyDone)) throw new ForbiddenException('Only the planner can change the run of show');
    }
    if (input.vendor_id !== undefined) await this.checkTimelineVendor(eventId, vendorIds, input.vendor_id);
    const { starts, ends } = this.times(input);
    const updated = await this.prisma.eventTimelineItem.update({
      where: { id: itemId },
      data: {
        ...(starts && { starts_at: starts }),
        ...(ends !== undefined && { ends_at: ends }),
        ...(input.title !== undefined && { title: input.title.trim() }),
        ...(input.notes !== undefined && { notes: input.notes?.trim() || null }),
        ...(input.location !== undefined && { location: input.location?.trim() || null }),
        ...(input.vendor_id !== undefined && { vendor_id: input.vendor_id || null }),
        ...(input.done !== undefined && { done: input.done }),
      },
      include: { vendor: { select: { id: true, name: true } } },
    });
    return { success: true, data: updated };
  }

  async deleteTimelineItem(eventId: string, itemId: string, userId: string) {
    assertNotCancelled((await this.planner(eventId, userId)).event);
    const gone = await this.prisma.eventTimelineItem.deleteMany({ where: { id: itemId, event_id: eventId } });
    if (!gone.count) throw new NotFoundException('Timeline item not found');
    return { success: true };
  }

  // ─── Shared files ─────────────────────────────────────────────────────────

  private fileUrl(fileKey: string, userId: string, fileId: string, name: string) {
    const base = appConfig().app.url ?? '';
    return `${base}/api/event-files/${SignedUrl.sign({ key: fileKey, uid: userId, cid: fileId, name }, FILE_LINK_TTL)}`;
  }

  async files(eventId: string, userId: string) {
    await this.access(eventId, userId);
    const files = await this.prisma.eventFile.findMany({ where: { event_id: eventId }, orderBy: { created_at: 'desc' }, include: { uploader: { select: { id: true, name: true } } } });
    return {
      success: true,
      data: files.map((f) => ({ id: f.id, name: f.name, size: f.size, mime: f.mime, created_at: f.created_at, uploader: f.uploader, can_delete: f.uploaded_by === userId, url: this.fileUrl(f.key, userId, f.id, f.name) })),
    };
  }

  async uploadFiles(eventId: string, userId: string, uploads: Express.Multer.File[]) {
    const { role } = await this.accessToChange(eventId, userId);
    if (role === 'client') throw new ForbiddenException('Clients can view files but not upload them');
    if (!uploads?.length) throw new BadRequestException('Choose at least one file');
    const tooBig = uploads.find((f) => f.size > MAX_FILE_BYTES);
    if (tooBig) throw new BadRequestException(`${tooBig.originalname} is over 20 MB`);
    const saved = [];
    for (const f of uploads) {
      const ext = (f.originalname.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin';
      const key = PrivateStorage.newKey(`events/${eventId}`, ext);
      await PrivateStorage.put(key, f.buffer);
      saved.push(await this.prisma.eventFile.create({ data: { event_id: eventId, key, name: f.originalname.slice(0, 255), size: f.size, mime: (f.mimetype || 'application/octet-stream').slice(0, 120), uploaded_by: userId } }));
    }
    return { success: true, data: saved.map((f) => ({ id: f.id, name: f.name, size: f.size })) };
  }

  async deleteFile(eventId: string, fileId: string, userId: string) {
    const { role } = await this.accessToChange(eventId, userId);
    const f = await this.prisma.eventFile.findFirst({ where: { id: fileId, event_id: eventId } });
    if (!f) throw new NotFoundException('File not found');
    if (role !== 'planner' && f.uploaded_by !== userId) throw new ForbiddenException('Only the planner or the person who shared it can remove it');
    await this.prisma.eventFile.delete({ where: { id: fileId } });
    return { success: true };
  }

  /** Serves a file from a signed link (the link is the permission; it expires in 10 minutes). */
  async resolveFile(token: string) {
    const claims = SignedUrl.verify(token);
    if (!claims) throw new ForbiddenException('This download link has expired. Open the file again from the event.');
    const f = await this.prisma.eventFile.findUnique({ where: { id: claims.cid } });
    if (!f || f.key !== claims.key) throw new NotFoundException('File not found');
    return { buffer: await PrivateStorage.get(f.key), name: f.name, type: f.mime };
  }

  // ─── Budget from bookings ─────────────────────────────────────────────────

  async budgetSummary(eventId: string, userId: string) {
    const { event, role } = await this.access(eventId, userId);
    if (role === 'vendor' || (role === 'client' && !event.client_sees_budget)) throw new ForbiddenException('The budget is private to the planner');
    const [lines, links] = await Promise.all([
      this.prisma.budgetItem.findMany({ where: { event_id: eventId }, orderBy: { created_at: 'asc' } }),
      this.prisma.eventBooking.findMany({
        where: { event_id: eventId, booking: { deleted_at: null } },
        select: {
          booking: {
            select: {
              id: true, status: true, amount: true, service_fee: true,
              vendor: { select: { name: true } },
              listing: { select: { title: true, category: { select: { name: true } } } },
              installments: { where: { kind: 'charge', status: { in: [InstallmentStatus.PAID, InstallmentStatus.REFUNDED] } }, select: { amount: true, refunded_amount: true } },
            },
          },
        },
      }),
    ]);
    const bookings = links.map(({ booking: b }) => ({
      id: b.id,
      status: b.status,
      amount: Number(b.amount ?? 0),
      service_fee: Number(b.service_fee ?? 0),
      paid: b.installments.reduce((s, i) => s + Number(i.amount) - Number(i.refunded_amount), 0),
      vendor_name: b.vendor.name ?? 'Vendor',
      title: b.listing?.title ?? 'Rental',
      category: b.listing?.category?.name ?? null,
    }));
    const summary = summariseBudget(
      event.total_budget != null ? Number(event.total_budget) : null,
      lines.map((l) => ({ id: l.id, category: l.category, allocated: Number(l.allocated), spent: Number(l.spent), note: l.note, booking_id: l.booking_id })),
      bookings,
    );
    return { success: true, data: { ...summary, can_edit: role === 'planner' } };
  }

  /** When a vendor accepts a booking for an event, it gets its own budget line (once). */
  async syncBookingBudget(bookingId: string) {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, amount: true, service_fee: true, vendor: { select: { name: true } }, listing: { select: { title: true, category: { select: { name: true } } } }, event_bookings: { select: { event_id: true } } },
    });
    if (!b) return;
    for (const { event_id } of b.event_bookings) {
      const exists = await this.prisma.budgetItem.findUnique({ where: { booking_id: b.id } });
      if (exists) continue;
      await this.prisma.budgetItem.create({
        data: {
          event_id,
          booking_id: b.id,
          category: (b.listing?.category?.name ?? 'Vendors').slice(0, 100),
          allocated: Math.round((Number(b.amount ?? 0) + Number(b.service_fee ?? 0)) * 100) / 100,
          note: `${b.vendor.name ?? 'Vendor'} · ${b.listing?.title ?? 'Booking'}`.slice(0, 255),
        },
      });
    }
  }

  // ─── Client access ────────────────────────────────────────────────────────

  async setClient(eventId: string, userId: string, dto: { email?: string | null; sees_budget?: boolean }) {
    const { event } = await this.planner(eventId, userId);
    assertNotCancelled(event);
    const email = dto.email === undefined ? event.client_email : dto.email?.trim().toLowerCase() || null;
    const changed = email !== (event.client_email?.toLowerCase() ?? null);
    const updated = await this.prisma.event.update({
      where: { id: eventId },
      data: { client_email: email, ...(changed && { client_invited_at: email ? new Date() : null }), ...(dto.sees_budget !== undefined && { client_sees_budget: dto.sees_budget }) },
      select: { client_email: true, client_invited_at: true, client_sees_budget: true },
    });
    // Contracts waiting for the client's co-signature follow the change: a new client is asked
    // instead, and with no client they go straight to the vendor.
    const waiting = changed
      ? await this.prisma.bookingContract.findMany({
          where: { status: 'AWAITING_CLIENT', booking: { event_bookings: { some: { event_id: eventId } } } },
          select: { id: true, booking_id: true, booking: { select: { vendor_id: true, listing: { select: { title: true } } } } },
        })
      : [];
    if (waiting.length) {
      const ids = waiting.map((w) => w.id);
      if (email) {
        await this.prisma.bookingContract.updateMany({ where: { id: { in: ids }, status: 'AWAITING_CLIENT' }, data: { client_email: email, last_reminder_at: null } });
      } else {
        await this.prisma.bookingContract.updateMany({ where: { id: { in: ids }, status: 'AWAITING_CLIENT' }, data: { status: 'AWAITING_VENDOR', client_email: null, last_reminder_at: null } });
        // the vendor can answer from now on, so the requests' 72-hour clock starts here (as when a client co-signs)
        await this.prisma.booking.updateMany({
          where: { id: { in: waiting.map((w) => w.booking_id) }, status: BookingStatus.PENDING },
          data: { request_opened_at: new Date(), expiry_reminded_at: null },
        });
        for (const w of waiting) {
          await this.push
            .sendToUser(w.booking.vendor_id, {
              title: `Ready to accept: ${w.booking.listing?.title ?? 'a booking'}`,
              body: 'The planner no longer needs their client to co-sign. Review the contract and tap Accept & Sign.',
              data: { type: 'contract' },
            })
            .catch(() => null);
        }
      }
    }
    if (email && changed) {
      const planner = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
      await this.mail
        .sendBookingNotification({
          to: email,
          recipientName: '',
          subject: `${planner?.name ?? 'Your planner'} shared “${event.name}” with you on Vendly`,
          message: `${planner?.name ?? 'Your planner'} added you to ${event.name}. Sign in (or create a free account with this email) to follow the vendors, the run of show and shared files.${
            waiting.length ? ` They also asked you to co-sign ${waiting.length === 1 ? 'a vendor contract' : `${waiting.length} vendor contracts`}: open the event’s Contracts tab.` : ''
          }`,
          status: 'INVITE',
          listingTitle: event.name,
          ctaUrl: `${appConfig().app.client_app_url}/my-events/${eventId}`,
        })
        .catch(() => null);
    }
    return { success: true, data: updated };
  }

  // ─── Saved vendor teams ───────────────────────────────────────────────────

  /** The vendors for a team: real, active vendor accounts (booked before or not), and nobody either side has blocked. */
  private async teamVendors(plannerId: string, vendorIds: string[]) {
    const ids = [...new Set(vendorIds)];
    if (ids.length > MAX_TEAM_SIZE) throw new BadRequestException(`A team can have up to ${MAX_TEAM_SIZE} vendors.`);
    if (ids.includes(plannerId)) throw new BadRequestException("You can't add yourself to your own team.");
    const vendors = await this.prisma.user.findMany({ where: { id: { in: ids }, ...activeVendorWhere() }, select: { id: true } });
    if (vendors.length !== ids.length) throw new BadRequestException('Some of those accounts are not active vendors.');
    const blocks = await blockSets(this.prisma, plannerId);
    if (ids.some((id) => blocks.blockedByMe.has(id) || blocks.blockedMe.has(id))) {
      throw new BadRequestException("You can't add someone you've blocked or who has blocked you.");
    }
    return ids;
  }

  async teams(plannerId: string) {
    const teams = await this.prisma.vendorTeam.findMany({ where: { planner_id: plannerId }, orderBy: { name: 'asc' } });
    const ids = [...new Set(teams.flatMap((t) => t.vendor_ids))];
    const [vendors, blocks] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: ids }, ...activeVendorWhere() }, select: TEAM_VENDOR_SELECT }),
      blockSets(this.prisma, plannerId),
    ]);
    // vendors who left, were suspended or are blocked either way aren't listed; saving the team drops them
    const listed = vendors.filter((v) => !blocks.blockedByMe.has(v.id) && !blocks.blockedMe.has(v.id));
    const byId = new Map(listed.map((v) => [v.id, teamVendorCard(v)]));
    return { success: true, data: teams.map((t) => ({ ...t, vendors: t.vendor_ids.map((id) => byId.get(id)).filter(Boolean) })) };
  }

  /** Active vendors by business name, account name or package category, to add to a team. */
  async searchTeamVendors(plannerId: string, q?: string) {
    const term = (typeof q === 'string' ? q : '').trim().slice(0, 80);
    if (term.length < 2) return { success: true, data: [] };
    const blocks = await blockSets(this.prisma, plannerId);
    const contains = { contains: term, mode: 'insensitive' as const };
    const vendors = await this.prisma.user.findMany({
      where: {
        // not yourself, and nobody either side has blocked
        id: { notIn: [plannerId, ...blocks.blockedByMe, ...blocks.blockedMe] },
        ...activeVendorWhere({
          OR: [
            { name: contains },
            { vendorProfile: { business_name: contains } },
            { vendorListings: { some: { status: ListingStatus.ACTIVE, deleted_at: null, category: { name: contains } } } },
          ],
        }),
      },
      orderBy: { name: 'asc' },
      take: 20,
      select: TEAM_VENDOR_SELECT,
    });
    return { success: true, data: vendors.map(teamVendorCard) };
  }

  async saveTeam(plannerId: string, dto: { name: string; vendor_ids: string[] }, teamId?: string) {
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('Give the team a name.');
    const ids = await this.teamVendors(plannerId, dto.vendor_ids ?? []);
    if (teamId) {
      const done = await this.prisma.vendorTeam.updateMany({ where: { id: teamId, planner_id: plannerId }, data: { name, vendor_ids: ids } });
      if (!done.count) throw new NotFoundException('Team not found');
      return { success: true, data: await this.prisma.vendorTeam.findUnique({ where: { id: teamId } }) };
    }
    return { success: true, data: await this.prisma.vendorTeam.create({ data: { planner_id: plannerId, name, vendor_ids: ids } }) };
  }

  async deleteTeam(plannerId: string, teamId: string) {
    const done = await this.prisma.vendorTeam.deleteMany({ where: { id: teamId, planner_id: plannerId } });
    if (!done.count) throw new NotFoundException('Team not found');
    return { success: true };
  }

  /** Messages every vendor in a saved team about the event (one 1:1 chat each). */
  async inviteTeam(eventId: string, plannerId: string, teamId: string, note?: string) {
    const { event } = await this.planner(eventId, plannerId);
    assertNotCancelled(event);
    const team = await this.prisma.vendorTeam.findFirst({ where: { id: teamId, planner_id: plannerId } });
    if (!team) throw new NotFoundException('Team not found');
    const planner = await this.prisma.user.findUnique({ where: { id: plannerId }, select: { name: true } });
    const when = event.date ? new Date(event.date).toDateString() : 'a date to confirm';
    const text = `Hi! ${planner?.name ?? 'I'} would love to have you on “${event.name}” (${when}${event.venue ? `, ${event.venue}` : ''}).${note?.trim() ? ` ${note.trim()}` : ''} Can you send me a quote here?`;
    let sent = 0;
    // no message to anyone either side has blocked
    const blocks = await blockSets(this.prisma, plannerId);
    // only vendors still active (one may have been suspended or deleted since the team was saved)
    const active = await this.prisma.user.findMany({ where: { id: { in: team.vendor_ids }, ...activeVendorWhere() }, select: { id: true } });
    const activeIds = new Set(active.map((v) => v.id));
    for (const vendorId of team.vendor_ids.filter((id) => activeIds.has(id))) {
      if (vendorId === plannerId) continue;
      if (blocks.blockedByMe.has(vendorId) || blocks.blockedMe.has(vendorId)) continue;
      let conv = await this.prisma.conversation.findFirst({
        where: { is_group: false, AND: [{ participants: { some: { userId: plannerId } } }, { participants: { some: { userId: vendorId } } }] },
        select: { id: true },
      });
      if (!conv) conv = await this.prisma.conversation.create({ data: { participants: { create: [{ userId: plannerId }, { userId: vendorId }] } }, select: { id: true } });
      const msg = await this.prisma.message.create({ data: { conversationId: conv.id, senderId: plannerId, text, status: 'SENT' }, include: messageInclude });
      await this.prisma.conversation.update({ where: { id: conv.id }, data: { updatedAt: new Date() } });
      this.gateway.server?.to(conv.id).emit('message', { from: plannerId, data: formatMessage(msg) });
      void this.push.sendToUser(vendorId, { title: `${planner?.name ?? 'A planner'} invited you`, body: event.name, data: { type: 'chat', conversationId: conv.id } }, 'messages');
      sent++;
    }
    return { success: true, data: { invited: sent } };
  }
}
