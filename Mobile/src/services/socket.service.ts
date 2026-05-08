import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

let socket: Socket | null = null;

async function getSocket(): Promise<Socket> {
  if (socket?.connected) return socket;

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

  async emitTyping(to: string, data: any) {
    const s = await getSocket();
    s.emit('typing', { to, data });
  },

  async emitStopTyping(to: string, data: any) {
    const s = await getSocket();
    s.emit('stopTyping', { to, data });
  },

  disconnect() {
    socket?.disconnect();
    socket = null;
  },
};
