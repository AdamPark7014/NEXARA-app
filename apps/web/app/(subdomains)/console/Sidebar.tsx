"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import styles from "./console.module.css";
import { useUser } from '@/components/UserContext';
import { useTheme } from '@/components/ThemeContext';
import Image from "next/image";
import { PERMISSIONS } from '@/lib/permissions';
import { getAvatarSrc, getRoleLabel, isPlatformAdmin } from '@/lib/panel-user';
import { canAccessMenuItem } from '@/lib/org-access';
import { useState, useEffect } from "react";
import { getOperacionUrl } from "@/lib/panel-urls";
import { isPanelDrawerViewport } from "@/lib/panel-drawer-breakpoint";

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useUser();
  const { darkMode, toggleDarkMode } = useTheme();
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileOpenGroups, setMobileOpenGroups] = useState<string[]>([]);
  const [brandLogoSrc, setBrandLogoSrc] = useState("/icon.png");

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(isPanelDrawerViewport(window.innerWidth));
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (isMobile) {
      setIsMenuOpen(false);
      setMobileOpenGroups([]);
    }
  }, [pathname, isMobile]);

  // Cerrar menú al hacer Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isMenuOpen) {
        closeMenu();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isMenuOpen]);

  useEffect(() => {
    if (!isMobile) return;
    document.body.style.overflow = isMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMenuOpen, isMobile]);

  const toggleMenu = () => {
    setIsMenuOpen((prev) => {
      const next = !prev;
      if (next) {
        setMobileOpenGroups([]);
      }
      return next;
    });
  };

  const closeMenu = () => {
    setIsMenuOpen(false);
    setMobileOpenGroups([]);
  };

  const handleLogout = () => {
    logout();
    closeMenu();
    router.replace('/login');
  };

  if (!user) return null;

  // Sidebar dinámico: permisos JWT + jerarquía org (sin buckets legacy ingeniero/vendedor)
  const isSuperAdmin = Boolean(user.isSuperAdmin);
  const isAdmin = !isSuperAdmin && isPlatformAdmin(user);
  const userRoleLabel = getRoleLabel(user);

  type MenuItem = {
    icon: string;
    label: string;
    href: string;
    permissions?: string[];
    anyPermissions?: string[];
  };

  type MenuGroup = {
    id: string;
    title: string;
    items: MenuItem[];
  };

  // Sidebar dinámico: permisos JWT + jerarquía org (sin buckets legacy ingeniero/vendedor)
  const canAccessItem = (item: MenuItem) => canAccessMenuItem(user, item);

  // Solo perfiles no globales ven vistas personales
  const profileItems: MenuItem[] = [];
  if (!isSuperAdmin && !isAdmin) {
    profileItems.push(
      { icon: "👤", label: "Mi perfil", href: "/my-profile", anyPermissions: [PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN] }
    );
  }

  // ── Mi espacio (solo perfil; operación en panel operacion) ──
  const employeeItems: MenuItem[] = [
    { icon: "📊", label: "Resumen ejecutivo", href: "/dashboard", anyPermissions: [PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN] },
  ];
  if (!isSuperAdmin && !isAdmin) {
    employeeItems.push(
      { icon: "🍽️", label: "Breaks y comidas", href: "/my-lunch-breaks", anyPermissions: [PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN] },
    );
  }

  const operacionLink: MenuItem = {
    icon: "🚀",
    label: "Operación de campo",
    href: getOperacionUrl("/dashboard"),
    anyPermissions: [PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN],
  };

  const peopleItems: MenuItem[] = [
    { icon: "🕒", label: "Asistencia", href: "/attendance", anyPermissions: [PERMISSIONS.ATTENDANCE_VIEW, PERMISSIONS.ATTENDANCE_MANAGE] },
    { icon: "🍽️", label: "Gestión de breaks", href: "/lunch-breaks", anyPermissions: [PERMISSIONS.LUNCH_BREAKS_MANAGE, PERMISSIONS.CONSOLE_ADMIN] },
    { icon: "⚖️", label: "Multas y sanciones", href: "/fines", anyPermissions: [PERMISSIONS.FINES_VIEW, PERMISSIONS.FINES_MANAGE, PERMISSIONS.CONSOLE_ADMIN] },
    { icon: "📄", label: "Gestión de CVs", href: "/cvs", anyPermissions: [PERMISSIONS.CVS_MANAGE, PERMISSIONS.CVS_ADMIN_REVIEW, PERMISSIONS.CVS_SUPERADMIN_REVIEW, PERMISSIONS.CONSOLE_ADMIN] },
    { icon: "🧑‍💼", label: "Gestión de usuarios", href: "/users", permissions: [PERMISSIONS.USERS_MANAGE] },
    { icon: "👥", label: "Permisos y evaluaciones", href: "/hr", anyPermissions: [PERMISSIONS.HR_VIEW, PERMISSIONS.HR_MANAGE] },
  ];

  const commercialItems: MenuItem[] = [
    { icon: "🏢", label: "Clientes corporativos", href: "/clients", anyPermissions: [PERMISSIONS.CLIENTS_VIEW, PERMISSIONS.CLIENTS_MANAGE, PERMISSIONS.CONSOLE_ADMIN] },
    { icon: "🧾", label: "Cotizaciones", href: "/cotizaciones", permissions: [PERMISSIONS.COTIZACIONES_ACCESS] },
    { icon: "📈", label: "Gestión comercial", href: "/gestion-vendedores", anyPermissions: [PERMISSIONS.SALES_MANAGE, PERMISSIONS.CONSOLE_ADMIN] },
    { icon: "📬", label: "Mensajes de contacto", href: "/contact-messages", permissions: [PERMISSIONS.CONSOLE_ADMIN] },
  ];

  const systemItems: MenuItem[] = [
    { icon: "📊", label: "Dashboard ejecutivo", href: "/executive", anyPermissions: [PERMISSIONS.EXECUTIVE_DASHBOARD, PERMISSIONS.CONSOLE_ADMIN] },
    { icon: "🛡️", label: "Mis aprobaciones", href: "/approvals", anyPermissions: [PERMISSIONS.WORKFLOW_VIEW, PERMISSIONS.CONSOLE_ADMIN] },
    { icon: "⏱️", label: "SLA Tracker", href: "/sla", anyPermissions: [PERMISSIONS.ACTIVITIES_VIEW, PERMISSIONS.CONSOLE_ADMIN] },
    { icon: "🛡️", label: "Audit log", href: "/audit", anyPermissions: [PERMISSIONS.AUDIT_VIEW, PERMISSIONS.CONSOLE_ADMIN] },
    { icon: "📥", label: "Exportaciones", href: "/exports", anyPermissions: [PERMISSIONS.SALES_REPORTS_EXPORT, PERMISSIONS.CONSOLE_ADMIN] },
    { icon: "📰", label: "Noticias y comunicados", href: "/news", permissions: [PERMISSIONS.CONSOLE_ADMIN] },
    { icon: "📧", label: "Newsletter", href: "/newsletter", permissions: [PERMISSIONS.CONSOLE_ADMIN] },
    { icon: "📅", label: "Calendario unificado", href: "/calendar", anyPermissions: [PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN] },
    { icon: "📚", label: "Knowledge Base", href: "/kb", anyPermissions: [PERMISSIONS.KB_MANAGE, PERMISSIONS.CONSOLE_ADMIN] },
    { icon: "🏢", label: "Datos de la empresa", href: "/settings", anyPermissions: [PERMISSIONS.COMPANY_SETTINGS_VIEW, PERMISSIONS.CONSOLE_ADMIN] },
    { icon: "🏛️", label: "Multi-empresa", href: "/companies", anyPermissions: [PERMISSIONS.COMPANY_SETTINGS_MANAGE, PERMISSIONS.CONSOLE_ADMIN] },
  ];

  // ── ERP Industrial ──────────────────────────────────────
  const inventoryItems: MenuItem[] = [
    { icon: "🏭", label: "Almacenes", href: "/warehouse", anyPermissions: [PERMISSIONS.WAREHOUSE_VIEW, PERMISSIONS.WAREHOUSE_MANAGE] },
    { icon: "📦", label: "Inventario / Stock", href: "/stock", anyPermissions: [PERMISSIONS.STOCK_VIEW, PERMISSIONS.STOCK_MANAGE] },
    { icon: "🛒", label: "Compras y requisiciones", href: "/procurement", anyPermissions: [PERMISSIONS.PROCUREMENT_VIEW, PERMISSIONS.PROCUREMENT_MANAGE] },
    { icon: "📊", label: "Dashboard compras", href: "/procurement/dashboard", anyPermissions: [PERMISSIONS.PROCUREMENT_VIEW, PERMISSIONS.PROCUREMENT_MANAGE] },
  ];

  const financeItems: MenuItem[] = [
    { icon: "📒", label: "Contabilidad (GL)", href: "/accounting", anyPermissions: [PERMISSIONS.ACCOUNTING_VIEW, PERMISSIONS.ACCOUNTING_MANAGE] },
    { icon: "💰", label: "Nómina y pagos", href: "/employee-payments", anyPermissions: [PERMISSIONS.ACCOUNTING_VIEW, PERMISSIONS.ACCOUNTING_MANAGE, PERMISSIONS.CONSOLE_ADMIN] },
    { icon: "📊", label: "Gastos operativos", href: "/expenses", anyPermissions: [PERMISSIONS.ACCOUNTING_VIEW, PERMISSIONS.ACCOUNTING_MANAGE, PERMISSIONS.CONSOLE_ADMIN] },
    { icon: "🧾", label: "Facturacion", href: "/invoicing", anyPermissions: [PERMISSIONS.INVOICING_VIEW, PERMISSIONS.INVOICING_MANAGE] },
    { icon: "🏦", label: "Banca y conciliaciones", href: "/banking", anyPermissions: [PERMISSIONS.BANKING_VIEW, PERMISSIONS.BANKING_MANAGE] },
    { icon: "📈", label: "Reportes financieros", href: "/accounting/reports", anyPermissions: [PERMISSIONS.ACCOUNTING_VIEW, PERMISSIONS.ACCOUNTING_MANAGE] },
  ];

  const complianceItems: MenuItem[] = [
    { icon: "📑", label: "Gestion documental", href: "/documents", anyPermissions: [PERMISSIONS.DOCUMENTS_VIEW, PERMISSIONS.DOCUMENTS_MANAGE] },
    { icon: "🔍", label: "Auditoria", href: "/audit", permissions: [PERMISSIONS.AUDIT_VIEW] },
    { icon: "📊", label: "BI y Analytics", href: "/analytics", anyPermissions: [PERMISSIONS.BI_VIEW, PERMISSIONS.BI_MANAGE] },
    { icon: "📈", label: "BI Ejecutivo", href: "/analytics/bi", anyPermissions: [PERMISSIONS.BI_VIEW, PERMISSIONS.BI_MANAGE, PERMISSIONS.CONSOLE_ADMIN] },
  ];

  const groups: MenuGroup[] = [
    {
      id: "profile",
      title: "Cuenta personal",
      items: profileItems,
    },
    {
      id: "employee",
      title: "Mi espacio de trabajo",
      items: employeeItems,
    },
    {
      id: "operacion",
      title: "Operación de servicios",
      items: [operacionLink],
    },
    {
      id: "people",
      title: "RRHH y control de personal",
      items: peopleItems,
    },
    {
      id: "commercial",
      title: "Clientes y comercial",
      items: commercialItems,
    },
    {
      id: "system",
      title: "Administracion interna",
      items: systemItems,
    },
    {
      id: "inventory",
      title: "Inventario y compras",
      items: inventoryItems,
    },
    {
      id: "finance",
      title: "Finanzas y banca",
      items: financeItems,
    },
    {
      id: "compliance",
      title: "Cumplimiento y BI",
      items: complianceItems,
    },
  ];

  const visibleGroups = groups
    .map((group) => ({
      ...group,
      items: group.items.filter(canAccessItem),
    }))
    .filter((group) => group.items.length > 0);

  const fallbackGroups: MenuGroup[] = [
    {
      id: "fallback",
      title: "Menú principal",
      items: [
        { icon: "👤", label: "Mi perfil", href: "/my-profile" },
        { icon: "📊", label: "Resumen ejecutivo", href: "/dashboard" },
      ],
    },
  ];

  const groupsToRender = visibleGroups.length > 0 ? visibleGroups : fallbackGroups;

  const isPathActive = (href: string) => pathname === href || (pathname?.startsWith(`${href}/`) ?? false);

  const toggleMobileGroup = (groupId: string) => {
    setMobileOpenGroups((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId],
    );
  };

  const avatarUrl = getAvatarSrc(user);

  return (
    <aside className={styles.sidebar} data-mobile={isMobile ? 'true' : 'false'} data-open={isMenuOpen ? 'true' : 'false'}>
      {/* Header del Sidebar con Logo y Hamburguesa */}
      <div className={styles.sidebarHeader}>
        <div className={styles.sidebarLogo}>
          <img
            src={brandLogoSrc}
            alt="NEXARA"
            className={styles.brandLogo}
            onError={() => setBrandLogoSrc("/icon.png")}
          />
          <span className={styles.brandMark}>NEXARA</span>
          {isMobile && <span className={styles.brandSub}>Consola</span>}
        </div>
        {isMobile && (
          <button
            type="button"
            className={styles.hamburgerButton}
            onClick={toggleMenu}
            aria-label={isMenuOpen ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={isMenuOpen}
            aria-controls="sidebar-menu"
            data-open={isMenuOpen ? 'true' : 'false'}
          >
            <span className={styles.hamburgerLine}></span>
            <span className={styles.hamburgerLine}></span>
            <span className={styles.hamburgerLine}></span>
          </button>
        )}
      </div>

      {/* Overlay para móvil */}
      {isMobile && isMenuOpen && (
        <div
          className={styles.sidebarOverlay}
          onClick={closeMenu}
          role="presentation"
        ></div>
      )}

      {/* Contenedor del menú que se desplaza en móvil */}
      {(!isMobile || isMenuOpen) && (
      <div
        className={styles.sidebarContent}
        id="sidebar-menu"
        data-open={isMobile && isMenuOpen ? 'true' : undefined}
      >
        <div className={styles.sidebarUser}>
          <div className={styles.sidebarAvatar}>
            <Image 
              className={`${styles.avatarImage} ${user.isSuperAdmin ? styles.avatarImageLogo : ''}`} 
              src={avatarUrl} 
              alt={user.isSuperAdmin ? 'NEXARA' : user.nombre}
              width={64} 
              height={64}
              priority={false}
              loading="lazy"
              unoptimized
            />
          </div>
          <div className={styles.sidebarName}>{user.nombre}</div>
          <div className={styles.sidebarEmail}>{user.email}</div>
          <div className={styles.sidebarMeta}>
            {user.isSuperAdmin ? (
              <span className={styles.levelPill}>Superadmin</span>
            ) : (
              <>
                <span className={styles.rolePill}>{userRoleLabel}</span>
                {isAdmin && userRoleLabel !== 'Admin' && (
                  <span className={styles.levelPill}>Admin</span>
                )}
              </>
            )}
          </div>
        </div>
        {groupsToRender.map((group) => (
          <div key={group.id} className={styles.menuGroup}>
            {isMobile ? (
              <button
                type="button"
                className={styles.menuGroupToggle}
                onClick={() => toggleMobileGroup(group.id)}
                aria-expanded={mobileOpenGroups.includes(group.id)}
                aria-controls={`menu-group-${group.id}`}
              >
                <span>{group.title}</span>
                <span className={`${styles.menuGroupChevron} ${mobileOpenGroups.includes(group.id) ? styles.menuGroupChevronOpen : ""}`}>
                  ▾
                </span>
              </button>
            ) : (
              <div className={styles.menuTitle}>{group.title}</div>
            )}

            {(!isMobile || mobileOpenGroups.includes(group.id)) && (
              <ul className={styles.sidebarMenu} id={`menu-group-${group.id}`}>
                {group.items.map((item) => {
                  const isExternal = item.href.startsWith("http://") || item.href.startsWith("https://");
                  const isItemActive = !isExternal && isPathActive(item.href);
                  const linkClass = isItemActive ? `${styles.menuLink} ${styles.active}` : styles.menuLink;
                  return (
                    <li key={`${group.id}-${item.href}`} className={styles.sidebarMenuItem}>
                      {isExternal ? (
                        <a href={item.href} className={linkClass} onClick={closeMenu}>
                          <span className={styles.menuLinkIcon} aria-hidden="true">{item.icon}</span>
                          <span className={styles.menuLinkText}>{item.label}</span>
                        </a>
                      ) : (
                        <Link href={item.href} className={linkClass} onClick={closeMenu}>
                          <span className={styles.menuLinkIcon} aria-hidden="true">{item.icon}</span>
                          <span className={styles.menuLinkText}>{item.label}</span>
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))}
        <div className={styles.sidebarFooter}>
          <div className={styles.sidebarFooterActions}>
            <button
              onClick={toggleDarkMode}
              className={styles.themeSwitcher}
              aria-label={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              title={darkMode ? 'Modo claro' : 'Modo oscuro'}
            >
              <span className={styles.themeIcon} aria-hidden="true">●</span>
              <span className={styles.themeLabel}>{darkMode ? 'Vista oscura' : 'Vista clara'}</span>
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className={styles.logoutButton}
              aria-label="Cerrar sesión"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
      )}
    </aside>
  );
}
