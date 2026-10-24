/**
 * Injection token for the live bell (the NotificationGateway), so services can update open apps
 * without importing the gateway class itself, whose decorator reads the app config on import.
 */
export const LIVE_NOTIFIER = 'LIVE_NOTIFIER';

export interface LiveNotifier {
  notifyUser(userId: string, data: Record<string, unknown>): Promise<void>;
}
