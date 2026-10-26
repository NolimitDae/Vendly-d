import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { PrismaService } from '../../../prisma/prisma.service';
import appConfig from '../../../config/app.config';
import { DateHelper } from '../../../common/helper/date.helper';
import { MessageGateway } from '../message/message.gateway';
import { TanvirStorage } from 'src/common/lib/Disk/TanvirStorage';
import { paginateResponse } from 'src/common/pagination';
import { assertCanMessage, blockSets, blockState } from '../safety/block';
import { BookingStatus, UserType } from 'prisma/generated/client';
import { classifyConversation, clientBookingWhere, CURRENT_BOOKING_STATUSES, InboxTab } from '../extras/inbox';

@Injectable()
export class ConversationService {
  constructor(
    private prisma: PrismaService,
    private readonly messageGateway: MessageGateway,
  ) { }

  // *create conversation
  async create(createConversationDto: CreateConversationDto, sender: string) {

    const { participant_id } = createConversationDto;

    if (participant_id === sender) {
      throw new ConflictException('That’s your own account, so there’s no one to message.');
    }

    // check if conversation already exists between the two users
    const existingConversation = await this.prisma.conversation.findFirst({
      where: {
        is_group: false,
        AND: [
          { participants: { some: { userId: sender } } },
          { participants: { some: { userId: participant_id } } },
        ],
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar: true,
              },
            },
          },
        },
      },
    });

    if (existingConversation) {
      return {
        message: 'Conversation already exists',
        success: true,
        conversation: {
          id: existingConversation.id,
          participants: existingConversation.participants.map((p) => ({
            userId: p.user.id,
            name: p.user.name,
            avater: p.user.avatar,
            avatar_url: p.user.avatar
              ? TanvirStorage.url(
                `${appConfig().storageUrl.avatar}/${p.user.avatar}`,
              )
              : null,
          })),
        },
      };
    }

    // no new 1:1 chat while either person has blocked the other (an existing one still opens, read-only)
    await assertCanMessage(this.prisma, sender, participant_id);

    // create new conversation
    const newConversation = await this.prisma.conversation.create({
      data: {
        participants: {
          create: [{ userId: sender }, { userId: participant_id }],
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar: true,
              },
            },
          },
        },
      },
    });

    const formattedParticipants = {
      conversation_id: newConversation.id,
      participants: newConversation.participants.map((p) => ({
        userId: p.user.id,
        name: p.user.name,
        avater: p.user.avatar,
        avatar_url: p.user.avatar
          ? TanvirStorage.url(
            `${appConfig().storageUrl.avatar}/${p.user.avatar}`,
          )
          : null,
      })),
    };

    return {
      message: 'Conversation created successfully',
      success: true,
      conversation: formattedParticipants,
    };
  }

  //  *conversation list of user (vendors can ask for one inbox tab: extras/inbox.ts). Chats this user
  // archived are left out (and out of the tab counts); `archived` lists only those (extras/archive.ts)
  async findAll(userId: string, opts: { tab?: InboxTab; page?: number; perPage?: number; archived?: boolean } = {}) {

    const all = await this.prisma.conversation.findMany({
      where: {
        participants: {
          some: {
            userId: userId,
          },
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
              },
            },
          },
        },
        messages: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
          select: {
            text: true,
            kind: true,
            attachments: true,
            createdAt: true,
            sender: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    const isArchived = (conv: (typeof all)[number]) => !!conv.participants.find((p) => p.userId === userId)?.archivedAt;
    const archivedCount = all.filter(isArchived).length;
    const conversations = all.filter((conv) => isArchived(conv) === !!opts.archived);

    // unread = messages from others since this user last read the chat
    const unread = new Map<string, number>();
    await Promise.all(
      conversations.map(async (conv) => {
        const me = conv.participants.find((p) => p.userId === userId);
        const n = await this.prisma.message.count({
          where: { conversationId: conv.id, senderId: { not: userId }, createdAt: { gt: me?.lastReadAt ?? new Date(0) } },
        });
        unread.set(conv.id, n);
      }),
    );

    const blocks = await blockSets(this.prisma, userId);

    const formattedConversations = conversations.map((conv) => {

      const me = conv.participants.find((p) => p.userId === userId);
      const opponentParticipant = conv.is_group
        ? null
        : conv.participants.find((p) => p.userId !== userId);

      const opponentData = opponentParticipant ? {
        userId: opponentParticipant.user.id,
        name: opponentParticipant.user.name,
        avater: opponentParticipant.user.avatar,
        avatar_url: opponentParticipant.user.avatar
          ? TanvirStorage.url(
            `${appConfig().storageUrl.avatar}/${opponentParticipant.user.avatar}`,
          )
          : null,
      }
        : null;

      return {
        conversation_id: conv.id,
        is_group: conv.is_group,
        title: conv.is_group ? conv.title : opponentData?.name ?? null,
        event_id: conv.event_id,
        member_count: conv.participants.length,
        members: conv.is_group
          ? conv.participants.map((p) => ({ userId: p.user.id, name: p.user.name, role: p.role }))
          : undefined,
        unread: unread.get(conv.id) ?? 0,
        last_read_at: me?.lastReadAt ?? null,
        archived_at: me?.archivedAt ?? null,
        opponent: opponentData,
        // 1:1 only
        ...(opponentParticipant
          ? { blocked_by_me: blocks.blockedByMe.has(opponentParticipant.userId), blocked_me: blocks.blockedMe.has(opponentParticipant.userId) }
          : {}),
        lastMessage: conv.messages[0] ? {
          text: conv.messages[0].text,
          kind: conv.messages[0].kind,
          sender_name: conv.messages[0].sender?.name ?? null,
          createdAt: conv.messages[0].createdAt,
          attachments: conv.messages[0].attachments,
          attachment_urls: conv.messages[0].attachments
            ? conv.messages[0].attachments.map((att) =>
              TanvirStorage.url(
                `${appConfig().storageUrl.attachment}/${att}`,
              ),
            )
            : [],
        }
          : null,
      };
    });

    // the archived list is a single list (no tabs)
    if (opts.tab && !opts.archived) {
      const tabbed = await this.inboxTab(userId, conversations, formattedConversations, opts as { tab: InboxTab; page?: number; perPage?: number });
      if (tabbed) return { message: 'Conversations retrieved successfully', success: true, ...tabbed, archived_count: archivedCount };
    }

    return {
      message: 'Conversations retrieved successfully',
      success: true,
      conversations: formattedConversations,
      // for the "Archived (n)" link
      archived_count: archivedCount,
    };
  }

  /**
   * Archive a chat for this user only. A 1:1 chat waits until the two people have no booking under way
   * (either one as the customer), so an active booking's chat can't be tucked away by mistake. Event
   * group chats can be archived any time.
   */
  async archive(id: string, userId: string) {
    const conv = await this.prisma.conversation.findFirst({
      where: { id, participants: { some: { userId } } },
      select: { id: true, is_group: true, participants: { select: { id: true, userId: true, archivedAt: true, user: { select: { name: true } } } } },
    });
    if (!conv) throw new NotFoundException('Conversation not found or you are not a participant.');
    const me = conv.participants.find((p) => p.userId === userId)!;
    const other = conv.is_group ? null : conv.participants.find((p) => p.userId !== userId);
    if (other) {
      const open = await this.prisma.booking.count({
        where: {
          deleted_at: null,
          status: { in: CURRENT_BOOKING_STATUSES },
          OR: [
            { customer_id: userId, vendor_id: other.userId },
            { customer_id: other.userId, vendor_id: userId },
          ],
        },
      });
      if (open) throw new BadRequestException(`You can archive this chat once your booking with ${other.user.name || 'them'} is finished.`);
    }
    const archivedAt = me.archivedAt ?? new Date();
    if (!me.archivedAt) await this.prisma.participant.update({ where: { id: me.id }, data: { archivedAt } });
    return { message: 'Chat archived', success: true, data: { conversation_id: conv.id, archived_at: archivedAt } };
  }

  /** Back to this user's main list. */
  async unarchive(id: string, userId: string) {
    const me = await this.prisma.participant.findFirst({ where: { conversationId: id, userId }, select: { id: true, archivedAt: true } });
    if (!me) throw new NotFoundException('Conversation not found or you are not a participant.');
    if (me.archivedAt) await this.prisma.participant.update({ where: { id: me.id }, data: { archivedAt: null } });
    return { message: 'Chat moved back to your messages', success: true, data: { conversation_id: id, archived_at: null } };
  }

  /**
   * One tab of a vendor's inbox (Clients or Inquiries), with both tabs' totals and unread counts so
   * the badges stay right. Clients with a booking under way come first. Null for anyone not signed in
   * as a vendor: they keep a single list.
   */
  private async inboxTab<T extends { unread: number }>(
    userId: string,
    conversations: { is_group: boolean; participants: { userId: string; role: string | null }[] }[],
    formatted: T[],
    opts: { tab: InboxTab; page?: number; perPage?: number },
  ) {
    const me = await this.prisma.user.findUnique({ where: { id: userId }, select: { type: true } });
    if (me?.type !== UserType.VENDOR) return null;

    // the customer in each chat: the other person, or the planner of an event chat
    const counterparts = conversations.map((c) =>
      (c.is_group ? c.participants.find((p) => p.role === 'planner') : c.participants.find((p) => p.userId !== userId))?.userId ?? null,
    );
    const ids = [...new Set(counterparts.filter((id): id is string => !!id && id !== userId))];
    const bookings = ids.length
      ? await this.prisma.booking.findMany({ where: { ...clientBookingWhere, vendor_id: userId, customer_id: { in: ids } }, select: { customer_id: true, status: true } })
      : [];
    const statuses = new Map<string, BookingStatus[]>();
    for (const b of bookings) statuses.set(b.customer_id, [...(statuses.get(b.customer_id) ?? []), b.status]);

    const rows = formatted.map((f, i) => {
      const c = classifyConversation({ is_group: conversations[i].is_group, counterpart: counterparts[i] }, statuses);
      return { ...f, tab: c.tab, current_booking: c.current };
    });
    const countOf = (tab: InboxTab) => {
      const inTab = rows.filter((r) => r.tab === tab);
      return {
        total: inTab.length,
        // chats with something unread (the tab badge), and the messages in them
        unread: inTab.filter((r) => r.unread > 0).length,
        unread_messages: inTab.reduce((n, r) => n + r.unread, 0),
      };
    };

    // newest activity first, as the full list; clients with a booking under way ahead of the rest
    let list = rows.filter((r) => r.tab === opts.tab);
    if (opts.tab === 'clients') list = [...list.filter((r) => r.current_booking), ...list.filter((r) => !r.current_booking)];

    const total = list.length;
    let pagination: ReturnType<typeof paginateResponse>['pagination'] | undefined;
    if (opts.page || opts.perPage) {
      const page = opts.page ?? 1;
      const perPage = opts.perPage ?? 20;
      pagination = paginateResponse([], total, page, perPage).pagination;
      list = list.slice((page - 1) * perPage, page * perPage);
    }

    return {
      conversations: list,
      tab: opts.tab,
      counts: { clients: countOf('clients'), inquiries: countOf('inquiries') },
      ...(pagination ? { pagination } : {}),
    };
  }

  // get conversation by id
  async findOne(id: string, userId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: id,
        participants: {
          some: {
            userId: userId,
          },
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar: true,
              },
            },
          },
        },
        messages: {
          orderBy: {
            createdAt: 'asc',
          },
          include: {
            sender: {
              select: {
                id: true,
                name: true,
                avatar: true,
              },
            },
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException(
        'Conversation not found or you are not a participant.',
      );
    }

    const opponent = conversation.is_group ? null : conversation.participants.find((p) => p.userId !== userId);
    const formattedConversation = {
      id: conversation.id,
      // 1:1 only
      ...(opponent ? await blockState(this.prisma, userId, opponent.userId) : {}),
      participants: conversation.participants.map((p) => ({
        userId: p.user.id,
        name: p.user.name,
        avater: p.user.avatar,
        avatar_url: p.user.avatar
          ? TanvirStorage.url(
            `${appConfig().storageUrl.avatar}/${p.user.avatar}`,
          )
          : null,
      })),
      messages: conversation.messages.map((msg) => ({
        id: msg.id,
        text: msg.text,
        createdAt: msg.createdAt,
        sender: {
          id: msg.sender.id,
          name: msg.sender.name,
          avatar: msg.sender.avatar
            ? TanvirStorage.url(
              `${appConfig().storageUrl.avatar}/${msg.sender.avatar}`,
            )
            : null,
        },
      })),
    };

    return {
      message: 'Conversation retrieved successfully',
      success: true,
      conversation: formattedConversation,
    };
  }

  // delete conversation
  async remove(id: string, userId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: id,
        participants: {
          some: {
            userId: userId,
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException(
        'Conversation not found or you are not a participant.',
      );
    }

    await this.prisma.conversation.delete({
      where: {
        id: id,
      },
    });

    return {
      message: 'Conversation deleted successfully',
      success: true,
    };
  }


  // People this user can start a chat with: only the other party of their own bookings.
  // (Previously returned every user's name and email to any logged-in user.)
  async findAllUserInfo(userId: string) {
    const bookings = await this.prisma.booking.findMany({
      where: { deleted_at: null, OR: [{ customer_id: userId }, { vendor_id: userId }] },
      select: { customer_id: true, vendor_id: true },
    });
    const contactIds = [
      ...new Set(bookings.map((b) => (b.customer_id === userId ? b.vendor_id : b.customer_id))),
    ].filter((id) => id !== userId);

    const users = await this.prisma.user.findMany({
      where: { id: { in: contactIds }, deleted_at: null },
      select: {
        id: true,
        name: true,
        avatar: true,
        type: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    const formattedUsers = users.map((user) => ({
      id: user.id,
      name: user.name,
      avatar: user.avatar
        ? TanvirStorage.url(
            `${appConfig().storageUrl.avatar}/${user.avatar}`,
          )
        : null,
      type: user.type,
    }));

    return {
      message: 'Users retrieved successfully',
      success: true,
      data: formattedUsers,
    };
  }






}
