// Utilidad para notificaciones push en navegador
export const registeredServiceWorker = async () => {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Este navegador no soporta Service Workers o Push Notifications');
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    return true;
  } catch (error) {
    console.error('✗ Error registrando Service Worker:', error);
    return false;
  }
};

export const requestNotificationPermission = async () => {
  if (!('Notification' in window)) {
    console.warn('Este navegador no soporta notificaciones');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    try {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    } catch (error) {
      console.error('Error solicitando permiso de notificación:', error);
      return false;
    }
  }

  return false;
};

export const showLocalNotification = async (title: string, options?: NotificationOptions) => {
  if (!('serviceWorker' in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    registration.showNotification(title, {
      icon: '/logo-nexara-lockup.png',
      badge: '/logo-nexara-lockup.png',
      ...options,
    });
  } catch (error) {
    console.error('Error mostrando notificación:', error);
  }
};

// Hook para usar en componentes
export const useLunchBreakNotifications = () => {
  const initializeNotifications = async () => {
    const swRegistered = await registeredServiceWorker();
    if (swRegistered) {
      await requestNotificationPermission();
    }
  };

  return { initializeNotifications };
};
