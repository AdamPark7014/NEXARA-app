"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { TabBar, type TabItem } from "@/components/rbac/TabBar";
import { ROLES } from "@/lib/rbac";
import { useUser } from "@/components/UserContext";
import { getSalesClient, type SalesClient } from "@/lib/sales-api";
import { DetailLoading } from "@/components/detail/DetailFrame";
import { Tag } from "@/components/ui/DataTable";
import chrome from "@/components/crm/crm-chrome.module.css";

type ClientDetail = SalesClient & {
  opportunities?: Array<{ id: number; title: string; stage: string; value: number | string }>;
};

type Ctx = {
  id: number;
  client: ClientDetail | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
};

const ClientDetailContext = createContext<Ctx | null>(null);

export function useClientDetail() {
  const ctx = useContext(ClientDetailContext);
  if (!ctx) throw new Error("useClientDetail debe usarse dentro de ClientDetailShell");
  return ctx;
}

export default function ClientDetailShell({ id, children }: { id: string; children: ReactNode }) {
  const numericId = Number(id);
  const { user } = useUser();
  const token = user?.token ?? "";
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !numericId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getSalesClient(token, numericId);
      setClient(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el cliente");
      setClient(null);
    } finally {
      setLoading(false);
    }
  }, [token, numericId]);

  useEffect(() => {
    void load();
  }, [load]);

  const base = `/crm/clients/${id}`;
  const tabs: TabItem[] = useMemo(
    () => [
      { id: "resumen", label: "Resumen 360", href: base },
      { id: "datos", label: "Datos", href: `${base}/datos` },
      { id: "sucursales", label: "Sucursales", href: `${base}/sucursales` },
      { id: "servicios", label: "Servicios", href: `${base}/servicios` },
      { id: "tickets", label: "Tickets", href: `${base}/tickets` },
      { id: "quotes", label: "Cotizaciones", href: `${base}/quotes` },
      {
        id: "facturas",
        label: "Facturas",
        href: `${base}/facturas`,
        roles: [ROLES.CEO, ROLES.DIR_ADMIN, ROLES.COORD_ADMIN, ROLES.CONTABILIDAD],
      },
    ],
    [base],
  );

  const ctx = useMemo(
    () => ({ id: numericId, client, loading, error, reload: load }),
    [numericId, client, loading, error, load],
  );

  const title = client?.legalName?.trim() || client?.name || `Cliente #${id}`;

  return (
    <ClientDetailContext.Provider value={ctx}>
      <div className={chrome.detailShell}>
        <header style={{ marginBottom: 14 }}>
          <Link href="/crm/clients" className={chrome.detailBack}>
            ← Clientes
          </Link>
          <h1 className={chrome.detailTitle}>
            {loading ? `Cliente #${id}` : title}
          </h1>
          {!loading && client && (
            <div className={chrome.detailMeta}>
              {client.status && (
                <Tag variant={client.status === "Activo" ? "accent" : client.status === "Prospecto" ? "warning" : "neutral"}>
                  {client.status}
                </Tag>
              )}
              {client.industry && <span className={chrome.metaChip}>{client.industry}</span>}
              {client.taxId && <span className={chrome.metaChip}>{client.taxId}</span>}
              {client.serviceClientId ? (
                <span className={`${chrome.metaChip} ${chrome.metaChipStrong}`}>OPS vinculado</span>
              ) : (
                <span className={chrome.metaChip}>Solo CRM</span>
              )}
            </div>
          )}
        </header>
        <TabBar tabs={tabs} />
        <section style={{ marginTop: 8 }}>
          {loading && !client ? <DetailLoading /> : children}
        </section>
      </div>
    </ClientDetailContext.Provider>
  );
}
