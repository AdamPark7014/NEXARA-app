"use client";

/**
 * PanelSwitcher — Dropdown del topbar para cambiar entre paneles/subdominios.
 *
 * FIX CRÍTICO: usa `buildCrossPanelUrl` con el token del usuario en lugar de
 * `getPanelUrl`. Esto añade `?_nxt=<token_base64>` a la URL de destino para que
 * el subddominio receptor guarde la sesión en su propio sessionStorage sin
 * pedir login de nuevo. El parámetro se elimina inmediatamente de la URL
 * (replaceState) una vez consumido por UserContext en el destino.
 *
 * PANEL_NAV_MAP define:
 *  - `subdomain`: prefijo canónico del subdominio (core|sales|ops|studio|lab|portal)
 *  - `path`:      ruta interna en ese subdominio (el middleware la traduce a /erp|/crm|/ops|…)
 */

import { useEffect, useRef, useState } from "react";
import { useUser } from "@/components/UserContext";
import { getAccessiblePanels, type PanelKey } from "@/lib/panel-routing";
import { buildCrossPanelUrl } from "@/lib/cross-panel-handoff";

/** Subdominios canónicos y rutas de entrada por cada legacy PanelKey.
 *  Fuente de verdad: middleware.ts `SUBDOMAIN_MAP` + `CANONICAL_BY_INTERNAL_PREFIX`.
 */
const PANEL_NAV_MAP: Record<PanelKey, { subdomain: string; path: string }> = {
  // ERP / Núcleo → core.nexara.com.mx/erp/...
  console:      { subdomain: "core",   path: "/erp/dashboard"   },
  contabilidad: { subdomain: "core",   path: "/erp/accounting"  },
  people:       { subdomain: "core",   path: "/erp/hr"          },
  // CRM / Ventas → sales.nexara.com.mx/crm/...
  ventas:       { subdomain: "sales",  path: "/crm/dashboard"   },
  // OPS / Operación → ops.nexara.com.mx/ops/...
  operacion:    { subdomain: "ops",    path: "/ops/dashboard"   },
  noc:          { subdomain: "ops",    path: "/ops/noc"         },
  support:      { subdomain: "ops",    path: "/ops/support"     },
  // Studio → studio.nexara.com.mx/studio/...
  web:          { subdomain: "studio", path: "/studio/dashboard" },
  // Lab → lab.nexara.com.mx/lab/...
  lab:          { subdomain: "lab",    path: "/lab/"            },
  // Portal cliente externo
  tickets:      { subdomain: "portal", path: "/"                },
};

type PanelSwitcherProps = {
  currentPanel: PanelKey;
  accentColor?: string;
  compact?: boolean;
};

export default function PanelSwitcher({
  currentPanel,
  accentColor = "#0ea5e9",
  compact = false,
}: PanelSwitcherProps) {
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  if (!user) return null;

  const accessible = getAccessiblePanels(user);
  if (accessible.length <= 1) return null;

  // JSON del usuario para el token handoff al cambiar de subdominio
  const userJson = JSON.stringify(user);

  const currentMeta = accessible.find((p) => p.key === currentPanel);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Cambiar de panel"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: compact ? "6px 8px" : "8px 12px",
          background: "var(--surface, #fff)",
          border: "1px solid var(--border, #e5e7eb)",
          borderRadius: 10,
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 600,
          color: "var(--text-primary, #111)",
          boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          transition: "background 0.15s, border-color 0.15s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = accentColor;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border, #e5e7eb)";
        }}
      >
        <span style={{ fontSize: 16 }}>{currentMeta?.icon || "🧭"}</span>
        {!compact && <span>{currentMeta?.name || "Panel"}</span>}
        <span style={{ fontSize: 10, opacity: 0.7 }}>▾</span>
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: 300,
            maxHeight: 520,
            overflow: "auto",
            background: "var(--surface, #fff)",
            border: "1px solid var(--border, #e5e7eb)",
            borderRadius: 12,
            boxShadow: "0 12px 36px rgba(0,0,0,0.14)",
            padding: 6,
            zIndex: 9999,
          }}
        >
          <div
            style={{
              padding: "10px 12px 6px",
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: 0.6,
              color: "var(--text-secondary, #6b7280)",
              fontWeight: 700,
            }}
          >
            Mis paneles · {user.nombre || user.email}
          </div>

          {accessible.map((panel) => {
            const isCurrent = panel.key === currentPanel;

            // Construye URL con token handoff (si cambia subdominio, añade ?_nxt=)
            const nav = PANEL_NAV_MAP[panel.key];
            const url = nav
              ? buildCrossPanelUrl(nav.subdomain, nav.path, userJson)
              : "#";

            return (
              <a
                key={panel.key}
                href={url}
                role="menuitem"
                onClick={() => setOpen(false)}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  padding: "10px 12px",
                  borderRadius: 8,
                  textDecoration: "none",
                  color: "var(--text-primary, #111)",
                  background: isCurrent ? `${accentColor}18` : "transparent",
                  border: isCurrent ? `1px solid ${accentColor}45` : "1px solid transparent",
                  cursor: isCurrent ? "default" : "pointer",
                  transition: "background 0.12s",
                  pointerEvents: isCurrent ? "none" : "auto",
                }}
                onMouseEnter={(e) => {
                  if (!isCurrent)
                    (e.currentTarget as HTMLAnchorElement).style.background =
                      "var(--surface-2, #f9fafb)";
                }}
                onMouseLeave={(e) => {
                  if (!isCurrent)
                    (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
                }}
              >
                <span style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>
                  {panel.icon}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{panel.name}</span>
                    {isCurrent && (
                      <span
                        style={{
                          fontSize: 9,
                          padding: "1px 6px",
                          borderRadius: 4,
                          background: accentColor,
                          color: "#fff",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        Aquí
                      </span>
                    )}
                    {/* Indicador de subdominio destino */}
                    {!isCurrent && nav && (
                      <span
                        style={{
                          fontSize: 9,
                          padding: "1px 6px",
                          borderRadius: 4,
                          background: "var(--surface-3, #f3f4f6)",
                          color: "var(--text-tertiary, #9ca3af)",
                          fontWeight: 500,
                        }}
                      >
                        {nav.subdomain}.nexara.com.mx
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-secondary, #6b7280)",
                      marginTop: 2,
                      lineHeight: 1.4,
                    }}
                  >
                    {panel.description}
                  </div>
                </div>
                {/* Indicador de redirección entre subdominios */}
                {!isCurrent && nav && nav.subdomain !== (typeof window !== "undefined" ? window.location.hostname.split(".")[0] : "") && (
                  <span style={{ fontSize: 14, opacity: 0.4, alignSelf: "center", flexShrink: 0 }}>
                    ↗
                  </span>
                )}
              </a>
            );
          })}

          {/* Separador y hint de seguridad */}
          <div
            style={{
              margin: "6px 0 0",
              padding: "8px 12px",
              borderTop: "1px solid var(--border, #e5e7eb)",
              fontSize: 10,
              color: "var(--text-tertiary, #9ca3af)",
              lineHeight: 1.4,
            }}
          >
            🔐 Sesión transferida automáticamente entre subdominios
          </div>
        </div>
      )}
    </div>
  );
}
