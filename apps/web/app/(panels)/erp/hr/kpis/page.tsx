"use client";

/**
 * ERP · KPIs de personas
 * Las cifras salen de `hr/dashboard` y del promedio de cierre. Esta pantalla no las recalcula.
 */

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Alert,
  Button,
  EmptyState,
  FilterChip,
  FilterChips,
  LinkButton,
  ListFooter,
  ModuleToolbar,
  PageHead,
  SearchInput,
  SkeletonRows,
  StatusBadge,
} from "@/components/base";
import { exportToExcel } from "@/lib/export-excel";
import { useUser } from "@/components/UserContext";
import { useHrManagementGuard } from "@/lib/useHrManagementGuard";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
import s from "./kpis.module.css";

interface EngineerRow {
  engineerId: number;
  engineerName: string;
  totalActivities: number;
  completed: number;
  completionRate: number;
  avgDurationMin: number | null;
}

interface PeopleInsights {
  generatedAt: string;
  kpis: {
    headcount: number;
    inactiveOrBaja: number;
    turnoverPct: number;
    hires12m: number;
    punctualityPct: number;
    lateEvents30d: number;
    lunchLate30d: number;
    avgDailyPresent: number;
    openAttendanceDays: number;
    pendingLeaves: number;
    approvedLeavesThisMonth: number;
    avgPerformanceRating: number;
    reviewsCount: number;
  };
  trends: { present14d: Array<{ date: string; count: number }> };
  distributions: { byDepartment: Array<{ name: string; count: number }> };
  workloadTop: Array<{
    userId: number;
    nombre: string;
    department: string;
    daysPresent: number;
    avgMinutes: number;
    lateCount: number;
  }>;
  lateLeaders: Array<{
    userId: number;
    nombre: string;
    lateCount: number;
    daysPresent: number;
  }>;
  pendingLeaveQueue: Array<{
    id: number;
    type: string;
    days: number;
    startDate: string;
    user: { id: number; nombre: string };
    createdAt: string;
  }>;
  recentReviews: Array<{
    id: number;
    period: string;
    overallRating: number;
    status: string;
    user: { id: number; nombre: string };
    reviewer: { id: number; nombre: string };
    reviewDate: string;
  }>;
  alerts: Array<{ severity: "warning" | "danger"; message: string }>;
}

const LEAVE_TYPE_LABEL: Record<string, string> = {
  VACATION: "Vacaciones",
  SICK: "Enfermedad",
  PERSONAL: "Personal",
  MATERNITY: "Maternidad",
  PATERNITY: "Paternidad",
  BEREAVEMENT: "Duelo",
  UNPAID: "Sin goce de sueldo",
};

const REVIEW_PERIOD_LABEL: Record<string, string> = {
  MONTHLY: "Mensual",
  QUARTERLY: "Trimestral",
  SEMI_ANNUAL: "Semestral",
  ANNUAL: "Anual",
};

const REVIEW_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  SUBMITTED: "Enviada",
  ACKNOWLEDGED: "Recibida",
};

const nf1 = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 });

function days(n: number): string {
  return n === 1 ? "1 día" : `${n} días`;
}

function shortDay(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" });
}

async function apiFetch(path: string, token: string) {
  const res = await fetch(buildApiUrl(path), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const readable = text.trim().startsWith("<") ? "" : text;
    throw new Error(readable || (res.status === 403 ? "No tienes permiso para ver estos indicadores." : "El servidor no respondió. Intenta de nuevo en unos minutos."));
  }
  return res.json();
}

type FiltroCierre = "todos" | "altos" | "revisar";

export default function HrKpisPage() {
  const { user } = useUser();
  useHrManagementGuard();
  const token = user?.token ?? "";

  const [insights, setInsights] = useState<PeopleInsights | null>(null);
  const [engineers, setEngineers] = useState<EngineerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const deferredQ = useDeferredValue(searchQ);
  const [cierre, setCierre] = useState<FiltroCierre>("todos");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [dash, engData] = await Promise.all([
        apiFetch("hr/dashboard", token),
        apiFetch("analytics/bi/engineers?limit=15", token).catch(() => []),
      ]);
      setInsights(dash as PeopleInsights);
      setEngineers(Array.isArray(engData) ? engData : []);
      setError(null);
    } catch (e) {
      setError(formatApiError(e, "No se pudieron cargar los indicadores de personas."));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  // Promedio de cierre de todos los ingenieros que llegaron, no de la lista filtrada.
  const avgCompletion = useMemo(() => engineers.length
    ? Math.round(engineers.reduce((s, e) => s + e.completionRate, 0) / engineers.length)
    : 0, [engineers]);

  const porTexto = useMemo(() => {
    const q = deferredQ.trim().toLowerCase();
    if (!q) return engineers;
    return engineers.filter((e) => e.engineerName.toLowerCase().includes(q));
  }, [engineers, deferredQ]);

  const cuentas = useMemo(() => ({
    todos: porTexto.length,
    altos: porTexto.filter((e) => e.completionRate >= 80).length,
    revisar: porTexto.filter((e) => e.completionRate < 80).length,
  }), [porTexto]);

  const visibleEngineers = useMemo(() => {
    if (cierre === "altos") return porTexto.filter((e) => e.completionRate >= 80);
    if (cierre === "revisar") return porTexto.filter((e) => e.completionRate < 80);
    return porTexto;
  }, [porTexto, cierre]);

  const presenceMax = useMemo(
    () => Math.max(1, ...(insights?.trends.present14d ?? []).map((x) => x.count)),
    [insights],
  );

  const k = insights?.kpis;
  const initialLoading = loading && !insights;
  const hayFiltros = Boolean(searchQ.trim()) || cierre !== "todos";
  const quitar = () => {
    setSearchQ("");
    setCierre("todos");
  };
  const unidad = visibleEngineers.length === 1 ? "ingeniero" : "ingenieros";

  return (
    <div className={s.pagina}>
      <PageHead title="KPIs de personas" back={{ href: "/erp/hr", label: "Plantilla" }} />

      {initialLoading ? <SkeletonRows rows={5} label="Cargando indicadores" /> : null}

      {error ? (
        <Alert tone={insights ? "warning" : "danger"} role="alert" action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}>
          {error}
        </Alert>
      ) : null}

      {insights && k ? (
        <>
          <dl className={s.cifras}>
            <div className={s.cifra}>
              <dt>Plantilla activa</dt>
              <dd>
                {k.headcount}
                <br />
                <small>{k.hires12m} altas en 12 meses</small>
              </dd>
            </div>
            <div className={s.cifra}>
              <dt>Rotación</dt>
              <dd className={k.turnoverPct > 15 ? s.aviso : s.ok}>
                {nf1.format(k.turnoverPct)}%
                <br />
                <small>{k.inactiveOrBaja} bajas o inactivas</small>
              </dd>
            </div>
            <div className={s.cifra}>
              <dt>Puntualidad (30 días)</dt>
              <dd className={k.punctualityPct >= 90 ? s.ok : s.aviso}>{nf1.format(k.punctualityPct)}%</dd>
            </div>
            <div className={s.cifra}>
              <dt>Presentes por día</dt>
              <dd>{nf1.format(k.avgDailyPresent)}</dd>
            </div>
            <div className={s.cifra}>
              <dt>Permisos por aprobar</dt>
              <dd className={k.pendingLeaves ? s.aviso : undefined}>{k.pendingLeaves}</dd>
            </div>
            <div className={s.cifra}>
              <dt>Cierre de órdenes</dt>
              <dd>
                {avgCompletion}%
                <br />
                <small>Promedio de ingenieros, 90 días</small>
              </dd>
            </div>
          </dl>

          {insights.alerts.map((a) => (
            <Alert key={a.message} tone={a.severity === "danger" ? "danger" : "warning"}>
              {a.message}
            </Alert>
          ))}

          <div className={s.paneles}>
            <section className={s.panel} aria-label="Presencia en los últimos 14 días">
              <h2>Presencia en 14 días</h2>
              <p>Personas con jornada registrada por día.</p>
              <ol className={s.barras} aria-label="Personas presentes por día">
                {insights.trends.present14d.map((p) => (
                  <li key={p.date} title={`${shortDay(p.date)}: ${p.count}`}>
                    <span
                      className={s.barra}
                      style={{ height: `${Math.max(4, (p.count / presenceMax) * 56)}px`, opacity: p.count ? 1 : 0.25 }}
                      aria-label={`${shortDay(p.date)}: ${p.count} ${p.count === 1 ? "persona" : "personas"}`}
                    />
                  </li>
                ))}
              </ol>
              <ul className={s.cargas}>
                <li className={s.carga}>
                  <span>Tardanzas (30 días)</span>
                  <span className={s.numero}>{k.lateEvents30d}</span>
                </li>
                <li className={s.carga}>
                  <span>Regresos tarde de comida</span>
                  <span className={s.numero}>{k.lunchLate30d}</span>
                </li>
                <li className={s.carga}>
                  <span>Calificación promedio</span>
                  <span className={s.numero}>{nf1.format(k.avgPerformanceRating)} de 5</span>
                </li>
              </ul>
            </section>

            <section className={s.panel} aria-label="Personas por área">
              <h2>Personas por área</h2>
              <p>Plantilla activa.</p>
              {insights.distributions.byDepartment.length === 0 ? (
                <p className={s.vacio}>Nadie tiene área asignada.</p>
              ) : (
                <ul className={s.areas}>
                  {insights.distributions.byDepartment.slice(0, 8).map((d) => (
                    <li key={d.name} className={s.area}>
                      <span className={s.nombre}>{d.name}</span>
                      <span className={s.pista} aria-hidden="true">
                        <span style={{ width: `${(d.count / Math.max(1, k.headcount)) * 100}%` }} />
                      </span>
                      <span className={s.numero}>{d.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={s.panel} aria-label="Mayor carga de trabajo">
              <h2>Mayor carga</h2>
              <p>Horas promedio por día, últimos 30 días.</p>
              {insights.workloadTop.length === 0 ? (
                <p className={s.vacio}>Sin asistencia en los últimos 30 días.</p>
              ) : (
                <ul className={s.cargas}>
                  {insights.workloadTop.map((w) => (
                    <li key={w.userId} className={s.carga}>
                      <span>
                        <Link href={`/erp/hr/${w.userId}`} className={s.nombre}>{w.nombre}</Link>
                        <span className={s.meta}>{[w.department, `${days(w.daysPresent)} con asistencia`].filter(Boolean).join(" · ")}</span>
                      </span>
                      <span className={s.numero}>
                        {nf1.format(w.avgMinutes / 60)} h
                        {w.lateCount > 0 ? (
                          <span className={s.meta}>{w.lateCount === 1 ? "1 tardanza" : `${w.lateCount} tardanzas`}</span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={s.panel} aria-label="Permisos por aprobar">
              <h2>Permisos por aprobar</h2>
              <p>Solicitudes en espera.</p>
              {insights.pendingLeaveQueue.length === 0 ? (
                <p className={s.vacio}>No hay permisos pendientes.</p>
              ) : (
                <ul className={s.permisos}>
                  {insights.pendingLeaveQueue.map((l) => (
                    <li key={l.id} className={s.permiso}>
                      <span className={s.nombre}>{l.user.nombre}</span>
                      <span>{LEAVE_TYPE_LABEL[l.type] ?? "Otro permiso"}</span>
                      <span className={s.numero}>{days(l.days)}</span>
                      <span className={s.meta}>
                        Desde el {new Date(l.startDate).toLocaleDateString("es-MX", { day: "numeric", month: "long" })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {insights.pendingLeaveQueue.length > 0 ? (
                <p>
                  <Link href="/erp/hr" className={s.nombre}>Revisar en Plantilla</Link>
                </p>
              ) : null}
            </section>
          </div>

          <section className={s.tabla} aria-label="Productividad en campo">
            <ModuleToolbar
              search={
                <SearchInput
                  aria-label="Buscar ingeniero"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="Nombre"
                />
              }
              chips={
                <FilterChips ariaLabel="Filtrar por cierre">
                  <FilterChip active={cierre === "todos"} count={cuentas.todos} onClick={() => setCierre("todos")}>Todos</FilterChip>
                  <FilterChip active={cierre === "altos"} count={cuentas.altos} onClick={() => setCierre(cierre === "altos" ? "todos" : "altos")}>Cierre alto</FilterChip>
                  <FilterChip active={cierre === "revisar"} count={cuentas.revisar} onClick={() => setCierre(cierre === "revisar" ? "todos" : "revisar")}>Por revisar</FilterChip>
                </FilterChips>
              }
              end={
                <>
                  {hayFiltros ? <LinkButton onClick={quitar}>Quitar filtros</LinkButton> : null}
                  {engineers.length > 0 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => exportToExcel(visibleEngineers, [
                        { key: "engineerName", label: "Ingeniero" },
                        { key: "totalActivities", label: "Órdenes (90 días)" },
                        { key: "completed", label: "Cerradas" },
                        { key: "completionRate", label: "% de cierre", format: (v) => `${String(v)}%` },
                        { key: "avgDurationMin", label: "Minutos promedio por orden" },
                      ], "indicadores-ingenieros")}
                    >
                      Excel
                    </Button>
                  ) : null}
                </>
              }
            />
            {visibleEngineers.length === 0 ? (
              <EmptyState
                title={hayFiltros ? "Ningún ingeniero coincide." : "No hay órdenes en los últimos 90 días."}
                tone="neutral"
                action={hayFiltros ? <Button size="sm" onClick={quitar}>Quitar filtros</Button> : undefined}
              />
            ) : (
              <>
                <div className={s.cabecera} aria-hidden="true">
                  <span>Ingeniero</span>
                  <span>Órdenes</span>
                  <span>Cerradas</span>
                  <span>Cierre</span>
                  <span>Minutos</span>
                </div>
                <ul className={s.ingenieros}>
                  {visibleEngineers.map((r) => (
                    <li key={r.engineerId} className={s.ingeniero}>
                      <span className={s.nombre}>{r.engineerName}</span>
                      <span className={s.numero}>{r.totalActivities}</span>
                      <span className={s.numero}>{r.completed}</span>
                      <span className={s.cierre}>
                        <span className={s.pista} aria-hidden="true">
                          <span style={{ width: `${Math.min(100, Math.max(0, r.completionRate))}%` }} />
                        </span>
                        <StatusBadge
                          label={`${r.completionRate}%`}
                          tone={r.completionRate >= 80 ? "success" : r.completionRate >= 60 ? "brand" : "warning"}
                          size="sm"
                        />
                      </span>
                      <span className={s.numero}>{r.avgDurationMin != null ? `${r.avgDurationMin} min` : "Sin dato"}</span>
                    </li>
                  ))}
                </ul>
                <ListFooter total={visibleEngineers.length} unit={unidad} />
              </>
            )}
          </section>

          {insights.recentReviews.length > 0 ? (
            <section className={s.panel} aria-label="Evaluaciones recientes">
              <h2>Evaluaciones recientes</h2>
              <p>
                {k.reviewsCount} {k.reviewsCount === 1 ? "evaluación" : "evaluaciones"} en total · promedio {nf1.format(k.avgPerformanceRating)} de 5.
              </p>
              <ul className={s.evaluaciones}>
                {insights.recentReviews.map((r) => (
                  <li key={r.id} className={s.evaluacion}>
                    <span>
                      <span className={s.nombre}>{r.user.nombre}</span>
                      <span className={s.meta}>{REVIEW_PERIOD_LABEL[r.period] ?? "Otro periodo"} · evaluó {r.reviewer.nombre}</span>
                    </span>
                    <span className={s.numero}>{nf1.format(r.overallRating)} de 5</span>
                    <span>{REVIEW_STATUS_LABEL[r.status] ?? "Sin estado"}</span>
                  </li>
                ))}
              </ul>
              <ListFooter total={insights.recentReviews.length} unit={insights.recentReviews.length === 1 ? "evaluación" : "evaluaciones"} />
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
