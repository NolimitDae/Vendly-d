import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class NotificationService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    receiver_id: string;
    sender_id?: string;
    type?: string;
    text?: string;
    entity_id?: string;
  }) {
    const event = await this.prisma.notificationEvent.create({
      data: { type: data.type, text: data.text },
    });

    return this.prisma.notification.create({
      data: {
        receiver_id: data.receiver_id,
        sender_id: data.sender_id,
        notification_event_id: event.id,
        entity_id: data.entity_id,
      },
    });
  }

  async findAllForUser(userId: string) {
    const notifications = await this.prisma.notification.findMany({
      where: { receiver_id: userId, deleted_at: null },
      orderBy: { created_at: 'desc' },
      take: 50,
      include: {
        notification_event: true,
        sender: { select: { id: true, name: true, avatar: true } },
      },
    });

    return {
      success: true,
      data: notifications,
      unread: notifications.filter((n) => !n.read_at).length,
    };
  }

  async markRead(id: string, userId: string) {
    await this.prisma.notification.updateMany({
      where: { id, receiver_id: userId },
      data: { read_at: new Date() },
    });
    return { success: true };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { receiver_id: userId, read_at: null },
      data: { read_at: new Date() },
    });
    return { success: true };
  }

  async remove(id: string, userId: string) {
    await this.prisma.notification.updateMany({
      where: { id, receiver_id: userId },
      data: { deleted_at: new Date() },
    });
    return { success: true };
  }
}
