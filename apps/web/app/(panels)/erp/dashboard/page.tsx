"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import KpiCard from "@/components/ui/KpiCard";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { Tag, Money } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { fetchExecutiveDashboard, type ExecutiveDashboard } from "@/lib/executive-api";
import { listMyPendingApprovals, type PendingApproval } from "@/lib/workflow-api";
import { resolveV2RoleKey } from "@/lib/user-access";
import { ROLES } from "@/lib/rbac";

type Approval = {
  id: string;
  titulo: string;
  monto: number | null;
  solicita: string;
  panel: "ERP" | "OPS" | "CRM";
  urgencia: "alta" | "media" | "baja";
};

function pendingToApproval(p: PendingApproval): Approval {
  const entity = (p.instance?.entityType ?? "").toLowerCase();
  let panel: Approval["panel"] = "ERP";
  if (entity.includes("cotiz") || entity.includes("opportun") || entity.includes("quote")) panel = "CRM";
  else if (entity.includes("viatic") || entity.includes("activity") || entity.includes("project")) panel = "OPS";
  const idLabel = `${entity.toUpperCase().slice(0, 3) || "WF"}-${p.instance?.entityId ?? p.id}`;
  const titulo = p.step?.name
    ? `${p.step.name} · ${entity || "workflow"} #${p.instance?.entityId ?? p.id}`
    : `Workflow #${p.id}`;
  const stepNum = p.step?.stepNumber ?? 1;
  const urgencia: Approval["urgencia"] = stepNum >= 3 ? "alta" : stepNum >= 2 ? "media" : "baja";
  return {
    id: idLabel,
    titulo,
    monto: null,
    solicita: p.step?.approverRole?.nombre ?? p.step?.approverUser?.nombre ?? "Sistema",
    panel,
    urgencia,
  };
}

const PANEL_COLOR: Record<Approval["panel"], string> = {
  ERP: "#0ea5e9",
  OPS: "#f97316",
  CRM: "#10b981",
};

// Atajos filtrados por rol — solo mostramos lo que el usuario puede abrir
const ALL_SHORTCUTS: Record<string, { href: string; icon: string; title: string; desc: string; accent: string }[]> = {
  executive: [
    { href: "/crm/dashboard", icon: "📈", title: "Pipeline comercial", desc: "Saltar al CRM", accent: "#10b981" },
    { href: "/ops/dashboard", icon: "🚀", title: "Operación de campo", desc: "Saltar a OPS", accent: "#f97316" },
    { href: "/studio/dashboard", icon: "🎨", title: "Sitio público & marca", desc: "Saltar a STUDIO", accent: "#a855f7" },
    { href: "/erp/users", icon: "🧑‍💼", title: "Gestionar usuarios", desc: "Roles, accesos por URL y matriz", accent: "#0ea5e9" },
    { href: "/erp/architecture", icon: "🗺️", title: "Arquitectura del ERP", desc: "Mapa de módulos y flujo end-to-end", accent: "#0ea5e9" },
    { href: "/erp/audit", icon: "🔍", title: "Auditoría", desc: "Timeline inmutable de cambios sensibles", accent: "#0ea5e9" },
  ],
  dir_admin: [
    { href: "/erp/approvals", icon: "🛡️", title: "Aprobaciones", desc: "Firma y autorización de solicitudes", accent: "#ef4444" },
    { href: "/erp/invoicing", icon: "🧾", title: "Facturación", desc: "CFDIs emitidos y por cobrar", accent: "#10b981" },
    { href: "/erp/finance/viatics", icon: "✈️", title: "Viáticos", desc: "Solicitudes y reembolsos del equipo", accent: "#f59e0b" },
    { href: "/erp/hr", icon: "👥", title: "Recursos humanos", desc: "Plantilla, asistencia y fines", accent: "#0ea5e9" },
    { href: "/ops/activities", icon: "📋", title: "Reportes de campo", desc: "Evidencias y avances para facturación", accent: "#f97316" },
    { href: "/erp/procurement", icon: "🛒", title: "Compras", desc: "Requisiciones y órdenes de compra", accent: "#8b5cf6" },
  ],
  coord_admin: [
    { href: "/erp/approvals", icon: "🛡️", title: "Aprobaciones", desc: "Firma y autorización de solicitudes", accent: "#ef4444" },
    { href: "/erp/procurement", icon: "🛒", title: "Compras", desc: "Requisiciones y órdenes de compra", accent: "#8b5cf6" },
    { href: "/erp/warehouse", icon: "📦", title: "Almacén", desc: "Stock e inventario de productos", accent: "#f97316" },
    { href: "/crm/dashboard", icon: "📈", title: "Pipeline CRM", desc: "Estado comercial del equipo", accent: "#10b981" },
    { href: "/ops/activities", icon: "📋", title: "Reportes OPS", desc: "Actividades del equipo de campo", accent: "#f97316" },
    { href: "/erp/invoicing", icon: "🧾", title: "Facturación", desc: "CFDIs emitidos y por cobrar", accent: "#10b981" },
  ],
  rh: [
    { href: "/erp/hr", icon: "👥", title: "Gestión de personal", desc: "Plantilla y datos del equipo", accent: "#0ea5e9" },
    { href: "/erp/hr/attendance", icon: "📍", title: "Asistencia", desc: "Check-in y ubicaciones del equipo", accent: "#10b981" },
    { href: "/erp/hr/fines", icon: "⚠️", title: "Incidencias", desc: "Multas y faltas de asistencia", accent: "#ef4444" },
    { href: "/erp/hr/kpis", icon: "📊", title: "KPIs del equipo", desc: "Desempeño individual por área", accent: "#8b5cf6" },
    { href: "/erp/finance/employee-payments", icon: "💵", title: "Nómina", desc: "Pagos y percepciones del personal", accent: "#f59e0b" },
    { href: "/erp/calendar", icon: "📅", title: "Calendario", desc: "Eventos corporativos y agenda", accent: "#6366f1" },
  ],
  contabilidad: [
    { href: "/erp/accounting", icon: "📒", title: "Pólizas contables", desc: "Libro diario y ajustes", accent: "#0ea5e9" },
    { href: "/erp/invoicing", icon: "🧾", title: "Facturación CFDI", desc: "Ingresos y egresos timbrados", accent: "#10b981" },
    { href: "/erp/banking", icon: "🏦", title: "Cuentas bancarias", desc: "Conciliación y movimientos", accent: "#8b5cf6" },
    { href: "/erp/finance/viatics", icon: "✈️", title: "Viáticos", desc: "Solicitudes y reembolsos", accent: "#f59e0b" },
    { href: "/erp/exports", icon: "📥", title: "Exportar datos", desc: "Reportes y cierres para SAT", accent: "#ef4444" },
    { href: "/crm/quotes", icon: "📋", title: "Cotizaciones CRM", desc: "Propuestas comerciales para revisión", accent: "#10b981" },
  ],
  administrativo: [
    { href: "/erp/chat", icon: "💬", title: "Chat", desc: "Canales, DMs y colaboración en vivo", accent: "#1264a3" },
    { href: "/erp/approvals", icon: "🛡️", title: "Aprobaciones", desc: "Firma y autorización de solicitudes", accent: "#ef4444" },
    { href: "/erp/documents", icon: "📂", title: "Documentos", desc: "Archivos corporativos", accent: "#0ea5e9" },
    { href: "/erp/finance/viatics", icon: "✈️", title: "Mis viáticos", desc: "Solicitudes y reembolsos", accent: "#f59e0b" },
    { href: "/erp/finance/expenses", icon: "💳", title: "Mis gastos", desc: "Gastos corporativos", accent: "#8b5cf6" },
    { href: "/erp/calendar", icon: "📅", title: "Calendario", desc: "Agenda corporativa", accent: "#6366f1" },
  ],
};

/** Deriva métricas de salud por dominio a partir del snapshot ejecutivo real. */
function buildHealthDomains(exec: ExecutiveDashboard) {
  const { headlineKpis, operations, finance, procurement, maintenance } = exec;

  const salesHealth = (() => {
    let score = 85;
    if (headlineKpis.revenueMoMChange < -10) score -= 20;
    else if (headlineKpis.revenueMoMChange > 10) score += 10;
    if (headlineKpis.pipelineCount < 3) score -= 10;
    const note = headlineKpis.pipelineCount > 0
      ? `${headlineKpis.pipelineCount} oportunidades activas · MoM ${headlineKpis.revenueMoMChange >= 0 ? "+" : ""}${headlineKpis.revenueMoMChange}%`
      : "Sin oportunidades activas en pipeline";
    return { name: "Ventas (CRM)", health: Math.min(100, Math.max(0, score)), note };
  })();

  const opsHealth = (() => {
    let score = 90;
    if (operations.otOverdue > 5) score -= 20;
    else if (operations.otOverdue > 0) score -= operations.otOverdue * 3;
    const note = operations.otOverdue > 0
      ? `${operations.otOverdue} OTs vencidas · ${operations.activeProjects} proyectos activos`
      : `${operations.otOpen} OTs abiertas · ${operations.activeProjects} proyectos activos`;
    return { name: "Operación (OPS)", health: Math.min(100, Math.max(0, score)), note };
  })();

  const finHealth = (() => {
    let score = 85;
    if (finance.overdueInvoices > 10) score -= 20;
    else if (finance.overdueInvoices > 0) score -= finance.overdueInvoices * 2;
    const ar = headlineKpis.arOutstanding;
    const arFmt = ar > 0 ? `$${(ar / 1000).toFixed(0)}k CXC pendiente` : "CXC al día";
    const note = finance.overdueInvoices > 0
      ? `${arFmt} · ${finance.overdueInvoices} facturas vencidas`
      : arFmt;
    return { name: "Finanzas", health: Math.min(100, Math.max(0, score)), note };
  })();

  const procHealth = (() => {
    let score = 88;
    if (procurement.lowStockItems > 3) score -= 15;
    else if (procurement.lowStockItems > 0) score -= procurement.lowStockItems * 3;
    if (procurement.pendingPOs > 5) score -= 10;
    const note = procurement.lowStockItems > 0
      ? `${procurement.lowStockItems} SKU bajo mínimo · ${procurement.pendingPOs} OC pendientes`
      : `${procurement.pendingPOs} OC pendientes de aprobación`;
    return { name: "Almacén & Compras", health: Math.min(100, Math.max(0, score)), note };
  })();

  const nocHealth = (() => {
    let score = 92;
    if (operations.ticketsOpen > 10) score -= 15;
    else if (operations.ticketsOpen > 0) score -= operations.ticketsOpen;
    const note = `${operations.ticketsOpen} tickets abiertos · ${maintenance.activeContracts} contratos de mantenimiento`;
    return { name: "NOC & Soporte", health: Math.min(100, Math.max(0, score)), note };
  })();

  const hrHealth = {
    name: "Personas (RH)",
    health: 90,
    note: `${exec.teamSize} colaboradores en plantilla`,
  };

  return [salesHealth, opsHealth, finHealth, procHealth, nocHealth, hrHealth].map((d) => ({
    ...d,
    variant: (d.health >= 85 ? "positive" : d.health >= 70 ? "warning" : "danger") as "positive" | "warning" | "danger",
  }));
}

export default function ErpDashboardPage() {
  const { user, token } = useUser();
  const nombre = user?.nombre?.split(" ")[0] ?? "Equipo";
  const v2Role = resolveV2RoleKey(user);
  const shortcuts = useMemo(() => {
    if (!v2Role) return ALL_SHORTCUTS.executive;
    if (v2Role === ROLES.CEO || v2Role === ROLES.SUPER_ADMIN || v2Role === ROLES.DIR_OPERACIONES) return ALL_SHORTCUTS.executive;
    if (v2Role === ROLES.DIR_ADMIN) return ALL_SHORTCUTS.dir_admin;
    if (v2Role === ROLES.COORD_ADMIN) return ALL_SHORTCUTS.coord_admin;
    if (v2Role === ROLES.RH) return ALL_SHORTCUTS.rh;
    if (v2Role === ROLES.CONTABILIDAD) return ALL_SHORTCUTS.contabilidad;
    if (v2Role === ROLES.ADMINISTRATIVO) return ALL_SHORTCUTS.administrativo;
    return ALL_SHORTCUTS.executive;
  }, [v2Role]);
  const ahora = new Date();
  const horas = ahora.getHours();
  const saludo = horas < 12 ? "Buenos días" : horas < 19 ? "Buenas tardes" : "Buenas noches";

  const [exec, setExec] = useState<ExecutiveDashboard | null>(null);
  const [pendings, setPendings] = useState<PendingApproval[] | null>(null);
  const [execLoading, setExecLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setExecLoading(true);
    Promise.allSettled([
      fetchExecutiveDashboard(token),
      listMyPendingApprovals(token),
    ]).then(([e, p]) => {
      if (cancelled) return;
      if (e.status === "fulfilled") setExec(e.value);
      if (p.status === "fulfilled") setPendings(p.value);
      setExecLoading(false);
    });
    return () => { cancelled = true; };
  }, [token]);

  const approvals: Approval[] = useMemo(() => {
    if (!pendings || pendings.length === 0) return [];
    return pendings.slice(0, 6).map(pendingToApproval);
  }, [pendings]);

  const healthDomains = useMemo(() => exec ? buildHealthDomains(exec) : null, [exec]);

  return (
    <>
      <PageHeader
        eyebrow="ERP · Tablero ejecutivo"
        title={`${saludo}, ${nombre}`}
        subtitle="Resumen consolidado del negocio: pipeline comercial, ejecución de proyectos, salud financiera y operaciones del día."
        variant="hero"
        meta={
          <>
            <Tag variant={exec ? "accent" : "neutral"} dot>{exec ? "EN VIVO" : execLoading ? "Cargando…" : "Sin datos"}</Tag>
            <Tag variant="neutral">{new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long" }).format(ahora)}</Tag>
            {pendings && pendings.length > 0 && (
              <Tag variant="warning" dot>{pendings.length} aprobaciones</Tag>
            )}
          </>
        }
        actions={
          <>
            <Link href="/erp/exports" style={{ textDecoration: "none" }}>
              <Button variant="secondary" iconLeft="📥">
                Exportar
              </Button>
            </Link>
            <Link href="/erp/executive" style={{ textDecoration: "none" }}>
              <Button variant="primary" iconLeft="📊" iconRight="→">
                Vista ejecutiva
              </Button>
            </Link>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 24 }}>
        <KpiCard
          label="Pipeline activo"
          value={exec ? <Money value={exec.headlineKpis.pipelineValue} compact /> : "—"}
          hint={exec ? `${exec.headlineKpis.pipelineCount} oportunidades en negociación` : execLoading ? "Cargando…" : "Sin datos"}
          icon="🎯"
          variant="accent"
          trend={exec && exec.headlineKpis.revenueMoMChange !== 0 ? {
            value: `${exec.headlineKpis.revenueMoMChange >= 0 ? "+" : ""}${exec.headlineKpis.revenueMoMChange}% MoM`,
            direction: exec.headlineKpis.revenueMoMChange >= 0 ? "up" : "down",
          } : undefined}
        />
        <KpiCard
          label="Proyectos en campo"
          value={exec ? String(exec.operations.activeProjects) : "—"}
          hint={exec ? `${exec.operations.otOpen} OTs abiertas · ${exec.operations.otOverdue} vencidas` : execLoading ? "Cargando…" : "Sin datos"}
          icon="🛠️"
          variant={exec && exec.operations.otOverdue > 0 ? "warning" : "default"}
        />
        <KpiCard
          label="Ingresos del mes"
          value={exec ? <Money value={exec.headlineKpis.revenueMtd} compact /> : "—"}
          hint={exec && exec.headlineKpis.revenuePrevMonth > 0
            ? `vs ${new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(exec.headlineKpis.revenuePrevMonth)} mes pasado`
            : execLoading ? "Cargando…" : "Sin datos"}
          icon="💰"
          variant={exec ? (exec.headlineKpis.revenueMoMChange >= 0 ? "positive" : "warning") : "default"}
          trend={exec && exec.headlineKpis.revenueMoMChange !== 0 ? {
            value: `${exec.headlineKpis.revenueMoMChange >= 0 ? "+" : ""}${exec.headlineKpis.revenueMoMChange}%`,
            direction: exec.headlineKpis.revenueMoMChange >= 0 ? "up" : "down",
          } : undefined}
        />
        <KpiCard
          label="Cobranza pendiente"
          value={exec ? <Money value={exec.headlineKpis.arOutstanding} compact /> : "—"}
          hint={exec ? `${exec.finance.overdueInvoices} facturas vencidas` : execLoading ? "Cargando…" : "Sin datos"}
          icon="🧾"
          variant={exec && exec.finance.overdueInvoices > 0 ? "warning" : "default"}
        />
        <KpiCard
          label="Alertas críticas"
          value={exec ? String(exec.alerts.filter((a) => a.level === "critical").length) : "—"}
          hint={exec ? `${exec.alerts.filter((a) => a.level === "warning").length} avisos · ${exec.procurement.lowStockItems} stock crítico` : execLoading ? "Cargando…" : "Sin datos"}
          icon="⚠️"
          variant={exec && exec.alerts.some((a) => a.level === "critical") ? "danger" : "default"}
        />
        <KpiCard
          label="Plantilla activa"
          value={exec ? String(exec.teamSize) : "—"}
          hint={exec ? `${exec.clientsCount} clientes activos` : execLoading ? "Cargando…" : "Sin datos"}
          icon="🧑‍💼"
        />
      </div>

      {healthDomains && (
        <div style={{ marginBottom: 20, padding: "12px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Salud por dominio</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {healthDomains.map((d) => (
              <div key={d.name} style={{ display: "grid", gridTemplateColumns: "160px 1fr 40px", gap: 10, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>{d.name}</span>
                <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${d.health}%`, background: d.variant === "positive" ? "var(--success)" : d.variant === "warning" ? "var(--warning)" : "var(--danger)", borderRadius: 3 }} />
                </div>
                <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "right" }}>{d.health}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", gap: 20 }}>
        <Section
          eyebrow="Bandeja del CEO"
          title="Aprobaciones pendientes"
          subtitle="Requieren tu firma — ordenadas por urgencia"
          tone="accent"
          actions={
            <Link href="/erp/approvals" style={{ textDecoration: "none" }}>
              <Button size="sm" variant="ghost" iconRight="→">Ver todas</Button>
            </Link>
          }
        >
          {execLoading && pendings === null ? (
            <EmptyState icon="⏳" title="Cargando…" description="Consultando aprobaciones pendientes." />
          ) : approvals.length === 0 ? (
            <EmptyState icon="✅" title="Bandeja limpia" description="No hay aprobaciones pendientes que requieran tu atención." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {approvals.map((a) => (
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
                  }}
                  className="nx-approval-row"
                >
                  <span
                    aria-hidden="true"
                    style={{ position: "absolute", left: 0, top: 12, bottom: 12, width: 3, borderRadius: "0 3px 3px 0", background: PANEL_COLOR[a.panel] }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5, background: `color-mix(in srgb, ${PANEL_COLOR[a.panel]} 16%, transparent)`, color: PANEL_COLOR[a.panel], letterSpacing: "0.04em" }}>
                        {a.panel}
                      </span>
                      <code style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{a.id}</code>
                    </div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" }}>{a.titulo}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 3 }}>Solicita · {a.solicita}</div>
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
                    <Link href="/erp/approvals" style={{ textDecoration: "none" }}>
                      <Button size="sm" variant="primary">Revisar</Button>
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Section>

        <Section eyebrow="Atajos" title="Lo que más usas" subtitle="Saltos rápidos entre paneles">
          <div style={{ display: "grid", gap: 8 }}>
            {shortcuts.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                className="nx-shortcut"
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 12px", borderRadius: 12, textDecoration: "none", color: "var(--text-primary)", border: "1px solid var(--nx-panel-hairline)", background: "var(--surface)", transition: "transform 180ms var(--nx-ease-out), border-color 180ms var(--nx-ease-out), box-shadow 180ms var(--nx-ease-out)" }}
              >
                <span style={{ fontSize: 17, width: 34, height: 34, borderRadius: 9, background: `color-mix(in srgb, ${s.accent} 16%, var(--surface))`, color: s.accent, border: `1px solid color-mix(in srgb, ${s.accent} 22%, var(--border))`, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                  {s.icon}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{s.title}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 1 }}>{s.desc}</div>
                </div>
                <span className="nx-shortcut-arrow" style={{ color: "var(--text-tertiary)", transition: "transform 180ms" }}>→</span>
              </Link>
            ))}
          </div>
        </Section>
      </div>

      {/* Salud por dominio — solo cuando exec cargó */}
      {healthDomains ? (
        <Section
          eyebrow="Estado del negocio"
          title="Salud por dominio"
          subtitle={`Actualizado ${new Date(exec!.generatedAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })} · verde > 85 · ámbar 70–85 · rojo < 70`}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
            {healthDomains.map((d) => {
              const color = d.variant === "positive" ? "var(--success)" : d.variant === "warning" ? "var(--warning)" : "var(--danger)";
              return (
                <div
                  key={d.name}
                  style={{ padding: 16, borderRadius: 14, background: "var(--surface)", border: "1px solid var(--nx-panel-hairline)", boxShadow: "var(--nx-panel-elev-1)" }}
                  className="nx-health-card"
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{d.name}</span>
                    <span style={{ fontFamily: "var(--nx-font-display)", fontSize: 17, fontWeight: 700, color, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>
                      {d.health}<span style={{ fontSize: "0.55em", marginLeft: 1, opacity: 0.7 }}>%</span>
                    </span>
                  </div>
                  <div style={{ position: "relative", height: 7, background: "color-mix(in srgb, var(--surface-2) 80%, transparent)", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ width: `${d.health}%`, height: "100%", background: `linear-gradient(90deg, color-mix(in srgb, ${color} 70%, transparent) 0%, ${color} 100%)`, borderRadius: 999, transition: "width 600ms var(--nx-ease-out)", boxShadow: `0 0 12px color-mix(in srgb, ${color} 50%, transparent)` }} />
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 10, lineHeight: 1.4 }}>{d.note}</div>
                </div>
              );
            })}
          </div>
        </Section>
      ) : execLoading ? (
        <Section eyebrow="Estado del negocio" title="Salud por dominio" subtitle="Cargando datos…">
          <EmptyState icon="⏳" title="Calculando…" description="Consultando métricas por dominio." />
        </Section>
      ) : null}

      <style jsx>{`
        :global(.nx-approval-row:hover) { transform: translateY(-1px); box-shadow: var(--nx-panel-elev-2); }
        :global(.nx-shortcut:hover) { transform: translateY(-1px); border-color: color-mix(in srgb, var(--primary) 40%, var(--border)); box-shadow: var(--nx-panel-elev-2); }
        :global(.nx-shortcut:hover .nx-shortcut-arrow) { transform: translateX(3px); color: var(--primary) !important; }
        :global(.nx-health-card:hover) { transform: translateY(-2px); box-shadow: var(--nx-panel-elev-hover); }
      `}</style>
    </>
  );
}
