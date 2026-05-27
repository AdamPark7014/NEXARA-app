"use client";

/**
 * PanelSwitcher — Dropdown discreto que aparece en el topbar de cada panel
 * para permitir al usuario cambiar al panel de otro dominio funcional
 * (operación / ventas / contabilidad / etc) sin saturar el sidebar.
 *
 * Diseño:
 *  - Aparece como botón "Cambiar de panel" en el header del panel.
 *  - Muestra solo los paneles a los que el usuario tiene acceso.
 *  - Marca el panel actual como "activo" y destaca el HOME del usuario.
 *  - Usa URLs absolutas cross-subdomain (getPanelUrl) para producción real.
 *  - En móvil se convierte en un sheet (full-screen dropdown).
 */

import { useEffect, useRef, useState } from "react";
import { useUser } from "@/components/UserContext";
import { getAccessiblePanels, type PanelKey } from "@/lib/panel-routing";
import { getPanelUrl } from "@/lib/panel-urls";
import { getUserHome } from "@/lib/panel-home";

type PanelSwitcherProps = {
  /** Slug del panel donde está actualmente el usuario */
  currentPanel: PanelKey;
  /** Color de acento del panel actual (usado en el botón) */
  accentColor?: string;
  /** Estilo compacto (solo icono) para topbars muy estrechos */
  compact?: boolean;
};

export default function PanelSwitcher({ currentPanel, accentColor = "#0ea5e9", compact = false }: PanelSwitcherProps) {
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Cerrar al hacer click fuera
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Cerrar con Escape
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
  // No mostrar si el usuario solo tiene UN panel (no hay a dónde cambiar)
  if (accessible.length <= 1) return null;

  const home = getUserHome(user);

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
            minWidth: 280,
            maxHeight: 480,
            overflow: "auto",
            background: "var(--surface, #fff)",
            border: "1px solid var(--border, #e5e7eb)",
            borderRadius: 12,
            boxShadow: "0 12px 32px rgba(0,0,0,0.12)",
            padding: 6,
            zIndex: 100,
          }}
        >
          <div style={{ padding: "10px 12px 6px", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6, color: "var(--text-secondary, #6b7280)", fontWeight: 700 }}>
            Mis paneles
          </div>
          {accessible.map((panel) => {
            const isCurrent = panel.key === currentPanel;
            const isHome = panel.key === home.panel;
            const url = getPanelUrl(panel.key, panel.entryPath);
            return (
              <a
                key={panel.key}
                href={url}
                role="menuitem"
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  padding: "10px 12px",
                  borderRadius: 8,
                  textDecoration: "none",
                  color: "var(--text-primary, #111)",
                  background: isCurrent ? `${accentColor}15` : "transparent",
                  border: isCurrent ? `1px solid ${accentColor}40` : "1px solid transparent",
                  cursor: isCurrent ? "default" : "pointer",
                  transition: "background 0.12s",
                  pointerEvents: isCurrent ? "none" : "auto",
                }}
                onMouseEnter={(e) => {
                  if (!isCurrent) (e.currentTarget as HTMLAnchorElement).style.background = "var(--surface-2, #f9fafb)";
                }}
                onMouseLeave={(e) => {
                  if (!isCurrent) (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
                }}
              >
                <span style={{ fontSize: 22, lineHeight: 1 }}>{panel.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{panel.name}</span>
                    {isCurrent && (
                      <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: accentColor, color: "#fff", fontWeight: 700, textTransform: "uppercase" }}>
                        Actual
                      </span>
                    )}
                    {!isCurrent && isHome && (
                      <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: "var(--surface-2, #f3f4f6)", color: "var(--text-secondary, #6b7280)", fontWeight: 600, textTransform: "uppercase" }}>
                        Mi base
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary, #6b7280)", marginTop: 2, lineHeight: 1.4 }}>
                    {panel.description}
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
