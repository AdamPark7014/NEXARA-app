'use client';

/**
 * NEXARA · TabBar
 * ----------------
 * Barra de pestañas para layouts con rutas dinámicas (detalle OT, cliente, etc.).
 * Tokens `--nx-panel-*` + acento del panel — misma densidad que PanelTabs.
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
        gap: 2,
        borderBottom: '1px solid var(--nx-panel-hairline)',
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
              padding: '9px 14px',
              marginBottom: -1,
              fontSize: 12.5,
              fontWeight: active ? 700 : 550,
              color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
              borderBottom: active
                ? '2px solid var(--panel-accent, var(--primary))'
                : '2px solid transparent',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              transition: 'color 140ms ease, border-color 140ms ease',
            }}
          >
            {t.label}
            {t.badge !== undefined && t.badge !== '' && (
              <span
                style={{
                  background: active
                    ? 'color-mix(in srgb, var(--panel-accent, var(--primary)) 16%, transparent)'
                    : 'var(--surface-2)',
                  color: active
                    ? 'var(--panel-accent, var(--primary))'
                    : 'var(--text-tertiary)',
                  border: '1px solid var(--nx-panel-hairline-soft)',
                  borderRadius: 999,
                  padding: '1px 6px',
                  fontSize: 10.5,
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
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
