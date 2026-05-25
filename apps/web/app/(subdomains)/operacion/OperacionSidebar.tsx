"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "../console/console.module.css";
import { useUser } from "@/components/UserContext";
import { useTheme } from "@/components/ThemeContext";
import { PERMISSIONS } from "@/lib/permissions";
import { getAvatarSrc, getRoleLabel, isPlatformAdmin } from "@/lib/panel-user";
import { canAccessMenuItem } from "@/lib/org-access";
import { isPanelDrawerViewport } from "@/lib/panel-drawer-breakpoint";
import { getConsoleUrl } from "@/lib/panel-urls";

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

export default function OperacionSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useUser();
  const { darkMode, toggleDarkMode } = useTheme();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileOpenGroups, setMobileOpenGroups] = useState<string[]>([]);

  useEffect(() => {
    const checkMobile = () => setIsMobile(isPanelDrawerViewport(window.innerWidth));
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

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isMenuOpen) setIsMenuOpen(false);
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

  if (!user) return null;

  const isSuperAdmin = Boolean(user.isSuperAdmin);
  const isAdmin = !isSuperAdmin && isPlatformAdmin(user);
  const userRoleLabel = getRoleLabel(user);

  const canAccessItem = (item: MenuItem) => canAccessMenuItem(user, item);

  const profileItems: MenuItem[] = [];
  if (!isSuperAdmin && !isAdmin) {
    profileItems.push({
      icon: "👤",
      label: "Mi perfil",
      href: getConsoleUrl("/my-profile"),
      anyPermissions: [PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN],
    });
  }

  const fieldItems: MenuItem[] = [{ icon: "📊", label: "Resumen operativo", href: "/dashboard" }];
  if (!isSuperAdmin && !isAdmin) {
    fieldItems.push(
      { icon: "📋", label: "Mis actividades", href: "/my-activities" },
      { icon: "📸", label: "Mis evidencias", href: "/my-evidences" },
      { icon: "💼", label: "Mis viáticos", href: "/my-viatics" },
      { icon: "🚗", label: "Mis vehículos", href: "/my-vehicles" },
    );
  }

  const serviceItems: MenuItem[] = [
    { icon: "🎫", label: "Helpdesk / Tickets", href: "/client-tickets", anyPermissions: [PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.CONSOLE_ACCESS] },
    { icon: "🗂️", label: "Actividades", href: "/activities", anyPermissions: [PERMISSIONS.ACTIVITIES_MANAGE, PERMISSIONS.CONSOLE_ADMIN] },
    { icon: "📄", label: "Hojas de servicio", href: "/service-sheets", anyPermissions: [PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN] },
    { icon: "📸", label: "Evidencias", href: "/evidences", anyPermissions: [PERMISSIONS.EVIDENCES_REVIEW, PERMISSIONS.CONSOLE_ADMIN] },
    { icon: "🧩", label: "Proyectos de instalación", href: "/projects", anyPermissions: [PERMISSIONS.ACTIVITIES_MANAGE, PERMISSIONS.CONSOLE_ADMIN] },
    { icon: "📈", label: "Rentabilidad por proyecto", href: "/work-projects", anyPermissions: [PERMISSIONS.ACCOUNTING_VIEW, PERMISSIONS.CONSOLE_ADMIN] },
  ];

  const assetsItems: MenuItem[] = [
    { icon: "📡", label: "Activos instalados", href: "/assets", anyPermissions: [PERMISSIONS.ASSETS_VIEW, PERMISSIONS.ASSETS_MANAGE] },
    { icon: "🔧", label: "Mantenimiento / SLA", href: "/maintenance", anyPermissions: [PERMISSIONS.MAINTENANCE_VIEW, PERMISSIONS.MAINTENANCE_MANAGE] },
    { icon: "📑", label: "Contratos recurrentes", href: "/maintenance/contracts", anyPermissions: [PERMISSIONS.MAINTENANCE_VIEW, PERMISSIONS.MAINTENANCE_MANAGE] },
    { icon: "🏢", label: "Clientes B2B", href: getConsoleUrl("/clients"), anyPermissions: [PERMISSIONS.CLIENTS_VIEW, PERMISSIONS.CLIENTS_MANAGE, PERMISSIONS.CONSOLE_ADMIN] },
  ];

  const logisticsItems: MenuItem[] = [
    { icon: "🛰️", label: "Monitoreo GPS", href: "/gps", permissions: [PERMISSIONS.GPS_VIEW] },
    { icon: "🚗", label: "Control vehicular", href: "/vehicles", anyPermissions: [PERMISSIONS.VEHICLES_REVIEW, PERMISSIONS.VEHICLES_INVENTORY, PERMISSIONS.CONSOLE_ADMIN] },
    { icon: "🛠️", label: "Herramientas", href: "/tools", anyPermissions: [PERMISSIONS.TOOLS_VIEW, PERMISSIONS.TOOLS_MANAGE, PERMISSIONS.CONSOLE_ADMIN] },
    { icon: "💼", label: "Viáticos", href: "/viatics", anyPermissions: [PERMISSIONS.VIATICS_MANAGE, PERMISSIONS.CONSOLE_ADMIN] },
  ];

  const groups: MenuGroup[] = [
    { id: "profile", title: "Cuenta", items: profileItems },
    { id: "field", title: "Mi trabajo en campo", items: fieldItems },
    { id: "service", title: "Servicio y entrega", items: serviceItems },
    { id: "assets", title: "Activos y contratos", items: assetsItems },
    { id: "logistics", title: "Logística de campo", items: logisticsItems },
  ];

  const visibleGroups = groups
    .map((group) => ({ ...group, items: group.items.filter(canAccessItem) }))
    .filter((group) => group.items.length > 0);

  const isPathActive = (href: string) => pathname === href || (pathname?.startsWith(`${href}/`) ?? false);

  return (
    <aside className={styles.sidebar} data-mobile={isMobile ? "true" : "false"} data-open={isMenuOpen ? "true" : "false"}>
      <div className={styles.sidebarHeader}>
        <div className={styles.sidebarLogo}>
          <img src="/logo-nexara.png" alt="NEXARA" className={styles.brandLogo} />
          <span className={styles.brandMark}>NEXARA</span>
          {isMobile && <span className={styles.brandSub}>Operación</span>}
        </div>
        {isMobile && (
          <button
            type="button"
            className={styles.hamburgerButton}
            onClick={() => setIsMenuOpen((prev) => !prev)}
            aria-label={isMenuOpen ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={isMenuOpen}
          >
            <span className={styles.hamburgerLine} />
            <span className={styles.hamburgerLine} />
            <span className={styles.hamburgerLine} />
          </button>
        )}
      </div>

      {isMobile && isMenuOpen && (
        <div className={styles.sidebarOverlay} onClick={() => setIsMenuOpen(false)} role="presentation" />
      )}

      {(!isMobile || isMenuOpen) && (
        <div className={styles.sidebarContent}>
          <div className={styles.sidebarUser}>
            <div className={styles.sidebarAvatar}>
              <Image
                className={styles.avatarImage}
                src={getAvatarSrc(user)}
                alt={user.nombre}
                width={64}
                height={64}
                unoptimized
              />
            </div>
            <div className={styles.sidebarName}>{user.nombre}</div>
            <div className={styles.sidebarEmail}>{user.email}</div>
            <div className={styles.sidebarMeta}>
              <span className={styles.rolePill}>{userRoleLabel}</span>
            </div>
          </div>

          {visibleGroups.map((group) => (
            <div key={group.id} className={styles.menuGroup}>
              <div className={styles.menuTitle}>{group.title}</div>
              <ul className={styles.sidebarMenu}>
                {group.items.map((item) => (
                  <li key={item.href} className={styles.sidebarMenuItem}>
                    <Link
                      href={item.href}
                      className={isPathActive(item.href) ? `${styles.menuLink} ${styles.active}` : styles.menuLink}
                      onClick={() => setIsMenuOpen(false)}
                    >
                      <span className={styles.menuLinkIcon}>{item.icon}</span>
                      <span className={styles.menuLinkText}>{item.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className={styles.menuGroup}>
            <div className={styles.menuTitle}>Otros paneles</div>
            <ul className={styles.sidebarMenu}>
              <li className={styles.sidebarMenuItem}>
                <a href={getConsoleUrl("/dashboard")} className={styles.menuLink}>
                  <span className={styles.menuLinkIcon}>⚙️</span>
                  <span className={styles.menuLinkText}>Administración</span>
                </a>
              </li>
            </ul>
          </div>

          <div className={styles.sidebarFooter}>
            <div className={styles.sidebarFooterActions}>
              <button type="button" onClick={toggleDarkMode} className={styles.themeSwitcher}>
                {darkMode ? "Vista oscura" : "Vista clara"}
              </button>
              <button
                type="button"
                onClick={() => {
                  logout();
                  router.replace("/login");
                }}
                className={styles.logoutButton}
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
