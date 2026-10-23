"use client";

import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import { URL as API_URL } from "@/config/app.config";
import { isLoggedIn } from "@/lib/session";
import { socketAuth } from "@/lib/currentUser";

export function useSocket(): Socket | null {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (!isLoggedIn()) return;

    const sock = io(API_URL, {
      // The login token is in an HttpOnly cookie scripts can't read, and browsers can't send custom
      // headers on a WebSocket: every (re)connection asks the API for a short-lived socket token
      // and passes it in the handshake `auth` payload.
      auth: socketAuth(),
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
