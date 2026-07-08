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

/** Formulario completo de OT (asignar ingeniero, cliente, AN, etc.) */
const ActivitiesTable = dynamic(() => import("@/components/ActivitiesTable"), { ssr: false });
/** Revisión de paquetes de evidencia (activity-evidence/review-history) */
const EvidenceTable = dynamic(() => import("@/components/EvidenceTable"), { ssr: false });

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
    if (searchParams.get("tab") === "evidencias") setTab("evidencias");
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

      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 20 }}>
          {summary.abiertas != null && <KpiCard label="Abiertas" value={summary.abiertas} icon="📋" />}
          {summary.enProceso != null && <KpiCard label="En proceso" value={summary.enProceso} icon="⚙️" variant="accent" />}
          {summary.completadas != null && <KpiCard label="Completadas (30d)" value={summary.completadas} icon="✅" variant="positive" />}
          {summary.vencidas != null && summary.vencidas > 0 && (
            <KpiCard label="Vencidas" value={summary.vencidas} icon="⚠️" variant="danger" hint="Requieren atención urgente" />
          )}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--border)", marginBottom: 20 }}>
        <button style={tabStyle(tab === "actividades")} onClick={() => setTab("actividades")}>
          Actividades / OT
        </button>
        <button style={tabStyle(tab === "evidencias")} onClick={() => setTab("evidencias")}>
          Evidencias
        </button>
        {tab === "actividades" && (
          <span style={{ marginLeft: "auto", padding: "0 12px 8px", fontSize: 11, color: "var(--text-tertiary)" }}>
            Asigna OT desde el botón «Nueva actividad» abajo
          </span>
        )}
      </div>

      {tab === "actividades" && <ActivitiesTable />}

      {tab === "evidencias" && (
        <EvidenceTable mode="admin" title={null} />
      )}
    </>
  );
}
