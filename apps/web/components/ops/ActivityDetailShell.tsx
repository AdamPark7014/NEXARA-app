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
};

const ActivityDetailContext = createContext<Ctx | null>(null);

export function useActivityDetail() {
  const ctx = useContext(ActivityDetailContext);
  if (!ctx) throw new Error("useActivityDetail debe usarse dentro de ActivityDetailShell");
  return ctx;
}

export default function ActivityDetailShell({ id, children }: { id: string; children: ReactNode }) {
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

  const base = `/ops/activities/${id}`;
  const tabs: TabItem[] = useMemo(
    () => [
      { id: "detalle", label: "Detalle", href: base },
      { id: "evidences", label: "Evidencias", href: `${base}/evidences` },
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
    [base],
  );

  const ctx = useMemo(
    () => ({ id: numericId, activity, loading, error, reload: load }),
    [numericId, activity, loading, error, load],
  );

  const title = activity ? `${activity.anNumber} · ${activity.titulo}` : `Actividad #${id}`;
  const backHref = useMemo(() => getActivitiesCanonicalPath(user), [user]);

  return (
    <ActivityDetailContext.Provider value={ctx}>
      <div style={{ padding: "24px 32px", maxWidth: 1200, margin: "0 auto" }}>
        <header style={{ marginBottom: 16 }}>
          <Link href={backHref} style={{ fontSize: 13, color: "var(--text-secondary, #64748b)", textDecoration: "none" }}>
            ← Actividades
          </Link>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "6px 0 0" }}>
            {loading ? `Actividad #${id}` : title}
          </h1>
        </header>
        <TabBar tabs={tabs} />
        <section style={{ marginTop: 8 }}>
          {loading && !activity ? <DetailLoading /> : children}
        </section>
      </div>
    </ActivityDetailContext.Provider>
  );
}
