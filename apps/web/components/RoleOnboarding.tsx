"use client";

/**
 * RoleOnboarding — tarjeta de bienvenida que muestra a cada usuario:
 *   - Quién es (rol oficial NEXARA)
 *   - Su misión (qué se espera que entregue)
 *   - Sus 3 acciones diarias típicas
 *   - Los módulos donde "vive"
 *   - Atajos a esos módulos
 *
 * Se puede colapsar y la preferencia se guarda en localStorage por usuario.
 * Diseñado para servir como tour de bienvenida sin ser invasivo.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@/components/UserContext";
import { getOrgRoleMeta, type OrgRoleKey } from "@/lib/org-roles";
import { getModulesForRole } from "@/lib/module-map";
import { getPanelUrl } from "@/lib/panel-urls";

type Props = {
  /** Por defecto se muestra colapsado tras la primera vez. */
  defaultOpen?: boolean;
  /** Si está vacío, se muestra para todo rol. */
  onlyForRoles?: OrgRoleKey[];
};

export default function RoleOnboarding({ defaultOpen = true, onlyForRoles }: Props) {
  const { user } = useUser();
  const [open, setOpen] = useState(defaultOpen);
  const [dismissed, setDismissed] = useState(false);

  const storageKey = user?.email ? `nexara_onboarding_${user.email}` : null;

  useEffect(() => {
    if (!storageKey) return;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored === "dismissed") {
        setDismissed(true);
      } else if (stored === "collapsed") {
        setOpen(false);
      }
    } catch {
      /* localStorage no disponible */
    }
  }, [storageKey]);

  const meta = getOrgRoleMeta(user?.role, user?.orgRoleKey, Boolean(user?.isSuperAdmin));

  if (!user || !meta) return null;
  if (dismissed) return null;
  if (onlyForRoles && !onlyForRoles.includes(meta.orgRoleKey)) return null;

  const modules = getModulesForRole(meta.orgRoleKey).slice(0, 6);

  const persist = (state: "open" | "collapsed" | "dismissed") => {
    if (!storageKey) return;
    try {
      window.localStorage.setItem(storageKey, state);
    } catch {
      /* no-op */
    }
  };

  const handleCollapse = () => {
    setOpen(false);
    persist("collapsed");
  };

  const handleExpand = () => {
    setOpen(true);
    persist("open");
  };

  const handleDismiss = () => {
    setDismissed(true);
    persist("dismissed");
  };

  return (
    <section
      style={{
        border: "1px solid var(--border, #e5e7eb)",
        borderRadius: 14,
        background: "linear-gradient(135deg, rgba(14,165,233,0.05), rgba(59,130,246,0.03))",
        padding: 18,
        marginBottom: 20,
      }}
    >
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: "var(--text-secondary)" }}>
            Tu rol en NEXARA
          </div>
          <h2 style={{ margin: "4px 0 2px", fontSize: 22 }}>{meta.label}</h2>
          <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 14 }}>{meta.missionStatement}</p>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {open ? (
            <button
              type="button"
              onClick={handleCollapse}
              className="button-secondary"
              style={{ fontSize: 12 }}
            >
              Colapsar
            </button>
          ) : (
            <button
              type="button"
              onClick={handleExpand}
              className="button-secondary"
              style={{ fontSize: 12 }}
            >
              Ver detalles
            </button>
          )}
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Cerrar"
            style={{
              border: "none",
              background: "transparent",
              fontSize: 18,
              color: "var(--text-secondary)",
              cursor: "pointer",
              padding: "4px 8px",
            }}
          >
            ×
          </button>
        </div>
      </header>

      {open && (
        <div style={{ marginTop: 14, display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: 8 }}>
              Tus acciones del día
            </div>
            <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
              {meta.dailyActions.map((action, idx) => (
                <li key={idx} style={{ fontSize: 14 }}>{action}</li>
              ))}
            </ol>
          </div>

          {modules.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: 8 }}>
                Tus módulos
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
                {modules.map((mod) => {
                  const primaryPanel = mod.panels[0];
                  const url = primaryPanel ? getPanelUrl(primaryPanel, "/") : "#";
                  return (
                    <li key={mod.id}>
                      <Link
                        href={url}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "6px 8px",
                          borderRadius: 8,
                          textDecoration: "none",
                          color: "var(--text-primary)",
                          background: "var(--surface, transparent)",
                          border: "1px solid var(--border, #e5e7eb)",
                          fontSize: 13,
                        }}
                      >
                        <span style={{ fontSize: 18, lineHeight: 1 }}>{mod.icon}</span>
                        <span style={{ flex: 1 }}>{mod.name}</span>
                        <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{primaryPanel}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
