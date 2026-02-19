import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';

export function useNotifications(callback?: (payload: any) => void) {
  useEffect(() => {
    if (!callback) return;
    const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/.]+$/, '');
    const socketUrl = API_URL.replace(/\/+api\/?$/, '');
    const socket: Socket = io(socketUrl, { transports: ['websocket'] });

    socket.on('notification', (payload) => {
      callback(payload);
    });

    return () => {
      socket.disconnect();
    };
  }, [callback]);

  return { notifications: [] };
}
