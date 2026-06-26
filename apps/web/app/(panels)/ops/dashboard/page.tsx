"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import KpiCard from "@/components/ui/KpiCard";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { filterRowsByScope, getOpsDashboardSectionConfig, getActivitiesCanonicalPath } from "@/lib/section-views";

interface ActivityRow {
  id: number;
  anNumber: string;
  titulo: string;
  estatus: string;
  branchName?: string | null;
  fechaEntregaEsperada?: string | null;
  client?: { name: string } | null;
  responsable?: { nombre: string } | null;
}

interface NocAlert {
  id: string;
  severity: "critical" | "warning" | "info";
  deviceName: string;
  title: string;
  message: string;
  triggeredAt: string;
}

async function apiFetch(path: string, token: string) {
  const res = await fetch(buildApiUrl(path), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return res.json();
}

export default function OpsDashboardPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getOpsDashboardSectionConfig(user), [user]);
  const token = user?.token ?? "";

  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [alerts, setAlerts] = useState<NocAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const [actData, alertData] = await Promise.all([
        apiFetch("activities", token),
        cfg.viewMode === "execute"
          ? Promise.resolve([])
          : apiFetch("noc/alerts", token).catch(() => []),
      ]);
      setActivities(Array.isArray(actData) ? actData : (actData?.data ?? []));
      setAlerts(Array.isArray(alertData) ? alertData : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar el panel de operaciones");
    } finally { setLoading(false); }
  }, [token, cfg.viewMode]);

  useEffect(() => { void load(); }, [load]);

  const scopedActivities = useMemo(
    () => filterRowsByScope(activities, user, cfg.defaultScope),
    [activities, user, cfg.defaultScope],
  );

  const today = new Date().toDateString();
  const ots = scopedActivities.filter((a) => a.fechaEntregaEsperada && new Date(a.fechaEntregaEsperada).toDateString() === today);
  const enCurso = scopedActivities.filter((a) => a.estatus === "En Proceso").length;
  const completadasHoy = scopedActivities.filter((a) => a.estatus === "Finalizado" && a.fechaEntregaEsperada && new Date(a.fechaEntregaEsperada).toDateString() === today).length;
  const showTeam = cfg.defaultScope === "team";
  const showNoc = cfg.viewMode !== "execute";

  const estadoVariant = (e: string): "positive" | "warning" | "default" => e === "Finalizado" ? "positive" : e === "En Proceso" ? "warning" : "default";
  const sevColor: Record<string, string> = { critical: "var(--danger)", warning: "var(--warning)", info: "var(--text-tertiary)" };

  return (
    <>
      <PageHeader
        eyebrow="OPS · Operación diaria"
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={
          <>
            <Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>
            {cfg.viewMode === "execute" && (
              <Link href={getActivitiesCanonicalPath(user)} style={{ textDecoration: "none" }}>
                <Button variant="primary" iconLeft="🧰">Mis actividades</Button>
              </Link>
            )}
          </>
        }
      />

      {loading && <EmptyState icon="⏳" title="Cargando…" description="Consultando OT y alertas." />}
      {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}

      {!loading && !error && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
            <KpiCard label="OT de hoy" value={ots.length} icon="📋" />
            <KpiCard label="En curso" value={enCurso} variant="warning" icon="⏳" />
            <KpiCard label="Completadas hoy" value={completadasHoy} variant="positive" icon="✓" />
            <KpiCard label="Alertas activas" value={showNoc ? alerts.length : "—"} variant={showNoc && alerts.length > 0 ? "danger" : "positive"} icon="🚨" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: showNoc ? "2fr 1fr" : "1fr", gap: 16 }}>
            <Section title="OT del día">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {ots.map((a) => (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }}>
                    <Tag variant="accent">{a.anNumber}</Tag>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{a.client?.name ?? a.branchName ?? "—"}</div>
                      <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{a.titulo}{showTeam && a.responsable ? ` · ${a.responsable.nombre}` : ""}</div>
                    </div>
                    <Tag variant={estadoVariant(a.estatus)}>{a.estatus}</Tag>
                  </div>
                ))}
                {ots.length === 0 && <EmptyState icon="🎉" title="Sin OT para hoy" description="No hay actividades con entrega esperada hoy." />}
              </div>
            </Section>

            {showNoc && (
            <Section title="Alertas de monitoreo">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {alerts.slice(0, 8).map((al) => (
                  <div key={al.id} style={{ padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, borderLeftWidth: 3, borderLeftColor: sevColor[al.severity] }}>
                    <div style={{ fontWeight: 700, fontSize: 12 }}>{al.title}</div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{al.deviceName} · {al.message.slice(0, 60)}</div>
                  </div>
                ))}
                {alerts.length === 0 && <EmptyState icon="✅" title="Sin alertas" description="Todos los sitios operativos." />}
              </div>
            </Section>
            )}
          </div>
        </>
      )}
    </>
  );
}
