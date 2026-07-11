"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import {
  MODULES,
  PANELS,
  PANEL_META,
  type ModuleEntry,
  type PanelId,
} from "@/lib/access-matrix";
import { ORG_ROLE_META, type OrgRoleKey } from "@/lib/org-roles";
import { useUser } from "@/components/UserContext";
import { resolveV2RoleKey } from "@/lib/user-access";
import { ROLES, type RoleKey } from "@/lib/rbac";
import KpiCard from "@/components/ui/KpiCard";

const ERP_ADMIN_ROLES = new Set<RoleKey>([ROLES.CEO, ROLES.DIR_ADMIN, ROLES.COORD_ADMIN, ROLES.DIR_OPERACIONES]);

/**
 * Vista de arquitectura: mapa visual del ERP NEXARA con flujo end-to-end
 * de datos, paneles consolidados y roles que habitan cada módulo.
 */
export default function ArchitecturePage() {
  const { user } = useUser();
  const router = useRouter();

  // Mapa de arquitectura — solo administración. Contiene estructura interna del sistema.
  useEffect(() => {
    if (!user) return;
    if (user.isSuperAdmin) return;
    const v2 = resolveV2RoleKey(user);
    if (v2 && !ERP_ADMIN_ROLES.has(v2)) router.replace("/erp/dashboard");
  }, [user, router]);

  const [selectedPanel, setSelectedPanel] = useState<PanelId | "all">("all");

  const modulesByPanel = useMemo(() => {
    const map = new Map<PanelId, ModuleEntry[]>();
    for (const m of Object.values(MODULES)) {
      const list = map.get(m.panel) || [];
      list.push(m);
      map.set(m.panel, list);
    }
    return map;
  }, []);

  const panelsToShow = selectedPanel === "all" ? Object.values(PANELS) : [selectedPanel];

  return (
    <>
      <PageHeader
        eyebrow="ERP · Gobierno corporativo"
        title="Arquitectura del sistema"
        subtitle="Mapa completo de NEXARA: 5 paneles consolidados, sus módulos, los roles que los habitan y el flujo end-to-end del negocio (CCTV · Redes · Mantenimiento · Ventas)."
        actions={
          <Link href="/erp/users" style={{ textDecoration: "none" }}>
            <Button variant="primary" iconLeft="🧑‍💼">
              Ver roles
            </Button>
          </Link>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, marginBottom: 20 }}>
        <KpiCard label="Paneles" value={Object.keys(PANELS).length} icon="🏛️" variant="accent" />
        <KpiCard label="Módulos" value={Object.keys(MODULES).length} icon="🧩" />
        <KpiCard label="Roles" value={Object.keys(ORG_ROLE_META).length} icon="🎭" variant="positive" />
        <KpiCard label="Vista actual" value={selectedPanel === "all" ? "Todos" : (PANEL_META[selectedPanel as PanelId]?.name ?? selectedPanel)} icon="📋" variant="default" />
      </div>

      {/* Módulos por panel */}
      {(() => {
        const total = Object.keys(MODULES).length;
        return (
          <div style={{ marginBottom: 20, padding: "12px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Módulos por panel</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {Object.values(PANEL_META).map((p) => {
                const count = modulesByPanel.get(p.id as PanelId)?.length ?? 0;
                return (
                  <div key={p.id} style={{ display: "grid", gridTemplateColumns: "70px 1fr 36px", gap: 10, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>{p.icon} {p.name.replace(/^NEXARA\s+/, "")}</span>
                    <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${(count / total) * 100}%`, background: p.accent, borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "right" }}>{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* SELECTOR DE PANEL */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 20,
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={() => setSelectedPanel("all")}
          style={pillBtn(selectedPanel === "all")}
        >
          Todos los paneles
        </button>
        {Object.values(PANEL_META).map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setSelectedPanel(p.id)}
            style={{
              ...pillBtn(selectedPanel === p.id),
              borderColor:
                selectedPanel === p.id
                  ? p.accent
                  : "var(--border)",
              background:
                selectedPanel === p.id
                  ? `color-mix(in srgb, ${p.accent} 12%, transparent)`
                  : "var(--surface)",
              color: selectedPanel === p.id ? p.accent : "var(--text-primary)",
            }}
          >
            <span style={{ marginRight: 6 }}>{p.icon}</span>
            {p.name.replace(/^NEXARA\s+/, "")}
          </button>
        ))}
      </div>

      {/* FLUJO END-TO-END */}
      <Section
        title="Flujo end-to-end del negocio"
        subtitle="Cómo viajan los datos desde lead hasta facturación"
      >
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "stretch",
            overflowX: "auto",
            paddingBottom: 8,
          }}
        >
          {[
            { panel: "studio", label: "Lead capturado", desc: "Sitio web, redes, ferias", icon: "🌐" },
            { panel: "crm", label: "Oportunidad calificada", desc: "Pipeline · descovery → cierre", icon: "🎯" },
            { panel: "crm", label: "Cotización firmada", desc: "Catálogo · servicios + equipos", icon: "📝" },
            { panel: "ops", label: "Proyecto operativo", desc: "OTs · ingenieros · materiales", icon: "🏗️" },
            { panel: "ops", label: "Ejecución en campo", desc: "Evidencias · viáticos · GPS", icon: "📸" },
            { panel: "erp", label: "Facturación CFDI", desc: "Timbrado → banca → contabilidad", icon: "🧾" },
            { panel: "ops", label: "Servicio post-venta", desc: "Mantenimiento · NOC · soporte", icon: "🔧" },
          ].map((step, idx, arr) => {
            const panelAccent = PANEL_META[step.panel as PanelId].accent;
            return (
              <div
                key={idx}
                style={{
                  flex: "1 1 0",
                  minWidth: 170,
                  padding: 14,
                  background: `linear-gradient(160deg, color-mix(in srgb, ${panelAccent} 12%, transparent), color-mix(in srgb, ${panelAccent} 4%, transparent))`,
                  border: `1px solid color-mix(in srgb, ${panelAccent} 24%, transparent)`,
                  borderRadius: 14,
                  position: "relative",
                }}
              >
                <div
                  style={{
                    fontSize: 9.5,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: panelAccent,
                    marginBottom: 6,
                  }}
                >
                  Paso {idx + 1}
                </div>
                <div style={{ fontSize: 22, marginBottom: 6 }}>{step.icon}</div>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 13.5,
                    color: "var(--text-primary)",
                    fontFamily: "var(--nx-font-display)",
                    marginBottom: 4,
                  }}
                >
                  {step.label}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                  {step.desc}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: panelAccent,
                    marginTop: 8,
                    opacity: 0.8,
                  }}
                >
                  {PANEL_META[step.panel as PanelId].name.replace(/^NEXARA\s+/, "")}
                </div>
                {idx < arr.length - 1 && (
                  <div
                    style={{
                      position: "absolute",
                      right: -14,
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--text-tertiary)",
                      fontSize: 16,
                      zIndex: 2,
                      pointerEvents: "none",
                    }}
                  >
                    →
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* MAPA DETALLADO POR PANEL */}
      {panelsToShow.map((panelId) => {
        const panelMeta = PANEL_META[panelId];
        const items = modulesByPanel.get(panelId) || [];

        const grouped = new Map<string, ModuleEntry[]>();
        for (const m of items) {
          const list = grouped.get(m.group) || [];
          list.push(m);
          grouped.set(m.group, list);
        }

        return (
          <Section
            key={panelId}
            title={
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 22 }}>{panelMeta.icon}</span>
                <span>{panelMeta.name}</span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: 6,
                    background: `color-mix(in srgb, ${panelMeta.accent} 14%, transparent)`,
                    color: panelMeta.accent,
                  }}
                >
                  {items.length} módulos
                </span>
              </span>
            }
            subtitle={panelMeta.tagline}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {Array.from(grouped.entries()).map(([groupName, mods]) => (
                <div key={groupName}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "var(--text-tertiary)",
                      marginBottom: 8,
                    }}
                  >
                    {groupName}
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                      gap: 8,
                    }}
                  >
                    {mods.map((m) => (
                      <Link
                        key={m.id}
                        href={`/${panelId}${m.path === "/" ? "" : m.path}`}
                        style={{
                          padding: "11px 12px",
                          background: "var(--surface)",
                          border: "1px solid var(--border)",
                          borderRadius: 11,
                          textDecoration: "none",
                          color: "var(--text-primary)",
                          display: "flex",
                          flexDirection: "column",
                          gap: 4,
                          transition: "border-color var(--nx-motion-fast) ease, transform var(--nx-motion-fast) ease",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 15 }}>{m.icon}</span>
                          <span style={{ fontSize: 13, fontWeight: 700 }}>{m.label}</span>
                        </div>
                        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", lineHeight: 1.4 }}>
                          {m.description}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: 4,
                            flexWrap: "wrap",
                            marginTop: 6,
                          }}
                        >
                          {m.allowedRoles.slice(0, 3).map((r: OrgRoleKey) => (
                            <span
                              key={r}
                              style={{
                                fontSize: 9.5,
                                padding: "2px 6px",
                                borderRadius: 5,
                                background: "var(--surface-2)",
                                color: "var(--text-secondary)",
                                fontWeight: 600,
                              }}
                            >
                              {ORG_ROLE_META[r].label}
                            </span>
                          ))}
                          {m.allowedRoles.length > 3 && (
                            <span
                              style={{
                                fontSize: 9.5,
                                padding: "2px 6px",
                                borderRadius: 5,
                                color: "var(--text-tertiary)",
                                fontWeight: 600,
                              }}
                            >
                              +{m.allowedRoles.length - 3}
                            </span>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        );
      })}
    </>
  );
}

function pillBtn(active: boolean): React.CSSProperties {
  return {
    padding: "8px 14px",
    fontSize: 12.5,
    fontWeight: 600,
    background: active ? "var(--primary)" : "var(--surface)",
    color: active ? "#fff" : "var(--text-primary)",
    border: "1px solid var(--border)",
    borderRadius: 999,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "all var(--nx-motion-fast) ease",
  };
}
