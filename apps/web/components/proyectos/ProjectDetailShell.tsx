"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Alert, Button } from "@/components/base";
import { useUser } from "@/components/UserContext";
import { getSalesProjectSummary, type SalesProjectSummary } from "@/lib/sales-api";
import { DetailLoading } from "@/components/detail/DetailFrame";

type Ctx = {
  id: number;
  summary: SalesProjectSummary | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
};

const ProjectDetailContext = createContext<Ctx | null>(null);

export function useProjectDetail() {
  const ctx = useContext(ProjectDetailContext);
  if (!ctx) throw new Error("useProjectDetail debe usarse dentro de ProjectDetailShell");
  return ctx;
}

export default function ProjectDetailShell({ id, children }: { id: string; children: ReactNode }) {
  const router = useRouter();
  const numericId = Number(id);
  const { user } = useUser();
  const token = user?.token ?? "";
  const [summary, setSummary] = useState<SalesProjectSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !numericId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getSalesProjectSummary(token, numericId);
      setSummary(data);
      if (data.operational?.id) router.replace(`/erp/proyectos/${data.operational.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el proyecto");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [token, numericId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const title = summary?.project?.name ?? `Proyecto #${id}`;
  const ctx = useMemo(() => ({ id: numericId, summary, loading, error, reload: load }), [numericId, summary, loading, error, load]);

  return (
    <ProjectDetailContext.Provider value={ctx}>
      <div style={{ padding: "24px 32px", maxWidth: 1200, margin: "0 auto" }}>
        <header style={{ marginBottom: 16 }}>
          <Link href="/erp/proyectos" style={{ fontSize: 13, color: "var(--text-secondary, #64748b)", textDecoration: "none" }}>
            ‹ Proyectos
          </Link>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "6px 0 0" }}>{loading ? `Proyecto #${id}` : title}</h1>
        </header>
        {error ? <Alert tone="danger" role="alert">{error}<Button onClick={() => void load()}>Reintentar</Button></Alert> : <DetailLoading />}
      </div>
    </ProjectDetailContext.Provider>
  );
}
