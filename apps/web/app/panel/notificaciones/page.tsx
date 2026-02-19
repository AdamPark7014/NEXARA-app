'use client';

import React, { useEffect, useState } from 'react';
import { useUser } from '@/components/UserContext';
import styles from './page.module.css';

interface Notification {
  id: number;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
  relatedUrl?: string;
}

const notificationIcons: Record<string, string> = {
  QUOTE_EXPIRING: '⏰',
  QUOTE_EXPIRED: '❌',
  QUOTE_SIGNED: '✅',
  ORDER_CREATED: '📦',
  PROJECT_COMPLETED: '🎉',
  VIATICO_APPROVED: '💰',
  VIATICO_REJECTED: '❌',
};

const notificationColors: Record<string, string> = {
  QUOTE_EXPIRING: '#f59e0b',
  QUOTE_EXPIRED: '#ef5350',
  QUOTE_SIGNED: '#10b981',
  ORDER_CREATED: '#0f6ad6',
  PROJECT_COMPLETED: '#8b5cf6',
  VIATICO_APPROVED: '#10b981',
  VIATICO_REJECTED: '#ef5350',
};

export default function NotificationsPage() {
  const { user } = useUser();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  useEffect(() => {
    if (!user?.token) return;
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [user?.token]);

  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/notifications?limit=50', {
        headers: { Authorization: `Bearer ${user?.token}` },
      });
      if (res.ok) {
        setNotifications(await res.json());
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (notificationId: number) => {
    try {
      await fetch(`/api/notifications/${notificationId}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${user?.token}` },
      });
      setNotifications(notifications.map(n =>
        n.id === notificationId ? { ...n, isRead: true } : n
      ));
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await fetch('/api/notifications/read/all', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${user?.token}` },
      });
      setNotifications(notifications.map(n => ({ ...n, isRead: true })));
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const handleDelete = async (notificationId: number) => {
    try {
      await fetch(`/api/notifications/${notificationId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${user?.token}` },
      });
      setNotifications(notifications.filter(n => n.id !== notificationId));
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  const filteredNotifications = notifications.filter(n =>
    filter === 'unread' ? !n.isRead : true
  );

  const unreadCount = notifications.filter(n => !n.isRead).length;

  if (loading) {
    return <div className={styles.loading}>Cargando notificaciones...</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1>Notificaciones</h1>
          {unreadCount > 0 && (
            <p className={styles.unreadInfo}>{unreadCount} sin leer</p>
          )}
        </div>
        <div className={styles.actions}>
          {unreadCount > 0 && (
            <button
              className={styles.markAllBtn}
              onClick={handleMarkAllAsRead}
            >
              Marcar todo como leído
            </button>
          )}
        </div>
      </div>

      <div className={styles.filters}>
        <button
          className={styles.filterBtn + (filter === 'all' ? ' ' + styles.active : '')}
          onClick={() => setFilter('all')}
        >
          Todas ({notifications.length})
        </button>
        <button
          className={styles.filterBtn + (filter === 'unread' ? ' ' + styles.active : '')}
          onClick={() => setFilter('unread')}
        >
          Sin leer ({unreadCount})
        </button>
      </div>

      {filteredNotifications.length === 0 ? (
        <div className={styles.empty}>
          <p>
            {filter === 'all'
              ? 'No tienes notificaciones'
              : 'No tienes notificaciones sin leer'}
          </p>
        </div>
      ) : (
        <div className={styles.list}>
          {filteredNotifications.map(notification => (
            <div
              key={notification.id}
              className={styles.item + (notification.isRead ? '' : ' ' + styles.unread)}
            >
              <div
                className={styles.icon}
                style={{ background: notificationColors[notification.type] || '#0f6ad6' }}
              >
                {notificationIcons[notification.type] || '📬'}
              </div>

              <div className={styles.content}>
                <h3 className={styles.title}>{notification.title}</h3>
                <p className={styles.message}>{notification.message}</p>
                <p className={styles.time}>
                  {new Date(notification.createdAt).toLocaleString('es-MX')}
                </p>
              </div>

              <div className={styles.itemActions}>
                {!notification.isRead && (
                  <button
                    className={styles.readBtn}
                    onClick={() => handleMarkAsRead(notification.id)}
                    title="Marcar como leído"
                  >
                    ✓
                  </button>
                )}
                {notification.relatedUrl && (
                  <a
                    href={notification.relatedUrl}
                    className={styles.linkBtn}
                    title="Ver detalles"
                  >
                    →
                  </a>
                )}
                <button
                  className={styles.deleteBtn}
                  onClick={() => handleDelete(notification.id)}
                  title="Eliminar"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
