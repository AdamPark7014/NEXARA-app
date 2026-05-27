'use client';

/**
 * NEXARA · DynamicSidebar v2
 * --------------------------
 * Sidebar único, neutro al panel. Renderiza navegación filtrada por rol
 * y reemplaza a los sidebars hardcoded por subdominio:
 *   - apps/web/app/(subdomains)/console/Sidebar.tsx
 *   - apps/web/app/(subdomains)/ventas/VentasSidebar.tsx
 *   - apps/web/app/(subdomains)/operacion/OperacionSidebar.tsx
 *   - navGroups hardcoded en contabilidad/layout.tsx
 *
 * Características:
 *   - Drawer móvil con overlay (hamburguesa + escape + lock scroll)
 *   - Búsqueda en vivo del menú
 *   - User card (avatar, nombre, email, rol)
 *   - Botones de logout y theme toggle
 *   - Preferencia roleKey (RBAC v2) > role legacy
 *
 * Uso:
 *   <DynamicSidebar panel="core" />
 */
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { filterNavByRole, getNavForPanel, type PanelKey, type RoleKey } from '@/lib/rbac';
import { useUser } from '@/components/UserContext';
import { useTheme } from '@/components/ThemeContext';
import { getAvatarSrc, getRoleLabel } from '@/lib/panel-user';
import { isPanelDrawerViewport } from '@/lib/panel-drawer-breakpoint';
import './DynamicSidebar.css';

export type DynamicSidebarProps = {
  panel: PanelKey;
  /** Etiqueta del panel mostrada en el header (ej. "Consola", "Ventas"). */
  panelLabel?: string;
  /** Override del rol (útil para preview / desarrollo). */
  forceRole?: RoleKey;
};

const PANEL_LABELS: Record<PanelKey, string> = {
  core: 'Consola',
  sales: 'Ventas',
  ops: 'Operación',
  studio: 'Estudio',
  portal: 'Portal',
};

export function DynamicSidebar({ panel, panelLabel, forceRole }: DynamicSidebarProps) {
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const { user, logout } = useUser();
  const { darkMode, toggleDarkMode } = useTheme();

  const [isMobile, setIsMobile] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [mobileOpenGroups, setMobileOpenGroups] = useState<string[]>([]);
  const [navQuery, setNavQuery] = useState('');
  const [brandLogoSrc, setBrandLogoSrc] = useState('/icon.png');

  // Preferencia: roleKey (RBAC v2) > role legacy
  const role: RoleKey | null =
    forceRole ??
    ((user?.roleKey as RoleKey | undefined) || (user?.role as RoleKey | undefined)) ??
    null;

  // Responsive
  useEffect(() => {
    const check = () => setIsMobile(isPanelDrawerViewport(window.innerWidth));
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Cerrar al navegar (móvil)
  useEffect(() => {
    if (isMobile) {
      setIsMenuOpen(false);
      setMobileOpenGroups([]);
    }
  }, [pathname, isMobile]);

  // Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMenuOpen) setIsMenuOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isMenuOpen]);

  // Body scroll lock móvil
  useEffect(() => {
    if (!isMobile) return;
    document.body.style.overflow = isMenuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobile, isMenuOpen]);

  const groups = useMemo(() => {
    if (!role) return [];
    return filterNavByRole(getNavForPanel(panel), role);
  }, [panel, role]);

  const normalizedQuery = navQuery.trim().toLowerCase();
  const filteredGroups = useMemo(() => {
    if (!normalizedQuery) return groups;
    return groups
      .map(g => ({
        ...g,
        items: g.items.filter(i => i.label.toLowerCase().includes(normalizedQuery)),
      }))
      .filter(g => g.items.length > 0);
  }, [groups, normalizedQuery]);

  const groupsToRender = filteredGroups;

  const closeMenu = () => {
    setIsMenuOpen(false);
    setMobileOpenGroups([]);
  };

  const toggleMobileGroup = (id: string) => {
    setMobileOpenGroups(prev =>
      prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id],
    );
  };

  const handleLogout = () => {
    logout();
    closeMenu();
    router.replace('/login');
  };

  if (!user || !role) return null;

  const label = panelLabel ?? PANEL_LABELS[panel];
  const avatarUrl = getAvatarSrc(user);
  const roleLabel = getRoleLabel(user);

  return (
    <aside
      className="nx-sidebar"
      data-mobile={isMobile ? 'true' : 'false'}
      data-open={isMenuOpen ? 'true' : 'false'}
      aria-label="Navegación principal"
    >
      <div className="nx-sidebar__header">
        <div className="nx-sidebar__brand">
          <img
            src={brandLogoSrc}
            alt="NEXARA"
            className="nx-sidebar__brand-logo"
            onError={() => setBrandLogoSrc('/icon.png')}
          />
          <span className="nx-sidebar__brand-mark">NEXARA</span>
          {isMobile && <span className="nx-sidebar__brand-sub">{label}</span>}
        </div>
        {isMobile && (
          <button
            type="button"
            className="nx-sidebar__hamburger"
            onClick={() => setIsMenuOpen(p => !p)}
            aria-label={isMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={isMenuOpen}
            aria-controls="nx-sidebar-menu"
            data-open={isMenuOpen ? 'true' : 'false'}
          >
            <span /><span /><span />
          </button>
        )}
      </div>

      {isMobile && isMenuOpen && (
        <div className="nx-sidebar__overlay" onClick={closeMenu} role="presentation" />
      )}

      {(!isMobile || isMenuOpen) && (
        <div className="nx-sidebar__content" id="nx-sidebar-menu">
          <div className="nx-sidebar__user">
            <div className="nx-sidebar__avatar">
              <Image
                src={avatarUrl}
                alt={user.isSuperAdmin ? 'NEXARA' : user.nombre}
                width={64}
                height={64}
                priority={false}
                loading="lazy"
                unoptimized
              />
            </div>
            <div className="nx-sidebar__name">{user.nombre}</div>
            <div className="nx-sidebar__email">{user.email}</div>
            <div className="nx-sidebar__meta">
              {user.isSuperAdmin ? (
                <span className="nx-sidebar__pill nx-sidebar__pill--level">Superadmin</span>
              ) : (
                <span className="nx-sidebar__pill nx-sidebar__pill--role">{roleLabel}</span>
              )}
            </div>
          </div>

          <div className="nx-sidebar__search">
            <input
              type="search"
              placeholder="🔍 Buscar en el menú…"
              value={navQuery}
              onChange={e => setNavQuery(e.target.value)}
              aria-label="Buscar en el menú"
            />
            {navQuery && (
              <button
                type="button"
                onClick={() => setNavQuery('')}
                aria-label="Limpiar búsqueda"
                className="nx-sidebar__search-clear"
              >
                ✕
              </button>
            )}
          </div>

          {groupsToRender.length === 0 && normalizedQuery && (
            <div className="nx-sidebar__empty">Sin resultados para “{navQuery}”</div>
          )}

          <nav className="nx-sidebar__nav">
            {groupsToRender.map(group => {
              const expanded = !isMobile || mobileOpenGroups.includes(group.id);
              return (
                <section key={group.id} className="nx-sidebar__group">
                  {isMobile ? (
                    <button
                      type="button"
                      className="nx-sidebar__group-toggle"
                      onClick={() => toggleMobileGroup(group.id)}
                      aria-expanded={expanded}
                    >
                      <span>{group.title}</span>
                      <span className={`nx-sidebar__chevron${expanded ? ' is-open' : ''}`}>▾</span>
                    </button>
                  ) : (
                    <h3 className="nx-sidebar__group-title">{group.title}</h3>
                  )}
                  {expanded && (
                    <ul className="nx-sidebar__items">
                      {group.items.map(item => {
                        const active =
                          pathname === item.href || pathname.startsWith(item.href + '/');
                        return (
                          <li key={item.id}>
                            <Link
                              href={item.href}
                              className={`nx-sidebar__link${active ? ' is-active' : ''}`}
                              aria-current={active ? 'page' : undefined}
                              onClick={closeMenu}
                            >
                              {item.icon && (
                                <span
                                  className={`nx-icon nx-icon--${item.icon}`}
                                  aria-hidden="true"
                                />
                              )}
                              <span className="nx-sidebar__label">{item.label}</span>
                              {item.badge && (
                                <span
                                  className={`nx-sidebar__badge nx-sidebar__badge--${item.badge}`}
                                >
                                  {item.badge}
                                </span>
                              )}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              );
            })}
          </nav>

          <div className="nx-sidebar__footer">
            <button
              type="button"
              onClick={toggleDarkMode}
              className="nx-sidebar__theme"
              aria-label={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              title={darkMode ? 'Modo claro' : 'Modo oscuro'}
            >
              <span aria-hidden="true">●</span>
              <span>{darkMode ? 'Vista oscura' : 'Vista clara'}</span>
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="nx-sidebar__logout"
              aria-label="Cerrar sesión"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}

export default DynamicSidebar;
