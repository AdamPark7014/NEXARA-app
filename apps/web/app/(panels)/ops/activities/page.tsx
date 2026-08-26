"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
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

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "8px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer",
    border: "none", borderBottom: active ? "2px solid var(--primary)" : "2px solid transparent",
    background: "transparent", color: active ? "var(--primary)" : "var(--text-secondary)",
    fontFamily: "inherit",
  });

  if (cfg.viewMode === "execute") return null;

  return (
    <>
      <PageHeader
        eyebrow="OPS · Campo"
        title={cfg.title}
        subtitle={cfg.subtitle}
      />

      {summary && (() => {
        const total = (summary.abiertas ?? 0) + (summary.enProceso ?? 0) + (summary.completadas ?? 0);
        const completadoPct = total > 0 ? Math.round(((summary.completadas ?? 0) / total) * 100) : 0;
        return (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 14 }}>
              {summary.abiertas != null && <KpiCard label="Abiertas" value={summary.abiertas} icon="📋" />}
              {summary.enProceso != null && <KpiCard label="En proceso" value={summary.enProceso} icon="⚙️" variant="accent" />}
              {summary.completadas != null && <KpiCard label="Completadas (30d)" value={summary.completadas} icon="✅" variant="positive" />}
              <KpiCard label="Vencidas" value={summary.vencidas ?? 0} icon="⚠️" variant={(summary.vencidas ?? 0) > 0 ? "danger" : "positive"} hint={(summary.vencidas ?? 0) > 0 ? "Requieren atención urgente" : "Sin OTs vencidas"} />
            </div>
            {total > 0 && (
              <div style={{ marginBottom: 20, padding: "10px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Avance de OTs (30 días)</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: completadoPct >= 80 ? "var(--success)" : "var(--primary)" }}>{completadoPct}% completado</span>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: "var(--surface)", overflow: "hidden", position: "relative" }}>
                  <div style={{ position: "absolute", height: "100%", width: `${((( summary.completadas ?? 0) + (summary.enProceso ?? 0)) / total) * 100}%`, background: "color-mix(in srgb, var(--primary) 35%, transparent)", borderRadius: 4 }} />
                  <div style={{ position: "absolute", height: "100%", width: `${completadoPct}%`, background: completadoPct >= 80 ? "var(--success)" : "var(--primary)", borderRadius: 4, transition: "width .4s" }} />
                </div>
              </div>
            )}
          </>
        );
      })()}

      <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--border)", marginBottom: 20 }}>
        <button style={tabStyle(tab === "actividades")} onClick={() => setTab("actividades")}>
          Bandeja OT
        </button>
        <button style={tabStyle(tab === "evidencias")} onClick={() => setTab("evidencias")}>
          Evidencias
        </button>
      </div>

      {tab === "actividades" && (
        <>
          <OpsTicketRequestQueue />
          <div style={{ marginTop: 20 }}>
            <OpsActivitiesBoard />
          </div>
        </>
      )}

      {tab === "evidencias" && <EvidenceReviewQueue />}
    </>
  );
}
