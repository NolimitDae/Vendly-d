import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class NotificationService {

  constructor(private prisma: PrismaService) {}

  // Get all notifications for the authenticated user
  async findAllNotificationsForUser(userId: string) {
    const notifications = await this.prisma.notification.findMany({
      where: { receiver_id: userId },
      orderBy: { created_at: 'desc' },
    });

    return {
      success: true,
      message: 'Notifications retrieved successfully',
      data: notifications,
    }
  }

  // Delete notification by id for the authenticated user
  async deleteNotificationForUser(
    notificationId: string, 
    userId: string
  ) {
  
    const notification = await this.prisma.notification.delete({
      where: {
        id: notificationId,
        receiver_id: userId,
      },
    });

    return {
      success: true,
      message: 'Notification deleted successfully',
      data: notification,
    }
  }







}
