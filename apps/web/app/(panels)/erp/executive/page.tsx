"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";
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
  RankIndex,
} from "@/components/dashboard/DashKit";
import { useUser } from "@/components/UserContext";
import { resolveV2RoleKey } from "@/lib/user-access";
import { ROLES, type RoleKey } from "@/lib/rbac";
import { buildApiUrl } from "@/lib/api-base";
import { CommandCenterRail } from "@/components/command-center/CommandCenterRail";
import { buildExecutiveDynamicWidgets, buildExecutiveBiDrillLinks } from "@/lib/executive-widgets";
import { ExecutiveBiDrillPanel } from "@/components/command-center/ExecutiveBiDrillPanel";

/**
 * Vista ejecutiva — pantalla home del CEO / Dueño.
 * Datos reales desde GET /api/executive/c-level
 */

interface DashboardAlert {
  level: "critical" | "warning" | "info";
  icon: string;
  title: string;
  message: string;
}

interface DashboardData {
  generatedAt: string;
  headlineKpis: {
    revenueMtd: number;
    revenuePrevMonth: number;
    revenueMoMChange: number;
    revenueYtd: number;
    wonOppsMtd: number;
    pipelineValue: number;
    pipelineCount: number;
    cashOnHand: number;
    arOutstanding: number;
    apOutstanding: number;
    workingCapital: number;
  };
  sales: { hotLeads: number; tendersOpen: number; tendersWon: number };
  operations: {
    activeProjects: number;
    otOpen: number;
    otOverdue: number;
    otCompletedMtd: number;
    ticketsOpen: number;
    ticketsClosedMtd: number;
  };
  finance: { invoicedMtd: number; invoicesCountMtd: number; overdueInvoices: number };
  maintenance: { activeContracts: number; upcomingVisits: number };
  procurement: { pendingRequisitions: number; pendingPOs: number; lowStockItems: number };
  clientsCount: number;
  teamSize: number;
  alerts: DashboardAlert[];
  topSellers: Array<{ ownerId: number; ownerName: string; revenue: number; wonCount: number }>;
  topAccounts?: Array<{
    clientId: number;
    clientName: string;
    projects: number;
    revenue: number;
    margin: number;
    marginPercent: number;
  }>;
}

const ERP_EXECUTIVE_ROLES = new Set<RoleKey>([ROLES.CEO, ROLES.DIR_ADMIN, ROLES.DIR_OPERACIONES]);

const fmtCompact = (v: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", notation: "compact" }).format(v);

export default function ExecutivePage() {
  const { token, user } = useUser();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    if (user.isSuperAdmin) return;
    const v2 = resolveV2RoleKey(user);
    if (v2 && !ERP_EXECUTIVE_ROLES.has(v2)) router.replace("/erp/dashboard");
  }, [user, router]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    fetch(buildApiUrl("executive/c-level"), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<DashboardData>;
      })
      .then((d) => setData(d))
      .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar dashboard"))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!mounted) return;
    load();
  }, [mounted, load]);

  if (!mounted) {
    return (
      <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", color: "var(--text-tertiary, #94a3b8)", fontSize: 14 }}>
        <span>Cargando vista ejecutiva…</span>
      </div>
    );
  }

  if (!user || !token) {
    return (
      <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-secondary)" }}>
        <p style={{ fontWeight: 600 }}>Sesión no detectada. Redirigiendo a login…</p>
      </div>
    );
  }

  const v2Role = resolveV2RoleKey(user);
  const shortcuts =
    v2Role === ROLES.DIR_OPERACIONES
      ? [
          { href: "/erp/approvals", label: "Aprobaciones", desc: "Solicitudes pendientes" },
          { href: "/ops/dashboard", label: "Centro OPS", desc: "Operación diaria" },
          { href: "/ops/projects", label: "Proyectos", desc: "Portafolio activo" },
          { href: "/erp/procurement", label: "Compras", desc: "Requisiciones y OC" },
        ]
      : v2Role === ROLES.DIR_ADMIN
      ? [
          { href: "/erp/approvals", label: "Aprobaciones", desc: "Solicitudes pendientes" },
          { href: "/erp/invoicing", label: "Facturación", desc: "CFDI y cobranza" },
          { href: "/erp/hr", label: "Recursos humanos", desc: "Equipo y nómina" },
          { href: "/erp/finance/viatics", label: "Viáticos", desc: "Gastos y analytics" },
        ]
      : [
          { href: "/erp/approvals", label: "Aprobaciones", desc: "Solicitudes pendientes" },
          { href: "/erp/analytics/bi", label: "Business Intelligence", desc: "Márgenes y ROI" },
          { href: "/erp/accounting", label: "Contabilidad", desc: "Estados financieros" },
          { href: "/erp/users", label: "Roles y accesos", desc: "Gobierno de usuarios" },
        ];

  const kpis = data?.headlineKpis;
  const ops = data?.operations;
  const fin = data?.finance;
  const maint = data?.maintenance;
  const proc = data?.procurement;

  const momChange = kpis?.revenueMoMChange ?? 0;
  const momLabel = momChange > 0 ? `+${momChange}%` : `${momChange}%`;
  const momDir: "up" | "down" | "flat" = momChange > 0 ? "up" : momChange < 0 ? "down" : "flat";

  const alerts: DashboardAlert[] = data?.alerts ?? [];
  const criticalAlerts = alerts.filter((a) => a.level === "critical");
  const dynamicWidgets = buildExecutiveDynamicWidgets(data);
  const biDrillLinks = buildExecutiveBiDrillLinks(data, {
    revenueMoMChange: kpis?.revenueMoMChange,
    pipelineValue: kpis?.pipelineValue,
  });

  return (
    <DashPage>
      <DashHero
        eyebrow="ERP · Vista ejecutiva"
        title={`Buen día, ${(user.nombre || user.email).split(" ")[0]}`}
        subtitle={
          data
            ? `Snapshot del grupo · actualizado ${new Date(data.generatedAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`
            : "Consultando el estado del grupo…"
        }
        actions={
          <>
            {criticalAlerts.length > 0 && <DashPill tone="danger">{criticalAlerts.length} alertas críticas</DashPill>}
            <Button variant="ghost" onClick={load}>Actualizar</Button>
            <Link href="/erp/calendar" style={{ textDecoration: "none" }}>
              <Button variant="primary" iconRight="→">Vista del mes</Button>
            </Link>
          </>
        }
      />

      <CommandCenterRail panel="erp" extraWidgets={dynamicWidgets} />

      {error && !loading && (
        <DashPanel title="No se pudo cargar" subtitle={error}>
          <Button size="sm" variant="secondary" onClick={load}>Reintentar</Button>
        </DashPanel>
      )}

      {/* ── Franja financiera principal ─────────────────────── */}
      <StatStrip
        stats={[
          {
            label: "Ingresos del mes",
            value: loading ? "…" : <Money value={kpis?.revenueMtd ?? 0} compact />,
            delta: loading ? undefined : { direction: momDir, value: momLabel },
            sub: loading ? undefined : `vs ${fmtCompact(kpis?.revenuePrevMonth ?? 0)} mes anterior · YTD ${fmtCompact(kpis?.revenueYtd ?? 0)}`,
            big: true,
          },
          {
            label: "Pipeline activo",
            value: loading ? "…" : <Money value={kpis?.pipelineValue ?? 0} compact />,
            sub: loading ? undefined : `${kpis?.pipelineCount ?? 0} oportunidades en curso`,
            tone: "accent",
          },
          {
            label: "Saldo en bancos",
            value: loading ? "…" : <Money value={kpis?.cashOnHand ?? 0} compact />,
            sub: loading ? undefined : `Capital de trabajo ${fmtCompact(kpis?.workingCapital ?? 0)}`,
          },
          {
            label: "Cuentas por cobrar",
            value: loading ? "…" : <Money value={kpis?.arOutstanding ?? 0} compact />,
            sub: loading
              ? undefined
              : fin && fin.overdueInvoices > 0
              ? `${fin.overdueInvoices} facturas vencidas`
              : `Por pagar ${fmtCompact(kpis?.apOutstanding ?? 0)}`,
            tone: fin && fin.overdueInvoices > 0 ? "warning" : "default",
          },
        ]}
      />

      <DashGrid>
        {/* ── Operación ───────────────────────────────────────── */}
        <DashCol span={8}>
          <DashPanel
            title="Operación"
            subtitle="Proyectos, órdenes de trabajo y soporte"
            action="Centro OPS"
            actionHref="/ops/dashboard"
          >
            <MiniStatGrid
              items={[
                { label: "Proyectos activos", value: loading ? "…" : ops?.activeProjects ?? 0, tone: "accent" },
                { label: "OTs abiertas", value: loading ? "…" : ops?.otOpen ?? 0 },
                { label: "OTs vencidas", value: loading ? "…" : ops?.otOverdue ?? 0, tone: ops && ops.otOverdue > 0 ? "danger" : "default" },
                { label: "Cerradas (mes)", value: loading ? "…" : ops?.otCompletedMtd ?? 0, tone: "positive" },
                { label: "Tickets abiertos", value: loading ? "…" : ops?.ticketsOpen ?? 0, tone: ops && ops.ticketsOpen > 0 ? "warning" : "default" },
                { label: "Contratos activos", value: loading ? "…" : maint?.activeContracts ?? 0 },
              ]}
            />
            {!loading && ops && ops.otOpen + ops.otOverdue + ops.otCompletedMtd > 0 && (
              <div style={{ marginTop: 14 }}>
                <BarList
                  items={[
                    { label: "Completadas (mes)", value: ops.otCompletedMtd, color: "var(--success)" },
                    { label: "Abiertas", value: ops.otOpen, color: "var(--panel-accent, var(--primary))" },
                    { label: "Vencidas", value: ops.otOverdue, color: "var(--danger)" },
                  ].filter((r) => r.value > 0)}
                />
              </div>
            )}
          </DashPanel>
        </DashCol>

        {/* ── Alertas ─────────────────────────────────────────── */}
        <DashCol span={4}>
          <DashPanel
            title="Requiere tu atención"
            subtitle="Eventos que impactan operación o finanzas"
          >
            {loading && <DashEmpty title="Cargando alertas…" />}
            {!loading && alerts.length === 0 && (
              <DashEmpty title="Sin alertas activas" description="Todo operando con normalidad." />
            )}
            {!loading &&
              alerts.slice(0, 6).map((a, i) => (
                <AlertRow key={i} level={a.level} title={a.title} message={a.message} />
              ))}
          </DashPanel>
        </DashCol>

        {/* ── Cuentas clave (Customer 360) ─────────────────────── */}
        <DashCol span={6}>
          <DashPanel
            title="Cuentas clave"
            subtitle="ROI por cliente · vista 360°"
            action="Ver BI"
            actionHref="/erp/analytics/bi?section=clients"
          >
            {loading && <DashEmpty title="Cargando…" />}
            {!loading && (!data?.topAccounts || data.topAccounts.length === 0) && (
              <DashEmpty title="Sin cuentas con proyectos" description="Los clientes con proyectos activos aparecerán aquí." />
            )}
            {!loading &&
              data?.topAccounts?.map((c) => (
                <ListRow
                  key={c.clientId}
                  href={`/crm/clients/${c.clientId}`}
                  title={c.clientName}
                  sub={`${c.projects} proyectos · margen ${c.marginPercent}%`}
                  trail={<Money value={c.margin} compact bold />}
                />
              ))}
          </DashPanel>
        </DashCol>

        {/* ── Top vendedores ──────────────────────────────────── */}
        <DashCol span={6}>
          <DashPanel
            title="Top vendedores del mes"
            subtitle="Ingresos por oportunidades cerradas"
            action="Ver BI"
            actionHref="/erp/analytics/bi"
          >
            {loading && <DashEmpty title="Cargando…" />}
            {!loading && (!data || data.topSellers.length === 0) && (
              <DashEmpty title="Sin cierres este mes" description="Aún no hay oportunidades ganadas en el periodo." />
            )}
            {!loading &&
              data &&
              data.topSellers.map((s, i) => (
                <ListRow
                  key={s.ownerId}
                  leading={<RankIndex n={i + 1} />}
                  title={s.ownerName}
                  sub={`${s.wonCount} oportunidades ganadas`}
                  trail={<Money value={s.revenue} compact bold />}
                />
              ))}
          </DashPanel>
        </DashCol>

        {/* ── Comercial y abastecimiento ──────────────────────── */}
        <DashCol span={6}>
          <DashPanel
            title="Comercial y abastecimiento"
            subtitle="Leads, licitaciones y compras"
            action="Pipeline"
            actionHref="/crm/pipeline"
          >
            <MiniStatGrid
              items={[
                { label: "Leads calientes", value: loading ? "…" : data?.sales.hotLeads ?? 0, tone: data && data.sales.hotLeads >= 5 ? "warning" : "default" },
                { label: "Licitaciones abiertas", value: loading ? "…" : data?.sales.tendersOpen ?? 0 },
                { label: "Licitaciones ganadas", value: loading ? "…" : data?.sales.tendersWon ?? 0, tone: "positive" },
                { label: "Requisiciones pend.", value: loading ? "…" : proc?.pendingRequisitions ?? 0, tone: proc && proc.pendingRequisitions > 0 ? "warning" : "default" },
                { label: "OC pendientes", value: loading ? "…" : proc?.pendingPOs ?? 0, tone: proc && proc.pendingPOs > 0 ? "warning" : "default" },
                { label: "Stock crítico", value: loading ? "…" : proc?.lowStockItems ?? 0, tone: proc && proc.lowStockItems > 0 ? "danger" : "default" },
              ]}
            />
          </DashPanel>
        </DashCol>
      </DashGrid>

      {/* ── Empresa + accesos ─────────────────────────────────── */}
      <DashGrid>
        <DashCol span={5}>
          <StatStrip
            stats={[
              {
                label: "Facturado (mes)",
                value: loading ? "…" : <Money value={fin?.invoicedMtd ?? 0} compact />,
                sub: loading ? undefined : `${fin?.invoicesCountMtd ?? 0} facturas emitidas`,
                tone: "positive",
              },
              { label: "Colaboradores", value: loading ? "…" : data?.teamSize ?? 0 },
              { label: "Clientes activos", value: loading ? "…" : data?.clientsCount ?? 0 },
            ]}
          />
        </DashCol>
        <DashCol span={7}>
          <DashPanel title="Accesos rápidos" subtitle="Lo que más usas — un clic" flush>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 4 }}>
              {shortcuts.map((s) => (
                <ListRow key={s.href} href={s.href} title={s.label} sub={s.desc} trail="→" />
              ))}
            </div>
          </DashPanel>
        </DashCol>
      </DashGrid>

      {biDrillLinks.length > 0 && (
        <DashGrid>
          <DashCol span={12}>
            <ExecutiveBiDrillPanel links={biDrillLinks} />
          </DashCol>
        </DashGrid>
      )}
    </DashPage>
  );
}
