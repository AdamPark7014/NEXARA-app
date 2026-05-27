"use client";

import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import KpiCard from "@/components/ui/KpiCard";
import Button from "@/components/ui/Button";
import { Tag, Money } from "@/components/ui/DataTable";

/**
 * Vista ejecutiva — la pantalla que ve el CEO al hacer login.
 * Agregado de los 4 paneles operativos con KPIs de alto nivel y
 * deeplinks a los módulos correspondientes.
 */

type Alert = {
  icon: string;
  title: string;
  desc: string;
  href: string;
  urgency: "danger" | "warning";
  cta: string;
};

const ALERTS: Alert[] = [
  {
    icon: "🛡️",
    title: "3 aprobaciones esperando tu firma",
    desc: "OC Polos del Bienestar ($3.2M) · Cámaras Hikvision lote ($420k) · Renovación UDLA ($1.6M)",
    href: "/erp/approvals",
    urgency: "danger",
    cta: "Aprobar",
  },
  {
    icon: "💸",
    title: "Cobranza vencida supera $850k",
    desc: "TOKS Centro Histórico · Comercializadora Lima · Constructora Reyes (> 60 días)",
    href: "/erp/banking",
    urgency: "warning",
    cta: "Ver banca",
  },
  {
    icon: "🚨",
    title: "Sitio Constructora Reyes caído > 18h",
    desc: "SLA penalty estimada: $24k. Requiere intervención presencial y aviso al cliente.",
    href: "/ops/noc",
    urgency: "danger",
    cta: "Ir a NOC",
  },
];

const SHORTCUTS = [
  { href: "/erp/approvals", label: "Aprobaciones", icon: "🛡️", count: 3, accent: "#ef4444" },
  { href: "/erp/users", label: "Roles y accesos", icon: "🧑‍💼", accent: "#0ea5e9" },
  { href: "/erp/architecture", label: "Arquitectura", icon: "🗺️", accent: "#0ea5e9" },
  { href: "/erp/audit", label: "Audit log", icon: "🔍", accent: "#0ea5e9" },
  { href: "/erp/banking", label: "Banca", icon: "🏦", accent: "#10b981" },
  { href: "/crm/pipeline", label: "Pipeline", icon: "📊", accent: "#10b981" },
  { href: "/ops/noc", label: "NOC", icon: "📡", accent: "#f97316" },
  { href: "/studio/dashboard", label: "Studio", icon: "🎨", accent: "#a855f7" },
];

export default function ExecutivePage() {
  return (
    <>
      <PageHeader
        eyebrow="ERP · CEO"
        title="Vista ejecutiva"
        subtitle="Todo el negocio en una pantalla. Si algo necesita tu atención, aparece arriba — el resto es contexto."
        variant="hero"
        meta={
          <>
            <Tag variant="danger" dot>3 firmas pendientes</Tag>
            <Tag variant="warning">2 alertas operativas</Tag>
            <Tag variant="positive">Salud global 87%</Tag>
          </>
        }
        actions={
          <>
            <Button variant="secondary" iconLeft="📥">
              Descargar reporte
            </Button>
            <Button variant="primary" iconLeft="📅" iconRight="→">
              Vista del mes
            </Button>
          </>
        }
      />

      <Section
        eyebrow="Mesa del CEO"
        title="Requiere tu atención"
        subtitle="Decisiones que solo tú puedes tomar — ordenadas por urgencia"
        tone="accent"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {ALERTS.map((a, i) => {
            const color = a.urgency === "danger" ? "var(--danger)" : "var(--warning)";
            return (
              <Link
                key={i}
                href={a.href}
                className="nx-alert-card"
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "14px 16px 14px 20px",
                  background: `linear-gradient(135deg, color-mix(in srgb, ${color} 9%, var(--surface)) 0%, var(--surface) 70%)`,
                  border: `1px solid color-mix(in srgb, ${color} 32%, var(--border))`,
                  borderRadius: 14,
                  textDecoration: "none",
                  color: "var(--text-primary)",
                  boxShadow: "var(--nx-panel-elev-1)",
                  transition: "transform 180ms var(--nx-ease-out), box-shadow 180ms var(--nx-ease-out)",
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
                    background: color,
                    boxShadow: `0 0 12px color-mix(in srgb, ${color} 60%, transparent)`,
                  }}
                />
                <span
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: `color-mix(in srgb, ${color} 16%, var(--surface))`,
                    border: `1px solid color-mix(in srgb, ${color} 28%, var(--border))`,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 22,
                    flexShrink: 0,
                  }}
                >
                  {a.icon}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 3 }}>
                    <span
                      style={{
                        fontSize: 9.5,
                        fontWeight: 700,
                        padding: "2px 7px",
                        borderRadius: 5,
                        background: `color-mix(in srgb, ${color} 16%, transparent)`,
                        color,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                      }}
                    >
                      {a.urgency === "danger" ? "Crítico" : "Importante"}
                    </span>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)" }}>{a.title}</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3, lineHeight: 1.45 }}>{a.desc}</div>
                </div>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    color,
                    whiteSpace: "nowrap",
                  }}
                  className="nx-alert-cta"
                >
                  {a.cta} →
                </span>
              </Link>
            );
          })}
        </div>
      </Section>

      <Section eyebrow="$" title="Pulso financiero" subtitle="Mes actual vs anterior">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          <KpiCard label="Ingresos del mes" value={<Money value={4820000} compact />} hint="vs $4.1M mes pasado" trend={{ direction: "up", value: "+17.5%" }} variant="positive" icon="💰" sparkline={[3.4, 3.7, 3.9, 4.0, 4.2, 4.5, 4.82]} />
          <KpiCard label="Gastos del mes" value={<Money value={2840000} compact />} hint="vs $2.9M mes pasado" trend={{ direction: "up", value: "-2.1%" }} variant="positive" icon="📉" />
          <KpiCard label="Margen bruto" value="41.1%" hint="vs 38.6% mes pasado" trend={{ direction: "up", value: "+2.5pp" }} variant="accent" icon="📊" sparkline={[35, 36, 37, 38, 39, 40, 41.1]} />
          <KpiCard label="MRR vigente" value={<Money value={177000} compact />} hint="5 contratos activos" icon="🔄" />
          <KpiCard label="Cobranza vencida" value={<Money value={852000} compact />} hint="3 clientes > 60 días" variant="warning" icon="⏳" trend={{ direction: "down", value: "+$120k WoW" }} />
          <KpiCard label="Saldo en bancos" value={<Money value={2410000} compact />} hint="3 cuentas operativas" icon="🏦" />
        </div>
      </Section>

      <Section
        eyebrow="$"
        title="Pulso comercial"
        subtitle="Pipeline y forecast del trimestre"
        actions={
          <Link href="/crm/pipeline" style={{ textDecoration: "none" }}>
            <Button variant="ghost" iconLeft="📊" iconRight="→" size="sm">
              Ver pipeline
            </Button>
          </Link>
        }
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          <KpiCard label="Pipeline total" value={<Money value={8420000} compact />} hint="9 oportunidades activas" variant="accent" icon="🎯" sparkline={[6.2, 6.8, 7.1, 7.5, 7.9, 8.2, 8.42]} />
          <KpiCard label="Pipeline ponderado" value={<Money value={4180000} compact />} hint="por probabilidad" icon="⚖️" />
          <KpiCard label="Cotizaciones firmadas" value="2 / 7" hint="tasa 28.6%" trend={{ direction: "up", value: "+5pp" }} variant="positive" icon="✍️" />
          <KpiCard label="Leads del mes" value="47" hint="vs 32 mes pasado" trend={{ direction: "up", value: "+47%" }} variant="positive" icon="✨" sparkline={[18, 22, 28, 32, 38, 42, 47]} />
        </div>
      </Section>

      <Section
        eyebrow="$"
        title="Pulso operativo"
        subtitle="Trabajo de campo y servicio continuo"
        actions={
          <Link href="/ops/dashboard" style={{ textDecoration: "none" }}>
            <Button variant="ghost" iconLeft="🚀" iconRight="→" size="sm">
              Ir a OPS
            </Button>
          </Link>
        }
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          <KpiCard label="OT cerradas (mes)" value="142" hint="92% en tiempo" variant="positive" icon="✓" sparkline={[110, 118, 124, 130, 134, 138, 142]} />
          <KpiCard label="OT abiertas hoy" value="11" hint="5 en curso · 6 pendientes" icon="📋" />
          <KpiCard label="SLA cumplimiento" value="96.2%" hint="vs 94.8% mes pasado" trend={{ direction: "up", value: "+1.4pp" }} variant="positive" icon="⏱️" sparkline={[94, 94.5, 95, 95.5, 96, 96.1, 96.2]} />
          <KpiCard label="Sitios monitoreados" value="48" hint="46 OK · 1 degradado · 1 caído" variant="warning" icon="📡" />
        </div>
      </Section>

      <Section
        eyebrow="$"
        title="Pulso de personas"
        subtitle="RH y equipo"
        actions={
          <Link href="/erp/hr" style={{ textDecoration: "none" }}>
            <Button variant="ghost" iconLeft="👥" iconRight="→" size="sm">
              RRHH
            </Button>
          </Link>
        }
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          <KpiCard label="Plantilla activa" value="34" hint="28 internos · 6 contratistas" icon="🧑‍💼" />
          <KpiCard label="Ingenieros en campo" value="12 / 14" hint="2 con vacaciones" icon="🛠️" />
          <KpiCard label="Bajas (90d)" value="1" hint="rotación 2.9%" variant="positive" icon="📉" />
          <KpiCard label="Capacitaciones pendientes" value="6" hint="vence en 2 semanas" variant="warning" icon="🎓" />
        </div>
      </Section>

      <Section eyebrow="Saltos" title="Atajos rápidos" subtitle="Lo que más usas — un clic">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          {SHORTCUTS.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="nx-exec-shortcut"
              style={{
                position: "relative",
                padding: "14px 14px",
                background: "var(--surface)",
                border: "1px solid var(--nx-panel-hairline)",
                borderRadius: 12,
                textDecoration: "none",
                color: "var(--text-primary)",
                display: "flex",
                alignItems: "center",
                gap: 10,
                boxShadow: "var(--nx-panel-elev-1)",
                overflow: "hidden",
                transition: "transform 180ms var(--nx-ease-out), border-color 180ms var(--nx-ease-out), box-shadow 180ms var(--nx-ease-out)",
              }}
            >
              <span
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 9,
                  background: `color-mix(in srgb, ${a.accent} 14%, var(--surface))`,
                  color: a.accent,
                  border: `1px solid color-mix(in srgb, ${a.accent} 22%, var(--border))`,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 17,
                  flexShrink: 0,
                }}
              >
                {a.icon}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{a.label}</span>
              {a.count && <Tag variant="danger" size="sm">{a.count}</Tag>}
            </Link>
          ))}
        </div>
      </Section>

      <style jsx>{`
        :global(.nx-alert-card:hover) {
          transform: translateY(-1px);
          box-shadow: var(--nx-panel-elev-2);
        }
        :global(.nx-alert-card:hover .nx-alert-cta) {
          transform: translateX(3px);
        }
        :global(.nx-exec-shortcut:hover) {
          transform: translateY(-2px);
          border-color: color-mix(in srgb, var(--primary) 35%, var(--border));
          box-shadow: var(--nx-panel-elev-hover);
        }
      `}</style>
    </>
  );
}
