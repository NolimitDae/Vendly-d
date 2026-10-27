/**
 * Where a sign-in's refresh token lives. Every sign-in is its own session (`sid`, carried in its
 * tokens), so signing in on one device never signs another out. Tokens issued before sessions
 * existed have no `sid` and keep the user's single old slot until they expire or sign out.
 */
export function sessionKeys(userId: string, sid?: string | null) {
  return sid
    ? { current: `refresh_token:${userId}:${sid}`, previous: `refresh_token_prev:${userId}:${sid}` }
    : { current: `refresh_token:${userId}`, previous: `refresh_token_prev:${userId}` };
}
