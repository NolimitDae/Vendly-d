import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, ListingStatus, QuoteStatus } from 'prisma/generated/enums';
import { MessageGateway } from 'src/modules/chat/message/message.gateway';
import { PushService } from 'src/modules/push/push.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { formatMessage, formatQuote, messageInclude } from './format';
import { track } from 'src/common/analytics';
import { assertCanMessage } from '../safety/block';
import { UNARCHIVE_ALL, unarchiveChat } from './archive';

const DAY = 24 * 3600 * 1000;
/** Bookings that put a vendor in the event chat. */
const ACTIVE: BookingStatus[] = [BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED];

@Injectable()
export class ChatExtrasService {
  constructor(
    private prisma: PrismaService,
    private gateway: MessageGateway,
    private push: PushService,
  ) {}

  private emit(conversationId: string, data: unknown, event = 'message') {
    this.gateway.server?.to(conversationId).emit(event, { from: 'system', data });
  }

  private async systemMessage(conversationId: string, senderId: string, text: string) {
    const msg = await this.prisma.message.create({ data: { conversationId, senderId, text, kind: 'system', status: 'SENT' }, include: messageInclude });
    // a booking notice matters: the chat comes back for anyone who archived it
    await unarchiveChat(this.prisma, conversationId);
    this.emit(conversationId, formatMessage(msg));
    return msg;
  }

  // ─── Event group chats ────────────────────────────────────────────────────

  /**
   * Makes sure the event's group chat exists and has the planner plus every vendor with an
   * accepted booking for the event. New vendors get a "joined" notice. Returns the chat id.
   * `createEmpty` lets the planner open the chat before any vendor has accepted.
   */
  async syncEventChat(eventId: string, opts: { createEmpty?: boolean } = {}) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        name: true,
        event_planner_id: true,
        bookings: { where: { booking: { status: { in: ACTIVE }, deleted_at: null } }, select: { booking: { select: { vendor_id: true, vendor: { select: { name: true } } } } } },
        conversation: { select: { id: true, participants: { select: { userId: true } } } },
      },
    });
    if (!event) throw new NotFoundException('Event not found');
    const vendors = new Map(event.bookings.map((b) => [b.booking.vendor_id, b.booking.vendor.name ?? 'A vendor']));
    if (!event.conversation && vendors.size === 0 && !opts.createEmpty) return null;

    let conversationId = event.conversation?.id;
    const present = new Set(event.conversation?.participants.map((p) => p.userId) ?? []);
    if (!conversationId) {
      const created = await this.prisma.conversation.create({
        data: { is_group: true, event_id: event.id, title: event.name, participants: { create: [{ userId: event.event_planner_id, role: 'planner' }] } },
      });
      conversationId = created.id;
      present.add(event.event_planner_id);
      await this.systemMessage(conversationId, event.event_planner_id, `Event chat for ${event.name}. Vendors join here once they accept a booking.`);
    }
    for (const [vendorId, name] of vendors) {
      if (present.has(vendorId)) continue;
      await this.prisma.participant.create({ data: { conversationId, userId: vendorId, role: 'vendor' } });
      await this.systemMessage(conversationId, vendorId, `${name} joined the event chat.`);
      void this.push.sendToUser(vendorId, { title: event.name, body: 'You were added to the event chat', data: { type: 'chat', conversationId } }, 'messages');
    }
    return conversationId;
  }

  /** Planner (or a booked vendor) opens the event chat from the event screen. */
  async openEventChat(eventId: string, userId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { event_planner_id: true, conversation: { select: { id: true, participants: { where: { userId }, select: { id: true } } } } } });
    if (!event) throw new NotFoundException('Event not found');
    const isPlanner = event.event_planner_id === userId;
    if (!isPlanner && !event.conversation?.participants.length) throw new ForbiddenException('You are not part of this event chat');
    const id = await this.syncEventChat(eventId, { createEmpty: isPlanner });
    return { success: true, data: { conversation_id: id } };
  }

  // ─── Pinned messages ──────────────────────────────────────────────────────

  private async participantOf(conversationId: string, userId: string) {
    const conv = await this.prisma.conversation.findFirst({
      where: { id: conversationId, participants: { some: { userId } } },
      include: { participants: { select: { userId: true, role: true } }, event: { select: { event_planner_id: true } } },
    });
    if (!conv) throw new NotFoundException('Conversation not found or you are not a participant.');
    return conv;
  }

  async pin(conversationId: string, userId: string, messageId: string | null) {
    await this.participantOf(conversationId, userId);
    let pinned: ReturnType<typeof formatMessage> | null = null;
    if (messageId) {
      const msg = await this.prisma.message.findFirst({ where: { id: messageId, conversationId }, include: messageInclude });
      if (!msg) throw new NotFoundException('Message not found in this conversation');
      pinned = formatMessage(msg);
    }
    await this.prisma.conversation.update({ where: { id: conversationId }, data: { pinned_message_id: messageId } });
    this.gateway.server?.to(conversationId).emit('pinned', { conversation_id: conversationId, message: pinned, by: userId });
    return { success: true, data: { pinned } };
  }

  // ─── Quotes ───────────────────────────────────────────────────────────────

  /** Vendor offers a custom price in a chat. The quote is for the customer (1:1) or the planner (event chat). */
  async createQuote(conversationId: string, vendorId: string, dto: { listing_id: string; title: string; description?: string; amount: number; expires_in_days?: number }) {
    const conv = await this.participantOf(conversationId, vendorId);
    const listing = await this.prisma.vendorListing.findFirst({ where: { id: dto.listing_id, vendor_id: vendorId, deleted_at: null, status: ListingStatus.ACTIVE } });
    if (!listing) throw new BadRequestException('Pick one of your live packages for this quote.');
    const customerId = conv.is_group ? conv.event?.event_planner_id : conv.participants.find((p) => p.userId !== vendorId)?.userId;
    if (!customerId || customerId === vendorId) throw new BadRequestException('There is no customer in this chat to quote.');
    // a quote is a chat message: same block rule as any other 1:1 message
    if (!conv.is_group) await assertCanMessage(this.prisma, vendorId, customerId);
    const amount = Math.round(Number(dto.amount) * 100) / 100;
    if (!(amount >= 1)) throw new BadRequestException('A quote must be at least $1.');
    const days = Math.min(30, Math.max(1, Math.round(dto.expires_in_days ?? 7)));

    const quote = await this.prisma.quote.create({
      data: { conversation_id: conversationId, vendor_id: vendorId, customer_id: customerId, listing_id: listing.id, event_id: conv.event_id, title: dto.title.trim(), description: dto.description?.trim() || null, amount, expires_at: new Date(Date.now() + days * DAY) },
    });
    const msg = await this.prisma.message.create({
      data: { conversationId, senderId: vendorId, text: `Quote: ${quote.title}`, kind: 'quote', quote_id: quote.id, status: 'SENT' },
      include: messageInclude,
    });
    await this.prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date(), participants: UNARCHIVE_ALL } });
    const formatted = formatMessage(msg);
    track('quote_sent', vendorId, { quote_id: quote.id, amount, group: conv.is_group });
    this.gateway.server?.to(conversationId).emit('message', { from: vendorId, data: formatted });
    void this.push.sendToUser(customerId, { title: 'New quote', body: `${quote.title} · $${amount.toFixed(2)}`, data: { type: 'chat', conversationId } }, 'messages');
    return { success: true, data: formatted };
  }

  async getQuote(quoteId: string, userId: string) {
    const q = await this.prisma.quote.findUnique({ where: { id: quoteId }, include: { listing: { select: { id: true, title: true, images: true } } } });
    if (!q || (q.customer_id !== userId && q.vendor_id !== userId)) throw new NotFoundException('Quote not found');
    return { success: true, data: formatQuote(q) };
  }

  private async setQuoteStatus(quoteId: string, userId: string, who: 'customer' | 'vendor', status: QuoteStatus) {
    const q = await this.prisma.quote.findUnique({ where: { id: quoteId } });
    if (!q || (who === 'customer' ? q.customer_id : q.vendor_id) !== userId) throw new NotFoundException('Quote not found');
    const done = await this.prisma.quote.updateMany({ where: { id: quoteId, status: QuoteStatus.PENDING }, data: { status } });
    if (done.count !== 1) throw new BadRequestException('This quote is no longer open.');
    this.gateway.server?.to(q.conversation_id).emit('quoteUpdated', { quote_id: quoteId, status });
    return { success: true, data: { id: quoteId, status } };
  }

  declineQuote(quoteId: string, customerId: string) {
    return this.setQuoteStatus(quoteId, customerId, 'customer', QuoteStatus.DECLINED);
  }

  withdrawQuote(quoteId: string, vendorId: string) {
    return this.setQuoteStatus(quoteId, vendorId, 'vendor', QuoteStatus.WITHDRAWN);
  }
}
