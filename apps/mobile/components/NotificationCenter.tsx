"use client";
import React, { useCallback, useState, useEffect, useRef } from 'react';
import { useUser } from './UserContext';
import { io, Socket } from 'socket.io-client';
import { getSocketBaseUrl } from '@/lib/api-base';
import styles from './NotificationCenter.module.css';

interface Notification {
  id: number;
  userId: number;
  type: string;
  category: string;
  title: string;
  message: string;
  triggerUser?: {
    id: number;
    nombre: string;
    avatarUrl?: string;
  };
  relatedUrl?: string;
  priority?: 'high' | 'normal' | 'low';
  isRead: boolean;
  readAt?: string;
  createdAt: string;
}

interface NotificationCenterProps {
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  maxNotifications?: number;
  autoCloseTime?: number;
  inlineTrigger?: boolean;
  mirrorToSystemNotifications?: boolean;
}

const getCategoryIcon = (category: string): string => {
  const icons: Record<string, string> = {
    attendance: '⏰',
    lunch_breaks: '🍽️',
    activities: '✨',
    evidences: '📸',
    viatics: '💰',
    tools: '🔨',
    fines: '⚠️',
    profile: '👤',
    vehicles: '🚗',
    quotes: '💼',
    orders: '📦',
    projects: '📊',
    general: '📢',
  };
  return icons[category] || '📬';
};

const getPriorityClass = (priority?: string): string => {
  if (priority === 'high') return styles.priorityHigh;
  if (priority === 'low') return styles.priorityLow;
  return styles.priorityNormal;
};

const getCategoryClass = (category: string): string => {
  const key = String(category || '').toLowerCase();
  if (key === 'attendance') return styles.catAttendance;
  if (key === 'lunch_breaks') return styles.catLunchBreaks;
  if (key === 'activities') return styles.catActivities;
  if (key === 'evidences') return styles.catEvidences;
  if (key === 'viatics') return styles.catViatics;
  if (key === 'tools') return styles.catTools;
  if (key === 'fines') return styles.catFines;
  if (key === 'profile') return styles.catProfile;
  if (key === 'vehicles') return styles.catVehicles;
  if (key === 'quotes') return styles.catQuotes;
  if (key === 'orders') return styles.catOrders;
  if (key === 'projects') return styles.catProjects;
  return styles.catGeneral;
};

const getPositionClass = (position: NotificationCenterProps['position']) => {
  if (position === 'top-left') return styles.posTopLeft;
  if (position === 'bottom-right') return styles.posBottomRight;
  if (position === 'bottom-left') return styles.posBottomLeft;
  return styles.posTopRight;
};

const getToastAnchorClass = (position: NotificationCenterProps['position']) => {
  const vertical = position?.startsWith('bottom') ? styles.toastBottom : styles.toastTop;
  const horizontal = position?.endsWith('left') ? styles.toastLeft : styles.toastRight;
  return `${vertical} ${horizontal}`;
};

const getStackClass = (index: number) => {
  if (index <= 0) return styles.stack0;
  if (index === 1) return styles.stack1;
  if (index === 2) return styles.stack2;
  if (index === 3) return styles.stack3;
  if (index === 4) return styles.stack4;
  return styles.stack5;
};

const formatTime = (isoDate: string) =>
  new Date(isoDate).toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  });

const formatDateTime = (isoDate: string) =>
  new Date(isoDate).toLocaleString('es-MX', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const trySystemNotification = (title: string, body: string, tag: string) => {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  const Sys = window.Notification;
  if (Sys.permission !== 'granted') return;
  try {
    new Sys(title, { body, tag });
  } catch {
    /* ignore */
  }
};

const NotificationCenter: React.FC<NotificationCenterProps> = ({
  position = 'top-right',
  maxNotifications = 5,
  autoCloseTime = 5000,
  inlineTrigger = false,
  mirrorToSystemNotifications = false,
}) => {
  const { user } = useUser();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [displayedNotifications, setDisplayedNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showPanel, setShowPanel] = useState(false);
  const [sysNotifyPermission, setSysNotifyPermission] = useState<'default' | 'denied' | 'granted' | 'unsupported'>('unsupported');
  const bellButtonRef = useRef<HTMLButtonElement | null>(null);
  const sidePanelRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const notificationTimers = useRef<Map<number, NodeJS.Timeout>>(new Map());

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

  useEffect(() => {
    if (!mirrorToSystemNotifications || typeof window === 'undefined') return;
    if (!('Notification' in window)) {
      setSysNotifyPermission('unsupported');
      return;
    }
    setSysNotifyPermission(window.Notification.permission);
  }, [mirrorToSystemNotifications]);

  const fetchNotifications = useCallback(async () => {
    if (!user?.token) return;
    try {
      const response = await fetch(`${API_URL}/notifications?limit=10`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      const data = await response.json();
      const items = Array.isArray(data) ? (data as Notification[]) : [];
      setNotifications(items);
      setDisplayedNotifications([]);

      const unread = items.filter((n: Notification) => !n.isRead).length;
      setUnreadCount(unread);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  }, [user?.token, API_URL]);

  useEffect(() => {
    const onNativePush = () => {
      void fetchNotifications();
    };
    window.addEventListener('nexara-native-push', onNativePush);
    return () => window.removeEventListener('nexara-native-push', onNativePush);
  }, [fetchNotifications]);

  // Conectar WebSocket
  useEffect(() => {
    if (!user?.token) return;

    const socketUrl = getSocketBaseUrl();
    socketRef.current = io(socketUrl, {
      transports: ['polling'],
      upgrade: false,
      timeout: 20000,
      reconnectionAttempts: 8,
      auth: {
        token: user.token,
      },
    });
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        fetchNotifications();
      }, 300);
    };

    // Eventos de notificaciones
    socketRef.current.on('notification:new', (notification: Notification) => {
      setNotifications(prev => {
        if (prev.some(item => item.id === notification.id)) return prev;
        return [notification, ...prev];
      });
      setDisplayedNotifications(prev => {
        if (prev.some(item => item.id === notification.id)) return prev;
        return [notification, ...prev].slice(0, maxNotifications);
      });
      setUnreadCount(prev => (notification.isRead ? prev : prev + 1));

      if (mirrorToSystemNotifications) {
        trySystemNotification(
          notification.title,
          notification.message,
          `nexara-notification-${notification.id}`,
        );
      }

      // Auto cerrar notificación
      const timer = setTimeout(() => {
        setDisplayedNotifications(prev =>
          prev.filter(n => n.id !== notification.id)
        );
      }, autoCloseTime);

      notificationTimers.current.set(notification.id, timer);
    });

    socketRef.current.on('notification:read', ({ notificationId }: { notificationId: number }) => {
      setNotifications(prev =>
        prev.map(n =>
          n.id === notificationId ? { ...n, isRead: true } : n
        )
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    });

    socketRef.current.on('notifications:read-all', () => {
      setNotifications(prev =>
        prev.map(n => ({ ...n, isRead: true }))
      );
      setUnreadCount(0);
    });

    socketRef.current.on('entity:updated', (payload: { model?: string }) => {
      if (!payload?.model) return;
      if (['Notification', 'UserNotification'].includes(payload.model)) {
        scheduleRefresh();
      }
    });

    return () => {
      socketRef.current?.disconnect();
      notificationTimers.current.forEach(timer => clearTimeout(timer));
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [user?.token, maxNotifications, autoCloseTime, fetchNotifications, mirrorToSystemNotifications]);

  // Cargar notificaciones iniciales
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    if (!showPanel) return;
    notificationTimers.current.forEach((timer) => clearTimeout(timer));
    notificationTimers.current.clear();
    setDisplayedNotifications([]);
  }, [showPanel]);

  const handleMarkAsRead = async (notificationId: number) => {
    try {
      await fetch(`${API_URL}/notifications/${notificationId}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${user?.token}` },
      });
      setNotifications(prev => prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n)));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await fetch(`${API_URL}/notifications/read/all`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${user?.token}` },
      });
      setNotifications(prev => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const handleDeleteNotification = async (notificationId: number) => {
    try {
      await fetch(`${API_URL}/notifications/${notificationId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${user?.token}` },
      });
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      setDisplayedNotifications(prev => prev.filter(n => n.id !== notificationId));
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  const handleNotificationActivate = (notification: Notification) => {
    if (!notification.isRead) {
      handleMarkAsRead(notification.id);
    }
    if (notification.relatedUrl) {
      window.location.href = notification.relatedUrl;
    }
  };

  const handleNotificationKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, notification: Notification) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleNotificationActivate(notification);
    }
  };

  useEffect(() => {
    if (!showPanel) return;

    const panel = sidePanelRef.current;
    if (!panel) return;

    const getFocusable = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute('disabled') && element.tabIndex !== -1);

    const initialFocusable = getFocusable();
    initialFocusable[0]?.focus();

    const handlePanelKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setShowPanel(false);
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = getFocusable();
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (!activeElement || activeElement === first || !panel.contains(activeElement)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (!activeElement || activeElement === last || !panel.contains(activeElement)) {
        event.preventDefault();
        first.focus();
      }
    };

    panel.addEventListener('keydown', handlePanelKeyDown);
    return () => {
      panel.removeEventListener('keydown', handlePanelKeyDown);
      bellButtonRef.current?.focus();
    };
  }, [showPanel]);

  return (
    <>
      {/* Campana con badge */}
      {!showPanel && (
        <div className={inlineTrigger ? styles.inlineRoot : `${styles.floatingRoot} ${getPositionClass(position)}`}>
          <button
            ref={bellButtonRef}
            type="button"
            onClick={() => setShowPanel(!showPanel)}
            className={styles.bellBtn}
            aria-label="Abrir panel de notificaciones"
            aria-expanded={showPanel}
            aria-controls="notification-side-panel"
          >
            🔔
            {unreadCount > 0 && (
              <span className={styles.badge}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Panel de notificaciones mostradas */}
      {!showPanel && displayedNotifications.map((notification, index) => (
        <div
          key={notification.id}
          className={`${styles.toast} ${getToastAnchorClass(position)} ${getStackClass(index)} ${getPriorityClass(notification.priority)}`}
        >
          <div className={styles.toastRow}>
            <div className={styles.toastIcon}>{getCategoryIcon(notification.category)}</div>
            <div className={styles.toastBody}>
              <div className={styles.toastTitle}>
                {notification.title}
              </div>
              <div className={styles.toastMessage}>
                {notification.message}
              </div>
              {notification.triggerUser && (
                <div className={styles.toastUser}>
                  👤 {notification.triggerUser.nombre}
                </div>
              )}
              <div className={styles.toastTime}>
                {formatTime(notification.createdAt)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleDeleteNotification(notification.id)}
              className={styles.toastClose}
              aria-label="Cerrar notificación"
            >
              ✕
            </button>
          </div>
          {notification.relatedUrl && (
            <a
              href={notification.relatedUrl}
              onClick={() => handleMarkAsRead(notification.id)}
              className={styles.toastLink}
            >
              Ver →
            </a>
          )}
        </div>
      ))}

      {/* Panel lateral de historial */}
      {showPanel && (
        <div ref={sidePanelRef} id="notification-side-panel" className={styles.sidePanel} role="dialog" aria-modal="true" aria-label="Panel de notificaciones">
          {/* Header */}
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>
              🔔 Notificaciones
            </h2>
            <button
              type="button"
              onClick={() => setShowPanel(false)}
              className={styles.panelClose}
              aria-label="Cerrar panel de notificaciones"
            >
              ✕
            </button>
          </div>

          {mirrorToSystemNotifications && sysNotifyPermission === 'default' && (
            <div className={styles.systemNotifyRow}>
              <button
                type="button"
                className={styles.systemNotifyBtn}
                onClick={async () => {
                  if (!('Notification' in window)) return;
                  const next = await window.Notification.requestPermission();
                  setSysNotifyPermission(next);
                }}
              >
                Activar avisos del sistema
              </button>
              <span className={styles.systemNotifyHint}>Recibe alertas aunque cambies de pestaña.</span>
            </div>
          )}

          {/* Stats */}
          {unreadCount > 0 && (
            <div className={styles.statsBar}>
              <div className={styles.statsText}>
                📬 {unreadCount} no leída{unreadCount !== 1 ? 's' : ''}
              </div>
              <button
                type="button"
                onClick={handleMarkAllAsRead}
                className={styles.markAllBtn}
              >
                Marcar todo como leído
              </button>
            </div>
          )}

          {/* Lista */}
          <div className={styles.listWrap}>
            {notifications.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>📭</div>
                <div className={styles.emptyTitle}>
                  No hay notificaciones
                </div>
                <div className={styles.emptyHint}>
                  Aquí aparecerán tus notificaciones
                </div>
              </div>
            ) : (
              notifications.map(notification => {
                return (
                  <div
                    key={notification.id}
                    onClick={() => handleNotificationActivate(notification)}
                    onKeyDown={(event) => handleNotificationKeyDown(event, notification)}
                    role="button"
                    tabIndex={0}
                    aria-label={`Notificación: ${notification.title}`}
                    className={`${styles.item} ${getCategoryClass(notification.category)} ${notification.isRead ? '' : styles.itemUnread} ${notification.relatedUrl ? styles.itemClickable : ''}`}
                  >
                    <div className={styles.itemRow}>
                      <div className={styles.itemIcon}>{getCategoryIcon(notification.category)}</div>
                      <div className={styles.itemBody}>
                        <div className={`${styles.itemTitle} ${notification.isRead ? '' : styles.itemTitleUnread}`}>
                          {notification.title}
                          {!notification.isRead && (
                            <span className={styles.unreadDot} />
                          )}
                        </div>
                        <div className={styles.itemMessage}>
                          {notification.message}
                        </div>
                        <div className={styles.itemTime}>
                          {formatDateTime(notification.createdAt)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          handleDeleteNotification(notification.id);
                        }}
                        className={styles.itemDelete}
                        aria-label="Eliminar notificación"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Overlay para cerrar panel */}
      {showPanel && (
        <div onClick={() => setShowPanel(false)} className={styles.overlay} aria-hidden="true" />
      )}
    </>
  );
};

export default NotificationCenter;
