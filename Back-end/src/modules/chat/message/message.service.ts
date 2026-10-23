import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import appConfig from "../../../config/app.config";
import { CreateMessageDto } from "./dto/create-message.dto";
import { PrismaService } from "../../../prisma/prisma.service";
import { TanvirStorage } from '../../../common/lib/Disk/TanvirStorage';
import { MessageGateway } from "./message.gateway";
import { StringHelper } from "src/common/helper/string.helper";
import { paginateResponse, PaginationDto } from "src/common/pagination";
import { ChatRepository } from "../../../common/repository/chat/chat.repository";
import { contactReasons, CONTACT_WARNING } from "../extras/contact-warning";
import { avatarUrl, formatMessage, messageInclude } from "../extras/format";

// Temporary enum until Prisma generates it
enum MessageStatus {
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  READ = 'READ',
  PENDING = 'PENDING',
}

@Injectable()
export class MessageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messageGateway: MessageGateway,
  ) { }

  // *Send message (with Prisma transaction)
  async create(
    createMessageDto: CreateMessageDto,
    sender: string,
    files?: Express.Multer.File[],
  ) {
    const { text, conversationId } = createMessageDto;

    const participant = await this.prisma.participant.findFirst({
      where: { conversationId, userId: sender },
    });

    if (!participant) {
      throw new UnauthorizedException(
        "You are not a participant of this conversation.",
      );
    }

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { participants: true },
    });

    if (!conversation) {
      throw new NotFoundException("Conversation not found");
    }

    const savedFileNames: string[] = [];

    if (files && files.length > 0) {
      for (const file of files) {
        const fileName = `${StringHelper.randomString(8)}_${file.originalname}`;
        await TanvirStorage.put(
          appConfig().storageUrl.attachment + "/" + fileName,
          file.buffer,
        );
        savedFileNames.push(fileName);
      }
    }

    const reasons = contactReasons(text);
    const message = await this.prisma.message.create({
      data: {
        text,
        conversationId,
        senderId: sender,
        status: MessageStatus.SENT,
        attachments: savedFileNames.length > 0 ? savedFileNames : [],
        contact_flagged: reasons.length > 0,
      },
      include: messageInclude,
    });

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    const formatted = formatMessage(message);

    // note: socket implementation for message sending
    const senderSocketId = this.messageGateway.clients.get(sender);

    if (senderSocketId) {
      this.messageGateway.server
        .to(conversationId)
        .except(senderSocketId)
        .emit("message", {
          from: sender,
          data: formatted,
        });
    } else {
      this.messageGateway.server.to(conversationId).emit("message", {
        from: sender,
        data: formatted,
      });
    }

    /*
     socket.on('message', (msg) => {
      console.log('New message received:', msg);
    });
    */

    return {
      message: "Message sent successfully",
      success: true,
      data: formatted,
      // non-blocking: the apps show this as a reminder under the message
      warning: reasons.length ? { reasons, text: CONTACT_WARNING } : null,
    };
  }

  // *get all messages for a conversation
  async findAll(
    conversationId: string,
    userId: string,
    paginationdto: PaginationDto,
  ) {
    const { page, perPage } = paginationdto;
    const skip = (page - 1) * perPage;
    const take = perPage;
    const whereClause = { conversationId };

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true, name: true, email: true, avatar: true },
            },
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException("Conversation not found");
    }

    const isParticipant = conversation.participants.some(
      (p) => p.userId === userId,
    );
    if (!isParticipant) {
      throw new UnauthorizedException(
        "You are not a participant of this conversation.",
      );
    }

    const receiverParticipant = conversation.is_group
      ? null
      : conversation.participants.find((p) => p.userId !== userId);

    let formattedReceiver = null;
    if (receiverParticipant) {
      formattedReceiver = {
        id: receiverParticipant.user.id,
        name: receiverParticipant.user.name,
        email: receiverParticipant.user.email,
        avatar_url: receiverParticipant.user.avatar
          ? TanvirStorage.url(
            `${appConfig().storageUrl.avatar}/${receiverParticipant.user.avatar}`,
          )
          : null,
      };
    }

    const [totalMessages, messages] = await this.prisma.$transaction([
      this.prisma.message.count({ where: whereClause }),
      this.prisma.message.findMany({
        where: whereClause,
        include: messageInclude,
        orderBy: { createdAt: "asc" },
        skip,
        take,
      }),
    ]);

    // who has read up to when (read receipts), plus group details and the pinned message
    const pinned = conversation.pinned_message_id
      ? await this.prisma.message.findFirst({ where: { id: conversation.pinned_message_id, conversationId }, include: messageInclude })
      : null;
    const conversationInfo = {
      id: conversation.id,
      is_group: conversation.is_group,
      title: conversation.title,
      event_id: conversation.event_id,
      pinned: pinned ? formatMessage(pinned) : null,
      participants: conversation.participants.map((p) => ({
        id: p.user.id,
        name: p.user.name,
        role: p.role,
        avatar_url: avatarUrl(p.user.avatar),
        last_read_at: p.lastReadAt,
      })),
    };

    if (totalMessages === 0) {
      return {
        message: "No messages found",
        success: true,
        conversation: conversationInfo,
        data: paginateResponse([], page, perPage, totalMessages),
      };
    }

    const formattedMessages = messages.map((msg) => ({
      ...formatMessage(msg),
      receiver: formattedReceiver,
    }));

    const paginationResult = paginateResponse(
      formattedMessages,
      page,
      perPage,
      totalMessages,
    );

    return {
      message: "Messages retrieved successfully",
      success: true,
      conversation: conversationInfo,
      ...paginationResult,
    };
  }

  // Delete a message
  async deleteMessage(userId: string, messageId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        sender: true,
      },
    });

    if (!message) {
      throw new NotFoundException("Message not found");
    }

    if (message.senderId !== userId) {
      throw new UnauthorizedException(
        "You are not authorized to delete this message.",
      );
    }

    await this.prisma.$transaction(async (tx) => {

      await tx.message.delete({
        where: { id: messageId },
      });

      if (message.attachments && message.attachments.length > 0) {
        for (const fname of message.attachments) {
          await TanvirStorage.delete(
            `${appConfig().storageUrl.attachment}/${fname}`,
          );
        }
      }
    });

    return {
      message: "Message deleted successfully",
      success: true,
    };
  }


  // unread message count
  async getUnreadMessage(userId: string, conversationId: string) {
    const participant = await this.prisma.participant.findFirst({
      where: { conversationId, userId },
    });

    if (!participant) {
      throw new UnauthorizedException(
        "You are not a participant of this conversation.",
      );
    }

    const lastReadAt = participant.lastReadAt || new Date(0);

    const whereClause = {
      conversationId,
      NOT: { status: MessageStatus.READ },
      senderId: { not: userId },
      createdAt: { gt: lastReadAt },
    };

    const [unreadCount, unreadMessages] = await this.prisma.$transaction([
      this.prisma.message.count({ where: whereClause }),
      this.prisma.message.findMany({
        where: whereClause,
        orderBy: { createdAt: "asc" },
        include: {
          sender: {
            select: { id: true, name: true, email: true, avatar: true },
          },
        },
      }),
    ]);

    const formattedMessages = unreadMessages.map((msg) => ({
      id: msg.id,
      text: msg.text,
      senderName: msg.sender.name,
      attachments: (msg.attachments || []).map((f) =>
        TanvirStorage.url(`${appConfig().storageUrl.attachment}/${f}`),
      ),
    }));

    return {
      message: "Unread message count retrieved successfully",
      success: true,
      data: {
        count: unreadCount,
        messages: formattedMessages,
      },
    };
  }

  // Mark messages as read
  async readMessages(userId: string, conversationId: string) {
    const participant = await this.prisma.participant.findFirst({
      where: { conversationId, userId },
    });

    if (!participant) {
      throw new UnauthorizedException(
        "You are not a participant of this conversation.",
      );
    }

    const lastReadAt = participant.lastReadAt || new Date(0);
    const readAt = new Date();

    const members = await this.prisma.$transaction(async (tx) => {
      await tx.message.updateMany({
        where: {
          conversationId,
          senderId: { not: userId },
          status: { not: "READ" },
          createdAt: { gt: lastReadAt, lte: readAt },
        },
        data: { status: "READ" },
      });

      await tx.participant.update({
        where: { id: participant.id },
        data: { lastReadAt: readAt },
      });

      return tx.participant.findMany({ where: { conversationId }, select: { userId: true } });
    });
    // read receipts: everyone in the chat learns how far this user has read. User rooms too, so
    // senders whose socket reconnected (and lost the conversation room) and the reader's other
    // tabs/devices (unread badges) still hear it; socket.io sends once per socket across rooms.
    const rooms = [conversationId, ...(members ?? []).map((m) => `user_${m.userId}`)];
    this.messageGateway.server?.to(rooms).emit("conversationRead", { conversation_id: conversationId, user_id: userId, read_at: readAt });

    return {
      message: "Messages marked as read successfully",
      success: true,
      data: { conversation_id: conversationId, read_at: readAt },
    };
  }


}
