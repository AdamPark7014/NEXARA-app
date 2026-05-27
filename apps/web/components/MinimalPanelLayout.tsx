"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeContext";
import { useUser } from "@/components/UserContext";
import PanelTopbarActions from "@/components/PanelTopbarActions";
import { ToastViewport } from "@/components/Toast";
import { getAvatarSrc, getRoleLabel } from "@/lib/panel-user";
import type { PanelKey } from "@/lib/panel-routing";

export type MinimalPanelMenuItem = {
  icon: string;
  label: string;
  href: string;
  section?: string;
  badge?: string | number | null;
};

export type MinimalPanelLayoutProps = {
  panelName: string;
  panelTagline?: string;
  panelIcon?: string;
  accentColor?: string;
  baseHref?: string;
  menu: MinimalPanelMenuItem[];
  /** Slug del panel actual para el PanelSwitcher (support/noc/people/lab). */
  panelKey?: PanelKey;
  children: React.ReactNode;
};

/**
 * Layout ligero para los paneles "satélite" del ERP (support, noc, people, lab,
 * y cualquier subdominio futuro de scope reducido). Tiene sidebar, topbar,
 * dark mode toggle y dropdown de usuario sin duplicar el código completo de
 * los layouts grandes (console/operacion/etc).
 */
export default function MinimalPanelLayout({
  panelName,
  panelTagline,
  panelIcon = "✨",
  accentColor = "#0ea5e9",
  baseHref = "/",
  menu,
  panelKey,
  children,
}: MinimalPanelLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { darkMode, toggleDarkMode } = useTheme();
  const { user, logout } = useUser();
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 900);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (isMobile) setOpen(false);
  }, [pathname, isMobile]);

  const userName = user?.nombre || panelName;
  const userRole = getRoleLabel(user);
  const userAvatar = getAvatarSrc(user);

  // Group menu by section
  const groups = menu.reduce<Record<string, MinimalPanelMenuItem[]>>((acc, item) => {
    const sec = item.section || "Principal";
    if (!acc[sec]) acc[sec] = [];
    acc[sec].push(item);
    return acc;
  }, {});

  const isActive = (href: string) => {
    if (!pathname) return false;
    const target = href === "/" ? baseHref : `${baseHref}${href}`.replace(/\/+$/, "") || baseHref;
    const cur = pathname.replace(/\/+$/, "") || "/";
    return cur === target;
  };

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-secondary)" }}>
      <ToastViewport />
      {/* Sidebar */}
      <aside
        style={{
          width: isMobile ? (open ? 280 : 0) : 260,
          background: "var(--bg-primary)",
          borderRight: "1px solid var(--border)",
          transition: "width 0.2s",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          position: isMobile ? "fixed" : "sticky",
          top: 0,
          height: "100vh",
          zIndex: 50,
          boxShadow: isMobile && open ? "0 12px 32px rgba(0,0,0,0.2)" : undefined,
        }}
      >
        <div style={{ padding: 16, borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: accentColor,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
              }}
            >
              {panelIcon}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{panelName}</div>
              {panelTagline && <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{panelTagline}</div>}
            </div>
          </div>
        </div>

        <nav style={{ padding: 12, overflow: "auto", flex: 1 }}>
          {Object.entries(groups).map(([section, items]) => (
            <div key={section} style={{ marginBottom: 14 }}>
              <div
                style={{
                  fontSize: 10,
                  color: "var(--text-secondary)",
                  textTransform: "uppercase",
                  letterSpacing: 0.6,
                  padding: "0 8px 6px",
                }}
              >
                {section}
              </div>
              {items.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={`${baseHref}${item.href === "/" ? "" : item.href}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 10px",
                      borderRadius: 8,
                      textDecoration: "none",
                      color: active ? "#fff" : "var(--text-primary)",
                      background: active ? accentColor : "transparent",
                      fontSize: 13,
                      fontWeight: 600,
                      marginBottom: 2,
                    }}
                  >
                    <span>{item.icon}</span>
                    <span style={{ flex: 1 }}>{item.label}</span>
                    {item.badge != null && (
                      <span
                        style={{
                          fontSize: 10,
                          background: active ? "rgba(255,255,255,0.3)" : accentColor + "33",
                          color: active ? "#fff" : accentColor,
                          padding: "1px 6px",
                          borderRadius: 999,
                          fontWeight: 700,
                        }}
                      >
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div style={{ padding: 12, borderTop: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 6 }}>
            {userAvatar && (
              <img src={userAvatar} alt="" style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {userName}
              </div>
              {userRole && (
                <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>{userRole}</div>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <button
              type="button"
              onClick={toggleDarkMode}
              style={{ flex: 1, padding: 6, background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", fontSize: 12 }}
            >
              {darkMode ? "☀️" : "🌙"}
            </button>
            <Link
              href="/paneles"
              style={{ flex: 1, padding: 6, background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", fontSize: 12, textAlign: "center", textDecoration: "none", color: "var(--text-primary)" }}
            >
              ⊞
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              style={{ flex: 1, padding: 6, background: "#dc2626", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12 }}
            >
              ⎋
            </button>
          </div>
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0 }}>
        {/* Topbar siempre visible con PanelSwitcher discreto a la derecha */}
        <div
          style={{
            padding: isMobile ? "10px 12px" : "12px 24px",
            background: "var(--bg-primary)",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            position: "sticky",
            top: 0,
            zIndex: 30,
          }}
        >
          {isMobile && (
            <button
              type="button"
              onClick={() => setOpen(!open)}
              aria-label="Abrir menú"
              style={{ padding: 8, background: accentColor, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}
            >
              ☰
            </button>
          )}
          <strong style={{ fontSize: isMobile ? 14 : 15, flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
            <span>{panelIcon}</span>
            <span>{panelName}</span>
          </strong>
          {panelKey ? (
            <PanelTopbarActions panelKey={panelKey} accentColor={accentColor} compact={isMobile} />
          ) : null}
        </div>
        {children}
      </main>

      {isMobile && open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 40 }}
        />
      )}
    </div>
  );
}
