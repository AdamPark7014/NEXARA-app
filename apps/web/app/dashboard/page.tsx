'use client';

import { useEffect, useState } from 'react';
import { getUserHomeUrlAbsolute } from '@/lib/panel-home';
import { getSharedCookie, SHARED_COOKIE_KEYS } from '@/lib/shared-cookies';

const USER_STORAGE_KEY = 'nexara_user';

function readSessionUser(): Record<string, unknown> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(USER_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Redirige al panel HOME del usuario activo en esta pestaña.
 */
export default function DashboardRedirect() {
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    try {
      const sessionUser = readSessionUser();
      if (sessionUser?.token) {
        const homeUrl = getUserHomeUrlAbsolute(sessionUser);
        setIsChecking(false);
        window.location.href = homeUrl;
        return;
      }

      const tokenFromCookie = getSharedCookie(SHARED_COOKIE_KEYS.ACCESS_TOKEN);
      const userFromCookie = getSharedCookie(SHARED_COOKIE_KEYS.USER);

      if (tokenFromCookie && userFromCookie) {
        const user = JSON.parse(userFromCookie);
        const homeUrl = getUserHomeUrlAbsolute(user);
        setIsChecking(false);
        window.location.href = homeUrl;
        return;
      }

      window.location.href = '/login';
    } catch (error) {
      console.error('Error en dashboard redirect:', error);
      window.location.href = '/login';
    }
  }, []);

  if (isChecking) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column' }}>
        <p>Redirigiendo a tu panel...</p>
      </div>
    );
  }

  return null;
}
