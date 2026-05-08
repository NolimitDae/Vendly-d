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
      extraHeaders: { authorization: `Bearer ${token}` },
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
