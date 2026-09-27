"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import InlineAlert from "@/components/ui/InlineAlert";
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
  DashSkeleton,
} from "@/components/dashboard/DashKit";
import { useUser } from "@/components/UserContext";
import { fetchExecutiveDashboard, type ExecutiveDashboard } from "@/lib/executive-api";
import { listMyPendingApprovals, labelForEntityType, type PendingApproval } from "@/lib/workflow-api";
import { formatApiError } from "@/lib/erp-api";
import { resolveV2RoleKey } from "@/lib/user-access";
import { ROLES } from "@/lib/rbac";

type Urgencia = "alta" | "media" | "baja";

type Approval = {
  key: string;
  titulo: string;
  sub: string;
  urgencia: Urgencia;
};

const URGENCIA_META: Record<Urgencia, { label: string; tone: "danger" | "warning" | "neutral"; accent: string }> = {
  alta: { label: "Alta", tone: "danger", accent: "var(--danger)" },
  media: { label: "Media", tone: "warning", accent: "var(--warning)" },
  baja: { label: "Baja", tone: "neutral", accent: "var(--border-strong, var(--border))" },
};

function pendingToApproval(p: PendingApproval): Approval {
  const entityType = p.instance?.entityType ?? "";
  const tipo = entityType ? labelForEntityType(entityType) : "Solicitud";
  const folio = p.instance?.entityId ?? p.id;
  const stepNum = p.step?.stepNumber ?? 1;
  const urgencia: Urgencia = stepNum >= 3 ? "alta" : stepNum >= 2 ? "media" : "baja";
  const aprobador = p.step?.approverUser?.nombre ?? p.step?.approverRole?.nombre;
  return {
    key: String(p.id),
    titulo: p.step?.name ? `${p.step.name} · ${tipo}` : tipo,
    sub: aprobador ? `Folio ${folio} · Firma: ${aprobador}` : `Folio ${folio}`,
    urgencia,
  };
}

type Shortcut = { href: string; title: string; desc: string };

const SHORTCUTS: Record<"executive" | "dir_admin" | "coord_admin" | "rh" | "contabilidad" | "administrativo", Shortcut[]> = {
  executive: [
    { href: "/erp/executive", title: "Vista ejecutiva", desc: "Indicadores clave del negocio" },
    { href: "/erp/cotizaciones", title: "Cotizaciones", desc: "Propuestas comerciales en curso" },
    { href: "/erp/pizarra", title: "Actividades del equipo", desc: "Quién hace qué hoy" },
    { href: "/erp/users", title: "Usuarios y accesos", desc: "Altas, roles y permisos" },
    { href: "/erp/architecture", title: "Mapa del sistema", desc: "Cómo se conectan los módulos" },
    { href: "/erp/audit", title: "Auditoría", desc: "Historial de cambios importantes" },
  ],
  dir_admin: [
    { href: "/erp/approvals", title: "Aprobaciones", desc: "Firma y autorización de solicitudes" },
    { href: "/erp/invoicing", title: "Facturación", desc: "Facturas emitidas y por cobrar" },
    { href: "/erp/finance/viatics", title: "Viáticos", desc: "Solicitudes y reembolsos del equipo" },
    { href: "/erp/hr", title: "Recursos humanos", desc: "Plantilla, asistencia y más" },
    { href: "/erp/pizarra", title: "Actividades del equipo", desc: "Avances y evidencias de campo" },
    { href: "/erp/procurement", title: "Compras", desc: "Requisiciones y órdenes de compra" },
  ],
  coord_admin: [
    { href: "/erp/approvals", title: "Aprobaciones", desc: "Firma y autorización de solicitudes" },
    { href: "/erp/procurement", title: "Compras", desc: "Requisiciones y órdenes de compra" },
    { href: "/erp/warehouse", title: "Almacén", desc: "Existencias e inventario" },
    { href: "/erp/cotizaciones", title: "Cotizaciones", desc: "Propuestas comerciales del equipo" },
    { href: "/erp/pizarra", title: "Actividades del equipo", desc: "Trabajo de campo del día" },
    { href: "/erp/invoicing", title: "Facturación", desc: "Facturas emitidas y por cobrar" },
  ],
  rh: [
    { href: "/erp/hr", title: "Gestión de personal", desc: "Plantilla y datos del equipo" },
    { href: "/erp/asistencias", title: "Asistencias", desc: "Entradas, salidas y presencia" },
    { href: "/erp/hr/fines", title: "Incidencias", desc: "Faltas y retardos" },
    { href: "/erp/hr/kpis", title: "Indicadores del equipo", desc: "Desempeño por área" },
    { href: "/erp/finance/employee-payments", title: "Pagos a empleados", desc: "Dispersiones internas" },
    { href: "/erp/calendar", title: "Calendario", desc: "Eventos y agenda del equipo" },
  ],
  contabilidad: [
    { href: "/erp/contabilidad/polizas", title: "Pólizas contables", desc: "Libro diario y ajustes" },
    { href: "/erp/invoicing", title: "Facturación", desc: "Ingresos y egresos timbrados" },
    { href: "/erp/banking", title: "Cuentas bancarias", desc: "Conciliación y movimientos" },
    { href: "/erp/finance/viatics", title: "Viáticos", desc: "Solicitudes y reembolsos" },
    { href: "/erp/exports", title: "Exportar datos", desc: "Reportes y cierres fiscales" },
    { href: "/erp/cotizaciones", title: "Cotizaciones", desc: "Propuestas comerciales para revisión" },
  ],
  administrativo: [
    { href: "/erp/chat", title: "Chat", desc: "Conversaciones con tu equipo" },
    { href: "/erp/approvals", title: "Aprobaciones", desc: "Firma y autorización de solicitudes" },
    { href: "/erp/documents", title: "Documentos", desc: "Archivos de la empresa" },
    { href: "/erp/finance/viatics", title: "Mis viáticos", desc: "Solicitudes y reembolsos" },
    { href: "/erp/finance/expenses", title: "Mis gastos", desc: "Gastos de la empresa" },
    { href: "/erp/calendar", title: "Calendario", desc: "Agenda del equipo" },
  ],
};

const EXECUTIVE_ROLES = new Set<string>([ROLES.CEO, ROLES.SUPER_ADMIN, ROLES.DIR_OPERACIONES]);

function shortcutsForRole(role: string | null | undefined): { list: Shortcut[]; executive: boolean } {
  if (!role || EXECUTIVE_ROLES.has(role)) return { list: SHORTCUTS.executive, executive: true };
  if (role === ROLES.DIR_ADMIN) return { list: SHORTCUTS.dir_admin, executive: false };
  if (role === ROLES.COORD_ADMIN) return { list: SHORTCUTS.coord_admin, executive: false };
  if (role === ROLES.RH) return { list: SHORTCUTS.rh, executive: false };
  if (role === ROLES.CONTABILIDAD) return { list: SHORTCUTS.contabilidad, executive: false };
  if (role === ROLES.ADMINISTRATIVO) return { list: SHORTCUTS.administrativo, executive: false };
  return { list: SHORTCUTS.executive, executive: true };
}

const clampScore = (n: number) => Math.min(100, Math.max(0, Math.round(n)));
const plural = (n: number, one: string, many: string) => `${n.toLocaleString("es-MX")} ${n === 1 ? one : many}`;
const compactMxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", notation: "compact" });

type HealthDomain = { name: string; health: number; note: string; variant: "positive" | "warning" | "danger" };

/** Índices estimados de salud por área, derivados del resumen ejecutivo. */
function buildHealthDomains(exec: ExecutiveDashboard): HealthDomain[] {
  const { headlineKpis, operations, finance, procurement, maintenance } = exec;

  let sales = 85;
  if (headlineKpis.revenueMoMChange < -10) sales -= 20;
  else if (headlineKpis.revenueMoMChange > 10) sales += 10;
  if (headlineKpis.pipelineCount < 3) sales -= 10;

  let ops = 90;
  if (operations.otOverdue > 5) ops -= 20;
  else if (operations.otOverdue > 0) ops -= operations.otOverdue * 3;

  let fin = 85;
  if (finance.overdueInvoices > 10) fin -= 20;
  else if (finance.overdueInvoices > 0) fin -= finance.overdueInvoices * 2;

  let proc = 88;
  if (procurement.lowStockItems > 3) proc -= 15;
  else if (procurement.lowStockItems > 0) proc -= procurement.lowStockItems * 3;
  if (procurement.pendingPOs > 5) proc -= 10;

  let support = 92;
  if (operations.ticketsOpen > 10) support -= 15;
  else if (operations.ticketsOpen > 0) support -= operations.ticketsOpen;

  const change = headlineKpis.revenueMoMChange;
  const domains: Array<Omit<HealthDomain, "variant">> = [
    {
      name: "Ventas",
      health: clampScore(sales),
      note: headlineKpis.pipelineCount > 0
        ? `${plural(headlineKpis.pipelineCount, "oportunidad activa", "oportunidades activas")} · ${change >= 0 ? "+" : ""}${change}% vs mes anterior`
        : "Sin oportunidades activas",
    },
    {
      name: "Operación",
      health: clampScore(ops),
      note: operations.otOverdue > 0
        ? `${plural(operations.otOverdue, "orden de trabajo vencida", "órdenes de trabajo vencidas")} · ${plural(operations.activeProjects, "proyecto activo", "proyectos activos")}`
        : `${plural(operations.otOpen, "orden de trabajo abierta", "órdenes de trabajo abiertas")} · ${plural(operations.activeProjects, "proyecto activo", "proyectos activos")}`,
    },
    {
      name: "Finanzas",
      health: clampScore(fin),
      note: [
        headlineKpis.arOutstanding > 0 ? `${compactMxn.format(headlineKpis.arOutstanding)} por cobrar` : "Cobranza al día",
        finance.overdueInvoices > 0 ? plural(finance.overdueInvoices, "factura vencida", "facturas vencidas") : null,
      ].filter(Boolean).join(" · "),
    },
    {
      name: "Almacén y compras",
      health: clampScore(proc),
      note: procurement.lowStockItems > 0
        ? `${plural(procurement.lowStockItems, "producto bajo mínimo", "productos bajo mínimo")} · ${plural(procurement.pendingPOs, "orden de compra pendiente", "órdenes de compra pendientes")}`
        : `${plural(procurement.pendingPOs, "orden de compra pendiente", "órdenes de compra pendientes")} de aprobar`,
    },
    {
      name: "Soporte",
      health: clampScore(support),
      note: `${plural(operations.ticketsOpen, "ticket abierto", "tickets abiertos")} · ${plural(maintenance.activeContracts, "contrato de mantenimiento", "contratos de mantenimiento")}`,
    },
    { name: "Personas", health: 90, note: plural(exec.teamSize, "colaborador", "colaboradores") },
  ];

  return domains.map((d) => ({
    ...d,
    variant: d.health >= 85 ? "positive" : d.health >= 70 ? "warning" : "danger",
  }));
}

const HEALTH_COLOR: Record<HealthDomain["variant"], string> = {
  positive: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
};

function greetingFor(hour: number) {
  return hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
}

export default function ErpDashboardPage() {
  const { user, token } = useUser();
  const nombre = user?.nombre?.split(" ")[0] ?? "equipo";
  const v2Role = resolveV2RoleKey(user);
  const { list: shortcuts, executive: isExecutive } = useMemo(() => shortcutsForRole(v2Role), [v2Role]);

  const [now] = useState(() => new Date());
  const [exec, setExec] = useState<ExecutiveDashboard | null>(null);
  const [pendings, setPendings] = useState<PendingApproval[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    Promise.allSettled([fetchExecutiveDashboard(token), listMyPendingApprovals(token)]).then(([e, p]) => {
      if (cancelled) return;
      if (e.status === "fulfilled") setExec(e.value);
      if (p.status === "fulfilled") setPendings(p.value);
      const firstFailure = e.status === "rejected" ? e.reason : p.status === "rejected" ? p.reason : null;
      setLoadError(
        firstFailure
          ? formatApiError(firstFailure, "No pudimos actualizar el resumen.")
          : null,
      );
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  const approvals = useMemo(() => (pendings ?? []).slice(0, 6).map(pendingToApproval), [pendings]);
  const healthDomains = useMemo(() => (exec ? buildHealthDomains(exec) : null), [exec]);
  const alertCounts = useMemo(() => {
    const alerts = exec?.alerts ?? [];
    return {
      critical: alerts.filter((a) => a.level === "critical").length,
      warning: alerts.filter((a) => a.level === "warning").length,
    };
  }, [exec]);

  const pendingTotal = pendings?.length ?? 0;
  const statSkeleton = <DashSkeleton width={96} height={26} />;
  const change = exec?.headlineKpis.revenueMoMChange ?? 0;
  const weakDomains = healthDomains?.filter((d) => d.variant !== "positive") ?? [];

  return (
    <DashPage>
      <DashHero
        eyebrow="Resumen general"
        title={`${greetingFor(now.getHours())}, ${nombre}`}
        subtitle={
          <>
            <span style={{ textTransform: "capitalize" }}>
              {new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long" }).format(now)}
            </span>
            {" · así va el negocio hoy"}
          </>
        }
        actions={
          <>
            {pendingTotal > 0 && (
              <DashPill tone="warning">{plural(pendingTotal, "aprobación pendiente", "aprobaciones pendientes")}</DashPill>
            )}
            {isExecutive ? (
              <>
                <Link href="/erp/exports" style={{ textDecoration: "none" }}>
                  <Button variant="secondary">Exportar</Button>
                </Link>
                <Link href="/erp/executive" style={{ textDecoration: "none" }}>
                  <Button variant="primary" iconRight="→">Vista ejecutiva</Button>
                </Link>
              </>
            ) : (
              <Link href="/erp/mis-actividades" style={{ textDecoration: "none" }}>
                <Button variant="primary" iconRight="→">Mis actividades</Button>
              </Link>
            )}
          </>
        }
      />

      {loadError && (
        <InlineAlert
          variant={exec || pendings ? "warning" : "danger"}
          message={
            exec || pendings
              ? `Parte del resumen no se pudo actualizar. Mostramos los últimos datos disponibles. (${loadError})`
              : `No pudimos cargar el resumen. ${loadError}`
          }
          action={
            <Button size="sm" variant="secondary" onClick={retry} loading={loading}>
              Reintentar
            </Button>
          }
        />
      )}

      <StatStrip
        stats={[
          {
            label: "Ingresos del mes",
            value: exec ? <Money value={exec.headlineKpis.revenueMtd} compact /> : statSkeleton,
            delta: exec && change !== 0
              ? { value: `${change >= 0 ? "+" : ""}${change}%`, direction: change >= 0 ? "up" : "down" }
              : undefined,
            sub: exec && exec.headlineKpis.revenuePrevMonth > 0
              ? `vs ${compactMxn.format(exec.headlineKpis.revenuePrevMonth)} el mes anterior`
              : undefined,
            big: true,
          },
          {
            label: "Oportunidades abiertas",
            value: exec ? <Money value={exec.headlineKpis.pipelineValue} compact /> : statSkeleton,
            sub: exec ? `${plural(exec.headlineKpis.pipelineCount, "oportunidad", "oportunidades")} en negociación` : undefined,
            tone: "accent",
          },
          {
            label: "Por cobrar",
            value: exec ? <Money value={exec.headlineKpis.arOutstanding} compact /> : statSkeleton,
            sub: exec ? plural(exec.finance.overdueInvoices, "factura vencida", "facturas vencidas") : undefined,
            tone: exec && exec.finance.overdueInvoices > 0 ? "warning" : "default",
          },
          {
            label: "Proyectos en campo",
            value: exec ? exec.operations.activeProjects.toLocaleString("es-MX") : statSkeleton,
            sub: exec
              ? `${plural(exec.operations.otOpen, "orden abierta", "órdenes abiertas")} · ${exec.operations.otOverdue.toLocaleString("es-MX")} vencidas`
              : undefined,
            tone: exec && exec.operations.otOverdue > 0 ? "warning" : "default",
          },
          {
            label: "Alertas críticas",
            value: exec ? alertCounts.critical.toLocaleString("es-MX") : statSkeleton,
            sub: exec
              ? `${plural(alertCounts.warning, "aviso", "avisos")} · ${plural(exec.procurement.lowStockItems, "producto bajo mínimo", "productos bajo mínimo")}`
              : undefined,
            tone: exec ? (alertCounts.critical > 0 ? "danger" : "positive") : "default",
          },
        ]}
      />

      <DashGrid>
        <DashCol span={8}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <DashPanel
              title="Aprobaciones pendientes"
              subtitle="Solicitudes que esperan tu firma"
              action="Ver todas"
              actionHref="/erp/approvals"
            >
              {pendings === null && loading ? (
                <div style={{ padding: "6px 12px" }}>
                  <DashSkeleton rows={3} height={14} gap={18} />
                </div>
              ) : approvals.length === 0 ? (
                <DashEmpty
                  title={pendings === null ? "No pudimos revisar tu bandeja" : "Todo al día"}
                  description={
                    pendings === null
                      ? "Intenta de nuevo en unos segundos."
                      : "No tienes solicitudes esperando tu firma."
                  }
                />
              ) : (
                approvals.map((a) => {
                  const meta = URGENCIA_META[a.urgencia];
                  return (
                    <ListRow
                      key={a.key}
                      href="/erp/approvals"
                      accent={meta.accent}
                      title={a.titulo}
                      sub={a.sub}
                      trail={<DashPill tone={meta.tone}>Prioridad {meta.label.toLowerCase()}</DashPill>}
                    />
                  );
                })
              )}
              {pendingTotal > approvals.length && (
                <p style={{ margin: "4px 12px 0", fontSize: 12, color: "var(--text-tertiary)" }}>
                  y {plural(pendingTotal - approvals.length, "solicitud más", "solicitudes más")}
                </p>
              )}
            </DashPanel>

            <DashPanel
              title="Salud por área"
              subtitle={
                exec
                  ? `Índice estimado · actualizado a las ${new Date(exec.generatedAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`
                  : "Índice estimado de 0 a 100"
              }
            >
              {!healthDomains ? (
                loading ? (
                  <DashSkeleton rows={6} height={10} gap={16} />
                ) : (
                  <DashEmpty title="Sin datos por ahora" description="No pudimos calcular los indicadores por área." />
                )
              ) : (
                <>
                  <BarList
                    max={100}
                    items={healthDomains.map((d) => ({
                      label: d.name,
                      value: d.health,
                      display: `${d.health}%`,
                      color: HEALTH_COLOR[d.variant],
                    }))}
                  />
                  {weakDomains.length > 0 ? (
                    <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
                      {weakDomains.map((d) => (
                        <li key={d.name} style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.45 }}>
                          <strong style={{ color: HEALTH_COLOR[d.variant], fontWeight: 650 }}>
                            {d.variant === "danger" ? "Atender" : "Vigilar"}
                          </strong>{" "}
                          {d.name}: {d.note}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--text-tertiary)" }}>
                      Todas las áreas están en verde (85 o más).
                    </p>
                  )}
                </>
              )}
            </DashPanel>
          </div>
        </DashCol>

        <DashCol span={4}>
          <DashPanel title="Accesos rápidos" subtitle="Lo que más usas según tu puesto" flush>
            <nav aria-label="Accesos rápidos" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {shortcuts.map((s) => (
                <ListRow key={s.href} href={s.href} title={s.title} sub={s.desc} trail={<span aria-hidden="true">→</span>} />
              ))}
            </nav>
          </DashPanel>
        </DashCol>
      </DashGrid>
    </DashPage>
  );
}
