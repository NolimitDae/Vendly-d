import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

let socket: Socket | null = null;
// the socket being opened right now: callers that arrive while the token is read share it
let opening: Promise<Socket> | null = null;

async function getSocket(): Promise<Socket> {
  // `active` covers a socket that is still connecting or reconnecting; opening another one then
  // would split listeners and joined rooms across two connections.
  if (socket?.connected || socket?.active) return socket;
  if (opening) return opening;

  opening = (async () => {
    const token = await AsyncStorage.getItem('token');
    socket = io(BASE_URL, {
      transports: ['websocket'],
      auth: { token },
      extraHeaders: { Authorization: `Bearer ${token}` },
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });
    return socket;
  })();
  try {
    return await opening;
  } finally {
    opening = null;
  }
}

export const SocketService = {
  connect: getSocket,

  async joinRoom(conversationId: string) {
    const s = await getSocket();
    s.emit('joinroom', { room_id: conversationId });
  },

  async onMessage(cb: (data: any) => void) {
    const s = await getSocket();
    s.on('message', cb);
  },

  async offMessage(cb?: (data: any) => void) {
    if (!socket) return;
    if (cb) {
      socket.off('message', cb);
    } else {
      socket.off('message');
    }
  },

  /** Any other server event: conversationRead, userTyping, userStoppedTyping, pinned, quoteUpdated, connect. */
  async on(event: string, cb: (data: any) => void) {
    const s = await getSocket();
    s.on(event, cb);
  },

  off(event: string, cb: (data: any) => void) {
    socket?.off(event, cb);
  },

  /** Typing indicator: the server checks we're in the conversation and tells the others. */
  async emitTyping(conversationId: string) {
    const s = await getSocket();
    s.emit('typing', { conversation_id: conversationId });
  },

  async emitStopTyping(conversationId: string) {
    const s = await getSocket();
    s.emit('stopTyping', { conversation_id: conversationId });
  },

  disconnect() {
    socket?.disconnect();
    socket = null;
    // a socket still being opened (e.g. during sign-out) is closed as soon as it exists
    opening?.then((s) => s.disconnect()).catch(() => {});
  },
};
