'use client';

import { useEffect, useState } from 'react';
import { getUserHomeUrlAbsolute } from '@/lib/panel-home';
import { getSharedCookie, SHARED_COOKIE_KEYS } from '@/lib/shared-cookies';

/**
 * Página de redirect de dashboard genérica.
 * Redirige al usuario a su panel HOME según su rol desde cookies compartidas (cross-subdomain).
 * 
 * Maneja redirecciones cross-subdomain (ej: core → studio).
 */
export default function DashboardRedirect() {
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    try {
      // 1. Intentar leer de cookies compartidas (cross-subdomain)
      const tokenFromCookie = getSharedCookie(SHARED_COOKIE_KEYS.ACCESS_TOKEN);
      const userFromCookie = getSharedCookie(SHARED_COOKIE_KEYS.USER);

      if (tokenFromCookie && userFromCookie) {
        const user = JSON.parse(userFromCookie);
        const homeUrl = getUserHomeUrlAbsolute(user);
        setIsChecking(false);
        window.location.href = homeUrl;
        return;
      }

      // 2. Fallback: intentar leer de localStorage (mismo subdominio)
      const token = localStorage.getItem('nexara_access_token');
      const userStr = localStorage.getItem('nexara_user');

      if (!token || !userStr) {
        // No autenticado → ir al login
        window.location.href = '/login';
        return;
      }

      // Parsear usuario
      const user = JSON.parse(userStr);

      // Usar función centralizada para obtener el URL home con subdominio
      const homeUrl = getUserHomeUrlAbsolute(user);
      setIsChecking(false);
      window.location.href = homeUrl;
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
