"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
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
import { CommandCenterRail } from "@/components/command-center/CommandCenterRail";

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
  title?: string;
  description?: string;
  status: string;
  priority?: string;
  urgency?: string;
  client?: { name: string } | null;
}

interface ActionNotif {
  id: number;
  title: string;
  message: string;
  category: string;
  priority: string | null;
  isRead: boolean;
  relatedUrl?: string | null;
  createdAt: string;
}

interface SlaBrief {
  responseSla?: { compliancePct: number };
  resolutionSla?: { compliancePct: number };
  backlog?: { open: number; aging?: { d7_plus: number } };
  breaches?: unknown[];
  inboxByStatus?: Record<string, number>;
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

const ESTATUS_COLORS: Record<string, string> = {
  PROGRAMADA: "var(--panel-accent, var(--primary))",
  EN_CURSO: "var(--warning)",
  COMPLETADA: "var(--success)",
  REPROGRAMAR: "#a855f7",
  CANCELADA: "var(--text-tertiary)",
};
const ESTATUS_LABELS: Record<string, string> = {
  PROGRAMADA: "Programadas",
  EN_CURSO: "En curso",
  COMPLETADA: "Completadas",
  REPROGRAMAR: "Reprogramar",
  CANCELADA: "Canceladas",
};

const TAG_TO_TONE: Record<string, "neutral" | "accent" | "positive" | "warning" | "danger"> = {
  neutral: "neutral",
  accent: "accent",
  positive: "positive",
  warning: "warning",
  danger: "danger",
};

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
          ? apiFetch("client-ticket-requests?limit=5", token).catch(() => [])
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

  const byEstatus = useMemo(() => {
    const map: Record<string, number> = {};
    for (const a of scopedActivities) map[a.estatus] = (map[a.estatus] ?? 0) + 1;
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [scopedActivities]);

  const sevColor: Record<string, string> = { critical: "var(--danger)", warning: "var(--warning)", info: "var(--text-tertiary)" };
  const ticketPriorityColor: Record<string, string> = { CRITICA: "var(--danger)", ALTA: "#f97316", MEDIA: "var(--warning)", BAJA: "var(--text-tertiary)" };

  return (
    <DashPage>
      <DashHero
        eyebrow="OPS · Operación diaria"
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={
          <>
            {overdueOts.length > 0 && <DashPill tone="danger">{overdueOts.length} OTs vencidas</DashPill>}
            <Button variant="ghost" onClick={() => void load()}>Actualizar</Button>
            {cfg.viewMode === "execute" && (
              <Link href={getActivitiesCanonicalPath(user)} style={{ textDecoration: "none" }}>
                <Button variant="primary" iconRight="→">Mis actividades</Button>
              </Link>
            )}
          </>
        }
      />

      <CommandCenterRail panel="ops" />

      {error && !loading && (
        <DashPanel title="No se pudo cargar" subtitle={error}>
          <Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>
        </DashPanel>
      )}

      <StatStrip
        stats={[
          {
            label: "OT de hoy",
            value: loading ? "…" : ots.length,
            sub: "Con entrega, en curso o completadas hoy",
            tone: "accent",
            big: true,
          },
          { label: "En curso", value: loading ? "…" : enCurso, tone: enCurso > 0 ? "warning" : "default" },
          { label: "Completadas hoy", value: loading ? "…" : completadasHoy, tone: "positive" },
          ...(showTeam && enRevision > 0
            ? [{ label: "En revisión", value: enRevision, tone: "warning" as const }]
            : []),
          {
            label: "Vencidas",
            value: loading ? "…" : overdueOts.length,
            tone: overdueOts.length > 0 ? "danger" : "positive",
          },
          ...(showNoc
            ? [{
                label: "Alertas activas",
                value: loading ? "…" : alerts.length,
                tone: (alerts.length > 0 ? "danger" : "positive") as "danger" | "positive",
              }]
            : []),
        ]}
      />

      {!loading && overdueOts.length > 0 && (
        <DashPanel
          title={`${overdueOts.length} OTs vencidas`}
          subtitle="Superaron su fecha de entrega esperada"
          action="Ver todas las OT"
          actionHref="/ops/activities"
        >
          {overdueOts.slice(0, 5).map((a) => (
            <ListRow
              key={a.id}
              href={`/ops/activities/${a.id}`}
              accent="var(--danger)"
              title={a.client?.name ?? a.branchName ?? "—"}
              sub={`${a.anNumber} · ${a.titulo}${showTeam && a.responsable ? ` · ${a.responsable.nombre}` : ""}`}
              trail={a.fechaEntregaEsperada
                ? <span style={{ color: "var(--danger)" }}>{new Date(a.fechaEntregaEsperada).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}</span>
                : undefined}
            />
          ))}
        </DashPanel>
      )}

      <DashGrid>
        <DashCol span={8}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <DashPanel
              title="OT del día"
              subtitle="Órdenes de trabajo activas hoy"
              action="Ver todas"
              actionHref="/ops/activities"
            >
              {loading && <DashEmpty title="Cargando…" />}
              {!loading && ots.length === 0 && (
                <DashEmpty title="Sin OT para hoy" description="No hay actividades con entrega, en curso o completadas hoy." />
              )}
              {!loading &&
                ots.slice(0, 8).map((a) => (
                  <ListRow
                    key={a.id}
                    href={`/ops/activities/${a.id}`}
                    title={a.client?.name ?? a.branchName ?? "—"}
                    sub={`${a.anNumber} · ${a.titulo}${showTeam && a.responsable ? ` · ${a.responsable.nombre}` : ""}`}
                    trail={
                      <DashPill tone={TAG_TO_TONE[activityDisplayVariant(a.estatus, a.activityEvidence)] ?? "neutral"}>
                        {activityDisplayLabel(a.estatus, a.activityEvidence)}
                      </DashPill>
                    }
                  />
                ))}
            </DashPanel>

            {byMember.length > 0 && (
              <DashPanel title="Carga por integrante" subtitle="OTs asignadas a cada miembro del equipo">
                <BarList
                  items={byMember.map((m) => ({
                    label: m.nombre,
                    value: m.total,
                    display: `${m.completadas}/${m.total}`,
                    color: m.total > 0 && m.completadas / m.total >= 0.8
                      ? "var(--success)"
                      : m.total > 0 && m.completadas / m.total >= 0.4
                      ? "var(--panel-accent, var(--primary))"
                      : "var(--warning)",
                  }))}
                />
              </DashPanel>
            )}
          </div>
        </DashCol>

        <DashCol span={4}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {byEstatus.length > 0 && (
              <DashPanel title="Estado de OTs" subtitle={`${scopedActivities.length} en total`}>
                <BarList
                  items={byEstatus.map(([s, count]) => ({
                    label: ESTATUS_LABELS[s] ?? s.replace(/_/g, " "),
                    value: count,
                    color: ESTATUS_COLORS[s] ?? "var(--panel-accent, var(--primary))",
                  }))}
                />
              </DashPanel>
            )}

            {showNoc && (
              <DashPanel
                title="Alertas de monitoreo"
                subtitle="Sitios y dispositivos NOC"
                action="Ver NOC"
                actionHref="/ops/noc"
              >
                {alertsErr && <p style={{ fontSize: 12, color: "var(--danger)", margin: 0 }}>{alertsErr}</p>}
                {!loading && alerts.length === 0 && !alertsErr && (
                  <DashEmpty title="Sin alertas" description="Todos los sitios operativos." />
                )}
                {alerts.slice(0, 5).map((al) => (
                  <ListRow
                    key={al.id}
                    accent={sevColor[al.severity]}
                    title={al.title}
                    sub={`${al.deviceName} · ${al.message.slice(0, 60)}`}
                  />
                ))}
              </DashPanel>
            )}

            {showNoc && tickets.length > 0 && (
              <DashPanel
                title="Tickets abiertos"
                subtitle="Soporte a clientes"
                action="Ver todos"
                actionHref="/ops/support"
              >
                {tickets.map((t) => (
                  <ListRow
                    key={t.id}
                    href="/ops/support"
                    accent={ticketPriorityColor[t.priority ?? "MEDIA"] ?? "var(--border)"}
                    title={t.title}
                    sub={[t.folio, t.client?.name].filter(Boolean).join(" · ")}
                    trail={t.priority
                      ? <DashPill tone={t.priority === "CRITICA" || t.priority === "ALTA" ? "danger" : "warning"}>{t.priority}</DashPill>
                      : undefined}
                  />
                ))}
              </DashPanel>
            )}
          </div>
        </DashCol>
      </DashGrid>
    </DashPage>
  );
}
