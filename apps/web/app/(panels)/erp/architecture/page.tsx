"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import MetricStrip from "@/components/ui/MetricStrip";
import EmptyState from "@/components/ui/EmptyState";
import FilterToolbar from "@/components/FilterToolbar";
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
import { getModuleGuide } from "@/lib/module-guides";
import { DOMAIN_TRUTHS } from "@/lib/domain-truths";

const ERP_ADMIN_ROLES = new Set<RoleKey>([ROLES.CEO, ROLES.DIR_ADMIN, ROLES.COORD_ADMIN, ROLES.DIR_OPERACIONES]);

const FLOW_STEPS: Array<{ panel: PanelId; label: string; desc: string; icon: string }> = [
  { panel: "studio" as PanelId, label: "Prospecto captado", desc: "Sitio web, redes y ferias", icon: "🌐" },
  { panel: "crm" as PanelId, label: "Oportunidad calificada", desc: "Embudo: descubrimiento → cierre", icon: "🎯" },
  { panel: "crm" as PanelId, label: "Cotización firmada", desc: "Catálogo de servicios y equipos", icon: "📝" },
  { panel: "ops" as PanelId, label: "Proyecto operativo", desc: "Órdenes de trabajo, ingenieros y materiales", icon: "🏗️" },
  { panel: "ops" as PanelId, label: "Ejecución en campo", desc: "Evidencias, viáticos y ubicación", icon: "📸" },
  { panel: "erp" as PanelId, label: "Facturación CFDI", desc: "Timbrado → banco → contabilidad", icon: "🧾" },
  { panel: "ops" as PanelId, label: "Servicio posventa", desc: "Mantenimiento, monitoreo y soporte", icon: "🔧" },
];

const eyebrowStyle: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--text-tertiary)",
  marginBottom: 4,
};

function panelShortName(id: PanelId): string {
  return PANEL_META[id]?.name.replace(/^NEXARA\s+/, "") ?? String(id);
}

/**
 * Mapa del sistema: paneles, módulos, roles que habitan cada módulo
 * y el flujo de punta a punta del negocio.
 */
export default function ArchitecturePage() {
  const { user } = useUser();
  const router = useRouter();

  // Solo administración: contiene la estructura interna del sistema.
  useEffect(() => {
    if (!user) return;
    if (user.isSuperAdmin) return;
    const v2 = resolveV2RoleKey(user);
    if (v2 && !ERP_ADMIN_ROLES.has(v2)) router.replace("/erp/dashboard");
  }, [user, router]);

  const [selectedPanel, setSelectedPanel] = useState<PanelId | "all">("all");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

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

  const filteredByPanel = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    const out = new Map<PanelId, Map<string, ModuleEntry[]>>();
    for (const panelId of panelsToShow) {
      const grouped = new Map<string, ModuleEntry[]>();
      for (const m of modulesByPanel.get(panelId) || []) {
        if (q) {
          const guide = getModuleGuide(m.id);
          const hay = `${m.label} ${m.description} ${m.group} ${guide?.summary ?? ""}`.toLowerCase();
          if (!hay.includes(q)) continue;
        }
        const list = grouped.get(m.group) || [];
        list.push(m);
        grouped.set(m.group, list);
      }
      if (grouped.size > 0) out.set(panelId, grouped);
    }
    return out;
    // panelsToShow deriva de selectedPanel
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modulesByPanel, selectedPanel, deferredQuery]);

  const visibleModuleCount = useMemo(() => {
    let n = 0;
    filteredByPanel.forEach((groups) => groups.forEach((mods) => { n += mods.length; }));
    return n;
  }, [filteredByPanel]);

  const totalModules = Object.keys(MODULES).length;

  return (
    <>
      <PageHeader
        eyebrow="Gobierno · Mapa del sistema"
        title="Mapa del sistema"
        subtitle="Paneles, módulos y roles de NEXARA, con el flujo del negocio de punta a punta y una guía de cómo funciona cada módulo."
        actions={
          <Link href="/erp/users" style={{ textDecoration: "none" }}>
            <Button variant="secondary">Ver usuarios y roles</Button>
          </Link>
        }
      />

      <div style={{ marginBottom: 20 }}>
        <MetricStrip
          ariaLabel="Resumen del sistema"
          metrics={[
            { label: "Paneles", value: Object.keys(PANELS).length },
            { label: "Módulos", value: totalModules },
            { label: "Roles", value: Object.keys(ORG_ROLE_META).length },
          ]}
        />
      </div>

      <Section
        title="Flujo del negocio de punta a punta"
        subtitle="Cómo viaja la información desde el primer contacto hasta la facturación y el servicio posventa."
      >
        <ol
          style={{
            display: "flex", gap: 14, alignItems: "stretch", overflowX: "auto",
            paddingBottom: 8, margin: 0, paddingLeft: 0, listStyle: "none", scrollSnapType: "x mandatory",
          }}
        >
          {FLOW_STEPS.map((step, idx, arr) => {
            const panelAccent = PANEL_META[step.panel]?.accent ?? "var(--primary)";
            return (
              <li
                key={step.label}
                style={{
                  flex: "1 1 0",
                  minWidth: 170,
                  padding: 14,
                  background: `color-mix(in srgb, ${panelAccent} 7%, var(--surface))`,
                  border: `1px solid color-mix(in srgb, ${panelAccent} 24%, var(--border))`,
                  borderRadius: 14,
                  position: "relative",
                  scrollSnapAlign: "start",
                }}
              >
                <div style={{ ...eyebrowStyle, color: panelAccent, marginBottom: 6 }}>Paso {idx + 1}</div>
                <div aria-hidden="true" style={{ fontSize: 22, marginBottom: 6 }}>{step.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)", fontFamily: "var(--nx-font-display)", marginBottom: 4 }}>
                  {step.label}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.45 }}>{step.desc}</div>
                <div style={{ ...eyebrowStyle, color: panelAccent, marginTop: 8, marginBottom: 0, opacity: 0.85 }}>
                  {panelShortName(step.panel)}
                </div>
                {idx < arr.length - 1 && (
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute", right: -13, top: "50%", transform: "translateY(-50%)",
                      color: "var(--text-tertiary)", fontSize: 14, zIndex: 2, pointerEvents: "none",
                    }}
                  >
                    →
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </Section>

      <Section title="Una sola fuente de verdad por tema" subtitle="Dónde vive el dato oficial y con qué no confundirlo, para no duplicar información.">
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
          {DOMAIN_TRUTHS.map((row) => (
            <li
              key={row.canonical}
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 12,
                padding: "12px 14px",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              <div>
                <div style={eyebrowStyle}>Fuente oficial</div>
                <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{row.canonical}</div>
              </div>
              <div>
                <div style={eyebrowStyle}>No confundir con</div>
                <div style={{ color: "var(--text-secondary)" }}>{row.alternate}</div>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Módulos" subtitle="Filtra por panel o busca un módulo para ver qué hace y quién lo usa.">
        <div role="group" aria-label="Filtrar por panel" style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <button
            type="button"
            aria-pressed={selectedPanel === "all"}
            onClick={() => setSelectedPanel("all")}
            style={pillBtn(selectedPanel === "all")}
          >
            Todos <span style={{ opacity: 0.7, fontVariantNumeric: "tabular-nums" }}>{totalModules}</span>
          </button>
          {Object.values(PANEL_META).map((p) => {
            const active = selectedPanel === p.id;
            const count = modulesByPanel.get(p.id as PanelId)?.length ?? 0;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={active}
                onClick={() => setSelectedPanel(p.id)}
                style={{
                  ...pillBtn(active),
                  borderColor: active ? p.accent : "var(--border)",
                  background: active ? `color-mix(in srgb, ${p.accent} 12%, var(--surface))` : "var(--surface)",
                  color: active ? p.accent : "var(--text-primary)",
                }}
              >
                <span aria-hidden="true">{p.icon}</span>
                {p.name.replace(/^NEXARA\s+/, "")}
                <span style={{ opacity: 0.7, fontVariantNumeric: "tabular-nums" }}>{count}</span>
              </button>
            );
          })}
        </div>
        <FilterToolbar
          search={{ value: query, onChange: setQuery, placeholder: "Buscar módulo por nombre o función…", ariaLabel: "Buscar módulos" }}
          onClear={() => { setQuery(""); setSelectedPanel("all"); }}
          resultCount={visibleModuleCount}
        />
      </Section>

      {filteredByPanel.size === 0 && (
        <EmptyState
          icon="🔎"
          title="Sin coincidencias"
          description="Ningún módulo coincide con la búsqueda."
          action={<Button size="sm" variant="secondary" onClick={() => setQuery("")}>Limpiar búsqueda</Button>}
        />
      )}

      {Array.from(filteredByPanel.entries()).map(([panelId, grouped]) => {
        const panelMeta = PANEL_META[panelId];
        const count = Array.from(grouped.values()).reduce((n, mods) => n + mods.length, 0);
        return (
          <Section
            key={panelId}
            title={
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span aria-hidden="true" style={{ fontSize: 22 }}>{panelMeta.icon}</span>
                <span>{panelMeta.name}</span>
                <span
                  style={{
                    fontSize: 11.5, fontWeight: 600, padding: "2px 8px", borderRadius: 6,
                    background: `color-mix(in srgb, ${panelMeta.accent} 14%, transparent)`, color: panelMeta.accent,
                  }}
                >
                  {count} {count === 1 ? "módulo" : "módulos"}
                </span>
              </span>
            }
            subtitle={panelMeta.tagline}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {Array.from(grouped.entries()).map(([groupName, mods]) => (
                <div key={groupName}>
                  <h3 style={{ ...eyebrowStyle, fontSize: 11, letterSpacing: "0.08em", margin: "0 0 8px" }}>{groupName}</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
                    {mods.map((m) => {
                      const guide = getModuleGuide(m.id);
                      const roleNames = m.allowedRoles.map((r: OrgRoleKey) => ORG_ROLE_META[r]?.label).filter(Boolean);
                      return (
                        <article
                          key={m.id}
                          style={{
                            padding: "12px 14px", background: "var(--surface)", border: "1px solid var(--border)",
                            borderRadius: 12, color: "var(--text-primary)", display: "flex", flexDirection: "column", gap: 4,
                          }}
                        >
                          <Link href={`/${panelId}${m.path === "/" ? "" : m.path}`} style={{ textDecoration: "none", color: "inherit" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span aria-hidden="true" style={{ fontSize: 16 }}>{m.icon}</span>
                              <span style={{ fontSize: 14, fontWeight: 650 }}>{m.label}</span>
                            </div>
                            <p style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5, margin: "4px 0 0" }}>
                              {m.description}
                            </p>
                          </Link>
                          {guide && (
                            <details style={{ marginTop: 6 }}>
                              <summary
                                style={{
                                  cursor: "pointer", fontSize: 12.5, fontWeight: 650, color: "var(--primary)",
                                  minHeight: 32, display: "flex", alignItems: "center",
                                }}
                              >
                                Cómo funciona
                              </summary>
                              <div style={{ marginTop: 6, fontSize: 12.5, lineHeight: 1.55, color: "var(--text-secondary)", maxWidth: "70ch" }}>
                                <p style={{ margin: "0 0 6px" }}><strong>Qué es:</strong> {guide.summary}</p>
                                <p style={{ margin: "0 0 6px" }}><strong>Quién lo usa:</strong> {guide.audience}</p>
                                <p style={{ margin: "0 0 6px" }}><strong>Cómo:</strong> {guide.how}</p>
                                <p style={{ margin: "0 0 4px" }}><strong>Pasos:</strong></p>
                                <ol style={{ margin: "0 0 6px", paddingLeft: 18 }}>
                                  {guide.steps.map((s) => (
                                    <li key={s} style={{ marginBottom: 3 }}>{s}</li>
                                  ))}
                                </ol>
                                <p style={{ margin: 0 }}><strong>Se conecta con:</strong> {guide.connects}</p>
                              </div>
                            </details>
                          )}
                          {roleNames.length > 0 && (
                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }} title={roleNames.join(", ")}>
                              {roleNames.slice(0, 3).map((label) => (
                                <span
                                  key={label}
                                  style={{
                                    fontSize: 11, padding: "2px 7px", borderRadius: 6,
                                    background: "var(--surface-2)", color: "var(--text-secondary)", fontWeight: 600,
                                  }}
                                >
                                  {label}
                                </span>
                              ))}
                              {roleNames.length > 3 && (
                                <span style={{ fontSize: 11, padding: "2px 6px", color: "var(--text-tertiary)", fontWeight: 600 }}>
                                  +{roleNames.length - 3} más
                                </span>
                              )}
                            </div>
                          )}
                        </article>
                      );
                    })}
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
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    minHeight: 40,
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 600,
    background: active ? "color-mix(in srgb, var(--primary) 12%, var(--surface))" : "var(--surface)",
    color: active ? "var(--primary)" : "var(--text-primary)",
    border: `1px solid ${active ? "var(--primary)" : "var(--border)"}`,
    borderRadius: 999,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "background var(--nx-motion-fast) ease, border-color var(--nx-motion-fast) ease",
  };
}
