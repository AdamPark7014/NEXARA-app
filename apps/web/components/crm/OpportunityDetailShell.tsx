"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { TabBar, type TabItem } from "@/components/rbac/TabBar";
import { useUser } from "@/components/UserContext";
import { getSalesOpportunity, type SalesOpportunity } from "@/lib/sales-api";
import { DetailLoading } from "@/components/detail/DetailFrame";

type Ctx = {
  id: number;
  opportunity: SalesOpportunity | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
};

const OpportunityDetailContext = createContext<Ctx | null>(null);

export function useOpportunityDetail() {
  const ctx = useContext(OpportunityDetailContext);
  if (!ctx) throw new Error("useOpportunityDetail debe usarse dentro de OpportunityDetailShell");
  return ctx;
}

export default function OpportunityDetailShell({ id, children }: { id: string; children: ReactNode }) {
  const numericId = Number(id);
  const { user } = useUser();
  const token = user?.token ?? "";
  const [opportunity, setOpportunity] = useState<SalesOpportunity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !numericId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getSalesOpportunity(token, numericId);
      setOpportunity(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la oportunidad");
      setOpportunity(null);
    } finally {
      setLoading(false);
    }
  }, [token, numericId]);

  useEffect(() => {
    void load();
  }, [load]);

  const base = `/crm/opportunities/${id}`;
  const tabs: TabItem[] = useMemo(
    () => [
      { id: "detalle", label: "Detalle", href: base },
      { id: "notas", label: "Notas", href: `${base}/notas` },
      { id: "quotes", label: "Cotizaciones", href: `${base}/quotes` },
      { id: "adjuntos", label: "Adjuntos", href: `${base}/adjuntos` },
      { id: "historial", label: "Historial", href: `${base}/historial` },
    ],
    [base],
  );

  const ctx = useMemo(
    () => ({ id: numericId, opportunity, loading, error, reload: load }),
    [numericId, opportunity, loading, error, load],
  );

  return (
    <OpportunityDetailContext.Provider value={ctx}>
      <div style={{ padding: "24px 32px", maxWidth: 1200, margin: "0 auto" }}>
        <header style={{ marginBottom: 16 }}>
          <Link href="/crm/opportunities" style={{ fontSize: 13, color: "var(--text-secondary, #64748b)", textDecoration: "none" }}>
            ← Oportunidades
          </Link>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "6px 0 0" }}>
            {loading ? `Oportunidad #${id}` : opportunity?.title ?? `Oportunidad #${id}`}
          </h1>
        </header>
        <TabBar tabs={tabs} />
        <section style={{ marginTop: 8 }}>
          {loading && !opportunity ? <DetailLoading /> : children}
        </section>
      </div>
    </OpportunityDetailContext.Provider>
  );
}
