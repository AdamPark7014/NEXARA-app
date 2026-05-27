'use client';

import { useMemo } from 'react';
import { canOpenPage, type RoleKey } from '@/lib/rbac';
import { useUser } from '@/components/UserContext';

/**
 * Hook para esconder/mostrar elementos en UI según el rol.
 *
 *   const can = useCanAccess();
 *   {can('/core/usuarios') && <Button>Gestionar usuarios</Button>}
 */
export function useCanAccess(forceRole?: RoleKey) {
  const { user } = useUser();
  const role = forceRole ?? (user?.role as RoleKey | undefined);

  return useMemo(() => {
    return (pathname: string): boolean => {
      if (!role) return false;
      return canOpenPage(role, pathname);
    };
  }, [role]);
}
