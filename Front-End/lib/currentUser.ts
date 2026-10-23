import { Fetch } from "./Fetch";

/**
 * The website's login token is in an HttpOnly cookie that page scripts can't read (or decode), so
 * who is logged in comes from the API.
 */
export async function whoAmI(): Promise<{ id: string | null; type: string | null }> {
  try {
    const res = await Fetch.get("/auth/me");
    const d = res.data?.success ? res.data.data : null;
    return { id: d?.id ?? null, type: d?.type ?? null };
  } catch {
    return { id: null, type: null };
  }
}

/**
 * A two-minute token for the Socket.IO handshake (sockets connect to the API directly and can't
 * use the cookie). Asked for again on every (re)connect, so it is always fresh. Null when logged out.
 */
export async function fetchSocketToken(): Promise<{ token: string; user_id: string } | null> {
  try {
    const res = await Fetch.get("/auth/socket-token");
    const d = res.data?.success ? res.data.data : null;
    return d?.token ? { token: d.token, user_id: d.user_id } : null;
  } catch {
    return null;
  }
}

/** For socket.io's `auth` option: hands each (re)connection a fresh socket token. */
export function socketAuth(first?: string | null) {
  let initial = first ?? null;
  return (cb: (data: object) => void) => {
    if (initial) {
      const token = initial;
      initial = null;
      cb({ token });
      return;
    }
    fetchSocketToken().then((t) => cb(t ? { token: t.token } : {}));
  };
}
