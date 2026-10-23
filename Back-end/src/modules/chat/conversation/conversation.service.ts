import {
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
import { blockSets, blockState } from '../safety/block';

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

  //  *conversation list of user
  async findAll(userId: string) {

    const conversations = await this.prisma.conversation.findMany({
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

    return {
      message: 'Conversations retrieved successfully',
      success: true,
      conversations: formattedConversations,
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
