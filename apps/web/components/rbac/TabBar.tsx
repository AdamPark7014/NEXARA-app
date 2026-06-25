'use client';

/**
 * NEXARA · TabBar
 * ----------------
 * Barra de pestañas accesible reutilizable para los layouts tabulados
 * Barra de pestañas para layouts con rutas dinámicas (p. ej. detalle de oportunidad).
 *
 * - Detecta la pestaña activa por `pathname` (match exacto o prefijo).
 * - Mantiene navegación con `next/link` para no romper streaming.
 * - Soporta filtrado por rol (mismo patrón que `useCanAccess`).
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { useUser } from '@/components/UserContext';
import type { RoleKey } from '@/lib/rbac';

export type TabItem = {
  id: string;
  label: string;
  /** Path final. Si empieza con `/`, se usa tal cual; si no, se concatena con `baseHref`. */
  href: string;
  /** Roles que pueden ver la pestaña. Vacío = todos los autenticados. */
  roles?: RoleKey[];
  /** Badge opcional (string o número). */
  badge?: string | number;
};

export type TabBarProps = {
  tabs: TabItem[];
  /** Prefijo común. Útil para layouts con :id dinámico. */
  baseHref?: string;
};

export function TabBar({ tabs, baseHref = '' }: TabBarProps) {
  const pathname = usePathname() ?? '';
  const { user } = useUser();
  const role = ((user?.roleKey as RoleKey | undefined) || (user?.role as RoleKey | undefined) || null);
  const isSuper = Boolean(user?.isSuperAdmin);

  const visible = useMemo(() => {
    return tabs.filter((t) => {
      if (!t.roles || t.roles.length === 0) return true;
      if (isSuper) return true;
      return role ? t.roles.includes(role) : false;
    });
  }, [tabs, role, isSuper]);

  return (
    <nav
      role="tablist"
      style={{
        display: 'flex',
        gap: 4,
        borderBottom: '1px solid #e5e7eb',
        overflowX: 'auto',
        marginBottom: 16,
      }}
    >
      {visible.map((t) => {
        const fullHref = t.href.startsWith('/') ? t.href : `${baseHref}${t.href}`;
        const active = pathname === fullHref || pathname.startsWith(fullHref + '/');
        return (
          <Link
            key={t.id}
            href={fullHref}
            role="tab"
            aria-selected={active}
            style={{
              padding: '10px 16px',
              fontSize: 14,
              fontWeight: active ? 600 : 500,
              color: active ? '#0f172a' : '#64748b',
              borderBottom: active ? '2px solid #2563eb' : '2px solid transparent',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              transition: 'color 120ms, border-color 120ms',
            }}
          >
            {t.label}
            {t.badge !== undefined && t.badge !== '' && (
              <span
                style={{
                  background: active ? '#2563eb' : '#e2e8f0',
                  color: active ? '#fff' : '#475569',
                  borderRadius: 10,
                  padding: '1px 8px',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {t.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export default TabBar;
