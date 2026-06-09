"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import KpiCard from "@/components/ui/KpiCard";
import Button from "@/components/ui/Button";
import { Tag, Money } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import {
  alertsToCards,
  fetchExecutiveDashboard,
  type ExecutiveCardAlert,
  type ExecutiveDashboard,
} from "@/lib/executive-api";

/**
 * Vista ejecutiva — la pantalla que ve el CEO al hacer login.
 * Agregado de los 4 paneles operativos con KPIs de alto nivel y
 * deeplinks a los módulos correspondientes.
 *
 * Datos: `GET /api/executive/c-level` (executive.service.ts). Si la API falla
 * o el usuario no tiene permisos (`SALES_REPORTS_VIEW | CONTABILIDAD_VIEW |
 * CONSOLE_ADMIN`), caemos a un demo estático para no dejar la pantalla vacía
 * en demos / staging sin datos.
 */

type Alert = ExecutiveCardAlert;

const FALLBACK_ALERTS: Alert[] = [
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

const SHORTCUTS_BASE = [
  { href: "/erp/approvals", label: "Aprobaciones", icon: "🛡️", count: 3, accent: "#ef4444" },
  { href: "/erp/users", label: "Roles y accesos", icon: "🧑‍💼", accent: "#0ea5e9" },
  { href: "/erp/architecture", label: "Arquitectura", icon: "🗺️", accent: "#0ea5e9" },
  { href: "/erp/audit", label: "Audit log", icon: "🔍", accent: "#0ea5e9" },
  { href: "/erp/banking", label: "Banca", icon: "🏦", accent: "#10b981" },
  { href: "/crm/pipeline", label: "Pipeline", icon: "📊", accent: "#10b981" },
  { href: "/ops/noc", label: "NOC", icon: "📡", accent: "#f97316" },
  { href: "/studio/dashboard", label: "Studio", icon: "🎨", accent: "#a855f7" },
];

type FetchState =
  | { status: "loading" }
  | { status: "ready"; data: ExecutiveDashboard }
  | { status: "error"; message: string }
  | { status: "anonymous" };

export default function ExecutivePage() {
  const { token, user } = useUser();
  const [state, setState] = useState<FetchState>({ status: "loading" });

  useEffect(() => {
    if (!token || !user) {
      setState({ status: "anonymous" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    fetchExecutiveDashboard(token)
      .then((data) => { if (!cancelled) setState({ status: "ready", data }); })
      .catch((err: Error) => {
        if (cancelled) return;
        setState({ status: "error", message: err.message });
      });
    return () => { cancelled = true; };
  }, [token, user]);

  const data = state.status === "ready" ? state.data : null;

  // Alertas: si tenemos backend, las usamos; sino, fallback demo.
  const alerts: Alert[] = useMemo(() => {
    if (data && data.alerts.length > 0) return alertsToCards(data.alerts);
    return FALLBACK_ALERTS;
  }, [data]);

  // Aprobaciones pendientes (atajos): contamos warnings/criticals si los hay.
  const pendingCount = useMemo(() => {
    if (!data) return 3;
    return (data.alerts || []).filter(
      (a) => a.level === "critical" || a.level === "warning",
    ).length;
  }, [data]);

  const shortcuts = useMemo(() => {
    return SHORTCUTS_BASE.map((s) =>
      s.href === "/erp/approvals" ? { ...s, count: pendingCount } : s,
    );
  }, [pendingCount]);

  // KPIs financieros: usar backend cuando esté, fallback demo si no.
  const kpis = data?.headlineKpis ?? null;
  const sales = data?.sales ?? null;
  const operations = data?.operations ?? null;
  const finance = data?.finance ?? null;

  const isLive = state.status === "ready";

  return (
    <>
      <PageHeader
        eyebrow="ERP · CEO"
        title="Vista ejecutiva"
        subtitle={
          state.status === "loading"
            ? "Consolidando ventas, operación, finanzas y RH…"
            : "Todo el negocio en una pantalla. Si algo necesita tu atención, aparece arriba — el resto es contexto."
        }
        variant="hero"
        meta={
          <>
            <Tag variant={isLive ? "positive" : "neutral"} dot>{isLive ? "Live" : state.status === "loading" ? "Cargando" : "Demo"}</Tag>
            {alerts.some((a) => a.urgency === "danger") && (
              <Tag variant="danger" dot>{alerts.filter((a) => a.urgency === "danger").length} críticas</Tag>
            )}
            {alerts.some((a) => a.urgency === "warning") && (
              <Tag variant="warning">{alerts.filter((a) => a.urgency === "warning").length} alertas</Tag>
            )}
            {data && (
              <Tag variant="neutral">{data.teamSize} en plantilla</Tag>
            )}
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
          {alerts.map((a, i) => {
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

      <Section eyebrow="$" title="Pulso financiero" subtitle={kpis ? `Cierre de ${new Date().toLocaleDateString("es-MX", { month: "long", year: "numeric" })} en vivo` : "Mes actual vs anterior"}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          <KpiCard
            label="Ingresos del mes"
            value={<Money value={kpis?.revenueMtd ?? 4820000} compact />}
            hint={kpis ? `vs ${new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(kpis.revenuePrevMonth)} mes pasado` : "vs $4.1M mes pasado"}
            trend={kpis ? { direction: kpis.revenueMoMChange >= 0 ? "up" : "down", value: `${kpis.revenueMoMChange >= 0 ? "+" : ""}${kpis.revenueMoMChange}%` } : { direction: "up", value: "+17.5%" }}
            variant={kpis ? (kpis.revenueMoMChange >= 0 ? "positive" : "warning") : "positive"}
            icon="💰"
          />
          <KpiCard
            label="Ingresos YTD"
            value={<Money value={kpis?.revenueYtd ?? 38400000} compact />}
            hint={kpis ? `${kpis.wonOppsMtd} oportunidades ganadas este mes` : "Acumulado del año"}
            variant="accent"
            icon="📊"
          />
          <KpiCard
            label="Pipeline activo"
            value={<Money value={kpis?.pipelineValue ?? 8420000} compact />}
            hint={kpis ? `${kpis.pipelineCount} oportunidades en curso` : "9 oportunidades activas"}
            variant="accent"
            icon="🎯"
          />
          <KpiCard
            label="Saldo en bancos"
            value={<Money value={kpis?.cashOnHand ?? 2410000} compact />}
            hint={kpis ? "Total cuentas activas" : "3 cuentas operativas"}
            icon="🏦"
          />
          <KpiCard
            label="Cuentas por cobrar"
            value={<Money value={kpis?.arOutstanding ?? 852000} compact />}
            hint={finance ? `${finance.overdueInvoices} facturas vencidas` : "3 clientes > 60 días"}
            variant={finance && finance.overdueInvoices > 0 ? "warning" : "default"}
            icon="⏳"
          />
          <KpiCard
            label="Capital de trabajo"
            value={<Money value={kpis?.workingCapital ?? 1200000} compact />}
            hint="AR − AP"
            variant={kpis && kpis.workingCapital >= 0 ? "positive" : "warning"}
            icon="💼"
          />
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
          <KpiCard
            label="Pipeline total"
            value={<Money value={kpis?.pipelineValue ?? 8420000} compact />}
            hint={kpis ? `${kpis.pipelineCount} oportunidades activas` : "9 oportunidades activas"}
            variant="accent"
            icon="🎯"
          />
          <KpiCard
            label="Ganadas (mes)"
            value={String(kpis?.wonOppsMtd ?? 2)}
            hint={kpis ? new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(kpis.revenueMtd) : "vs 7 cotizaciones"}
            trend={kpis ? { direction: "up", value: `${kpis.revenueMoMChange >= 0 ? "+" : ""}${kpis.revenueMoMChange}% MoM` } : { direction: "up", value: "+5pp" }}
            variant="positive"
            icon="✍️"
          />
          <KpiCard
            label="Leads calientes"
            value={String(sales?.hotLeads ?? 47)}
            hint={sales ? "Score ≥ 70" : "vs 32 mes pasado"}
            variant={sales && sales.hotLeads > 0 ? "accent" : "default"}
            icon="✨"
          />
          <KpiCard
            label="Licitaciones"
            value={`${sales?.tendersOpen ?? 4} / ${sales?.tendersWon ?? 2}`}
            hint="abiertas / ganadas"
            icon="📜"
          />
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
          <KpiCard
            label="OT cerradas (mes)"
            value={String(operations?.otCompletedMtd ?? 142)}
            hint={operations ? `${operations.activeProjects} proyectos activos` : "92% en tiempo"}
            variant="positive"
            icon="✓"
          />
          <KpiCard
            label="OT abiertas"
            value={String(operations?.otOpen ?? 11)}
            hint={operations ? `${operations.otOverdue} vencidas` : "5 en curso · 6 pendientes"}
            variant={operations && operations.otOverdue > 0 ? "warning" : "default"}
            icon="📋"
          />
          <KpiCard
            label="Tickets soporte"
            value={String(operations?.ticketsOpen ?? 8)}
            hint={operations ? `${operations.ticketsClosedMtd} cerrados este mes` : "vs 12 mes pasado"}
            variant={operations && operations.ticketsOpen > 10 ? "warning" : "positive"}
            icon="🎫"
          />
          <KpiCard
            label="Mantenimiento"
            value={String(data?.maintenance.activeContracts ?? 12)}
            hint={data ? `${data.maintenance.upcomingVisits} visitas próximas (30d)` : "contratos activos"}
            icon="🛠️"
          />
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
          <KpiCard
            label="Plantilla activa"
            value={String(data?.teamSize ?? 34)}
            hint={data ? `${data.clientsCount} clientes activos` : "28 internos · 6 contratistas"}
            icon="🧑‍💼"
          />
          <KpiCard
            label="Compras pendientes"
            value={`${data?.procurement.pendingRequisitions ?? 0} / ${data?.procurement.pendingPOs ?? 0}`}
            hint="requisiciones / OC"
            variant={data && (data.procurement.pendingRequisitions + data.procurement.pendingPOs) > 5 ? "warning" : "default"}
            icon="🛒"
          />
          <KpiCard
            label="Stock crítico"
            value={String(data?.procurement.lowStockItems ?? 0)}
            hint="insumos en mínimo"
            variant={data && data.procurement.lowStockItems > 0 ? "warning" : "positive"}
            icon="📦"
          />
          <KpiCard
            label="Top vendedor"
            value={data?.topSellers[0]?.ownerName ?? "—"}
            hint={data?.topSellers[0]?.revenue ? new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(data.topSellers[0].revenue) : "del mes"}
            variant="accent"
            icon="🏆"
          />
        </div>
      </Section>

      <Section eyebrow="Saltos" title="Atajos rápidos" subtitle="Lo que más usas — un clic">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          {shortcuts.map((a) => (
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
