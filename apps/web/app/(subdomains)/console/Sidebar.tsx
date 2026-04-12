"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import styles from "./console.module.css";
import { useUser } from '@/components/UserContext';
import { useTheme } from '@/components/ThemeContext';
import Image from "next/image";
import { hasAnyPermission, hasPermission, PERMISSIONS } from '@/lib/permissions';
import { getAvatarSrc, getRoleLabel, isPlatformAdmin } from '@/lib/panel-user';
import { useState, useEffect } from "react";
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

  // Nueva lógica de roles principales
  const role = String(user.role || '').toLowerCase();
  const hasConsoleAdmin = isPlatformAdmin(user);
  const isSuperAdmin = Boolean(user.isSuperAdmin);
  const isAdmin = !isSuperAdmin && hasConsoleAdmin;
  const isIngeniero = !isSuperAdmin && !isAdmin && role.includes('ingenier');
  const isVendedor = !isSuperAdmin && !isAdmin && !isIngeniero;
  const userRoleLabel = getRoleLabel(user);
  const roleFlags = user.roleFlags || {};
  const canAccessCotizaciones = hasPermission(user, PERMISSIONS.COTIZACIONES_ACCESS);
  const canAccessCvs = hasAnyPermission(user, [
    PERMISSIONS.CVS_MANAGE,
    PERMISSIONS.CVS_ADMIN_REVIEW,
    PERMISSIONS.CVS_SUPERADMIN_REVIEW,
    PERMISSIONS.CONSOLE_ADMIN,
  ]);
  const canAccessVentas = hasAnyPermission(user, [
    PERMISSIONS.PANEL_VENTAS,
    PERMISSIONS.SALES_VIEW,
    PERMISSIONS.SALES_MANAGE,
    PERMISSIONS.SALES_REPORTS_VIEW,
  ]);
  const canAccessCotizacionesByRole = Boolean(roleFlags.accesoCotizaciones);
  const canAccessCvsByRole = Boolean(roleFlags.accesoGestionCvs);
  const canAccessVentasByRole = Boolean(roleFlags.accesoPanelVentas);

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

  // Sidebar dinámico según perfil
  const canAccessItem = (item: MenuItem) => {
    // Superadmin: solo vistas globales, nunca personales
    if (isSuperAdmin) {
      if (item.href.startsWith('/my-')) return false;
      return true;
    }
    // Admin: solo gestión, nunca vistas personales ni ventas ni contabilidad completa
    if (isAdmin) {
      if (item.href.startsWith('/my-')) return false;
      if (["/ventas", "/accounting", "/newsletter", "/news", "/gestion-pagina-web"].some((p) => item.href.startsWith(p))) return false;
      if (item.href === "/cotizaciones" && !(canAccessCotizaciones || canAccessCotizacionesByRole)) return false;
      if (item.href === "/cvs" && !(canAccessCvs || canAccessCvsByRole)) return false;
      return true;
    }
    // Ingeniero: solo vistas personales y módulos extra habilitados
    if (isIngeniero) {
      if (!item.href.startsWith('/my-') && !["/dashboard", "/cotizaciones", "/cvs", "/ventas", "/attendance"].includes(item.href)) return false;
      if (item.href === "/cotizaciones" && !(canAccessCotizaciones || canAccessCotizacionesByRole)) return false;
      if (item.href === "/cvs" && !(canAccessCvs || canAccessCvsByRole)) return false;
      if (item.href === "/ventas" && !(canAccessVentas || canAccessVentasByRole)) return false;
      return true;
    }
    // Vendedor: solo ventas y módulos extra habilitados
    if (isVendedor) {
      if (!item.href.startsWith('/my-') && !["/dashboard", "/ventas", "/cotizaciones", "/cvs", "/attendance"].includes(item.href)) return false;
      if (item.href === "/cotizaciones" && !(canAccessCotizaciones || canAccessCotizacionesByRole)) return false;
      if (item.href === "/cvs" && !(canAccessCvs || canAccessCvsByRole)) return false;
      if (item.href === "/ventas" && !(canAccessVentas || canAccessVentasByRole)) return false;
      return true;
    }
    // Por defecto, usar permisos
    if (item.permissions && !item.permissions.every((permission) => hasPermission(user, permission))) {
      return false;
    }
    if (item.anyPermissions && !hasAnyPermission(user, item.anyPermissions)) {
      return false;
    }
    return true;
  };

  // Solo perfiles no globales ven vistas personales
  const profileItems: MenuItem[] = [];
  if (!isSuperAdmin && !isAdmin) {
    profileItems.push(
      { icon: "👤", label: "Mi perfil", href: "/my-profile", anyPermissions: [PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN] }
    );
  }

  // ── Empleado (auto-servicio) ──────────────────────────
  const employeeItems: MenuItem[] = [
    { icon: "📊", label: "Resumen ejecutivo", href: "/dashboard", anyPermissions: [PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN] },
  ];
  // Todo usuario de consola no admin puede ver su espacio personal
  if (!isSuperAdmin && !isAdmin) {
    employeeItems.push(
      { icon: "📋", label: "Mis actividades", href: "/my-activities", anyPermissions: [PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN] },
      { icon: "📸", label: "Mis evidencias", href: "/my-evidences", anyPermissions: [PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN] },
      { icon: "💼", label: "Mis viáticos", href: "/my-viatics", anyPermissions: [PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN] },
      { icon: "🚗", label: "Mis vehículos", href: "/my-vehicles", anyPermissions: [PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN] },
      { icon: "🍽️", label: "Breaks y comidas", href: "/my-lunch-breaks", anyPermissions: [PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN] }
    );
  }

  // ── Operación (supervisión) ────────────────────────────
  const operationItems: MenuItem[] = [
    { icon: "🗂️", label: "Operación: actividades", href: "/activities", anyPermissions: [PERMISSIONS.ACTIVITIES_MANAGE, PERMISSIONS.CONSOLE_ADMIN] },
    { icon: "📸", label: "Evidencias de servicio", href: "/evidences", anyPermissions: [PERMISSIONS.EVIDENCES_REVIEW, PERMISSIONS.CONSOLE_ADMIN] },
    { icon: "💼", label: "Viáticos operativos", href: "/viatics", anyPermissions: [PERMISSIONS.VIATICS_MANAGE, PERMISSIONS.CONSOLE_ADMIN] },
    { icon: "🚗", label: "Control vehicular", href: "/vehicles", anyPermissions: [PERMISSIONS.VEHICLES_REVIEW, PERMISSIONS.VEHICLES_INVENTORY, PERMISSIONS.CONSOLE_ADMIN] },
    { icon: "🛰️", label: "Monitoreo GPS", href: "/gps", permissions: [PERMISSIONS.GPS_VIEW] },
  ];

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
    { icon: "🧩", label: "Proyectos", href: "/projects", anyPermissions: [PERMISSIONS.ACTIVITIES_MANAGE, PERMISSIONS.CONSOLE_ADMIN] },
    { icon: "🧾", label: "Cotizaciones", href: "/cotizaciones", permissions: [PERMISSIONS.COTIZACIONES_ACCESS] },
    { icon: "📈", label: "Gestión comercial", href: "/gestion-vendedores", anyPermissions: [PERMISSIONS.SALES_MANAGE, PERMISSIONS.CONSOLE_ADMIN] },
    { icon: "📬", label: "Mensajes de contacto", href: "/contact-messages", permissions: [PERMISSIONS.CONSOLE_ADMIN] },
  ];

  const systemItems: MenuItem[] = [
    { icon: "🛠️", label: "Herramientas internas", href: "/tools", anyPermissions: [PERMISSIONS.TOOLS_VIEW, PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN] },
    { icon: "📰", label: "Noticias y comunicados", href: "/news", permissions: [PERMISSIONS.CONSOLE_ADMIN] },
    { icon: "📧", label: "Newsletter", href: "/newsletter", permissions: [PERMISSIONS.CONSOLE_ADMIN] },
    { icon: "🔧", label: "Configuración del sistema", href: "/settings", permissions: [PERMISSIONS.CONSOLE_ADMIN] },
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
    { icon: "🏗️", label: "Proyectos de obra", href: "/work-projects", anyPermissions: [PERMISSIONS.ACCOUNTING_VIEW, PERMISSIONS.ACCOUNTING_MANAGE, PERMISSIONS.CONSOLE_ADMIN] },
    { icon: "🧾", label: "Facturacion", href: "/invoicing", anyPermissions: [PERMISSIONS.INVOICING_VIEW, PERMISSIONS.INVOICING_MANAGE] },
    { icon: "🏦", label: "Banca y conciliaciones", href: "/banking", anyPermissions: [PERMISSIONS.BANKING_VIEW, PERMISSIONS.BANKING_MANAGE] },
    { icon: "📈", label: "Reportes financieros", href: "/accounting/reports", anyPermissions: [PERMISSIONS.ACCOUNTING_VIEW, PERMISSIONS.ACCOUNTING_MANAGE] },
  ];

  const complianceItems: MenuItem[] = [
    { icon: "🦺", label: "Seguridad industrial", href: "/safety", anyPermissions: [PERMISSIONS.SAFETY_VIEW, PERMISSIONS.SAFETY_MANAGE] },
    { icon: "📑", label: "Gestion documental", href: "/documents", anyPermissions: [PERMISSIONS.DOCUMENTS_VIEW, PERMISSIONS.DOCUMENTS_MANAGE] },
    { icon: "🔄", label: "Flujos de aprobacion", href: "/workflow", anyPermissions: [PERMISSIONS.WORKFLOW_VIEW, PERMISSIONS.WORKFLOW_MANAGE] },
    { icon: "🔍", label: "Auditoria", href: "/audit", permissions: [PERMISSIONS.AUDIT_VIEW] },
    { icon: "📊", label: "BI y Analytics", href: "/analytics", anyPermissions: [PERMISSIONS.BI_VIEW, PERMISSIONS.BI_MANAGE] },
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
      id: "operations",
      title: "Supervisión operativa",
      items: operationItems,
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
                  const isItemActive = isPathActive(item.href);
                  return (
                    <li key={`${group.id}-${item.href}`} className={styles.sidebarMenuItem}>
                      <Link
                        href={item.href}
                        className={isItemActive ? `${styles.menuLink} ${styles.active}` : styles.menuLink}
                        onClick={closeMenu}
                      >
                        <span className={styles.menuLinkIcon} aria-hidden="true">{item.icon}</span>
                        <span className={styles.menuLinkText}>{item.label}</span>
                      </Link>
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
