"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import { Money } from "@/components/ui/DataTable";
import {
  DashPage,
  DashHero,
  DashGrid,
  DashCol,
  StatStrip,
  DashPanel,
  BarList,
  ListRow,
  DashPill,
  DashEmpty,
} from "@/components/dashboard/DashKit";
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
const ALL_SHORTCUTS: Record<string, { href: string; title: string; desc: string }[]> = {
  executive: [
    { href: "/crm/dashboard", title: "Pipeline comercial", desc: "Saltar al CRM" },
    { href: "/ops/dashboard", title: "Operación de campo", desc: "Saltar a OPS" },
    { href: "/studio/dashboard", title: "Sitio público & marca", desc: "Saltar a STUDIO" },
    { href: "/erp/users", title: "Gestionar usuarios", desc: "Roles, accesos por URL y matriz" },
    { href: "/erp/architecture", title: "Arquitectura del ERP", desc: "Mapa de módulos y flujo end-to-end" },
    { href: "/erp/audit", title: "Auditoría", desc: "Timeline inmutable de cambios sensibles" },
  ],
  dir_admin: [
    { href: "/erp/approvals", title: "Aprobaciones", desc: "Firma y autorización de solicitudes" },
    { href: "/erp/invoicing", title: "Facturación", desc: "CFDIs emitidos y por cobrar" },
    { href: "/erp/finance/viatics", title: "Viáticos", desc: "Solicitudes y reembolsos del equipo" },
    { href: "/erp/hr", title: "Recursos humanos", desc: "Plantilla, asistencia y fines" },
    { href: "/ops/activities", title: "Reportes de campo", desc: "Evidencias y avances para facturación" },
    { href: "/erp/procurement", title: "Compras", desc: "Requisiciones y órdenes de compra" },
  ],
  coord_admin: [
    { href: "/erp/approvals", title: "Aprobaciones", desc: "Firma y autorización de solicitudes" },
    { href: "/erp/procurement", title: "Compras", desc: "Requisiciones y órdenes de compra" },
    { href: "/erp/warehouse", title: "Almacén", desc: "Stock e inventario de productos" },
    { href: "/crm/dashboard", title: "Pipeline CRM", desc: "Estado comercial del equipo" },
    { href: "/ops/activities", title: "Reportes OPS", desc: "Actividades del equipo de campo" },
    { href: "/erp/invoicing", title: "Facturación", desc: "CFDIs emitidos y por cobrar" },
  ],
  rh: [
    { href: "/erp/hr", title: "Gestión de personal", desc: "Plantilla y datos del equipo" },
    { href: "/erp/hr/attendance", title: "Asistencia", desc: "Check-in y ubicaciones del equipo" },
    { href: "/erp/hr/fines", title: "Incidencias", desc: "Multas y faltas de asistencia" },
    { href: "/erp/hr/kpis", title: "KPIs del equipo", desc: "Desempeño individual por área" },
    { href: "/erp/finance/employee-payments", title: "Pagos a empleados", desc: "Dispersiones internas (no CFDI nómina)" },
    { href: "/erp/calendar", title: "Calendario", desc: "Eventos corporativos y agenda" },
  ],
  contabilidad: [
    { href: "/erp/accounting", title: "Pólizas contables", desc: "Libro diario y ajustes" },
    { href: "/erp/invoicing", title: "Facturación CFDI", desc: "Ingresos y egresos timbrados" },
    { href: "/erp/banking", title: "Cuentas bancarias", desc: "Conciliación y movimientos" },
    { href: "/erp/finance/viatics", title: "Viáticos", desc: "Solicitudes y reembolsos" },
    { href: "/erp/exports", title: "Exportar datos", desc: "Reportes y cierres para SAT" },
    { href: "/crm/quotes", title: "Cotizaciones CRM", desc: "Propuestas comerciales para revisión" },
  ],
  administrativo: [
    { href: "/erp/chat", title: "Chat", desc: "Canales, DMs y colaboración en vivo" },
    { href: "/erp/approvals", title: "Aprobaciones", desc: "Firma y autorización de solicitudes" },
    { href: "/erp/documents", title: "Documentos", desc: "Archivos corporativos" },
    { href: "/erp/finance/viatics", title: "Mis viáticos", desc: "Solicitudes y reembolsos" },
    { href: "/erp/finance/expenses", title: "Mis gastos", desc: "Gastos corporativos" },
    { href: "/erp/calendar", title: "Calendario", desc: "Agenda corporativa" },
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
    return { name: "Ventas (CRM)", health: Math.min(100, Math.max(0, score)), note, estimated: true };
  })();

  const opsHealth = (() => {
    let score = 90;
    if (operations.otOverdue > 5) score -= 20;
    else if (operations.otOverdue > 0) score -= operations.otOverdue * 3;
    const note = operations.otOverdue > 0
      ? `${operations.otOverdue} OTs vencidas · ${operations.activeProjects} proyectos activos`
      : `${operations.otOpen} OTs abiertas · ${operations.activeProjects} proyectos activos`;
    return { name: "Operación (OPS)", health: Math.min(100, Math.max(0, score)), note, estimated: true };
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
    return { name: "Finanzas", health: Math.min(100, Math.max(0, score)), note, estimated: true };
  })();

  const procHealth = (() => {
    let score = 88;
    if (procurement.lowStockItems > 3) score -= 15;
    else if (procurement.lowStockItems > 0) score -= procurement.lowStockItems * 3;
    if (procurement.pendingPOs > 5) score -= 10;
    const note = procurement.lowStockItems > 0
      ? `${procurement.lowStockItems} SKU bajo mínimo · ${procurement.pendingPOs} OC pendientes`
      : `${procurement.pendingPOs} OC pendientes de aprobación`;
    return { name: "Almacén & Compras", health: Math.min(100, Math.max(0, score)), note, estimated: true };
  })();

  const nocHealth = (() => {
    let score = 92;
    if (operations.ticketsOpen > 10) score -= 15;
    else if (operations.ticketsOpen > 0) score -= operations.ticketsOpen;
    const note = `${operations.ticketsOpen} tickets abiertos · ${maintenance.activeContracts} contratos de mantenimiento`;
    return { name: "NOC & Soporte", health: Math.min(100, Math.max(0, score)), note, estimated: true };
  })();

  const hrHealth = {
    name: "Personas (RH)",
    health: 90,
    note: `${exec.teamSize} colaboradores en plantilla`,
    estimated: true,
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
  const criticalCount = exec?.alerts.filter((a) => a.level === "critical").length ?? 0;

  return (
    <DashPage>
      <DashHero
        eyebrow="ERP · Tablero"
        title={`${saludo}, ${nombre}`}
        subtitle={`${new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long" }).format(ahora)} · resumen consolidado del negocio`}
        actions={
          <>
            {pendings && pendings.length > 0 && (
              <DashPill tone="warning">{pendings.length} aprobaciones pendientes</DashPill>
            )}
            <Link href="/erp/exports" style={{ textDecoration: "none" }}>
              <Button variant="secondary">Exportar</Button>
            </Link>
            <Link href="/erp/executive" style={{ textDecoration: "none" }}>
              <Button variant="primary" iconRight="→">Vista ejecutiva</Button>
            </Link>
          </>
        }
      />

      <StatStrip
        stats={[
          {
            label: "Ingresos del mes",
            value: exec ? <Money value={exec.headlineKpis.revenueMtd} compact /> : "…",
            delta: exec && exec.headlineKpis.revenueMoMChange !== 0
              ? {
                  value: `${exec.headlineKpis.revenueMoMChange >= 0 ? "+" : ""}${exec.headlineKpis.revenueMoMChange}%`,
                  direction: exec.headlineKpis.revenueMoMChange >= 0 ? "up" : "down",
                }
              : undefined,
            sub: exec && exec.headlineKpis.revenuePrevMonth > 0
              ? `vs ${new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", notation: "compact" }).format(exec.headlineKpis.revenuePrevMonth)} mes anterior`
              : undefined,
            big: true,
          },
          {
            label: "Pipeline activo",
            value: exec ? <Money value={exec.headlineKpis.pipelineValue} compact /> : "…",
            sub: exec ? `${exec.headlineKpis.pipelineCount} oportunidades en negociación` : undefined,
            tone: "accent",
          },
          {
            label: "Cobranza pendiente",
            value: exec ? <Money value={exec.headlineKpis.arOutstanding} compact /> : "…",
            sub: exec ? `${exec.finance.overdueInvoices} facturas vencidas` : undefined,
            tone: exec && exec.finance.overdueInvoices > 0 ? "warning" : "default",
          },
          {
            label: "Proyectos en campo",
            value: exec ? exec.operations.activeProjects : "…",
            sub: exec ? `${exec.operations.otOpen} OTs abiertas · ${exec.operations.otOverdue} vencidas` : undefined,
            tone: exec && exec.operations.otOverdue > 0 ? "warning" : "default",
          },
          {
            label: "Alertas críticas",
            value: exec ? criticalCount : "…",
            sub: exec ? `${exec.alerts.filter((a) => a.level === "warning").length} avisos · ${exec.procurement.lowStockItems} stock crítico` : undefined,
            tone: criticalCount > 0 ? "danger" : "positive",
          },
        ]}
      />

      <DashGrid>
        <DashCol span={8}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <DashPanel
              title="Aprobaciones pendientes"
              subtitle="Requieren tu firma — ordenadas por urgencia"
              action="Ver todas"
              actionHref="/erp/approvals"
            >
              {execLoading && pendings === null && <DashEmpty title="Cargando…" />}
              {!(execLoading && pendings === null) && approvals.length === 0 && (
                <DashEmpty title="Bandeja limpia" description="No hay aprobaciones pendientes que requieran tu atención." />
              )}
              {approvals.map((a) => (
                <ListRow
                  key={a.id}
                  href="/erp/approvals"
                  accent={PANEL_COLOR[a.panel]}
                  title={a.titulo}
                  sub={`${a.id} · Solicita ${a.solicita}`}
                  trail={
                    <>
                      {a.monto !== null && <Money value={a.monto} compact bold />}
                      <DashPill tone={a.urgencia === "alta" ? "danger" : a.urgencia === "media" ? "warning" : "neutral"}>
                        {a.urgencia}
                      </DashPill>
                    </>
                  }
                />
              ))}
            </DashPanel>

            <DashPanel
              title="Salud por dominio"
              subtitle={exec
                ? `Actualizado ${new Date(exec.generatedAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })} · verde > 85 · ámbar 70–85 · rojo < 70`
                : "Cargando datos…"}
            >
              {!healthDomains && <DashEmpty title="Calculando…" description="Consultando métricas por dominio." />}
              {healthDomains && (
                <BarList
                  max={100}
                  items={healthDomains.map((d) => ({
                    label: d.estimated ? `${d.name} · estimado` : d.name,
                    value: d.health,
                    display: `${d.health}%`,
                    color: d.variant === "positive" ? "var(--success)" : d.variant === "warning" ? "var(--warning)" : "var(--danger)",
                  }))}
                />
              )}
              {healthDomains && (
                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
                  {healthDomains.filter((d) => d.variant !== "positive").map((d) => (
                    <span key={d.name} style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
                      {d.name}: {d.note}
                    </span>
                  ))}
                </div>
              )}
            </DashPanel>
          </div>
        </DashCol>

        <DashCol span={4}>
          <DashPanel title="Lo que más usas" subtitle="Saltos rápidos entre paneles" flush>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {shortcuts.map((s) => (
                <ListRow key={s.href} href={s.href} title={s.title} sub={s.desc} trail="→" />
              ))}
            </div>
          </DashPanel>
        </DashCol>
      </DashGrid>
    </DashPage>
  );
}
