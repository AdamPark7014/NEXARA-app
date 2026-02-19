"use client";
import { useState } from 'react';
import { useNotifications } from '../lib/useNotifications';
import { useUser } from './UserContext';
import { hasPermission, PERMISSIONS } from '../lib/permissions';

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
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        background: 'var(--primary)',
        color: 'var(--surface)',
        padding: '12px',
        textAlign: 'center',
        zIndex: 1000,
        fontWeight: 600,
        letterSpacing: 1,
        boxShadow: '0 2px 8px var(--shadow)',
      }}
    >
      {message}
    </div>
  );
}
