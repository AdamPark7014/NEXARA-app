"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  MiniStatGrid,
  BarList,
  AlertRow,
  ListRow,
  DashPill,
  DashEmpty,
  DashSkeleton,
  RankIndex,
} from "@/components/dashboard/DashKit";
import { useUser } from "@/components/UserContext";
import { resolveV2RoleKey } from "@/lib/user-access";
import { ROLES, type RoleKey } from "@/lib/rbac";
import { buildApiUrl } from "@/lib/api-base";
import type { ExecutiveDashboard } from "@/lib/executive-api";
import { CommandCenterRail } from "@/components/command-center/CommandCenterRail";
import { buildExecutiveDynamicWidgets, buildExecutiveBiDrillLinks } from "@/lib/executive-widgets";
import { ExecutiveBiDrillPanel } from "@/components/command-center/ExecutiveBiDrillPanel";

/**
 * Vista ejecutiva — pantalla principal de dirección.
 * Datos reales desde GET /api/executive/c-level
 */

type DashboardData = ExecutiveDashboard & {
  topAccounts?: Array<{
    clientId: number;
    clientName: string;
    projects: number;
    revenue: number;
    margin: number;
    marginPercent: number;
  }>;
};

type Shortcut = { href: string; label: string; desc: string };

const ERP_EXECUTIVE_ROLES = new Set<RoleKey>([ROLES.CEO, ROLES.DIR_ADMIN, ROLES.DIR_OPERACIONES]);

const SHORTCUTS: Record<"ops" | "admin" | "ceo", Shortcut[]> = {
  ops: [
    { href: "/erp/approvals", label: "Aprobaciones", desc: "Solicitudes pendientes" },
    { href: "/erp/pizarra", label: "Actividades del equipo", desc: "Operación del día" },
    { href: "/erp/proyectos", label: "Proyectos", desc: "Portafolio activo" },
    { href: "/erp/procurement", label: "Compras", desc: "Requisiciones y órdenes" },
  ],
  admin: [
    { href: "/erp/approvals", label: "Aprobaciones", desc: "Solicitudes pendientes" },
    { href: "/erp/invoicing", label: "Facturación", desc: "Facturas y cobranza" },
    { href: "/erp/hr", label: "Recursos humanos", desc: "Equipo y nómina" },
    { href: "/erp/finance/viatics", label: "Viáticos", desc: "Gastos de viaje" },
  ],
  ceo: [
    { href: "/erp/approvals", label: "Aprobaciones", desc: "Solicitudes pendientes" },
    { href: "/erp/analytics/bi", label: "Analítica", desc: "Márgenes y rentabilidad" },
    { href: "/erp/contabilidad", label: "Contabilidad", desc: "Cobros, pagos y cierres" },
    { href: "/erp/users", label: "Usuarios y accesos", desc: "Quién ve qué" },
  ],
};

const fmtCompact = (v: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", notation: "compact" }).format(v);
const num = (v: number) => v.toLocaleString("es-MX");
const plural = (n: number, one: string, many: string) => `${num(n)} ${n === 1 ? one : many}`;

function greetingFor(hour: number) {
  return hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
}

function friendlyLoadError(status?: number) {
  if (status === 401 || status === 403) return "Tu usuario no tiene acceso a estos indicadores.";
  if (status && status >= 500) return "El servidor no respondió como esperábamos.";
  return "Revisa tu conexión e intenta de nuevo.";
}

export default function ExecutivePage() {
  const { token, user } = useUser();
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const v2Role = resolveV2RoleKey(user);

  useEffect(() => {
    if (!user || user.isSuperAdmin) return;
    if (v2Role && !ERP_EXECUTIVE_ROLES.has(v2Role)) router.replace("/erp/dashboard");
  }, [user, v2Role, router]);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    fetch(buildApiUrl("executive/c-level"), { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status });
        return r.json() as Promise<DashboardData>;
      })
      .then((d) => setData(d))
      .catch((e: { status?: number }) => setError(friendlyLoadError(e?.status)))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const dynamicWidgets = useMemo(() => buildExecutiveDynamicWidgets(data), [data]);
  const biDrillLinks = useMemo(
    () =>
      buildExecutiveBiDrillLinks(data, {
        revenueMoMChange: data?.headlineKpis.revenueMoMChange,
        pipelineValue: data?.headlineKpis.pipelineValue,
      }),
    [data],
  );
  const alerts = useMemo(() => data?.alerts ?? [], [data]);
  const criticalCount = useMemo(() => alerts.filter((a) => a.level === "critical").length, [alerts]);

  const shortcuts =
    v2Role === ROLES.DIR_OPERACIONES ? SHORTCUTS.ops : v2Role === ROLES.DIR_ADMIN ? SHORTCUTS.admin : SHORTCUTS.ceo;

  if (!user || !token) {
    return (
      <DashPage>
        <DashEmpty title="Verificando tu sesión…" description="En un momento te mostramos los indicadores." />
      </DashPage>
    );
  }

  const kpis = data?.headlineKpis;
  const ops = data?.operations;
  const fin = data?.finance;
  const maint = data?.maintenance;
  const proc = data?.procurement;
  const ready = data !== null;
  const sk = <DashSkeleton width={88} height={26} />;
  const skMini = <DashSkeleton width={44} height={20} />;

  const momChange = kpis?.revenueMoMChange ?? 0;
  const momDir: "up" | "down" | "flat" = momChange > 0 ? "up" : momChange < 0 ? "down" : "flat";
  const firstName = (user.nombre || user.email || "").split(" ")[0];

  return (
    <DashPage>
      <DashHero
        eyebrow="Vista ejecutiva"
        title={`${greetingFor(new Date().getHours())}, ${firstName}`}
        subtitle={
          data
            ? `Así va la empresa · actualizado a las ${new Date(data.generatedAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`
            : "Reuniendo los indicadores de la empresa…"
        }
        actions={
          <>
            {criticalCount > 0 && <DashPill tone="danger">{plural(criticalCount, "alerta crítica", "alertas críticas")}</DashPill>}
            <Button variant="ghost" iconLeft="↻" onClick={load} loading={loading && ready} disabled={loading}>
              Actualizar
            </Button>
            <Link href="/erp/analytics/bi" style={{ textDecoration: "none" }}>
              <Button variant="primary" iconRight="→">Ver analítica</Button>
            </Link>
          </>
        }
      />

      <CommandCenterRail panel="erp" extraWidgets={dynamicWidgets} ariaLabel="Atajos y pendientes" />

      {error && !loading && (
        <InlineAlert
          variant={ready ? "warning" : "danger"}
          message={ready ? `No pudimos actualizar; mostramos los últimos datos. ${error}` : `No pudimos cargar la vista ejecutiva. ${error}`}
          action={<Button size="sm" variant="secondary" onClick={load}>Reintentar</Button>}
        />
      )}

      <StatStrip
        stats={[
          {
            label: "Ingresos del mes",
            value: ready ? <Money value={kpis?.revenueMtd ?? 0} compact /> : sk,
            delta: ready && momChange !== 0 ? { direction: momDir, value: `${momChange > 0 ? "+" : ""}${momChange}%` } : undefined,
            sub: ready
              ? `vs ${fmtCompact(kpis?.revenuePrevMonth ?? 0)} el mes anterior · ${fmtCompact(kpis?.revenueYtd ?? 0)} en el año`
              : undefined,
            big: true,
          },
          {
            label: "Oportunidades abiertas",
            value: ready ? <Money value={kpis?.pipelineValue ?? 0} compact /> : sk,
            sub: ready ? `${plural(kpis?.pipelineCount ?? 0, "oportunidad", "oportunidades")} en curso` : undefined,
            tone: "accent",
          },
          {
            label: "Saldo en bancos",
            value: ready ? <Money value={kpis?.cashOnHand ?? 0} compact /> : sk,
            sub: ready ? `Capital de trabajo ${fmtCompact(kpis?.workingCapital ?? 0)}` : undefined,
          },
          {
            label: "Por cobrar",
            value: ready ? <Money value={kpis?.arOutstanding ?? 0} compact /> : sk,
            sub: !ready
              ? undefined
              : fin && fin.overdueInvoices > 0
                ? plural(fin.overdueInvoices, "factura vencida", "facturas vencidas")
                : `Por pagar ${fmtCompact(kpis?.apOutstanding ?? 0)}`,
            tone: fin && fin.overdueInvoices > 0 ? "warning" : "default",
          },
        ]}
      />

      <DashGrid>
        <DashCol span={8}>
          <DashPanel title="Operación" subtitle="Proyectos, órdenes de trabajo y soporte" action="Actividades" actionHref="/erp/pizarra">
            <MiniStatGrid
              items={[
                { label: "Proyectos activos", value: ops ? num(ops.activeProjects) : skMini, tone: "accent" },
                { label: "Órdenes abiertas", value: ops ? num(ops.otOpen) : skMini },
                { label: "Órdenes vencidas", value: ops ? num(ops.otOverdue) : skMini, tone: ops && ops.otOverdue > 0 ? "danger" : "default" },
                { label: "Cerradas en el mes", value: ops ? num(ops.otCompletedMtd) : skMini, tone: "positive" },
                { label: "Tickets abiertos", value: ops ? num(ops.ticketsOpen) : skMini, tone: ops && ops.ticketsOpen > 0 ? "warning" : "default" },
                { label: "Contratos activos", value: maint ? num(maint.activeContracts) : skMini },
              ]}
            />
            {ops && ops.otOpen + ops.otOverdue + ops.otCompletedMtd > 0 && (
              <div style={{ marginTop: 14 }}>
                <BarList
                  items={[
                    { label: "Cerradas en el mes", value: ops.otCompletedMtd, color: "var(--success)" },
                    { label: "Abiertas", value: ops.otOpen, color: "var(--panel-accent, var(--primary))" },
                    { label: "Vencidas", value: ops.otOverdue, color: "var(--danger)" },
                  ].filter((r) => r.value > 0)}
                  formatValue={num}
                />
              </div>
            )}
          </DashPanel>
        </DashCol>

        <DashCol span={4}>
          <DashPanel title="Requiere tu atención" subtitle="Lo que afecta la operación o las finanzas">
            {!ready ? (
              loading ? <DashSkeleton rows={4} height={34} gap={8} /> : <DashEmpty title="Sin datos por ahora" />
            ) : alerts.length === 0 ? (
              <DashEmpty title="Sin alertas" description="Todo funciona con normalidad." />
            ) : (
              alerts.slice(0, 6).map((a, i) => <AlertRow key={`${a.title}-${i}`} level={a.level} title={a.title} message={a.message} />)
            )}
          </DashPanel>
        </DashCol>

        <DashCol span={6}>
          <DashPanel title="Clientes clave" subtitle="Margen por cliente con proyectos" action="Ver rentabilidad" actionHref="/erp/analytics/bi?section=clients">
            {!ready ? (
              loading ? <DashSkeleton rows={4} height={14} gap={18} /> : <DashEmpty title="Sin datos por ahora" />
            ) : !data.topAccounts || data.topAccounts.length === 0 ? (
              <DashEmpty title="Aún no hay clientes con proyectos" description="Aparecerán aquí en cuanto tengan proyectos activos." />
            ) : (
              data.topAccounts.map((c) => (
                <ListRow
                  key={c.clientId}
                  href={`/erp/clientes/${c.clientId}`}
                  title={c.clientName}
                  sub={`${plural(c.projects, "proyecto", "proyectos")} · margen ${c.marginPercent}%`}
                  trail={<Money value={c.margin} compact bold />}
                />
              ))
            )}
          </DashPanel>
        </DashCol>

        <DashCol span={6}>
          <DashPanel title="Mejores vendedores del mes" subtitle="Ingresos por oportunidades ganadas" action="Ver analítica" actionHref="/erp/analytics/bi">
            {!ready ? (
              loading ? <DashSkeleton rows={4} height={14} gap={18} /> : <DashEmpty title="Sin datos por ahora" />
            ) : data.topSellers.length === 0 ? (
              <DashEmpty title="Sin cierres este mes" description="Aún no hay oportunidades ganadas en el periodo." />
            ) : (
              data.topSellers.map((s, i) => (
                <ListRow
                  key={s.ownerId}
                  leading={<RankIndex n={i + 1} />}
                  title={s.ownerName}
                  sub={plural(s.wonCount, "oportunidad ganada", "oportunidades ganadas")}
                  trail={<Money value={s.revenue} compact bold />}
                />
              ))
            )}
          </DashPanel>
        </DashCol>

        <DashCol span={6}>
          <DashPanel title="Ventas y compras" subtitle="Prospectos, licitaciones y abastecimiento" action="Cotizaciones" actionHref="/erp/cotizaciones">
            <MiniStatGrid
              items={[
                { label: "Prospectos calientes", value: data ? num(data.sales.hotLeads) : skMini, tone: data && data.sales.hotLeads >= 5 ? "warning" : "default" },
                { label: "Licitaciones abiertas", value: data ? num(data.sales.tendersOpen) : skMini },
                { label: "Licitaciones ganadas", value: data ? num(data.sales.tendersWon) : skMini, tone: "positive" },
                { label: "Requisiciones", value: proc ? num(proc.pendingRequisitions) : skMini, tone: proc && proc.pendingRequisitions > 0 ? "warning" : "default" },
                { label: "Órdenes de compra", value: proc ? num(proc.pendingPOs) : skMini, tone: proc && proc.pendingPOs > 0 ? "warning" : "default" },
                { label: "Bajo mínimo", value: proc ? num(proc.lowStockItems) : skMini, tone: proc && proc.lowStockItems > 0 ? "danger" : "default" },
              ]}
            />
          </DashPanel>
        </DashCol>

        <DashCol span={6}>
          <DashPanel title="Accesos rápidos" subtitle="Lo que más usas, a un clic" flush>
            <nav aria-label="Accesos rápidos" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: 4 }}>
              {shortcuts.map((s) => (
                <ListRow key={s.href} href={s.href} title={s.label} sub={s.desc} trail={<span aria-hidden="true">→</span>} />
              ))}
            </nav>
          </DashPanel>
        </DashCol>
      </DashGrid>

      <StatStrip
        stats={[
          {
            label: "Facturado en el mes",
            value: fin ? <Money value={fin.invoicedMtd} compact /> : sk,
            sub: fin ? plural(fin.invoicesCountMtd, "factura emitida", "facturas emitidas") : undefined,
            tone: "positive",
          },
          { label: "Colaboradores", value: data ? num(data.teamSize) : sk },
          { label: "Clientes activos", value: data ? num(data.clientsCount) : sk },
        ]}
      />

      {biDrillLinks.length > 0 && <ExecutiveBiDrillPanel links={biDrillLinks} />}
    </DashPage>
  );
}
