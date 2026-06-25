"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { TabBar, type TabItem } from "@/components/rbac/TabBar";
import { ROLES } from "@/lib/rbac";
import { useUser } from "@/components/UserContext";
import { getSalesClient, type SalesClient } from "@/lib/sales-api";
import { DetailLoading } from "@/components/detail/DetailFrame";

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
      { id: "datos", label: "Datos", href: base },
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
      <div style={{ padding: "24px 32px", maxWidth: 1200, margin: "0 auto" }}>
        <header style={{ marginBottom: 16 }}>
          <Link href="/crm/clients" style={{ fontSize: 13, color: "var(--text-secondary, #64748b)", textDecoration: "none" }}>
            ← Clientes
          </Link>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "6px 0 0" }}>
            {loading ? `Cliente #${id}` : title}
          </h1>
        </header>
        <TabBar tabs={tabs} />
        <section style={{ marginTop: 8 }}>
          {loading && !client ? <DetailLoading /> : children}
        </section>
      </div>
    </ClientDetailContext.Provider>
  );
}
