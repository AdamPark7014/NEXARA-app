"use client";

import { useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { Tag } from "@/components/ui/DataTable";
import {
  PANEL_META,
  PANELS,
  getAllowedModules,
  type ModuleEntry,
  type PanelId,
} from "@/lib/access-matrix";
import {
  ORG_ROLE_KEYS,
  ORG_ROLE_META,
  type OrgRoleKey,
} from "@/lib/org-roles";

/**
 * Página premium de Gestión de Usuarios y Roles.
 * Visualiza la matriz rol → URLs accesibles con jerarquía y tier badges.
 */

type DemoUser = {
  id: number;
  nombre: string;
  email: string;
  orgRoleKey: OrgRoleKey;
  active: boolean;
  lastLogin: string;
};

const DEMO_USERS: DemoUser[] = [
  { id: 1, nombre: "Christian Del Pozo", email: "gerencia@nexara.com.mx", orgRoleKey: ORG_ROLE_KEYS.CEO, active: true, lastLogin: "Hoy · 09:12" },
  { id: 2, nombre: "Adam Del Pozo", email: "developer@nexara.com.mx", orgRoleKey: ORG_ROLE_KEYS.CEO, active: true, lastLogin: "Hoy · 11:48" },
  { id: 3, nombre: "Luis Joel Aguilar", email: "direccion.operaciones@nexara.com.mx", orgRoleKey: ORG_ROLE_KEYS.DIRECTOR_OPS, active: true, lastLogin: "Ayer · 17:30" },
  { id: 4, nombre: "Karen Elizalde", email: "ventas@nexara.com.mx", orgRoleKey: ORG_ROLE_KEYS.DIRECTOR_ADMIN, active: true, lastLogin: "Hoy · 08:25" },
  { id: 5, nombre: "Alejandro Gonzales", email: "operaciones@nexara.com.mx", orgRoleKey: ORG_ROLE_KEYS.PROJECT_MANAGER, active: true, lastLogin: "Hoy · 07:55" },
  { id: 6, nombre: "Carolina Juárez", email: "soporte@nexara.com.mx", orgRoleKey: ORG_ROLE_KEYS.SENIOR_ENGINEER, active: true, lastLogin: "Hoy · 10:14" },
  { id: 7, nombre: "Karina Martínez", email: "vendedor@nexara.com.mx", orgRoleKey: ORG_ROLE_KEYS.SALES_REP, active: true, lastLogin: "Hoy · 09:42" },
  { id: 8, nombre: "Julio Rivera", email: "julio.rivazquez@nexara.com.mx", orgRoleKey: ORG_ROLE_KEYS.FIELD_ENGINEER, active: true, lastLogin: "Hoy · 06:30 · GPS" },
  { id: 9, nombre: "David Morales", email: "david.morzenon@nexara.com.mx", orgRoleKey: ORG_ROLE_KEYS.FIELD_ENGINEER, active: true, lastLogin: "Hoy · 06:45 · GPS" },
  { id: 10, nombre: "Israel Ramos", email: "israel.ralima@nexara.com.mx", orgRoleKey: ORG_ROLE_KEYS.FIELD_ENGINEER, active: true, lastLogin: "Hoy · 07:02 · GPS" },
];

function tierFor(nivel: number): { label: string; color: string; bg: string } {
  if (nivel >= 90) return { label: "Ejecutivo", color: "#f59e0b", bg: "color-mix(in srgb, #f59e0b 14%, transparent)" };
  if (nivel >= 70) return { label: "Director", color: "#0ea5e9", bg: "color-mix(in srgb, #0ea5e9 14%, transparent)" };
  if (nivel >= 50) return { label: "Mando medio", color: "#10b981", bg: "color-mix(in srgb, #10b981 14%, transparent)" };
  if (nivel >= 30) return { label: "Especialista", color: "#a855f7", bg: "color-mix(in srgb, #a855f7 14%, transparent)" };
  return { label: "Operativo", color: "#64748b", bg: "color-mix(in srgb, #64748b 14%, transparent)" };
}

export default function UsersPage() {
  const [selectedRole, setSelectedRole] = useState<OrgRoleKey>(ORG_ROLE_KEYS.SALES_REP);
  const [filter, setFilter] = useState("");

  const filteredUsers = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return DEMO_USERS;
    return DEMO_USERS.filter(
      (u) =>
        u.nombre.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        ORG_ROLE_META[u.orgRoleKey].label.toLowerCase().includes(q),
    );
  }, [filter]);

  const modulesForRole = useMemo(() => getAllowedModules(selectedRole), [selectedRole]);
  const modulesByPanel = useMemo(() => {
    const map = new Map<PanelId, ModuleEntry[]>();
    for (const m of modulesForRole) {
      const list = map.get(m.panel) || [];
      list.push(m);
      map.set(m.panel, list);
    }
    return map;
  }, [modulesForRole]);

  const orgMeta = ORG_ROLE_META[selectedRole];
  const tier = tierFor(orgMeta.nivelAutoridad);

  return (
    <>
      <PageHeader
        eyebrow="ERP · Gobierno corporativo"
        title="Usuarios y roles"
        subtitle="Plantilla del equipo, matriz de accesos por URL y auditoría. Cada rol define exactamente a qué páginas y módulos puede entrar."
        variant="hero"
        meta={
          <>
            <Tag variant="accent" dot>{DEMO_USERS.length} cuentas activas</Tag>
            <Tag variant="neutral">{Object.keys(ORG_ROLE_META).length} roles · 5 tiers</Tag>
            <Tag variant="positive">100% con acceso restringido por matriz</Tag>
          </>
        }
        actions={
          <>
            <Button variant="secondary" iconLeft="📥">
              Exportar
            </Button>
            <Button variant="primary" iconLeft="➕" iconRight="→">
              Nuevo usuario
            </Button>
          </>
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.35fr) minmax(0, 1fr)",
          gap: 20,
        }}
      >
        <Section
          eyebrow="Plantilla"
          title={`Usuarios activos · ${DEMO_USERS.filter((u) => u.active).length}`}
          subtitle="Clic en un usuario para ver el detalle del rol y sus URLs"
          actions={
            <input
              type="search"
              placeholder="Buscar nombre, email o rol…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{
                height: 34,
                padding: "0 12px",
                fontSize: 12.5,
                background: "var(--surface-2)",
                border: "1px solid var(--nx-panel-hairline)",
                borderRadius: 9,
                color: "var(--text-primary)",
                outline: "none",
                width: 220,
              }}
            />
          }
        >
          {filteredUsers.length === 0 ? (
            <EmptyState
              icon="🔍"
              title="Sin resultados"
              description={`Ningún usuario coincide con "${filter}"`}
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filteredUsers.map((u) => {
                const meta = ORG_ROLE_META[u.orgRoleKey];
                const isSelected = u.orgRoleKey === selectedRole;
                const t = tierFor(meta.nivelAutoridad);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setSelectedRole(u.orgRoleKey)}
                    className="nx-user-row"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "auto 1fr auto auto",
                      gap: 14,
                      alignItems: "center",
                      padding: "12px 14px",
                      borderRadius: 12,
                      border: isSelected
                        ? `1px solid color-mix(in srgb, ${t.color} 50%, var(--border))`
                        : "1px solid var(--nx-panel-hairline)",
                      background: isSelected
                        ? `linear-gradient(135deg, ${t.bg} 0%, var(--surface) 60%)`
                        : "var(--surface)",
                      boxShadow: isSelected ? "var(--nx-panel-elev-2)" : "var(--nx-panel-elev-1)",
                      cursor: "pointer",
                      textAlign: "left",
                      fontFamily: "inherit",
                      color: "inherit",
                      transition: "transform 180ms var(--nx-ease-out), box-shadow 180ms var(--nx-ease-out), border-color 180ms var(--nx-ease-out)",
                    }}
                  >
                    <span
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 999,
                        background: `linear-gradient(135deg, ${t.color} 0%, color-mix(in srgb, ${t.color} 60%, var(--accent)) 100%)`,
                        color: "#fff",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        fontFamily: "var(--nx-font-display)",
                        fontSize: 13,
                        letterSpacing: "-0.02em",
                        boxShadow: `0 1px 0 rgba(255,255,255,0.18) inset, 0 6px 12px color-mix(in srgb, ${t.color} 24%, transparent)`,
                      }}
                    >
                      {u.nombre
                        .split(" ")
                        .slice(0, 2)
                        .map((n) => n[0])
                        .join("")}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--text-primary)" }}>
                        {u.nombre}
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{u.email}</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "2px 7px",
                          borderRadius: 5,
                          background: t.bg,
                          color: t.color,
                          letterSpacing: "0.05em",
                          textTransform: "uppercase",
                        }}
                      >
                        {t.label}
                      </span>
                      <span
                        style={{
                          fontSize: 11.5,
                          fontWeight: 600,
                          color: "var(--text-primary)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {meta.label}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: 10.5,
                        color: "var(--text-tertiary)",
                        whiteSpace: "nowrap",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {u.lastLogin}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Section>

        <div>
          <Section
            eyebrow={`Tier · ${tier.label}`}
            title={orgMeta.label}
            subtitle={orgMeta.description}
            tone="accent"
            actions={
              <Button size="sm" variant="ghost">
                Editar rol
              </Button>
            }
          >
            <div
              style={{
                padding: 14,
                borderRadius: 12,
                background: "var(--surface)",
                border: "1px solid var(--nx-panel-hairline)",
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: tier.color,
                  marginBottom: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: tier.color,
                  }}
                />
                Misión del rol · Nivel autoridad {orgMeta.nivelAutoridad}
              </div>
              <div style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.55 }}>
                {orgMeta.missionStatement}
              </div>
            </div>

            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "var(--text-tertiary)",
                marginBottom: 10,
              }}
            >
              Día a día
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
              {orgMeta.dailyActions.map((action) => (
                <li
                  key={action}
                  style={{
                    fontSize: 12.5,
                    color: "var(--text-secondary)",
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                    lineHeight: 1.5,
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      background: `color-mix(in srgb, ${tier.color} 18%, transparent)`,
                      color: tier.color,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 9,
                      fontWeight: 800,
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  >
                    ✓
                  </span>
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section
            eyebrow="Matriz de acceso"
            title="URLs a las que entra"
            subtitle={`${modulesForRole.length} módulos en ${modulesByPanel.size} paneles consolidados`}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {Object.values(PANELS).map((panelId) => {
                const items = modulesByPanel.get(panelId);
                if (!items || items.length === 0) return null;
                const panelMeta = PANEL_META[panelId];
                return (
                  <div key={panelId}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 8,
                        paddingBottom: 6,
                        borderBottom: `1px dashed color-mix(in srgb, ${panelMeta.accent} 28%, var(--border))`,
                      }}
                    >
                      <span style={{ fontSize: 14 }}>{panelMeta.icon}</span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: panelMeta.accent,
                          fontFamily: "var(--nx-font-display)",
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                        }}
                      >
                        {panelMeta.name}
                      </span>
                      <span
                        style={{
                          fontSize: 10.5,
                          padding: "1px 7px",
                          borderRadius: 999,
                          background: `color-mix(in srgb, ${panelMeta.accent} 12%, transparent)`,
                          color: panelMeta.accent,
                          fontWeight: 700,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {items.length}
                      </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {items.map((m) => (
                        <div
                          key={m.id}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "auto auto 1fr",
                            gap: 10,
                            alignItems: "center",
                            padding: "6px 10px",
                            background: "var(--surface)",
                            border: "1px solid var(--nx-panel-hairline-soft)",
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                        >
                          <span style={{ fontSize: 14, width: 18, textAlign: "center" }}>{m.icon}</span>
                          <code
                            style={{
                              color: panelMeta.accent,
                              fontSize: 11,
                              fontFamily: "var(--nx-panel-mono-font)",
                              background: `color-mix(in srgb, ${panelMeta.accent} 6%, transparent)`,
                              padding: "2px 7px",
                              borderRadius: 5,
                            }}
                          >
                            /{panelId}{m.path === "/" ? "" : m.path}
                          </code>
                          <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
                            {m.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        </div>
      </div>

      <Section
        eyebrow="Estructura organizacional"
        title="Jerarquía corporativa NEXARA"
        subtitle="5 tiers · 19 roles · clic en cualquier tarjeta para inspeccionar el rol y sus URLs"
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 12,
          }}
        >
          {Object.values(ORG_ROLE_META)
            .sort((a, b) => b.nivelAutoridad - a.nivelAutoridad)
            .map((meta) => {
              const isSelected = meta.orgRoleKey === selectedRole;
              const t = tierFor(meta.nivelAutoridad);
              return (
                <button
                  key={meta.orgRoleKey}
                  type="button"
                  onClick={() => setSelectedRole(meta.orgRoleKey)}
                  className="nx-role-card"
                  style={{
                    position: "relative",
                    padding: "14px 16px",
                    background: isSelected
                      ? `linear-gradient(135deg, ${t.bg} 0%, var(--surface) 70%)`
                      : "var(--surface)",
                    border: isSelected
                      ? `1px solid color-mix(in srgb, ${t.color} 50%, var(--border))`
                      : "1px solid var(--nx-panel-hairline)",
                    borderRadius: 14,
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: "inherit",
                    color: "inherit",
                    boxShadow: isSelected ? "var(--nx-panel-elev-2)" : "var(--nx-panel-elev-1)",
                    overflow: "hidden",
                    transition: "transform 180ms var(--nx-ease-out), box-shadow 180ms var(--nx-ease-out), border-color 180ms var(--nx-ease-out)",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 12,
                      bottom: 12,
                      width: 3,
                      borderRadius: "0 3px 3px 0",
                      background: t.color,
                    }}
                  />
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 6,
                      paddingLeft: 6,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 9.5,
                        fontWeight: 700,
                        padding: "2px 7px",
                        borderRadius: 5,
                        background: t.bg,
                        color: t.color,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                      }}
                    >
                      {t.label}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: "var(--text-tertiary)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      LV {meta.nivelAutoridad}
                    </span>
                  </div>
                  <div style={{ paddingLeft: 6 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 14,
                        color: "var(--text-primary)",
                        fontFamily: "var(--nx-font-display)",
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {meta.label}
                    </div>
                    <div
                      style={{
                        fontSize: 10.5,
                        color: "var(--text-tertiary)",
                        marginTop: 2,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      {meta.departmentHint}
                    </div>
                    <div
                      style={{
                        fontSize: 11.5,
                        color: "var(--text-secondary)",
                        marginTop: 8,
                        lineHeight: 1.5,
                      }}
                    >
                      {meta.description}
                    </div>
                  </div>
                </button>
              );
            })}
        </div>
      </Section>

      <style jsx>{`
        :global(.nx-user-row:hover) {
          transform: translateY(-1px);
          box-shadow: var(--nx-panel-elev-2);
          border-color: color-mix(in srgb, var(--primary) 35%, var(--border));
        }
        :global(.nx-role-card:hover) {
          transform: translateY(-2px);
          box-shadow: var(--nx-panel-elev-hover);
        }
      `}</style>
    </>
  );
}
