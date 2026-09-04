"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  BarList,
  ListRow,
  DashPill,
  DashEmpty,
  RankIndex,
} from "@/components/dashboard/DashKit";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { filterRowsByScope, getCrmSalesSectionConfig } from "@/lib/section-views";
import { CommandCenterRail } from "@/components/command-center/CommandCenterRail";
import {
  PIPELINE_STAGES,
  isClosedOpportunityStage,
  isHotOpportunityStage,
  listSalesOpportunities,
  formatOpportunityStage,
  type SalesOpportunity,
} from "@/lib/sales-api";

interface CrmActivity {
  id: number;
  activityType: string;
  subject: string;
  dueDate: string;
  lead?: { name: string } | null;
  opportunity?: { title: string; id?: number } | null;
}

interface SalesNotif {
  id: number;
  title: string;
  message: string;
  category: string;
  priority: string | null;
  isRead: boolean;
  relatedUrl?: string | null;
  createdAt: string;
}

interface Metrics {
  totalRevenue: number;
  pipelineValue: number;
  opportunityCount: number;
  conversionRate: number;
}

interface CrmLead {
  id: number;
  name: string;
  source?: string | null;
  createdAt?: string | null;
}

const TYPE_COLOR: Record<string, string> = {
  CALL: "#15803d",
  MEETING: "#d97706",
  VISIT: "#0284c7",
  EMAIL: "#475569",
  TASK: "#94a3b8",
  WHATSAPP: "#16a34a",
  NOTE: "#0f766e",
};

async function apiFetch(path: string, token: string) {
  const res = await fetch(buildApiUrl(path), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return res.json();
}

export default function CrmDashboardPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getCrmSalesSectionConfig(user, "opportunities"), [user]);
  const token = user?.token ?? "";

  const [opps, setOpps] = useState<SalesOpportunity[]>([]);
  const [agenda, setAgenda] = useState<CrmActivity[]>([]);
  const [overdueAgenda, setOverdueAgenda] = useState<CrmActivity[]>([]);
  const [salesNotifs, setSalesNotifs] = useState<SalesNotif[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [recentLeads, setRecentLeads] = useState<CrmLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const [oppData, agendaData, metricsData, leadsData, notifData] = await Promise.all([
        listSalesOpportunities(token),
        apiFetch("crm-activities/my-agenda", token).catch(() => null),
        apiFetch("ventas/reportes/metricas?period=month", token).catch(() => null),
        apiFetch("ventas/leads?limit=5", token).catch(() => null),
        apiFetch("ventas/reportes/notificaciones?limit=10", token).catch(() => []),
      ]);
      setOpps(oppData);
      setAgenda(agendaData?.pendingToday ?? []);
      setOverdueAgenda(agendaData?.overdue ?? []);
      setMetrics(metricsData);
      const leadsArr = Array.isArray(leadsData) ? leadsData : (leadsData?.data ?? []);
      setRecentLeads(leadsArr.slice(0, 5));
      const nArr: SalesNotif[] = Array.isArray(notifData) ? notifData : (notifData?.data ?? []);
      setSalesNotifs(
        nArr
          .filter((n) => !n.isRead && (n.priority === "high" || /quote|crm|sales/i.test(n.category)))
          .slice(0, 5),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar el panel comercial");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const visibleOpps = useMemo(
    () => filterRowsByScope(opps, user, cfg.defaultScope),
    [opps, user, cfg.defaultScope],
  );

  const pipelineTotal = useMemo(
    () => visibleOpps.filter((o) => !isClosedOpportunityStage(o.stage)).reduce((s, o) => s + Number(o.value ?? 0), 0),
    [visibleOpps],
  );
  const enCierre = visibleOpps.filter((o) => isHotOpportunityStage(o.stage)).length;

  const stageBreakdown = useMemo(() => {
    const active = visibleOpps.filter((o) => !isClosedOpportunityStage(o.stage));
    return PIPELINE_STAGES
      .filter((s) => !isClosedOpportunityStage(s.id))
      .map((stage) => {
        const inStage = active.filter((o) => o.stage === stage.id);
        return {
          stage: stage.id,
          label: formatOpportunityStage(stage.id),
          count: inStage.length,
          value: inStage.reduce((s, o) => s + Number(o.value ?? 0), 0),
        };
      })
      .filter((s) => s.count > 0);
  }, [visibleOpps]);

  const wonThisMonth = useMemo(() => {
    const now = new Date();
    return visibleOpps.filter((o) => {
      if (o.stage !== "CLOSED_WON") return false;
      const d = new Date((o as unknown as Record<string, string>).updatedAt ?? "");
      return !isNaN(d.getTime()) && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
  }, [visibleOpps]);

  const byRep = useMemo(() => {
    if (cfg.defaultScope !== "team") return [];
    const map = new Map<number, { nombre: string; pipeline: number; count: number; hot: number }>();
    for (const o of visibleOpps) {
      if (isClosedOpportunityStage(o.stage)) continue;
      const id = o.ownerId ?? 0;
      const nombre = o.owner?.nombre ?? "Sin asignar";
      const cur = map.get(id) ?? { nombre, pipeline: 0, count: 0, hot: 0 };
      cur.pipeline += Number(o.value ?? 0);
      cur.count += 1;
      if (isHotOpportunityStage(o.stage)) cur.hot += 1;
      map.set(id, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.pipeline - a.pipeline);
  }, [visibleOpps, cfg.defaultScope]);

  const activeOpps = visibleOpps.filter((o) => !isClosedOpportunityStage(o.stage));
  const fmtCompact = (v: number) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", notation: "compact" }).format(v);

  return (
    <DashPage>
      <DashHero
        eyebrow="CRM · Pipeline comercial"
        title={cfg.defaultScope === "team" ? "Pipeline del equipo" : "Cierra el mes"}
        subtitle={cfg.defaultScope === "team"
          ? "Métricas consolidadas del equipo — pipeline, actividades y conversión."
          : "Tu pipeline, tus métricas y los próximos seguimientos en un solo lugar."}
        actions={
          <>
            {wonThisMonth.length > 0 && <DashPill tone="positive">{wonThisMonth.length} ganadas este mes</DashPill>}
            <Link href="/crm/leads?new=1" style={{ textDecoration: "none" }}><Button variant="secondary">Nuevo lead</Button></Link>
            <Link href="/crm/pipeline" style={{ textDecoration: "none" }}><Button variant="primary" iconRight="→">Ver pipeline</Button></Link>
          </>
        }
      />

      <CommandCenterRail panel="crm" />

      {error && !loading && (
        <DashPanel title="No se pudo cargar" subtitle={error}>
          <Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>
        </DashPanel>
      )}

      <StatStrip
        stats={[
          {
            label: "Pipeline total",
            value: loading ? "…" : <Money value={pipelineTotal} compact />,
            sub: loading ? undefined : `${activeOpps.length} oportunidades activas`,
            tone: "accent",
            big: true,
          },
          {
            label: "Cerrado este mes",
            value: loading ? "…" : <Money value={metrics?.totalRevenue ?? 0} compact />,
            sub: "Ingreso facturado",
            tone: "positive",
          },
          {
            label: "En negociación / cierre",
            value: loading ? "…" : enCierre,
            sub: "Oportunidades calientes",
            tone: enCierre > 0 ? "warning" : "default",
          },
          {
            label: "Seguimientos vencidos",
            value: loading ? "…" : overdueAgenda.length,
            tone: overdueAgenda.length > 0 ? "danger" : "positive",
          },
          {
            label: "Tasa de conversión",
            value: loading ? "…" : `${metrics?.conversionRate ?? 0}%`,
            sub: "Este mes",
          },
        ]}
      />

      {!loading && (overdueAgenda.length > 0 || salesNotifs.length > 0) && (
        <DashPanel
          title="Decisiones comerciales"
          subtitle="Seguimientos vencidos y cotizaciones / pipeline que requieren acción"
          action="Notificaciones"
          actionHref="/crm/notifications-center"
        >
          {overdueAgenda.slice(0, 4).map((a) => (
            <ListRow
              key={`od-${a.id}`}
              href={a.opportunity?.id ? `/crm/opportunities/${a.opportunity.id}` : "/crm/agenda"}
              accent="var(--danger)"
              title={a.subject}
              sub={a.lead?.name ?? a.opportunity?.title ?? "Seguimiento vencido"}
              trail={<DashPill tone="danger">Vencido</DashPill>}
            />
          ))}
          {salesNotifs.map((n) => (
            <ListRow
              key={n.id}
              href={n.relatedUrl || "/crm/notifications-center"}
              accent={n.priority === "high" ? "var(--danger)" : "var(--warning)"}
              title={n.title}
              sub={n.message.slice(0, 90)}
              trail={n.priority === "high" ? <DashPill tone="danger">Alta</DashPill> : undefined}
            />
          ))}
        </DashPanel>
      )}

      <DashGrid>
        <DashCol span={7}>
          <DashPanel
            title="Pipeline por etapa"
            subtitle="Oportunidades activas en el ciclo de venta"
            action="Ver pipeline"
            actionHref="/crm/pipeline"
          >
            {loading && <DashEmpty title="Cargando…" />}
            {!loading && stageBreakdown.length === 0 && (
              <DashEmpty title="Sin oportunidades activas" description="Crea tu primera oportunidad desde el pipeline." />
            )}
            {!loading && stageBreakdown.length > 0 && (
              <BarList
                items={stageBreakdown.map((s) => ({
                  label: s.label,
                  value: s.count,
                  display: `${s.count} · ${fmtCompact(s.value)}`,
                }))}
              />
            )}
          </DashPanel>
        </DashCol>

        <DashCol span={5}>
          <DashPanel
            title="Tu agenda de hoy"
            subtitle="Seguimientos y actividades pendientes"
            action="Ver actividades"
            actionHref="/crm/agenda"
          >
            {loading && <DashEmpty title="Cargando…" />}
            {!loading && agenda.length === 0 && (
              <DashEmpty title="Sin pendientes hoy" description="Tu agenda está libre." />
            )}
            {!loading &&
              agenda.slice(0, 6).map((a) => (
                <ListRow
                  key={a.id}
                  accent={TYPE_COLOR[a.activityType] ?? "var(--border)"}
                  title={a.subject}
                  sub={a.lead?.name ?? a.opportunity?.title ?? ""}
                  trail={new Date(a.dueDate).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                />
              ))}
          </DashPanel>
        </DashCol>

        <DashCol span={7}>
          <DashPanel
            title={cfg.defaultScope === "team" ? "Top oportunidades del equipo" : "Mis oportunidades activas"}
            subtitle="Ordenadas por relevancia"
            action="Ver todas"
            actionHref="/crm/opportunities"
          >
            {loading && <DashEmpty title="Cargando…" />}
            {!loading && activeOpps.length === 0 && (
              <DashEmpty title="Sin oportunidades" description="Crea tu primera oportunidad desde el pipeline." />
            )}
            {!loading &&
              activeOpps.slice(0, 6).map((o) => (
                <ListRow
                  key={o.id}
                  href={`/crm/opportunities/${o.id}`}
                  title={o.client?.name ?? o.clientName ?? o.title}
                  sub={`${formatOpportunityStage(o.stage)}${o.owner?.nombre ? ` · ${o.owner.nombre}` : ""}`}
                  trail={<Money value={Number(o.value ?? 0)} compact bold />}
                />
              ))}
            {!loading && wonThisMonth.length > 0 && (
              <div style={{ marginTop: 8, paddingTop: 10, borderTop: "1px solid var(--nx-panel-hairline, var(--border))" }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-tertiary)", marginBottom: 6 }}>
                  Ganadas este mes
                </div>
                {wonThisMonth.slice(0, 3).map((o) => (
                  <ListRow
                    key={o.id}
                    href={`/crm/opportunities/${o.id}`}
                    accent="var(--success)"
                    title={o.client?.name ?? o.clientName ?? o.title}
                    trail={<Money value={Number(o.value ?? 0)} compact bold />}
                  />
                ))}
              </div>
            )}
          </DashPanel>
        </DashCol>

        <DashCol span={5}>
          {byRep.length > 0 ? (
            <DashPanel title="Desempeño por vendedor" subtitle="Pipeline activo por rep">
              {byRep.slice(0, 6).map((rep, i) => (
                <ListRow
                  key={i}
                  leading={<RankIndex n={i + 1} />}
                  title={rep.nombre}
                  sub={`${rep.count} oportunidades${rep.hot > 0 ? ` · ${rep.hot} en cierre` : ""}`}
                  trail={<Money value={rep.pipeline} compact bold />}
                />
              ))}
            </DashPanel>
          ) : (
            <DashPanel
              title="Leads recientes"
              subtitle="Últimos leads capturados"
              action="Ver todos"
              actionHref="/crm/leads"
            >
              {loading && <DashEmpty title="Cargando…" />}
              {!loading && recentLeads.length === 0 && (
                <DashEmpty title="Sin leads recientes" description="Captura tu primer lead para verlo aquí." />
              )}
              {!loading &&
                recentLeads.map((l) => (
                  <ListRow
                    key={l.id}
                    href={`/crm/leads/${l.id}`}
                    title={l.name}
                    sub={l.source ?? undefined}
                    trail={l.createdAt
                      ? new Date(l.createdAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })
                      : undefined}
                  />
                ))}
            </DashPanel>
          )}
        </DashCol>

        {byRep.length > 0 && recentLeads.length > 0 && (
          <DashCol span={12}>
            <DashPanel
              title="Leads recientes"
              subtitle="Últimos leads capturados"
              action="Ver todos"
              actionHref="/crm/leads"
              flush
            >
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 4 }}>
                {recentLeads.map((l) => (
                  <ListRow
                    key={l.id}
                    href={`/crm/leads/${l.id}`}
                    title={l.name}
                    sub={l.source ?? undefined}
                    trail={l.createdAt
                      ? new Date(l.createdAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })
                      : undefined}
                  />
                ))}
              </div>
            </DashPanel>
          </DashCol>
        )}
      </DashGrid>
    </DashPage>
  );
}
