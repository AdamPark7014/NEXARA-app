"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import KpiCard from "@/components/ui/KpiCard";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import { Tag, Money } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { filterRowsByScope, getCrmSalesSectionConfig } from "@/lib/section-views";
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
  opportunity?: { title: string } | null;
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

const TYPE_COLOR: Record<string, string> = { CALL: "#10b981", MEETING: "#f59e0b", VISIT: "#0ea5e9", EMAIL: "#6366f1", TASK: "#94a3b8", WHATSAPP: "#22c55e", NOTE: "#a855f7" };

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
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [recentLeads, setRecentLeads] = useState<CrmLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const [oppData, agendaData, metricsData, leadsData] = await Promise.all([
        listSalesOpportunities(token),
        apiFetch("crm-activities/my-agenda", token).catch(() => null),
        apiFetch("ventas/reportes/metricas?period=month", token).catch(() => null),
        apiFetch("leads?limit=5&sort=createdAt:desc", token).catch(() => null),
      ]);
      setOpps(oppData);
      setAgenda(agendaData?.pendingToday ?? []);
      setMetrics(metricsData);
      const leadsArr = Array.isArray(leadsData) ? leadsData : (leadsData?.data ?? []);
      setRecentLeads(leadsArr.slice(0, 5));
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

  // Pipeline por etapa — embudo visual
  const stageBreakdown = useMemo(() => {
    const active = visibleOpps.filter((o) => !isClosedOpportunityStage(o.stage));
    return PIPELINE_STAGES
      .filter((s) => !isClosedOpportunityStage(s))
      .map((stage) => {
        const inStage = active.filter((o) => o.stage === stage);
        return {
          stage,
          label: formatOpportunityStage(stage),
          count: inStage.length,
          value: inStage.reduce((s, o) => s + Number(o.value ?? 0), 0),
        };
      })
      .filter((s) => s.count > 0);
  }, [visibleOpps]);

  const maxCount = useMemo(() => Math.max(1, ...stageBreakdown.map((s) => s.count)), [stageBreakdown]);

  // Ganadas este mes
  const wonThisMonth = useMemo(() => {
    const now = new Date();
    return visibleOpps.filter((o) => {
      if (o.stage !== "CLOSED_WON") return false;
      const d = new Date((o as unknown as Record<string, string>).updatedAt ?? "");
      return !isNaN(d.getTime()) && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
  }, [visibleOpps]);

  // Desempeño por vendedor — solo visible en vista de equipo
  const byRep = useMemo(() => {
    if (cfg.defaultScope !== 'team') return [];
    const map = new Map<number, { nombre: string; pipeline: number; count: number; hot: number }>();
    for (const o of visibleOpps) {
      if (isClosedOpportunityStage(o.stage)) continue;
      const id = o.ownerId ?? 0;
      const nombre = o.owner?.nombre ?? 'Sin asignar';
      const cur = map.get(id) ?? { nombre, pipeline: 0, count: 0, hot: 0 };
      cur.pipeline += Number(o.value ?? 0);
      cur.count += 1;
      if (isHotOpportunityStage(o.stage)) cur.hot += 1;
      map.set(id, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.pipeline - a.pipeline);
  }, [visibleOpps, cfg.defaultScope]);

  const activeOpps = visibleOpps.filter((o) => !isClosedOpportunityStage(o.stage));

  return (
    <>
      <PageHeader
        eyebrow="CRM · Pipeline comercial"
        title={cfg.defaultScope === 'team' ? 'Pipeline del equipo' : 'Cierra el mes'}
        subtitle={cfg.defaultScope === 'team' ? 'Métricas consolidadas del equipo — pipeline, actividades y conversión.' : 'Tu pipeline, tus métricas y los próximos seguimientos en un solo lugar.'}
        variant="hero"
        meta={
          <>
            <Tag variant="accent" dot>{visibleOpps.length} oportunidades activas</Tag>
            {metrics && <Tag variant="positive">{metrics.conversionRate}% conversión</Tag>}
            {wonThisMonth.length > 0 && <Tag variant="positive">🏆 {wonThisMonth.length} ganadas este mes</Tag>}
          </>
        }
        actions={
          <>
            <Link href="/crm/leads" style={{ textDecoration: "none" }}><Button variant="secondary" iconLeft="✨">Nuevo lead</Button></Link>
            <Link href="/crm/pipeline" style={{ textDecoration: "none" }}><Button variant="primary" iconLeft="📊" iconRight="→">Ver pipeline</Button></Link>
          </>
        }
      />

      {loading && <EmptyState icon="⏳" title="Cargando…" description="Consultando tu pipeline comercial." />}
      {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}

      {!loading && !error && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 24 }}>
            <KpiCard label="Pipeline total" value={<Money value={pipelineTotal} compact />} hint={`${activeOpps.length} oportunidades activas`} icon="🎯" variant="accent" />
            <KpiCard label="Cerrado este mes" value={<Money value={metrics?.totalRevenue ?? 0} compact />} hint="Ingreso facturado" icon="📈" variant="positive" />
            <KpiCard label="En negociación/cierre" value={enCierre} hint="Oportunidades calientes" icon="🔥" />
            <KpiCard label="Tasa de conversión" value={`${metrics?.conversionRate ?? 0}%`} hint="Este mes" icon="⚡" />
          </div>

          {byRep.length > 0 && (
            <Section eyebrow="Equipo" title="Desempeño por vendedor" subtitle="Pipeline activo por rep — excluye oportunidades cerradas">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {byRep.map((rep, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-tertiary)", width: 20, textAlign: "center" }}>#{i + 1}</span>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{rep.nombre}</span>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{rep.count} opp.</span>
                    {rep.hot > 0 && <Tag variant="warning">{rep.hot} 🔥</Tag>}
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--primary)" }}>
                      <Money value={rep.pipeline} compact />
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {stageBreakdown.length > 0 && (
            <Section eyebrow="Embudo" title="Pipeline por etapa" subtitle="Distribución de oportunidades activas en el ciclo de venta">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {stageBreakdown.map((s) => (
                  <div key={s.stage} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ width: 150, fontSize: 12, color: "var(--text-secondary)", flexShrink: 0, textAlign: "right" }}>{s.label}</span>
                    <div style={{ flex: 1, position: "relative", height: 28, background: "var(--surface-2)", borderRadius: 6, overflow: "hidden" }}>
                      <div style={{ width: `${(s.count / maxCount) * 100}%`, height: "100%", background: "color-mix(in srgb, var(--primary) 50%, transparent)", borderRadius: 6, transition: "width 500ms ease", minWidth: 4 }} />
                      <span style={{ position: "absolute", left: 10, top: 0, bottom: 0, display: "flex", alignItems: "center", fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
                        {s.count} opp.
                      </span>
                    </div>
                    <span style={{ width: 100, fontSize: 12, fontWeight: 700, color: "var(--primary)", textAlign: "right", flexShrink: 0 }}>
                      <Money value={s.value} compact />
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
            <Section title={cfg.defaultScope === 'team' ? 'Top oportunidades del equipo' : 'Mis oportunidades activas'}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {activeOpps.slice(0, 6).map((o) => (
                  <Link key={o.id} href={`/crm/opportunities/${o.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{o.client?.name ?? o.clientName ?? o.title}</div>
                        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
                          {formatOpportunityStage(o.stage)}{o.owner?.nombre ? ` · ${o.owner.nombre}` : ""}
                        </div>
                      </div>
                      <Money value={Number(o.value ?? 0)} />
                    </div>
                  </Link>
                ))}
                {activeOpps.length === 0 && <EmptyState icon="🎯" title="Sin oportunidades" description="Crea tu primera oportunidad desde el pipeline." />}
              </div>
              {wonThisMonth.length > 0 && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 8 }}>🏆 Ganadas este mes</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {wonThisMonth.slice(0, 3).map((o) => (
                      <Link key={o.id} href={`/crm/opportunities/${o.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", background: "color-mix(in srgb, #10b981 8%, var(--surface))", border: "1px solid color-mix(in srgb, #10b981 20%, var(--border))", borderRadius: 8 }}>
                          <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600 }}>{o.client?.name ?? o.clientName ?? o.title}</span>
                          <Money value={Number(o.value ?? 0)} />
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </Section>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Section title="Tu agenda de hoy">
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {agenda.map((a) => (
                    <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, borderLeftWidth: 3, borderLeftColor: TYPE_COLOR[a.activityType] ?? "var(--border)" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 12.5 }}>{a.subject}</div>
                        <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{a.lead?.name ?? a.opportunity?.title ?? ""}</div>
                      </div>
                      <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{new Date(a.dueDate).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  ))}
                  {agenda.length === 0 && <EmptyState icon="🎉" title="Sin pendientes hoy" description="Tu agenda está libre." />}
                </div>
                <div style={{ marginTop: 10, textAlign: "right" }}>
                  <Link href="/crm/activities" style={{ fontSize: 12, color: "var(--primary)", fontWeight: 600 }}>Ver actividades →</Link>
                </div>
              </Section>

              {recentLeads.length > 0 && (
                <Section eyebrow="Leads" title="Recientes" subtitle="Últimos leads capturados">
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {recentLeads.map((l) => (
                      <Link key={l.id} href="/crm/leads" style={{ textDecoration: "none", color: "inherit" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</div>
                            {l.source && <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{l.source}</div>}
                          </div>
                          {l.createdAt && (
                            <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", flexShrink: 0 }}>
                              {new Date(l.createdAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}
                            </span>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                  <div style={{ marginTop: 10, textAlign: "right" }}>
                    <Link href="/crm/leads" style={{ fontSize: 12, color: "var(--primary)", fontWeight: 600 }}>Ver todos →</Link>
                  </div>
                </Section>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
