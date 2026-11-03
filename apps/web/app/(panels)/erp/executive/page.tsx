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
import TuDiaPanel from "@/components/executive/TuDiaPanel";
import DireccionHoy from "@/components/executive/DireccionHoy";
import { DIRECCION_VISIBLE } from "@/lib/direccion-api";
import CadenaNegocio, { SiguientePasoNegocio } from "@/components/executive/CadenaNegocio";

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

  // Solo dirección: los demás roles que abren esta vista no ven al personal completo.
  const [muestra, setMuestra] = useState(false);
  useEffect(() => {
    setMuestra(new URLSearchParams(window.location.search).has("muestra"));
  }, []);
  const verDireccion = (DIRECCION_VISIBLE || muestra) && v2Role === ROLES.CEO;

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
  const cadena = data?.cadena ?? null;
  const momDir: "up" | "down" | "flat" = momChange > 0 ? "up" : momChange < 0 ? "down" : "flat";
  const firstName = (user.nombre || user.email || "").split(" ")[0];

  // Sin datos todavía se enseñan vacías mientras cargan; ya cargado, un cuadro en $0 no dice nada.
  const cifrasDinero: Array<{ n: number; stat: Parameters<typeof StatStrip>[0]["stats"][number] }> = [
    { n: kpis?.revenueMtd ?? 0, stat: {
            label: "Ingresos del mes",
            value: ready ? <Money value={kpis?.revenueMtd ?? 0} compact /> : sk,
            delta: ready && momChange !== 0 ? { direction: momDir, value: `${momChange > 0 ? "+" : ""}${momChange}%` } : undefined,
            sub: ready
              ? `vs ${fmtCompact(kpis?.revenuePrevMonth ?? 0)} el mes anterior · ${fmtCompact(kpis?.revenueYtd ?? 0)} en el año`
              : undefined,
            big: true,
              } },
    { n: kpis?.pipelineValue ?? 0, stat: {
            label: "Oportunidades abiertas",
            value: ready ? <Money value={kpis?.pipelineValue ?? 0} compact /> : sk,
            sub: ready ? `${plural(kpis?.pipelineCount ?? 0, "oportunidad", "oportunidades")} en curso` : undefined,
            tone: "accent",
              } },
    { n: kpis?.cashOnHand ?? 0, stat: {
            label: "Saldo en bancos",
            value: ready ? <Money value={kpis?.cashOnHand ?? 0} compact /> : sk,
            sub: ready ? `Capital de trabajo ${fmtCompact(kpis?.workingCapital ?? 0)}` : undefined,
              } },
    { n: kpis?.arOutstanding ?? 0, stat: {
            label: "Por cobrar",
            value: ready ? <Money value={kpis?.arOutstanding ?? 0} compact /> : sk,
            sub: !ready
              ? undefined
              : fin && fin.overdueInvoices > 0
                ? plural(fin.overdueInvoices, "factura vencida", "facturas vencidas")
                : `Por pagar ${fmtCompact(kpis?.apOutstanding ?? 0)}`,
            tone: fin && fin.overdueInvoices > 0 ? "warning" : "default",
              } },
  ];
  const cifras = ready ? cifrasDinero.filter((c) => c.n !== 0) : cifrasDinero;
  const clientesClave = (data?.topAccounts ?? []).filter((c) => c.margin !== 0 || c.revenue > 0);
  const celdasTrabajo = [
    { label: "Por validar", n: cadena?.actividades.porValidar ?? 0, tone: "accent" as const },
    { label: "En proceso", n: cadena?.actividades.enProceso ?? 0 },
    { label: "Finalizadas", n: cadena?.actividades.finalizadas ?? 0, tone: "positive" as const },
    { label: "Órdenes vencidas", n: ops?.otOverdue ?? 0, tone: "danger" as const },
    { label: "Tickets abiertos", n: ops?.ticketsOpen ?? 0 },
    { label: "Contratos activos", n: maint?.activeContracts ?? 0 },
  ].filter((c) => c.n > 0);
  const celdasVentas = [
    { label: "Prospectos calientes", n: data?.sales.hotLeads ?? 0, tone: (data?.sales.hotLeads ?? 0) >= 5 ? ("warning" as const) : undefined },
    { label: "Licitaciones abiertas", n: data?.sales.tendersOpen ?? 0 },
    { label: "Licitaciones ganadas", n: data?.sales.tendersWon ?? 0, tone: "positive" as const },
    { label: "Requisiciones", n: proc?.pendingRequisitions ?? 0, tone: "warning" as const },
    { label: "Órdenes de compra", n: proc?.pendingPOs ?? 0, tone: "warning" as const },
    { label: "Bajo mínimo", n: proc?.lowStockItems ?? 0, tone: "danger" as const },
  ].filter((c) => c.n > 0);

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

      <TuDiaPanel token={token} />

      {verDireccion ? <DireccionHoy token={token} /> : null}

      {error && !loading && (
        <InlineAlert
          variant={ready ? "warning" : "danger"}
          message={ready ? `No pudimos actualizar; mostramos los últimos datos. ${error}` : `No pudimos cargar la vista ejecutiva. ${error}`}
          action={<Button size="sm" variant="secondary" onClick={load}>Reintentar</Button>}
        />
      )}

      {cadena ? <CadenaNegocio cadena={cadena} faltanCifras={ready && cifras.length < cifrasDinero.length} /> : null}
      {cadena ? <SiguientePasoNegocio cadena={cadena} /> : null}

      {cifras.length ? <StatStrip stats={cifras.map((c) => c.stat)} /> : null}

      <DashGrid>
        <DashCol span={6}>
          <DashPanel title="Trabajo" action="Actividades" actionHref="/erp/pizarra">
            {!ready ? (
              <DashSkeleton rows={2} height={20} gap={10} />
            ) : celdasTrabajo.length ? (
              <MiniStatGrid items={celdasTrabajo.map((c) => ({ label: c.label, value: num(c.n), tone: c.tone }))} />
            ) : (
              <DashEmpty title="Sin trabajo abierto" />
            )}
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

        {alerts.length > 0 ? (
          <DashCol span={6}>
            <DashPanel title="Requiere tu atención" subtitle="Lo que afecta la operación o las finanzas">
              {alerts.slice(0, 6).map((a, i) => (
                <AlertRow key={`${a.title}-${i}`} level={a.level} title={a.title} message={a.message} />
              ))}
            </DashPanel>
          </DashCol>
        ) : null}

        {clientesClave.length ? (
          <DashCol span={6}>
            <DashPanel title="Clientes clave" subtitle="Margen por cliente con proyectos" action="Ver rentabilidad" actionHref="/erp/analytics/bi?section=clients">
              {clientesClave.map((c) => (
                <ListRow
                  key={c.clientId}
                  href={`/erp/clientes/${c.clientId}`}
                  title={c.clientName}
                  sub={`${plural(c.projects, "proyecto", "proyectos")} · margen ${c.marginPercent}%`}
                  trail={<Money value={c.margin} compact bold />}
                />
              ))}
            </DashPanel>
          </DashCol>
        ) : null}

        {data?.topSellers?.length ? (
          <DashCol span={6}>
            <DashPanel title="Mejores vendedores del mes" subtitle="Ingresos por oportunidades ganadas" action="Ver analítica" actionHref="/erp/analytics/bi">
              {data.topSellers.map((s, i) => (
                <ListRow
                  key={s.ownerId}
                  leading={<RankIndex n={i + 1} />}
                  title={s.ownerName}
                  sub={plural(s.wonCount, "oportunidad ganada", "oportunidades ganadas")}
                  trail={<Money value={s.revenue} compact bold />}
                />
              ))}
            </DashPanel>
          </DashCol>
        ) : null}

        {celdasVentas.length ? (
          <DashCol span={6}>
            <DashPanel title="Ventas y compras" subtitle="Prospectos, licitaciones y abastecimiento" action="Cotizaciones" actionHref="/erp/cotizaciones">
              <MiniStatGrid items={celdasVentas.map((c) => ({ label: c.label, value: num(c.n), tone: c.tone }))} />
            </DashPanel>
          </DashCol>
        ) : null}
      </DashGrid>

      {fin && fin.invoicedMtd > 0 ? (
        <StatStrip
          stats={[
            {
              label: "Facturado en el mes",
              value: <Money value={fin.invoicedMtd} compact />,
              sub: plural(fin.invoicesCountMtd, "factura emitida", "facturas emitidas"),
              tone: "positive",
            },
            { label: "Colaboradores", value: num(data?.teamSize ?? 0) },
            { label: "Clientes activos", value: num(data?.clientsCount ?? 0) },
          ]}
        />
      ) : null}

      <CommandCenterRail panel="erp" extraWidgets={dynamicWidgets} ariaLabel="Atajos y pendientes" />

      {biDrillLinks.length > 0 && <ExecutiveBiDrillPanel links={biDrillLinks} />}
    </DashPage>
  );
}
