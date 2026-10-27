import { INestApplication } from '@nestjs/common';

/**
 * Access tokens only work while their sign-in exists (JwtStrategy). The suites sign their own tokens
 * without a session id, so each user gets the single old sign-in slot those tokens belong to.
 */
export async function signedIn(app: INestApplication, userIds: string[]) {
  const redis = app.get('default_IORedisModuleConnectionToken');
  for (const id of userIds) await redis.set(`refresh_token:${id}`, 'e2e', 'EX', 3600);
}
