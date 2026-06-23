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

interface Opportunity {
  id: number;
  nombre?: string;
  concepto?: string;
  monto?: number;
  probabilidad?: number;
  etapa?: string;
  cliente?: { razonSocial?: string };
}

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

const TYPE_COLOR: Record<string, string> = { CALL: "#10b981", MEETING: "#f59e0b", VISIT: "#0ea5e9", EMAIL: "#6366f1", TASK: "#94a3b8", WHATSAPP: "#22c55e", NOTE: "#a855f7" };

async function apiFetch(path: string, token: string) {
  const res = await fetch(buildApiUrl(path), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return res.json();
}

export default function CrmDashboardPage() {
  const { user } = useUser();
  const token = user?.token ?? "";

  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [agenda, setAgenda] = useState<CrmActivity[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const [oppData, agendaData, metricsData] = await Promise.all([
        apiFetch("ventas/oportunidades", token),
        apiFetch("crm-activities/my-agenda", token).catch(() => null),
        apiFetch("ventas/reportes/metricas?period=month", token).catch(() => null),
      ]);
      setOpps(Array.isArray(oppData) ? oppData : (oppData?.data ?? []));
      const todays = agendaData?.pendingToday ?? [];
      setAgenda(todays);
      setMetrics(metricsData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar el panel comercial");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const pipelineTotal = useMemo(() => opps.filter((o) => !["Ganado", "Perdido"].includes(o.etapa ?? "")).reduce((s, o) => s + (o.monto ?? 0), 0), [opps]);
  const enCierre = opps.filter((o) => ["Negociación", "Cierre"].includes(o.etapa ?? "")).length;

  return (
    <>
      <PageHeader
        eyebrow="CRM · Pipeline comercial"
        title="Cierra el mes"
        subtitle="Tu pipeline, tus métricas y los próximos seguimientos en un solo lugar."
        variant="hero"
        meta={
          <>
            <Tag variant="accent" dot>{opps.length} oportunidades activas</Tag>
            {metrics && <Tag variant="positive">{metrics.conversionRate}% conversión</Tag>}
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
            <KpiCard label="Pipeline total" value={<Money value={pipelineTotal} compact />} hint={`${opps.length} oportunidades activas`} icon="🎯" variant="accent" />
            <KpiCard label="Cerrado este mes" value={<Money value={metrics?.totalRevenue ?? 0} compact />} hint="Ingreso facturado" icon="📈" variant="positive" />
            <KpiCard label="En negociación/cierre" value={enCierre} hint="Oportunidades calientes" icon="🔥" />
            <KpiCard label="Tasa de conversión" value={`${metrics?.conversionRate ?? 0}%`} hint="Este mes" icon="⚡" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
            <Section title="Top oportunidades">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {opps.slice(0, 6).map((o) => (
                  <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{o.cliente?.razonSocial ?? o.nombre ?? "—"}</div>
                      <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{o.etapa}</div>
                    </div>
                    <Money value={o.monto ?? 0} />
                  </div>
                ))}
                {opps.length === 0 && <EmptyState icon="🎯" title="Sin oportunidades" description="Crea tu primera oportunidad desde el pipeline." />}
              </div>
            </Section>

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
                {agenda.length === 0 && <EmptyState icon="🎉" title="Sin pendientes hoy" description="Tu agenda está libre por ahora." />}
              </div>
            </Section>
          </div>
        </>
      )}
    </>
  );
}
