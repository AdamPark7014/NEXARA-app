import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { getSocketBaseUrl } from './api-base';

export function useNotifications(callback?: (payload: any) => void) {
  useEffect(() => {
    if (!callback) return;
    const socketUrl = getSocketBaseUrl();
    const socket: Socket = io(socketUrl, {
      transports: ['polling'],
      upgrade: false,
      timeout: 20000,
      reconnectionAttempts: 8,
    });

    socket.on('notification', (payload) => {
      callback(payload);
    });

    return () => {
      socket.disconnect();
    };
  }, [callback]);

  return { notifications: [] };
}
