'use client';

import { buildApiUrl } from "@/lib/api-base";
import { useEffect, useState } from 'react';
import { useUser } from '@/components/UserContext';
import { hasAnyPermission, PERMISSIONS } from '@/lib/permissions';
import styles from './page.module.css';

type Notification = {
  id: number;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
  relatedUrl?: string;
};

const notificationIcons: Record<string, string> = {
  QUOTE_EXPIRING: '⏰',
  QUOTE_EXPIRED: '❌',
  QUOTE_SIGNED: '✅',
  ORDER_CREATED: '📦',
  PROJECT_COMPLETED: '🎉',
  VIATICO_APPROVED: '💰',
  VIATICO_REJECTED: '❌',
  EVIDENCE_SUBMITTED: '📋',
  EVIDENCE_APPROVED: '✅',
  EVIDENCE_REJECTED: '❌',
  ACTIVITY_ASSIGNED: '📌',
  ACTIVITY_COMPLETED: '🏁',
  SALES_CLIENT_CREATED: '👤',
  SALES_LEAD_CREATED: '🎯',
  SALES_OPPORTUNITY_CREATED: '💼',
  SALES_OPPORTUNITY_STAGE_CHANGED: '📈',
  USER_ACTION_CONFIRMED: '✅',
  PURCHASE_REQUISITION_CREATED: '📋',
  PURCHASE_REQUISITION_APPROVED: '✅',
  PURCHASE_REQUISITION_REJECTED: '❌',
  PURCHASE_ORDER_CREATED: '🛒',
  PURCHASE_ORDER_APPROVED: '✅',
  GOODS_RECEIPT_POSTED: '📦',
  STOCK_MOVEMENT_POSTED: '↔️',
  QUALITY_NCR_CREATED: '⚠️',
};

export default function VentasNotificationsPage() {
  const { user } = useUser();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const canAccessSalesPanel = hasAnyPermission(user, [PERMISSIONS.PANEL_VENTAS, PERMISSIONS.SALES_VIEW]);
  const isSalesAdminOrSuperAdmin = Boolean(user?.isSuperAdmin) || hasAnyPermission(user, [PERMISSIONS.CONSOLE_ADMIN]);

  const fetchNotifications = async () => {
    if (!user?.token) return;
    try {
      const res = await fetch(buildApiUrl('ventas/reportes/notificaciones?limit=50'), {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(Array.isArray(data) ? data : []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.token) return;
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [user?.token]);

  const handleMarkAsRead = async (notificationId: number) => {
    if (!user?.token) return;
    await fetch(buildApiUrl(`ventas/reportes/notificaciones/${notificationId}/read`), {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${user.token}` },
    });
    setNotifications((prev) => prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n)));
  };

  const handleMarkAllAsRead = async () => {
    if (!user?.token) return;
    await fetch(buildApiUrl('ventas/reportes/notificaciones/read/all'), {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${user.token}` },
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const handleDelete = async (notificationId: number) => {
    if (!user?.token) return;
    await fetch(buildApiUrl(`ventas/reportes/notificaciones/${notificationId}`), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${user.token}` },
    });
    setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
  };

  const filteredNotifications = notifications.filter((n) => (filter === 'unread' ? !n.isRead : true));
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  if (!canAccessSalesPanel) {
    return <div className={styles.loading}>No tienes permisos para ver notificaciones de ventas.</div>;
  }

  if (loading) return <div className={styles.loading}>Cargando notificaciones...</div>;

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Notificaciones de ventas</h1>
          <p>
            {unreadCount} sin leer · {isSalesAdminOrSuperAdmin ? 'Vista admin/superadmin (equipo vendedor)' : 'Vista vendedor (solo tus notificaciones)'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button className={styles.button} onClick={handleMarkAllAsRead}>
            Marcar todo como leído
          </button>
        )}
      </header>

      <div className={styles.filters}>
        <button className={filter === 'all' ? styles.activeFilter : styles.filter} onClick={() => setFilter('all')}>
          Todas ({notifications.length})
        </button>
        <button className={filter === 'unread' ? styles.activeFilter : styles.filter} onClick={() => setFilter('unread')}>
          Sin leer ({unreadCount})
        </button>
      </div>

      <div className={styles.list}>
        {filteredNotifications.length === 0 && <p className={styles.empty}>No hay notificaciones para mostrar.</p>}
        {filteredNotifications.map((notification) => (
          <article key={notification.id} className={`${styles.card} ${notification.isRead ? '' : styles.unread}`}>
            <div className={styles.icon}>{notificationIcons[notification.type] || '📬'}</div>
            <div className={styles.content}>
              <h3>{notification.title}</h3>
              <p>{notification.message}</p>
              <small>{new Date(notification.createdAt).toLocaleString('es-MX')}</small>
            </div>
            <div className={styles.actions}>
              {!notification.isRead && (
                <button className={styles.action} onClick={() => handleMarkAsRead(notification.id)}>
                  Leída
                </button>
              )}
              <button className={styles.action} onClick={() => handleDelete(notification.id)}>
                Eliminar
              </button>
              {notification.relatedUrl && (
                <a className={styles.actionLink} href={notification.relatedUrl}>
                  Abrir
                </a>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
