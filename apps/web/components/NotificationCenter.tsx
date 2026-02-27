"use client";
import React, { useState, useEffect, useRef } from 'react';
import { useUser } from './UserContext';
import { io, Socket } from 'socket.io-client';

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

const getPriorityColor = (priority?: string): string => {
  switch (priority) {
    case 'high':
      return '#d64545'; // danger red (consola)
    case 'low':
      return '#a9c0ea'; // tertiary text (consola)
    default:
      return '#0f6ad6'; // primary blue (consola)
  }
};

const getCategoryColors = (category: string): { bg: string; text: string } => {
  const categoryConfig: Record<string, { bg: string; text: string }> = {
    attendance: { bg: '#eff6ff', text: '#0f6ad6' }, // blue
    lunch_breaks: { bg: '#f0fdf4', text: '#16a96e' }, // green
    activities: { bg: '#fef3c7', text: '#f59e0b' }, // amber
    evidences: { bg: '#fce7f3', text: '#ec4899' }, // pink
    viatics: { bg: '#ecfdf5', text: '#10b981' }, // teal
    tools: { bg: '#f3e8ff', text: '#8b5cf6' }, // purple
    fines: { bg: '#fee2e2', text: '#ef4444' }, // red
    profile: { bg: '#f5f3ff', text: '#6f6ee8' }, // indigo
    vehicles: { bg: '#fef2f2', text: '#d64545' }, // dark red
    quotes: { bg: '#f0f9ff', text: '#1f8df2' }, // info
    orders: { bg: '#f7f9fc', text: '#23324a' }, // gray
    projects: { bg: '#f5f7fa', text: '#344560' }, // slate
    general: { bg: '#f9fafb', text: '#6b7280' }, // gray
  };
  return categoryConfig[category] || categoryConfig.general;
};

const NotificationCenter: React.FC<NotificationCenterProps> = ({
  position = 'top-right',
  maxNotifications = 5,
  autoCloseTime = 5000,
}) => {
  const { user } = useUser();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [displayedNotifications, setDisplayedNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showPanel, setShowPanel] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const notificationTimers = useRef<Map<number, NodeJS.Timeout>>(new Map());

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
  const getSocketBaseUrl = () => API_URL.replace(/\/+api\/?$/, '');

  // Conectar WebSocket
  useEffect(() => {
    if (!user?.token) return;

    const socketUrl = getSocketBaseUrl();
    socketRef.current = io(socketUrl, {
      transports: ['websocket'],
      auth: {
        token: user.token,
      },
    });

    // Eventos de notificaciones
    socketRef.current.on('notification:new', (notification: Notification) => {
      setNotifications(prev => [notification, ...prev]);
      setDisplayedNotifications(prev => [notification, ...prev].slice(0, maxNotifications));
      setUnreadCount(prev => prev + 1);

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

    return () => {
      socketRef.current?.disconnect();
      notificationTimers.current.forEach(timer => clearTimeout(timer));
    };
  }, [user?.token, maxNotifications, autoCloseTime]);

  // Cargar notificaciones iniciales
  useEffect(() => {
    if (!user?.token) return;

    const fetchNotifications = async () => {
      try {
        const response = await fetch(`${API_URL}/notifications?limit=10`, {
          headers: { Authorization: `Bearer ${user.token}` },
        });
        const data = await response.json();
        setNotifications(data);

        const unread = data.filter((n: Notification) => !n.isRead).length;
        setUnreadCount(unread);
      } catch (error) {
        console.error('Error fetching notifications:', error);
      }
    };

    fetchNotifications();
  }, [user?.token]);

  const handleMarkAsRead = async (notificationId: number) => {
    try {
      await fetch(`${API_URL}/notifications/${notificationId}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${user?.token}` },
      });
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

  // Posición del panel
  const positionStyles: Record<string, React.CSSProperties> = {
    'top-right': { top: 20, right: 20 },
    'top-left': { top: 20, left: 20 },
    'bottom-right': { bottom: 20, right: 20 },
    'bottom-left': { bottom: 20, left: 20 },
  };

  return (
    <>
      {/* Campana con badge */}
      <div
        style={{
          position: 'fixed',
          ...positionStyles[position],
          zIndex: 9999,
          cursor: 'pointer',
        }}
      >
        <button
          onClick={() => setShowPanel(!showPanel)}
          style={{
            position: 'relative',
            background: 'linear-gradient(135deg, #0f6ad6 0%, #1789FC 100%)',
            border: '2px solid rgba(31, 141, 242, 0.3)',
            color: '#fff',
            padding: '12px 14px',
            borderRadius: '12px',
            fontSize: '20px',
            cursor: 'pointer',
            width: '50px',
            height: '50px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(15, 106, 214, 0.35), 0 2px 8px rgba(15, 106, 214, 0.2)',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
          onMouseEnter={e => {
            const target = e.currentTarget as HTMLButtonElement;
            target.style.transform = 'translateY(-2px)';
            target.style.boxShadow = '0 12px 32px rgba(15, 106, 214, 0.4), 0 4px 12px rgba(15, 106, 214, 0.25)';
          }}
          onMouseLeave={e => {
            const target = e.currentTarget as HTMLButtonElement;
            target.style.transform = 'translateY(0)';
            target.style.boxShadow = '0 8px 24px rgba(15, 106, 214, 0.35), 0 2px 8px rgba(15, 106, 214, 0.2)';
          }}
        >
          🔔
          {unreadCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: '-5px',
                right: '-5px',
                background: 'linear-gradient(135deg, #d64545 0%, #ef4444 100%)',
                color: '#fff',
                borderRadius: '50%',
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
                fontWeight: '700',
                border: '2px solid #fff',
                boxShadow: '0 4px 12px rgba(214, 69, 69, 0.4)',
              }}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* Panel de notificaciones mostradas */}
      {displayedNotifications.map(notification => (
        <div
          key={notification.id}
          style={{
            position: 'fixed',
            ...positionStyles[position],
            top: positionStyles[position].top!,
            right: positionStyles[position].right,
            left: positionStyles[position].left,
            marginTop: displayedNotifications.indexOf(notification) * 80 + 'px',
            zIndex: 10000,
            minWidth: '350px',
            maxWidth: '400px',
            background: '#fff',
            border: `3px solid ${getPriorityColor(notification.priority)}`,
            borderRadius: '8px',
            padding: '12px',
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.15)',
            animation: 'slideIn 0.3s ease-out',
          }}
        >
          <div style={{ display: 'flex', gap: '10px' }}>
            <div
              style={{
                fontSize: '20px',
                marginTop: '2px',
              }}
            >
              {getCategoryIcon(notification.category)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#1f2937' }}>
                {notification.title}
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                {notification.message}
              </div>
              {notification.triggerUser && (
                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                  👤 {notification.triggerUser.nombre}
                </div>
              )}
              <div style={{ fontSize: '10px', color: '#d1d5db', marginTop: '6px' }}>
                {new Date(notification.createdAt).toLocaleTimeString('es-MX')}
              </div>
            </div>
            <button
              onClick={() => handleDeleteNotification(notification.id)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '18px',
                color: '#d1d5db',
              }}
            >
              ✕
            </button>
          </div>
          {notification.relatedUrl && (
            <a
              href={notification.relatedUrl}
              onClick={() => handleMarkAsRead(notification.id)}
              style={{
                display: 'block',
                marginTop: '8px',
                padding: '6px 8px',
                background: '#f3f4f6',
                borderRadius: '4px',
                textAlign: 'center',
                fontSize: '11px',
                color: '#3b82f6',
                textDecoration: 'none',
                fontWeight: '500',
              }}
            >
              Ver →
            </a>
          )}
        </div>
      ))}

      {/* Panel lateral de historial */}
      {showPanel && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            width: '420px',
            height: '100vh',
            background: '#f7f9fc',
            boxShadow: '-8px 0 32px rgba(15, 32, 64, 0.15), -2px 0 8px rgba(15, 32, 64, 0.08)',
            zIndex: 9998,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '18px 20px',
              background: 'linear-gradient(135deg, #f7f9fc 0%, #eaf1fc 100%)',
              borderBottom: '1px solid rgba(31, 77, 159, 0.1)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#0b1220' }}>
              🔔 Notificaciones
            </h2>
            <button
              onClick={() => setShowPanel(false)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '24px',
                cursor: 'pointer',
                color: '#344560',
                transition: 'color 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = '#0f6ad6')}
              onMouseLeave={e => (e.currentTarget.style.color = '#344560')}
            >
              ✕
            </button>
          </div>

          {/* Stats */}
          {unreadCount > 0 && (
            <div
              style={{
                padding: '14px 16px',
                background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                borderBottom: '1px solid #bfdbfe',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <div style={{ fontSize: '13px', color: '#0f6ad6', fontWeight: '600' }}>
                📬 {unreadCount} no leída{unreadCount !== 1 ? 's' : ''}
              </div>
              <button
                onClick={handleMarkAllAsRead}
                style={{
                  background: 'linear-gradient(135deg, #0f6ad6 0%, #1789FC 100%)',
                  color: '#fff',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(15, 106, 214, 0.3)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                Marcar todo como leído
              </button>
            </div>
          )}

          {/* Lista */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              background: '#f7f9fc',
            }}
          >
            {notifications.length === 0 ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  color: '#a9c0ea',
                  gap: '8px',
                  padding: '20px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '42px' }}>📭</div>
                <div style={{ fontSize: '13px', fontWeight: '500' }}>
                  No hay notificaciones
                </div>
                <div style={{ fontSize: '11px', color: '#cfe0ff' }}>
                  Aquí aparecerán tus notificaciones
                </div>
              </div>
            ) : (
              notifications.map(notification => {
                const colors = getCategoryColors(notification.category);
                return (
                  <div
                    key={notification.id}
                    onClick={() => {
                      if (!notification.isRead) {
                        handleMarkAsRead(notification.id);
                      }
                      if (notification.relatedUrl) {
                        window.location.href = notification.relatedUrl;
                      }
                    }}
                    style={{
                      padding: '14px 16px',
                      borderBottom: '1px solid #e1e7f1',
                      cursor: notification.relatedUrl ? 'pointer' : 'default',
                      background: notification.isRead ? '#fff' : colors.bg,
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => {
                      const div = e.currentTarget as HTMLDivElement;
                      div.style.background = colors.bg;
                      div.style.paddingLeft = '18px';
                    }}
                    onMouseLeave={e => {
                      const div = e.currentTarget as HTMLDivElement;
                      div.style.background = notification.isRead ? '#fff' : colors.bg;
                      div.style.paddingLeft = '16px';
                    }}
                  >
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                      <div
                        style={{
                          fontSize: '18px',
                          flexShrink: 0,
                          marginTop: '2px',
                        }}
                      >
                        {getCategoryIcon(notification.category)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: '12px',
                            fontWeight: notification.isRead ? '500' : '700',
                            color: notification.isRead ? '#344560' : colors.text,
                            marginBottom: '3px',
                            lineHeight: '1.3',
                          }}
                        >
                          {notification.title}
                          {!notification.isRead && (
                            <span
                              style={{
                                display: 'inline-block',
                                width: '7px',
                                height: '7px',
                                borderRadius: '50%',
                                background: colors.text,
                                marginLeft: '6px',
                                verticalAlign: 'middle',
                              }}
                            />
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: '11px',
                            color: '#344560',
                            marginBottom: '4px',
                            lineHeight: '1.35',
                          }}
                        >
                          {notification.message.substring(0, 70)}
                          {notification.message.length > 70 ? '...' : ''}
                        </div>
                        <div style={{ fontSize: '10px', color: '#a9c0ea' }}>
                          {new Date(notification.createdAt).toLocaleString('es-MX', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          handleDeleteNotification(notification.id);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#cfe0ff',
                          cursor: 'pointer',
                          fontSize: '14px',
                          padding: '0',
                          transition: 'color 0.2s',
                          flexShrink: 0,
                        }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#d64545')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#cfe0ff')}
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
        <div
          onClick={() => setShowPanel(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.3)',
            zIndex: 9997,
          }}
        />
      )}

      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(420px) scale(0.95);
            opacity: 0;
          }
          to {
            transform: translateX(0) scale(1);
            opacity: 1;
          }
        }
        
        /* Scrollbar styling para el panel */
        div::-webkit-scrollbar {
          width: 6px;
        }
        
        div::-webkit-scrollbar-track {
          background: transparent;
        }
        
        div::-webkit-scrollbar-thumb {
          background: rgba(15, 106, 214, 0.3);
          border-radius: 3px;
        }
        
        div::-webkit-scrollbar-thumb:hover {
          background: rgba(15, 106, 214, 0.5);
        }
      `}</style>
    </>
  );
};

export default NotificationCenter;
