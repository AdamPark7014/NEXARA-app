'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Página de redirect de dashboard genérica.
 * Redirige al usuario a su panel HOME según su rol desde localStorage.
 * 
 * Si `smartRedirect` está habilitado en PanelLogin, esta ruta
 * nunca debería ser alcanzada. Esta es un fallback safety.
 */
export default function DashboardRedirect() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    try {
      // Verificar si está autenticado (cookie/localStorage)
      const token = localStorage.getItem('nexara_access_token');
      const userStr = localStorage.getItem('nexara_user');

      if (!token || !userStr) {
        // No autenticado → ir al login
        router.replace('/login');
        return;
      }

      // Intentar parsear el usuario
      const user = JSON.parse(userStr);
      
      // Mapeo simple: rol → panel home
      let homeUrl = '/erp/executive'; // default
      
      if (user.orgRoleKey === 'designer') {
        homeUrl = '/studio';
      } else if (user.orgRoleKey === 'field_engineer') {
        homeUrl = '/ops';
      } else if (user.orgRoleKey?.includes('director') || user.orgRoleKey === 'ceo') {
        homeUrl = '/erp/executive';
      }

      setIsChecking(false);
      router.replace(homeUrl);
    } catch (error) {
      console.error('Error en dashboard redirect:', error);
      router.replace('/login');
    }
  }, [router]);

  if (isChecking) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column' }}>
        <p>Redirigiendo a tu panel...</p>
      </div>
    );
  }

  return null;
}
