import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationTopic, wants } from 'src/common/helper/notification-prefs';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private prisma: PrismaService) {}

  /** Keeps a copy in the user's notification inbox (app + website), even if they have no push token. */
  private async record(userId: string, payload: { title: string; body: string; data?: Record<string, unknown> }) {
    try {
      const d = payload.data ?? {};
      const entity = (d.bookingId ?? d.conversationId ?? d.eventId ?? null) as string | null;
      const event = await this.prisma.notificationEvent.create({
        data: { type: typeof d.type === 'string' ? d.type : 'general', text: `${payload.title}: ${payload.body}`.slice(0, 1000) },
      });
      await this.prisma.notification.create({ data: { receiver_id: userId, notification_event_id: event.id, entity_id: entity } });
    } catch (err) {
      this.logger.warn(`Inbox record for ${userId} failed: ${(err as Error).message}`);
    }
  }

  /**
   * `topic` marks an optional push the user can turn off in their notification settings (it still
   * goes to their inbox). Leave it out for anything they must get (security, disputes, contracts).
   */
  async sendToUser(
    userId: string,
    payload: { title: string; body: string; data?: Record<string, unknown> },
    topic?: NotificationTopic,
  ) {
    await this.record(userId, payload);
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { push_token: true, notification_prefs: true },
      });
      if (!user?.push_token) return;
      if (!wants(user.notification_prefs, topic, 'push')) return;

      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ to: user.push_token, sound: 'default', ...payload }),
      });
      const json: any = await res.json().catch(() => null);
      if (json?.data?.details?.error === 'DeviceNotRegistered') {
        await this.prisma.user.update({ where: { id: userId }, data: { push_token: null } });
      }
    } catch (err) {
      this.logger.warn(`Push to ${userId} failed: ${(err as Error).message}`);
    }
  }
}
