"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { TabBar, type TabItem } from "@/components/rbac/TabBar";
import { useUser } from "@/components/UserContext";
import {
  formatOpportunityStage,
  getSalesOpportunity,
  isHotOpportunityStage,
  type SalesOpportunity,
} from "@/lib/sales-api";
import { DetailLoading } from "@/components/detail/DetailFrame";
import { Money, Tag } from "@/components/ui/DataTable";
import chrome from "@/components/crm/crm-chrome.module.css";

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

  const stageVariant =
    opportunity?.stage === "WON"
      ? "positive"
      : opportunity?.stage === "LOST"
        ? "danger"
        : isHotOpportunityStage(opportunity?.stage)
          ? "accent"
          : "warning";

  return (
    <OpportunityDetailContext.Provider value={ctx}>
      <div className={chrome.detailShell}>
        <header style={{ marginBottom: 14 }}>
          <Link href="/crm/opportunities" className={chrome.detailBack}>
            ← Oportunidades
          </Link>
          <h1 className={chrome.detailTitle}>
            {loading ? `Oportunidad #${id}` : opportunity?.title ?? `Oportunidad #${id}`}
          </h1>
          {!loading && opportunity && (
            <div className={chrome.detailMeta}>
              <Tag variant={stageVariant}>{formatOpportunityStage(opportunity.stage)}</Tag>
              <span className={`${chrome.metaChip} ${chrome.metaChipStrong}`}>
                <Money value={Number(opportunity.value ?? 0)} />
              </span>
              {opportunity.probability != null && (
                <span className={chrome.metaChip}>{opportunity.probability}% prob.</span>
              )}
              {(opportunity.client?.name ?? opportunity.clientName) && (
                <span className={chrome.metaChip}>
                  {opportunity.client?.name ?? opportunity.clientName}
                </span>
              )}
            </div>
          )}
        </header>
        <TabBar tabs={tabs} />
        <section style={{ marginTop: 8 }}>
          {loading && !opportunity ? <DetailLoading /> : children}
        </section>
      </div>
    </OpportunityDetailContext.Provider>
  );
}
