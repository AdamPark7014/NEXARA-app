"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { TabBar, type TabItem } from "@/components/rbac/TabBar";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { DetailLoading } from "@/components/detail/DetailFrame";
import { formatOperationalProjectStatus, getOperationalProject, type OperationalProject } from "@/lib/ops-operational-api";

type Ctx = {
  id: number;
  project: OperationalProject | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
};

const OpsProjectDetailContext = createContext<Ctx | null>(null);

export function useOpsProjectDetail() {
  const ctx = useContext(OpsProjectDetailContext);
  if (!ctx) throw new Error("useOpsProjectDetail debe usarse dentro de OpsProjectDetailShell");
  return ctx;
}

export default function OpsProjectDetailShell({ id, children }: { id: string; children: ReactNode }) {
  const numericId = Number(id);
  const { user } = useUser();
  const token = user?.token ?? "";
  const [project, setProject] = useState<OperationalProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !numericId) return;
    setLoading(true);
    setError(null);
    try {
      setProject(await getOperationalProject(token, numericId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el proyecto");
      setProject(null);
    } finally {
      setLoading(false);
    }
  }, [token, numericId]);

  useEffect(() => {
    void load();
  }, [load]);

  const base = `/ops/projects/${id}`;
  const tabs: TabItem[] = useMemo(
    () => [
      { id: "resumen", label: "Resumen", href: base },
      { id: "actividades", label: "Actividades", href: `${base}/actividades` },
    ],
    [base],
  );

  const ctx = useMemo(() => ({ id: numericId, project, loading, error, reload: load }), [numericId, project, loading, error, load]);

  return (
    <OpsProjectDetailContext.Provider value={ctx}>
      <div style={{ padding: "24px 32px", maxWidth: 1200, margin: "0 auto" }}>
        <header style={{ marginBottom: 16 }}>
          <Link href="/ops/projects" style={{ fontSize: 13, color: "var(--text-secondary)", textDecoration: "none" }}>
            ← Proyectos operativos
          </Link>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginTop: 6 }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{loading && !project ? `Proyecto #${id}` : (project?.title ?? `Proyecto #${id}`)}</h1>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>{project?.client?.name ?? "Detalle de ejecución en campo"}</p>
              {project && (
                <div style={{ marginTop: 8 }}>
                  <Tag variant={project.status === "ACTIVE" ? "accent" : project.status === "COMPLETED" ? "neutral" : "warning"}>
                    {formatOperationalProjectStatus(project.status)}
                  </Tag>
                </div>
              )}
            </div>
            <Button variant="ghost" onClick={() => void load()}>Actualizar</Button>
          </div>
        </header>
        <TabBar tabs={tabs} />
        <section style={{ marginTop: 8 }}>{loading && !project ? <DetailLoading /> : children}</section>
      </div>
    </OpsProjectDetailContext.Provider>
  );
}
