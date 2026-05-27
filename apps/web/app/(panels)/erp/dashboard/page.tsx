"use client";

import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import KpiCard from "@/components/ui/KpiCard";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import { Tag, Money } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";

type Approval = {
  id: string;
  titulo: string;
  monto: number | null;
  solicita: string;
  panel: "ERP" | "OPS" | "CRM";
  urgencia: "alta" | "media" | "baja";
};

const APPROVALS: Approval[] = [
  { id: "OC-4892", titulo: "OC #4892 · 24 cámaras Hikvision DS-2CD2143", monto: 84200, solicita: "Almacén · Israel R.", panel: "ERP", urgencia: "alta" },
  { id: "VIA-188", titulo: "Viáticos · Visita Soriana Querétaro (4 ing, 3 días)", monto: 18400, solicita: "PM · Alejandro G.", panel: "OPS", urgencia: "media" },
  { id: "COT-602", titulo: "Descuento 22% · Cotización UDLA Puebla (laptops)", monto: 412000, solicita: "Karina M.", panel: "CRM", urgencia: "alta" },
  { id: "HR-21", titulo: "Contratación · Ingeniero CCTV junior", monto: null, solicita: "RH · Carolina J.", panel: "ERP", urgencia: "baja" },
];

const PANEL_COLOR: Record<Approval["panel"], string> = {
  ERP: "#0ea5e9",
  OPS: "#f97316",
  CRM: "#10b981",
};

const SHORTCUTS = [
  { href: "/crm/dashboard", icon: "📈", title: "Pipeline comercial", desc: "Saltar al CRM", accent: "#10b981" },
  { href: "/ops/dashboard", icon: "🚀", title: "Operación de campo", desc: "Saltar a OPS", accent: "#f97316" },
  { href: "/studio/dashboard", icon: "🎨", title: "Sitio público & marca", desc: "Saltar a STUDIO", accent: "#a855f7" },
  { href: "/erp/users", icon: "🧑‍💼", title: "Gestionar usuarios", desc: "Roles, accesos por URL y matriz", accent: "#0ea5e9" },
  { href: "/erp/architecture", icon: "🗺️", title: "Arquitectura del ERP", desc: "Mapa de módulos y flujo end-to-end", accent: "#0ea5e9" },
  { href: "/erp/audit", icon: "🔍", title: "Auditoría", desc: "Timeline inmutable de cambios sensibles", accent: "#0ea5e9" },
];

const HEALTH = [
  { name: "Ventas (CRM)", health: 92, variant: "positive" as const, note: "12 oportunidades por cerrar este mes" },
  { name: "Operación (OPS)", health: 88, variant: "positive" as const, note: "2 visitas fuera de SLA esta semana" },
  { name: "Finanzas", health: 78, variant: "warning" as const, note: "$ 1.2M en CXC pendiente · 9 facturas > 30d" },
  { name: "Almacén & Compras", health: 81, variant: "positive" as const, note: "2 SKU bajo mínimo · 1 OC en tránsito" },
  { name: "NOC & Soporte", health: 95, variant: "positive" as const, note: "99.6% uptime de cámaras · 2 tickets P2 abiertos" },
  { name: "Personas (RH)", health: 90, variant: "positive" as const, note: "3 vacantes activas · 1 nuevo ingreso esta semana" },
];

export default function ErpDashboardPage() {
  const { user } = useUser();
  const nombre = user?.nombre?.split(" ")[0] ?? "Equipo";
  const ahora = new Date();
  const horas = ahora.getHours();
  const saludo = horas < 12 ? "Buenos días" : horas < 19 ? "Buenas tardes" : "Buenas noches";

  return (
    <>
      <PageHeader
        eyebrow="ERP · Tablero ejecutivo"
        title={`${saludo}, ${nombre}`}
        subtitle="Resumen consolidado del negocio: pipeline comercial, ejecución de proyectos, salud financiera y operaciones del día."
        variant="hero"
        meta={
          <>
            <Tag variant="accent" dot>EN VIVO</Tag>
            <Tag variant="neutral">{new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long" }).format(ahora)}</Tag>
            <Tag variant="positive">Salud global 87%</Tag>
          </>
        }
        actions={
          <>
            <Button variant="secondary" iconLeft="📥">
              Exportar
            </Button>
            <Link href="/erp/executive" style={{ textDecoration: "none" }}>
              <Button variant="primary" iconLeft="📊" iconRight="→">
                Vista ejecutiva
              </Button>
            </Link>
          </>
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <KpiCard
          label="Pipeline activo"
          value={<>$<span style={{ fontSize: "0.7em", opacity: 0.85, marginLeft: 2 }}>4.8M</span></>}
          hint="32 oportunidades en negociación"
          icon="🎯"
          variant="accent"
          trend={{ value: "+12% MoM", direction: "up" }}
          sparkline={[3.6, 3.9, 4.1, 4.0, 4.3, 4.6, 4.8]}
        />
        <KpiCard
          label="Proyectos en campo"
          value="18"
          hint="6 CCTV · 4 redes · 8 mantenimiento"
          icon="🛠️"
          sparkline={[12, 13, 14, 16, 15, 17, 18]}
        />
        <KpiCard
          label="Margen del mes"
          value="34.2%"
          hint="vs 31% planeado"
          icon="📈"
          variant="positive"
          trend={{ value: "+3.2pp", direction: "up" }}
          sparkline={[28, 30, 31, 32, 32, 33, 34.2]}
        />
        <KpiCard
          label="Cobranza pendiente"
          value={<><Money value={1_200_000} compact /></>}
          hint="9 facturas > 30 días"
          icon="🧾"
          variant="warning"
          trend={{ value: "-4% WoW", direction: "down" }}
        />
        <KpiCard
          label="Alertas críticas"
          value="3"
          hint="2 SLA en riesgo · 1 stock mínimo"
          icon="⚠️"
          variant="danger"
        />
        <KpiCard
          label="Personal en sitio"
          value="11/14"
          hint="3 ingenieros en oficina"
          icon="🧑‍💼"
          sparkline={[10, 11, 12, 11, 12, 11, 11]}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)",
          gap: 20,
        }}
      >
        <Section
          eyebrow="Bandeja del CEO"
          title="Aprobaciones pendientes"
          subtitle="Requieren tu firma esta semana — ordenadas por urgencia y monto"
          tone="accent"
          actions={
            <Link href="/erp/approvals" style={{ textDecoration: "none" }}>
              <Button size="sm" variant="ghost" iconRight="→">
                Ver todas
              </Button>
            </Link>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {APPROVALS.map((a) => (
              <article
                key={a.id}
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 14,
                  padding: "14px 16px 14px 18px",
                  background: "var(--surface)",
                  border: "1px solid var(--nx-panel-hairline)",
                  borderRadius: 14,
                  boxShadow: "var(--nx-panel-elev-1)",
                  transition: "transform 180ms var(--nx-ease-out), box-shadow 180ms var(--nx-ease-out)",
                }}
                className="nx-approval-row"
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
                    background: PANEL_COLOR[a.panel],
                  }}
                />
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 7px",
                        borderRadius: 5,
                        background: `color-mix(in srgb, ${PANEL_COLOR[a.panel]} 16%, transparent)`,
                        color: PANEL_COLOR[a.panel],
                        letterSpacing: "0.04em",
                      }}
                    >
                      {a.panel}
                    </span>
                    <code style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{a.id}</code>
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" }}>
                    {a.titulo}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 3 }}>
                    Solicita · {a.solicita}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  {a.monto !== null ? (
                    <span style={{ fontSize: 15, fontFamily: "var(--nx-font-display)", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      <Money value={a.monto} />
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Sin monto</span>
                  )}
                  <Tag variant={a.urgencia === "alta" ? "danger" : a.urgencia === "media" ? "warning" : "neutral"} dot>
                    {a.urgencia}
                  </Tag>
                  <Button size="sm" variant="primary">
                    Revisar
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </Section>

        <Section
          eyebrow="Atajos"
          title="Lo que más usas"
          subtitle="Saltos rápidos entre paneles"
        >
          <div style={{ display: "grid", gap: 8 }}>
            {SHORTCUTS.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                className="nx-shortcut"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "11px 12px",
                  borderRadius: 12,
                  textDecoration: "none",
                  color: "var(--text-primary)",
                  border: "1px solid var(--nx-panel-hairline)",
                  background: "var(--surface)",
                  transition:
                    "transform 180ms var(--nx-ease-out), border-color 180ms var(--nx-ease-out), box-shadow 180ms var(--nx-ease-out)",
                }}
              >
                <span
                  style={{
                    fontSize: 17,
                    width: 34,
                    height: 34,
                    borderRadius: 9,
                    background: `color-mix(in srgb, ${s.accent} 16%, var(--surface))`,
                    color: s.accent,
                    border: `1px solid color-mix(in srgb, ${s.accent} 22%, var(--border))`,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {s.icon}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{s.title}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 1 }}>{s.desc}</div>
                </div>
                <span className="nx-shortcut-arrow" style={{ color: "var(--text-tertiary)", transition: "transform 180ms" }}>
                  →
                </span>
              </Link>
            ))}
          </div>
        </Section>
      </div>

      <Section
        eyebrow="Estado del negocio"
        title="Salud por dominio"
        subtitle="Última actualización hace 4 minutos · semáforo verde > 85, ámbar 70–85, rojo < 70"
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 12,
          }}
        >
          {HEALTH.map((d) => {
            const color =
              d.variant === "positive"
                ? "var(--success)"
                : d.variant === "warning"
                  ? "var(--warning)"
                  : "var(--danger)";
            return (
              <div
                key={d.name}
                style={{
                  padding: 16,
                  borderRadius: 14,
                  background: "var(--surface)",
                  border: "1px solid var(--nx-panel-hairline)",
                  boxShadow: "var(--nx-panel-elev-1)",
                  transition: "transform 180ms var(--nx-ease-out), box-shadow 180ms var(--nx-ease-out)",
                }}
                className="nx-health-card"
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{d.name}</span>
                  <span
                    style={{
                      fontFamily: "var(--nx-font-display)",
                      fontSize: 17,
                      fontWeight: 700,
                      color,
                      fontVariantNumeric: "tabular-nums",
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {d.health}
                    <span style={{ fontSize: "0.55em", marginLeft: 1, opacity: 0.7 }}>%</span>
                  </span>
                </div>
                <div
                  style={{
                    position: "relative",
                    height: 7,
                    background: "color-mix(in srgb, var(--surface-2) 80%, transparent)",
                    borderRadius: 999,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${d.health}%`,
                      height: "100%",
                      background: `linear-gradient(90deg, color-mix(in srgb, ${color} 70%, transparent) 0%, ${color} 100%)`,
                      borderRadius: 999,
                      transition: "width 600ms var(--nx-ease-out)",
                      boxShadow: `0 0 12px color-mix(in srgb, ${color} 50%, transparent)`,
                    }}
                  />
                </div>
                <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 10, lineHeight: 1.4 }}>{d.note}</div>
              </div>
            );
          })}
        </div>
      </Section>

      <style jsx>{`
        :global(.nx-approval-row:hover) {
          transform: translateY(-1px);
          box-shadow: var(--nx-panel-elev-2);
        }
        :global(.nx-shortcut:hover) {
          transform: translateY(-1px);
          border-color: color-mix(in srgb, var(--primary) 40%, var(--border));
          box-shadow: var(--nx-panel-elev-2);
        }
        :global(.nx-shortcut:hover .nx-shortcut-arrow) {
          transform: translateX(3px);
          color: var(--primary) !important;
        }
        :global(.nx-health-card:hover) {
          transform: translateY(-2px);
          box-shadow: var(--nx-panel-elev-hover);
        }
      `}</style>
    </>
  );
}
