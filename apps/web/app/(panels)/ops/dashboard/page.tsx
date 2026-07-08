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
import {
  activityDisplayLabel,
  activityDisplayVariant,
  isActivityAwaitingReview,
  isActivityCompletedToday,
  isActivityInProgress,
  isActivityRelevantToday,
} from "@/lib/activity-status";
import type { ActivityEvidenceSummary } from "@/lib/evidence-lock";
import { filterRowsByScope, getActivitiesCanonicalPath, getOpsDashboardSectionConfig } from "@/lib/section-views";

interface ActivityRow {
  id: number;
  anNumber: string;
  titulo: string;
  estatus: string;
  branchName?: string | null;
  fechaEntregaEsperada?: string | null;
  fechaInicio?: string | null;
  fechaFinalizacion?: string | null;
  activityEvidence?: (ActivityEvidenceSummary & { completedAt?: string | null }) | null;
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

interface SupportTicket {
  id: number;
  folio?: string;
  title: string;
  status: string;
  priority?: string;
  client?: { name: string } | null;
}

async function apiFetch(path: string, token: string) {
  const res = await fetch(buildApiUrl(path), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return res.json();
}

function isOverdue(a: ActivityRow): boolean {
  if (!a.fechaEntregaEsperada) return false;
  if (isActivityCompletedToday(a)) return false;
  if (a.estatus === "CANCELADO" || a.estatus === "COMPLETADO") return false;
  return new Date(a.fechaEntregaEsperada) < new Date();
}

export default function OpsDashboardPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getOpsDashboardSectionConfig(user), [user]);
  const token = user?.token ?? "";

  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [alerts, setAlerts] = useState<NocAlert[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [alertsErr, setAlertsErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    setAlertsErr(null);
    try {
      const [actData, alertData, ticketData] = await Promise.all([
        apiFetch("activities", token),
        cfg.viewMode === "execute"
          ? Promise.resolve([])
          : apiFetch("noc/alerts", token).catch((e) => {
              setAlertsErr(e instanceof Error ? e.message : "No se pudieron cargar alertas NOC");
              return [];
            }),
        cfg.viewMode !== "execute"
          ? apiFetch("support-tickets?limit=5&status=OPEN", token).catch(() => [])
          : Promise.resolve([]),
      ]);
      setActivities(Array.isArray(actData) ? actData : (actData?.data ?? []));
      setAlerts(Array.isArray(alertData) ? alertData : []);
      const tArr = Array.isArray(ticketData) ? ticketData : (ticketData?.data ?? []);
      setTickets(tArr.slice(0, 5));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar el panel de operaciones");
    } finally { setLoading(false); }
  }, [token, cfg.viewMode]);

  useEffect(() => { void load(); }, [load]);

  const scopedActivities = useMemo(
    () => filterRowsByScope(activities, user, cfg.defaultScope),
    [activities, user, cfg.defaultScope],
  );

  const ots = scopedActivities.filter((a) => isActivityRelevantToday(a));
  const overdueOts = scopedActivities.filter((a) => isOverdue(a));
  const enCurso = scopedActivities.filter((a) => isActivityInProgress(a.estatus)).length;
  const completadasHoy = scopedActivities.filter((a) => isActivityCompletedToday(a)).length;
  const enRevision = scopedActivities.filter(
    (a) => isActivityAwaitingReview(a.activityEvidence) && isActivityCompletedToday(a),
  ).length;
  const showTeam = cfg.defaultScope === "team";
  const showNoc = cfg.viewMode !== "execute";
  const sevColor: Record<string, string> = { critical: "var(--danger)", warning: "var(--warning)", info: "var(--text-tertiary)" };

  // Carga por integrante — solo en vista de equipo
  const byMember = useMemo(() => {
    if (!showTeam) return [];
    const map = new Map<string, { nombre: string; total: number; completadas: number; enCurso: number }>();
    for (const a of scopedActivities) {
      const nombre = a.responsable?.nombre ?? "Sin asignar";
      const cur = map.get(nombre) ?? { nombre, total: 0, completadas: 0, enCurso: 0 };
      cur.total += 1;
      if (isActivityCompletedToday(a)) cur.completadas += 1;
      if (isActivityInProgress(a.estatus)) cur.enCurso += 1;
      map.set(nombre, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 6);
  }, [scopedActivities, showTeam]);

  const ticketPriorityColor: Record<string, string> = { CRITICA: "var(--danger)", ALTA: "#f97316", MEDIA: "var(--warning)", BAJA: "var(--text-tertiary)" };

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
            {showTeam && enRevision > 0 && (
              <KpiCard label="En revisión" value={enRevision} variant="warning" icon="👁" />
            )}
            <KpiCard label="Vencidas" value={overdueOts.length} variant={overdueOts.length > 0 ? "danger" : "positive"} icon="⚠️" />
            <KpiCard label="Alertas activas" value={showNoc ? alerts.length : "—"} variant={showNoc && alerts.length > 0 ? "danger" : "positive"} icon="🚨" />
          </div>

          {/* OTs vencidas — solo cuando hay */}
          {overdueOts.length > 0 && (
            <Section
              eyebrow="Urgente"
              title={`${overdueOts.length} OTs vencidas`}
              subtitle="Estas órdenes de trabajo superaron su fecha de entrega esperada"
              tone="accent"
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {overdueOts.slice(0, 5).map((a) => (
                  <Link key={a.id} href={`/ops/activities/${a.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "color-mix(in srgb, var(--danger) 6%, var(--surface))", border: "1px solid color-mix(in srgb, var(--danger) 25%, var(--border))", borderRadius: 10 }}>
                      <Tag variant="danger">{a.anNumber}</Tag>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{a.client?.name ?? a.branchName ?? "—"}</div>
                        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
                          {a.titulo}{showTeam && a.responsable ? ` · ${a.responsable.nombre}` : ""}
                        </div>
                      </div>
                      {a.fechaEntregaEsperada && (
                        <span style={{ fontSize: 11, color: "var(--danger)", fontWeight: 600, flexShrink: 0 }}>
                          {new Date(a.fechaEntregaEsperada).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
              <div style={{ marginTop: 10, textAlign: "right" }}>
                <Link href="/ops/activities" style={{ fontSize: 12, color: "var(--danger)", fontWeight: 600 }}>Ver todas las OT →</Link>
              </div>
            </Section>
          )}

          <div style={{ display: "grid", gridTemplateColumns: showNoc ? "2fr 1fr" : "1fr", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Section title="OT del día">
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {ots.map((a) => (
                    <Link key={a.id} href={`/ops/activities/${a.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }}>
                        <Tag variant="accent">{a.anNumber}</Tag>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{a.client?.name ?? a.branchName ?? "—"}</div>
                          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{a.titulo}{showTeam && a.responsable ? ` · ${a.responsable.nombre}` : ""}</div>
                        </div>
                        <Tag variant={activityDisplayVariant(a.estatus, a.activityEvidence)}>
                          {activityDisplayLabel(a.estatus, a.activityEvidence)}
                        </Tag>
                      </div>
                    </Link>
                  ))}
                  {ots.length === 0 && (
                    <EmptyState
                      icon="🎉"
                      title="Sin OT para hoy"
                      description="No hay actividades con entrega, en curso o completadas hoy."
                    />
                  )}
                </div>
                <div style={{ marginTop: 10, textAlign: "right" }}>
                  <Link href="/ops/activities" style={{ fontSize: 12, color: "var(--primary)", fontWeight: 600 }}>Ver todas las OT →</Link>
                </div>
              </Section>

              {byMember.length > 0 && (
                <Section eyebrow="Equipo" title="Carga por integrante" subtitle="OTs asignadas a cada miembro del equipo">
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {byMember.map((m) => {
                      const pct = m.total > 0 ? Math.round((m.completadas / m.total) * 100) : 0;
                      return (
                        <div key={m.nombre} style={{ display: "grid", gridTemplateColumns: "140px 1fr 56px", gap: 10, alignItems: "center" }}>
                          <span style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.nombre}</span>
                          <div style={{ position: "relative", height: 14, background: "var(--surface-2)", borderRadius: 4, overflow: "hidden" }}>
                            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`, background: pct >= 80 ? "var(--success)" : pct >= 40 ? "var(--primary)" : "var(--warning)", borderRadius: 4, opacity: 0.8 }} />
                            {m.enCurso > 0 && (
                              <div style={{ position: "absolute", left: `${pct}%`, top: 0, bottom: 0, width: `${Math.round((m.enCurso / m.total) * 100)}%`, background: "var(--warning)", opacity: 0.5 }} />
                            )}
                          </div>
                          <span style={{ fontSize: 11.5, color: "var(--text-secondary)", textAlign: "right" }}>{m.completadas}/{m.total}</span>
                        </div>
                      );
                    })}
                  </div>
                </Section>
              )}
            </div>

            {showNoc && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <Section title="Alertas de monitoreo" actions={<Link href="/ops/noc" style={{ fontSize: 12, color: "var(--primary)" }}>Ver NOC →</Link>}>
                  {alertsErr && <p style={{ fontSize: 12, color: "var(--danger)", marginBottom: 8 }}>{alertsErr}</p>}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {alerts.slice(0, 6).map((al) => (
                      <div key={al.id} style={{ padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, borderLeftWidth: 3, borderLeftColor: sevColor[al.severity] }}>
                        <div style={{ fontWeight: 700, fontSize: 12 }}>{al.title}</div>
                        <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{al.deviceName} · {al.message.slice(0, 60)}</div>
                      </div>
                    ))}
                    {alerts.length === 0 && <EmptyState icon="✅" title="Sin alertas" description="Todos los sitios operativos." />}
                  </div>
                </Section>

                {tickets.length > 0 && (
                  <Section eyebrow="Soporte" title="Tickets abiertos" actions={<Link href="/ops/support" style={{ fontSize: 12, color: "var(--primary)" }}>Ver todos →</Link>}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {tickets.map((t) => (
                        <Link key={t.id} href="/ops/support" style={{ textDecoration: "none", color: "inherit" }}>
                          <div style={{ padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, borderLeftWidth: 3, borderLeftColor: ticketPriorityColor[t.priority ?? "MEDIA"] ?? "var(--border)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                              {t.folio && <code style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{t.folio}</code>}
                              {t.priority && <Tag variant={t.priority === "CRITICA" || t.priority === "ALTA" ? "danger" : "warning"} size="sm">{t.priority}</Tag>}
                            </div>
                            <div style={{ fontWeight: 600, fontSize: 12.5 }}>{t.title}</div>
                            {t.client?.name && <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{t.client.name}</div>}
                          </div>
                        </Link>
                      ))}
                    </div>
                  </Section>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
