'use client';

/**
 * NEXARA · RbacPageGuard
 * ----------------------
 * Componente de servidor-friendly que envuelve un layout y bloquea la
 * renderización si el rol activo no tiene permitida la URL actual
 * (según `lib/rbac/page-matrix.ts`).
 *
 * Uso:
 *   <RbacPageGuard>
 *     {children}
 *   </RbacPageGuard>
 *
 * - Mientras el contexto del usuario carga, muestra placeholder.
 * - Si el usuario no tiene acceso, redirige a `/paneles` y muestra mensaje breve.
 * - Si está autorizado, renderiza los children sin overhead.
 *
 * Compatibilidad: si el usuario aún no tiene `roleKey` (pre-migración),
 * usa `role` legacy como fallback.
 */
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useUser } from '@/components/UserContext';
import { canOpenPage, type RoleKey } from '@/lib/rbac';

export type RbacPageGuardProps = {
  children: React.ReactNode;
  /** Mostrar mientras se valida el usuario. */
  fallback?: React.ReactNode;
  /** A dónde redirigir si no tiene acceso (default: /paneles). */
  denyRedirect?: string;
};

export function RbacPageGuard({ children, fallback, denyRedirect = '/paneles' }: RbacPageGuardProps) {
  const { user, isContextReady } = useUser();
  const pathname = usePathname() ?? '/';
  const router = useRouter();

  const role: RoleKey | null =
    (user?.roleKey as RoleKey | undefined) ||
    (user?.role as RoleKey | undefined) ||
    null;

  const allowed = role ? canOpenPage(role, pathname) : false;
  const superadmin = Boolean(user?.isSuperAdmin);

  useEffect(() => {
    if (!isContextReady) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!superadmin && role && !allowed) {
      router.replace(`${denyRedirect}?denied=${encodeURIComponent(pathname)}`);
    }
  }, [isContextReady, user, role, allowed, superadmin, pathname, router, denyRedirect]);

  if (!isContextReady) {
    return (
      fallback ?? (
        <div style={{ minHeight: '40vh', display: 'grid', placeItems: 'center', color: '#64748b' }}>
          Cargando…
        </div>
      )
    );
  }

  if (!user) return null;
  if (!superadmin && (!role || !allowed)) return null;

  return <>{children}</>;
}

export default RbacPageGuard;
