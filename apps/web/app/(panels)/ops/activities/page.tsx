"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import PanelTabs from "@/components/ui/PanelTabs";
import { useUser } from "@/components/UserContext";
import { getActivitiesSectionConfig, getActivitiesCanonicalPath } from "@/lib/section-views";
import { useOpsCanonicalRoute } from "@/lib/use-ops-canonical-route";
import { buildApiUrl } from "@/lib/api-base";

/** Revisión de evidencias — cola con navegación al workspace */
const EvidenceReviewQueue = dynamic(() => import("@/components/ops/EvidenceReviewQueue"), { ssr: false });
/** Bandeja moderna DataTable → workspace */
const OpsActivitiesBoard = dynamic(() => import("@/components/ops/OpsActivitiesBoard"), { ssr: false });
/** Cola de tickets cliente aprobados → nueva OT */
const OpsTicketRequestQueue = dynamic(() => import("@/components/ops/OpsTicketRequestQueue"), { ssr: false });

function useActivitiesConfig() {
  const { user } = useUser();
  return useMemo(() => getActivitiesSectionConfig(user), [user]);
}

type TabId = "actividades" | "evidencias";

interface ActivitySummary {
  abiertas?: number;
  enProceso?: number;
  completadas?: number;
  vencidas?: number;
  total?: number;
}

export default function ActivitiesPage() {
  const { user } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const cfg = useActivitiesConfig();
  useOpsCanonicalRoute(user, "activities");
  const token = user?.token ?? "";

  const [tab, setTab] = useState<TabId>(
    searchParams.get("tab") === "evidencias" ? "evidencias" : "actividades",
  );
  const [summary, setSummary] = useState<ActivitySummary | null>(null);

  const loadSummary = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(buildApiUrl("activities/summary"), { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setSummary(await res.json());
    } catch { /* summary is non-critical */ }
  }, [token]);

  useEffect(() => { void loadSummary(); }, [loadSummary]);

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "evidencias") setTab("evidencias");
  }, [searchParams]);
  useEffect(() => {
    if (cfg.viewMode === "execute") {
      router.replace(getActivitiesCanonicalPath(user));
    }
  }, [cfg.viewMode, router, user]);

  if (cfg.viewMode === "execute") return null;

  const switchTab = (next: TabId) => {
    setTab(next);
    const url = next === "evidencias" ? "/ops/activities?tab=evidencias" : "/ops/activities";
    router.replace(url, { scroll: false });
  };

  return (
    <>
      <PageHeader
        eyebrow="OPS · Campo"
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => void loadSummary()}>Actualizar</Button>
            <Link href="/ops/dispatch" style={{ textDecoration: "none" }}>
              <Button variant="secondary" size="sm">Despacho</Button>
            </Link>
            {cfg.canCreate && (
              <Link href="/ops/activities/new" style={{ textDecoration: "none" }}>
                <Button variant="primary" size="sm">Nueva OT</Button>
              </Link>
            )}
          </>
        }
      />

      {summary && (() => {
        const total = (summary.abiertas ?? 0) + (summary.enProceso ?? 0) + (summary.completadas ?? 0);
        const completadoPct = total > 0 ? Math.round(((summary.completadas ?? 0) / total) * 100) : 0;
        return (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 14 }}>
              {summary.abiertas != null && <KpiCard label="Abiertas" value={summary.abiertas} />}
              {summary.enProceso != null && <KpiCard label="En proceso" value={summary.enProceso} variant="accent" />}
              {summary.completadas != null && <KpiCard label="Completadas (30d)" value={summary.completadas} variant="positive" />}
              <KpiCard
                label="Vencidas"
                value={summary.vencidas ?? 0}
                variant={(summary.vencidas ?? 0) > 0 ? "danger" : "positive"}
                hint={(summary.vencidas ?? 0) > 0 ? "Requieren atención urgente" : "Sin OTs vencidas"}
              />
            </div>
            {total > 0 && (
              <div
                style={{
                  marginBottom: 18,
                  padding: "10px 14px",
                  background: "var(--nx-panel-surface-overlay)",
                  border: "1px solid var(--nx-panel-hairline)",
                  borderRadius: "var(--nx-panel-radius-sm)",
                  boxShadow: "var(--nx-panel-elev-1)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Avance de OTs · 30 días
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: completadoPct >= 80 ? "var(--success)" : "var(--panel-accent, var(--primary))" }}>
                    {completadoPct}% completado
                  </span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: "var(--surface-2)", overflow: "hidden", position: "relative" }}>
                  <div style={{ position: "absolute", height: "100%", width: `${(((summary.completadas ?? 0) + (summary.enProceso ?? 0)) / total) * 100}%`, background: "color-mix(in srgb, var(--panel-accent, var(--primary)) 28%, transparent)", borderRadius: 3 }} />
                  <div style={{ position: "absolute", height: "100%", width: `${completadoPct}%`, background: completadoPct >= 80 ? "var(--success)" : "var(--panel-accent, var(--primary))", borderRadius: 3, transition: "width .35s ease" }} />
                </div>
              </div>
            )}
          </>
        );
      })()}

      <PanelTabs
        ariaLabel="Bandeja de operaciones"
        value={tab}
        onChange={switchTab}
        tabs={[
          { key: "actividades", label: "Bandeja OT" },
          { key: "evidencias", label: "Evidencias" },
        ]}
      />

      {tab === "actividades" && (
        <>
          <OpsTicketRequestQueue />
          <div style={{ marginTop: 16 }}>
            <OpsActivitiesBoard />
          </div>
        </>
      )}

      {tab === "evidencias" && <EvidenceReviewQueue />}
    </>
  );
}
