import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private prisma: PrismaService) {}

  async sendToUser(
    userId: string,
    payload: { title: string; body: string; data?: Record<string, unknown> },
  ) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { push_token: true },
      });
      if (!user?.push_token) return;

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
