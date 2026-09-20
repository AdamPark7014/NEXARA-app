"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { TabBar, type TabItem } from "@/components/rbac/TabBar";
import { ROLES } from "@/lib/rbac/roles";
import { useUser } from "@/components/UserContext";
import { getActivity, type ActivityDetail } from "@/lib/ops-activities-api";
import { DetailLoading } from "@/components/detail/DetailFrame";
import { getActivitiesCanonicalPath } from "@/lib/section-views";

type Ctx = {
  id: number;
  activity: ActivityDetail | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  /** Montado en Core (/erp/actividades): enlaces y pestañas no salen de /erp. */
  core: boolean;
  hrefs: { detail: string; evidences: string; back: string };
};

const ActivityDetailContext = createContext<Ctx | null>(null);

export function useActivityDetail() {
  const ctx = useContext(ActivityDetailContext);
  if (!ctx) throw new Error("useActivityDetail debe usarse dentro de ActivityDetailShell");
  return ctx;
}

export default function ActivityDetailShell({
  id,
  children,
  core = false,
}: {
  id: string;
  children: ReactNode;
  core?: boolean;
}) {
  const numericId = Number(id);
  const { user } = useUser();
  const token = user?.token ?? "";
  const [activity, setActivity] = useState<ActivityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !numericId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getActivity(token, numericId);
      setActivity(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la actividad");
      setActivity(null);
    } finally {
      setLoading(false);
    }
  }, [token, numericId]);

  useEffect(() => {
    void load();
  }, [load]);

  const base = core ? `/erp/actividades/${id}` : `/ops/activities/${id}`;
  const evidencesHref = core ? `${base}/evidencias` : `${base}/evidences`;
  const tabs: TabItem[] = useMemo(
    () => core
      ? [
          { id: "detalle", label: "Detalle", href: base },
          { id: "evidences", label: "Evidencias", href: evidencesHref },
          { id: "historial", label: "Historial", href: `${base}/historial` },
        ]
      : [
      { id: "detalle", label: "Detalle", href: base },
      { id: "operacion", label: "Operación", href: `${base}/operacion` },
      { id: "evidences", label: "Evidencias", href: evidencesHref },
      { id: "team", label: "Equipo", href: `${base}/team` },
      { id: "materials", label: "Materiales", href: `${base}/materials` },
      {
        id: "viatics",
        label: "Viáticos",
        href: `${base}/viatics`,
        roles: [ROLES.CEO, ROLES.DIR_OPERACIONES, ROLES.DIR_ADMIN, ROLES.COORD_ADMIN, ROLES.ADMINISTRATIVO, ROLES.ING_CAMPO],
      },
      {
        id: "approvals",
        label: "Aprobaciones",
        href: `${base}/approvals`,
        roles: [ROLES.CEO, ROLES.DIR_OPERACIONES, ROLES.DIR_ADMIN, ROLES.COORD_ADMIN, ROLES.COORD_OPERACIONES, ROLES.ARQUITECTO],
      },
      { id: "historial", label: "Historial", href: `${base}/historial` },
    ],
    [base, core, evidencesHref],
  );

  const backHref = useMemo(
    () => (core ? "/erp/pizarra" : getActivitiesCanonicalPath(user)),
    [core, user],
  );

  const ctx = useMemo(
    () => ({
      id: numericId,
      activity,
      loading,
      error,
      reload: load,
      core,
      hrefs: { detail: base, evidences: evidencesHref, back: backHref },
    }),
    [numericId, activity, loading, error, load, core, base, evidencesHref, backHref],
  );

  const title = activity
    ? core
      ? activity.titulo
      : `${activity.anNumber} · ${activity.titulo}`
    : `Actividad #${id}`;

  // El enlace decía «Actividades» también en Core, donde vuelve a la pizarra:
  // una etiqueta que no nombra su destino hace dudar antes de pulsarla.
  const backLabel = core ? "Pizarra" : "Actividades";

  return (
    <ActivityDetailContext.Provider value={ctx}>
      <div style={{ padding: "24px 32px", maxWidth: 1200, margin: "0 auto" }}>
        <header style={{ marginBottom: 12 }}>
          <Link
            href={backHref}
            style={{
              display: "inline-block",
              padding: "2px 0",
              fontSize: 12.5,
              color: "var(--text-secondary)",
              textDecoration: "none",
            }}
          >
            ← {backLabel}
          </Link>
          <h1
            style={{
              fontSize: "clamp(1.2rem, 1rem + 0.7vw, 1.55rem)",
              fontWeight: 650,
              letterSpacing: "-0.015em",
              lineHeight: 1.25,
              margin: "4px 0 0",
              color: "var(--text-primary)",
            }}
          >
            {loading ? `Actividad #${id}` : title}
          </h1>
          {!loading && activity && core && (
            <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--text-tertiary)" }}>
              {activity.anNumber}
            </p>
          )}
        </header>
        <TabBar tabs={tabs} />
        <section style={{ marginTop: 12 }}>
          {loading && !activity ? <DetailLoading /> : children}
        </section>
      </div>
    </ActivityDetailContext.Provider>
  );
}
