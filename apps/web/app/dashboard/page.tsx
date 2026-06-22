'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/components/UserContext';
import { getUserHomeUrl } from '@/lib/panel-home';

/**
 * Página de redirect de dashboard genérica.
 * Redirige al usuario a su panel HOME según su rol.
 * 
 * Esto es útil como fallback después del login si no se puede
 * usar `smartRedirect` en PanelLogin.
 */
export default function DashboardRedirect() {
  const router = useRouter();
  const { user } = useUser();

  useEffect(() => {
    if (!user) {
      // No está autenticado, volver al login
      router.replace('/login');
      return;
    }

    // Obtener URL del home según el rol del usuario
    const homeUrl = getUserHomeUrl(user);
    
    // Redirigir al panel HOME
    if (homeUrl.startsWith('http')) {
      window.location.assign(homeUrl);
    } else {
      router.replace(homeUrl);
    }
  }, [user, router]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <p>Redirigiendo a tu panel...</p>
    </div>
  );
}
