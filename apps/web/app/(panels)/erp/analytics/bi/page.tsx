"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import InlineAlert from "@/components/ui/InlineAlert";
import DataTable, { Money, Tag, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToExcel } from "@/lib/export-excel";
import { useUser } from "@/components/UserContext";
import { getBiSectionConfig } from "@/lib/section-views";
import { apiRequest } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
import { resolveV2RoleKey } from "@/lib/user-access";
import { ROLES, type RoleKey } from "@/lib/rbac";
import { biRecommendationHref, buildBiQuickLinks } from "@/lib/bi-drill-links";
import s from "./bi.module.css";

const ERP_BI_ROLES = new Set<RoleKey>([
  ROLES.CEO, ROLES.DIR_ADMIN, ROLES.DIR_OPERACIONES,
  ROLES.COORD_VENTAS, ROLES.COORD_OPERACIONES,
]);

interface MarginRow { projectType: string; count: number; budget: number; cost: number; margin: number; marginPercent: number }
interface EngineerRow { engineerId: number; engineerName: string; totalActivities: number; completed: number; completionRate: number; avgEfficiency: number | null; avgDurationMin: number | null }
interface ClientRoiRow { clientId: number; clientName: string; projects: number; revenue: number; cost: number; roi: number }
interface IntelligencePayload {
  what?: { revenue?: number; marginPercent?: number; dangerCount?: number; warningCount?: number; lowStockAlerts?: number };
  why?: { drivers?: string[] };
  willHappen?: { forecastSalesNextMonth?: number; riskIfNoAction?: string };
  recommendations?: Array<{ action: string; impact: string; priority: string }>;
  risk?: string;
  cost?: { monthlyExpenses?: number; opportunityCostOverdueSla?: number };
  optimize?: string[];
}

type Period = "month" | "quarter" | "year";
type SectionId = "intelligence" | "margins" | "engineers" | "clients";

const PERIOD_LABEL: Record<Period, string> = {
  month: "Último mes",
  quarter: "Último trimestre",
  year: "Último año",
};

const SECTIONS: Array<{ id: SectionId; label: string }> = [
  { id: "intelligence", label: "Hallazgos" },
  { id: "margins", label: "Márgenes" },
  { id: "engineers", label: "Ingenieros" },
  { id: "clients", label: "Clientes" },
];

const RISK_LABEL: Record<string, string> = { low: "bajo", medium: "medio", high: "alto", critical: "crítico" };
const PRIORITY_META: Record<string, { label: string; variant: "danger" | "warning" | "neutral" }> = {
  P0: { label: "Urgente", variant: "danger" },
  P1: { label: "Importante", variant: "warning" },
  P2: { label: "Normal", variant: "neutral" },
};

const mxnCompact = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", notation: "compact" });
const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

const pctVariant = (v: number, good: number, ok: number): "positive" | "warning" | "danger" =>
  v >= good ? "positive" : v >= ok ? "warning" : "danger";
const TONE_COLOR = { positive: "var(--success)", warning: "var(--warning)", danger: "var(--danger)" } as const;

async function apiFetch(path: string, token: string) {
  const res = await apiRequest(path, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return res.json();
}

function Meter({ value, max = 100, tone }: { value: number; max?: number; tone: "positive" | "warning" | "danger" }) {
  return (
    <div className={s.meter}>
      <div className={s.meterTrack} aria-hidden="true">
        <div className={s.meterFill} style={{ width: `${Math.min(100, Math.max(0, (value / max) * 100))}%`, background: TONE_COLOR[tone] }} />
      </div>
      <Tag variant={tone}>{value}%</Tag>
    </div>
  );
}

function ExportButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" iconLeft="⬇" onClick={onClick}>
      Excel
    </Button>
  );
}

export default function BiPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getBiSectionConfig(user), [user]);
  const router = useRouter();
  const token = user?.token ?? "";

  useEffect(() => {
    if (!user || user.isSuperAdmin) return;
    const v2 = resolveV2RoleKey(user);
    if (v2 && !ERP_BI_ROLES.has(v2)) router.replace("/erp/dashboard");
  }, [user, router]);

  const [period, setPeriod] = useState<Period>("month");
  const [margin, setMargin] = useState<MarginRow[]>([]);
  const [engineers, setEngineers] = useState<EngineerRow[]>([]);
  const [clientsRoi, setClientsRoi] = useState<ClientRoiRow[]>([]);
  const [intel, setIntel] = useState<IntelligencePayload | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [engSearch, setEngSearch] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [focusSection, setFocusSection] = useState<SectionId | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [m, e, c, i] = await Promise.all([
        apiFetch(`analytics/bi/margin-by-type?period=${period}`, token),
        apiFetch(`analytics/bi/engineers?limit=20&period=${period}`, token),
        apiFetch(`analytics/bi/clients-roi?limit=20&period=${period}`, token),
        apiFetch(`analytics/intelligence`, token).catch(() => null),
      ]);
      setMargin(Array.isArray(m) ? m : []);
      setEngineers(Array.isArray(e) ? e : []);
      setClientsRoi(Array.isArray(c) ? c : []);
      setIntel(i && typeof i === "object" ? i : null);
      setLoaded(true);
    } catch (e) {
      setError(formatApiError(e, "No pudimos cargar la analítica."));
    } finally {
      setLoading(false);
    }
  }, [token, period]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("section");
    if (raw && SECTIONS.some((x) => x.id === raw)) setFocusSection(raw as SectionId);
  }, []);

  useEffect(() => {
    if (!focusSection || !loaded) return;
    const el = document.getElementById(`bi-${focusSection}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    const t = window.setTimeout(() => setFocusSection(null), 1800);
    return () => window.clearTimeout(t);
  }, [focusSection, loaded]);

  const goToSection = (id: SectionId) => {
    const url = new URL(window.location.href);
    url.searchParams.set("section", id);
    window.history.replaceState(null, "", url.toString());
    setFocusSection(id);
  };

  const summary = useMemo(() => {
    const totalMargin = margin.reduce((acc, m) => acc + m.margin, 0);
    const totalBudget = margin.reduce((acc, m) => acc + m.budget, 0);
    const avgMarginPct = margin.length > 0 ? +(margin.reduce((acc, m) => acc + m.marginPercent, 0) / margin.length).toFixed(1) : 0;
    const topClient = clientsRoi.reduce<ClientRoiRow | null>((best, c) => (!best || c.roi > best.roi ? c : best), null);
    const avgCompletion = engineers.length > 0 ? Math.round(engineers.reduce((acc, e) => acc + e.completionRate, 0) / engineers.length) : 0;
    const maxBudget = Math.max(1, ...margin.map((r) => r.budget));
    return { totalMargin, totalBudget, avgMarginPct, topClient, avgCompletion, maxBudget };
  }, [margin, clientsRoi, engineers]);

  const visibleEngineers = useMemo(() => {
    const q = engSearch.trim().toLowerCase();
    return q ? engineers.filter((e) => e.engineerName.toLowerCase().includes(q)) : engineers;
  }, [engineers, engSearch]);

  const visibleClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    return q ? clientsRoi.filter((c) => c.clientName.toLowerCase().includes(q)) : clientsRoi;
  }, [clientsRoi, clientSearch]);

  const marginCols = useMemo<Column<MarginRow>[]>(() => [
    {
      key: "projectType",
      label: "Línea de negocio",
      width: 180,
      render: (r) => <Link href="/erp/proyectos" className={s.cellLink}>{r.projectType}</Link>,
    },
    { key: "count", label: "Proyectos", width: 90 },
    { key: "budget", label: "Presupuesto", render: (r) => <Money value={r.budget} />, width: 130 },
    { key: "cost", label: "Costo", render: (r) => <Money value={r.cost} />, width: 130 },
    { key: "margin", label: "Margen", render: (r) => <Money value={r.margin} />, width: 130 },
    { key: "marginPercent", label: "% de margen", render: (r) => <Meter value={r.marginPercent} tone={pctVariant(r.marginPercent, 20, 10)} />, width: 160 },
  ], []);

  const engCols = useMemo<Column<EngineerRow>[]>(() => [
    { key: "engineerName", label: "Ingeniero", render: (r) => <Link href={`/erp/hr/${r.engineerId}`} className={s.cellLink}>{r.engineerName}</Link> },
    { key: "totalActivities", label: "Órdenes (90 días)", width: 120 },
    { key: "completed", label: "Cerradas", width: 90 },
    { key: "completionRate", label: "% cerradas", render: (r) => <Meter value={r.completionRate} tone={pctVariant(r.completionRate, 80, 60)} />, width: 160 },
    { key: "avgDurationMin", label: "Minutos por orden", render: (r) => (r.avgDurationMin != null ? r.avgDurationMin.toLocaleString("es-MX") : "—"), width: 130 },
  ], []);

  const clientCols = useMemo<Column<ClientRoiRow>[]>(() => [
    { key: "clientName", label: "Cliente", render: (r) => <Link href={`/erp/clientes/${r.clientId}`} className={s.cellLink}>{r.clientName}</Link> },
    { key: "projects", label: "Proyectos", width: 90 },
    { key: "revenue", label: "Ingreso", render: (r) => <Money value={r.revenue} />, width: 130 },
    { key: "cost", label: "Costo", render: (r) => <Money value={r.cost} />, width: 130 },
    { key: "roi", label: "Rentabilidad", render: (r) => <Meter value={r.roi} tone={pctVariant(r.roi, 20, 0)} />, width: 150 },
  ], []);

  const periodLabel = PERIOD_LABEL[period];
  const slaCost = Number(intel?.cost?.opportunityCostOverdueSla || 0);
  const { topClient } = summary;
  const quickLinks = buildBiQuickLinks({
    topClientId: topClient?.clientId,
    hasSlaRisk: slaCost > 0 || (intel?.what?.dangerCount ?? 0) > 0,
  });
  const riskLabel = intel?.risk ? RISK_LABEL[intel.risk.toLowerCase()] ?? intel.risk : null;
  const forecast = intel?.willHappen?.forecastSalesNextMonth;

  const anchorClass = (id: SectionId) => `${s.anchor} ${focusSection === id ? s.anchorFocus : ""}`;

  return (
    <>
      <PageHeader
        eyebrow="Hoy"
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={
          <div className={s.toolbar}>
            <select aria-label="Periodo" className={s.select} value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
              {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
                <option key={p} value={p}>{PERIOD_LABEL[p]}</option>
              ))}
            </select>
            <Button variant="ghost" iconLeft="↻" onClick={() => void load()} loading={loading && loaded} disabled={loading}>
              Actualizar
            </Button>
          </div>
        }
      />

      {error && loaded && (
        <InlineAlert
          variant="warning"
          message={`No pudimos actualizar; mostramos los últimos datos. ${error}`}
          action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}
        />
      )}

      {!loaded && loading && (
        <div aria-busy="true" aria-label="Cargando analítica">
          <div className={s.kpis}>
            {[0, 1, 2, 3].map((i) => <div key={i} className={s.skeleton} style={{ height: 104 }} />)}
          </div>
          <div className={s.skeleton} style={{ height: 280 }} />
        </div>
      )}

      {!loaded && !loading && error && (
        <EmptyState
          icon="⚠️"
          title="No pudimos cargar la analítica"
          description={error}
          action={<Button variant="primary" onClick={() => void load()}>Reintentar</Button>}
        />
      )}

      {loaded && (
        <>
          <nav className={s.nav} aria-label="Secciones de analítica">
            {SECTIONS.filter((x) => x.id !== "intelligence" || intel).map((x) => (
              <button key={x.id} type="button" className={s.navBtn} onClick={() => goToSection(x.id)}>
                {x.label}
              </button>
            ))}
            <div className={s.quickRow}>
              {quickLinks.map((link) => (
                <Link key={link.href} href={link.href} className={s.quick} title={link.desc}>
                  {link.label} →
                </Link>
              ))}
            </div>
          </nav>

          <div className={s.kpis}>
            <KpiCard label="Presupuesto total" value={<Money value={summary.totalBudget} compact />} icon="💰" hint={periodLabel} />
            <KpiCard label="Margen total" value={<Money value={summary.totalMargin} compact />} variant={summary.totalMargin >= 0 ? "positive" : "danger"} icon="📊" hint={periodLabel} />
            <KpiCard label="Margen promedio" value={`${summary.avgMarginPct}%`} variant={pctVariant(summary.avgMarginPct, 20, 10)} icon="📈" hint="Por línea de negocio" />
            <KpiCard label="Órdenes cerradas" value={`${summary.avgCompletion}%`} variant={pctVariant(summary.avgCompletion, 80, 60)} icon="✅" hint={`Promedio de ${engineers.length} ingenieros · 90 días`} />
            {topClient && (
              <KpiCard
                label="Cliente más rentable"
                value={`${topClient.roi}%`}
                variant="accent"
                icon="🏆"
                hint={topClient.clientName}
                onClick={() => router.push(`/erp/clientes/${topClient.clientId}`)}
              />
            )}
          </div>

          {intel && (
            <div id="bi-intelligence" className={anchorClass("intelligence")}>
              <Section
                eyebrow="Hallazgos"
                title="Qué está pasando y qué hacer"
                subtitle={[
                  riskLabel ? `Riesgo ${riskLabel}` : null,
                  forecast != null ? `Ventas estimadas el próximo mes: ${mxnCompact.format(Number(forecast))}` : null,
                ].filter(Boolean).join(" · ") || undefined}
              >
                <div className={s.insights}>
                  <div className={s.insight}>
                    <div className={s.insightLabel}>Por qué</div>
                    {intel.why?.drivers?.length ? (
                      <ul>{intel.why.drivers.map((d) => <li key={d}>{d}</li>)}</ul>
                    ) : (
                      <p>No detectamos causas de alerta.</p>
                    )}
                  </div>
                  <div className={s.insight}>
                    <div className={s.insightLabel}>Qué puede pasar</div>
                    <p>{intel.willHappen?.riskIfNoAction || "Se espera estabilidad."}</p>
                  </div>
                  <div className={s.insight}>
                    <div className={s.insightLabel}>Costo de no actuar</div>
                    <p>
                      Servicios fuera de tiempo: <strong style={{ fontVariantNumeric: "tabular-nums" }}>{mxn.format(slaCost)}</strong>
                    </p>
                    {slaCost > 0 && (
                      <Link href="/erp/pizarra" className={s.link} style={{ display: "inline-block", marginTop: 8 }}>
                        Ver actividades del equipo →
                      </Link>
                    )}
                  </div>
                </div>
                {(intel.recommendations?.length ?? 0) > 0 && (
                  <ul className={s.recs}>
                    {intel.recommendations!.slice(0, 4).map((r) => {
                      const href = biRecommendationHref(r.action);
                      const meta = PRIORITY_META[r.priority] ?? { label: "Normal", variant: "neutral" as const };
                      return (
                        <li key={r.action} className={s.rec}>
                          <Tag variant={meta.variant}>{meta.label}</Tag>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className={s.recTitle}>{r.action}</div>
                            <div className={s.recImpact}>{r.impact}</div>
                            {href && (
                              <Link href={href} className={s.link} style={{ display: "inline-block", marginTop: 6 }}>
                                Ir al módulo →
                              </Link>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Section>
            </div>
          )}

          <div id="bi-margins" className={anchorClass("margins")}>
            <Section
              eyebrow="Finanzas"
              title="Margen por línea de negocio"
              subtitle={periodLabel}
              actions={margin.length > 0 ? (
                <ExportButton
                  onClick={() => exportToExcel(margin, [
                    { key: "projectType", label: "Línea de negocio" },
                    { key: "count", label: "Proyectos" },
                    { key: "budget", label: "Presupuesto (MXN)" },
                    { key: "cost", label: "Costo (MXN)" },
                    { key: "margin", label: "Margen (MXN)" },
                    { key: "marginPercent", label: "% de margen", format: (v) => `${String(v)}%` },
                  ], `analitica-margen-${period}`)}
                />
              ) : undefined}
            >
              {margin.length > 0 && (
                <div className={s.bars}>
                  {margin.map((r) => (
                    <div key={r.projectType} className={s.barRow}>
                      <span className={s.barName} title={r.projectType}>{r.projectType}</span>
                      <div className={s.barTrack} aria-hidden="true">
                        <div className={s.barFill} style={{ width: `${(r.budget / summary.maxBudget) * 100}%`, background: "color-mix(in srgb, var(--primary) 20%, transparent)" }} />
                        <div className={s.barFill} style={{ width: `${Math.max(0, (r.margin / summary.maxBudget) * 100)}%`, background: r.margin >= 0 ? "var(--success)" : "var(--danger)", opacity: 0.75 }} />
                      </div>
                      <span className={s.barValue} style={{ color: r.marginPercent >= 0 ? "var(--success)" : "var(--danger)" }}>
                        {r.marginPercent}%
                      </span>
                    </div>
                  ))}
                  <div className={s.legend}>
                    <span><span className={s.swatch} style={{ background: "color-mix(in srgb, var(--primary) 20%, transparent)" }} />Presupuesto</span>
                    <span><span className={s.swatch} style={{ background: "var(--success)" }} />Margen</span>
                  </div>
                </div>
              )}
              <DataTable columns={marginCols} rows={margin} rowKey={(r) => r.projectType} emptyTitle="Sin datos en el periodo" emptyDescription="No hay proyectos con presupuesto registrado." />
            </Section>
          </div>

          <div id="bi-engineers" className={anchorClass("engineers")}>
            <Section eyebrow="Operación" title="Productividad de ingenieros" subtitle="Últimos 90 días">
              {engineers.length > 0 && (
                <div className={s.bars}>
                  {engineers.slice(0, 10).map((r) => {
                    const tone = pctVariant(r.completionRate, 80, 60);
                    return (
                      <div key={r.engineerId} className={s.barRow}>
                        <Link href={`/erp/hr/${r.engineerId}`} className={`${s.barName} ${s.cellLink}`}>{r.engineerName}</Link>
                        <div className={s.barTrack} style={{ height: 14 }} aria-hidden="true">
                          <div className={s.barFill} style={{ width: `${r.completionRate}%`, background: TONE_COLOR[tone], opacity: 0.75 }} />
                        </div>
                        <span className={s.barValue}>{r.completionRate}%</span>
                      </div>
                    );
                  })}
                </div>
              )}
              <FilterToolbar
                search={{ value: engSearch, onChange: setEngSearch, placeholder: "Buscar ingeniero…" }}
                onClear={() => setEngSearch("")}
                resultCount={visibleEngineers.length}
                rightActions={engineers.length > 0 ? (
                  <ExportButton
                    onClick={() => exportToExcel(visibleEngineers, [
                      { key: "engineerName", label: "Ingeniero" },
                      { key: "totalActivities", label: "Órdenes (90 días)" },
                      { key: "completed", label: "Cerradas" },
                      { key: "completionRate", label: "% cerradas", format: (v) => `${String(v)}%` },
                      { key: "avgDurationMin", label: "Minutos por orden" },
                    ], "analitica-ingenieros")}
                  />
                ) : undefined}
              />
              <DataTable columns={engCols} rows={visibleEngineers} rowKey={(r) => r.engineerId} emptyTitle="Sin datos" emptyDescription="No hay órdenes cerradas en los últimos 90 días." />
            </Section>
          </div>

          <div id="bi-clients" className={anchorClass("clients")}>
            <Section eyebrow="Clientes" title="Rentabilidad por cliente" subtitle={periodLabel}>
              <FilterToolbar
                search={{ value: clientSearch, onChange: setClientSearch, placeholder: "Buscar cliente…" }}
                onClear={() => setClientSearch("")}
                resultCount={visibleClients.length}
                rightActions={clientsRoi.length > 0 ? (
                  <ExportButton
                    onClick={() => exportToExcel(visibleClients, [
                      { key: "clientName", label: "Cliente" },
                      { key: "projects", label: "Proyectos" },
                      { key: "revenue", label: "Ingreso (MXN)" },
                      { key: "cost", label: "Costo (MXN)" },
                      { key: "roi", label: "Rentabilidad (%)", format: (v) => `${String(v)}%` },
                    ], `analitica-clientes-${period}`)}
                  />
                ) : undefined}
              />
              <DataTable columns={clientCols} rows={visibleClients} rowKey={(r) => r.clientId} emptyTitle="Sin datos" emptyDescription="No hay proyectos facturados en el periodo seleccionado." />
            </Section>
          </div>
        </>
      )}
    </>
  );
}
