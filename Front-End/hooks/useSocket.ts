"use client";

import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import { CookieHelper } from "@/helper/cookie.helper";
import { URL as API_URL } from "@/config/app.config";

export function useSocket(): Socket | null {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const token = CookieHelper.get({ key: "token" });
    if (!token) return;

    const sock = io(API_URL, {
      // Browsers can't send custom headers on a WebSocket, so the token goes in the handshake `auth`
      // payload. It's a function so every (re)connection reads the latest, possibly refreshed, token.
      auth: (cb) => cb({ token: CookieHelper.get({ key: "token" }) }),
      transports: ["websocket"],
      reconnectionAttempts: 5,
    });

    setSocket(sock);

    return () => {
      sock.disconnect();
      setSocket(null);
    };
  }, []);

  return socket;
}
