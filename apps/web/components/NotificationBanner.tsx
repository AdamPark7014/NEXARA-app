"use client";
import { useState } from 'react';
import { useNotifications } from '../lib/useNotifications';
import { useUser } from './UserContext';
import { hasPermission, PERMISSIONS } from '../lib/permissions';
import styles from './NotificationBanner.module.css';

export function NotificationBanner() {
  const [message, setMessage] = useState<string | null>(null);
  const { user } = useUser();

  useNotifications((payload) => {
    if (payload && typeof payload === 'object' && (payload as any).adminOnly) {
      if (!hasPermission(user, PERMISSIONS.CONSOLE_ADMIN)) return;
    }

    if (payload && typeof payload === 'object' && 'message' in payload) {
      setMessage((payload as { message?: string }).message || 'Nueva notificación');
    } else {
      setMessage('Nueva notificación');
    }
    setTimeout(() => setMessage(null), 5000);
  });

  if (!message) return null;
  return (
    <div className={styles.banner}>
      {message}
    </div>
  );
}
