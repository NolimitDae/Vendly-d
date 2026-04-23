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
      throw new ConflictException('Cannot create conversation with yourself');
    }

    // check if conversation already exists between the two users
    const existingConversation = await this.prisma.conversation.findFirst({
      where: {
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
            attachments: true,
            createdAt: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    const formattedConversations = conversations.map((conv) => {

      const opponentParticipant = conv.participants.find(
        (p) => p.userId !== userId,
      );

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
        opponent: opponentData,
        lastMessage: conv.messages[0] ? {
          text: conv.messages[0].text,
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

    const formattedConversation = {
      id: conversation.id,
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


  // user information
  async findAllUserInfo(userId: string) {
    
    const users = await this.prisma.user.findMany({
      where: {
        id: {not: userId},
      },
      select: {
        id: true,
        name: true,
        email: true,
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
      email: user.email,
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
