"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import InlineAlert from "@/components/ui/InlineAlert";
import { DetailError } from "@/components/detail/DetailFrame";
import Customer360Dashboard, { buildClient360Timeline } from "@/components/crm/Customer360Dashboard";
import { useClientDetail } from "@/components/crm/ClientDetailShell";
import { useUser } from "@/components/UserContext";
import { fetchSalesClientSnapshot, type ClientSnapshot } from "@/lib/client-snapshot-api";
import { provisionSalesServiceClient } from "@/lib/sales-api";

export default function Client360OverviewPage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const { client, error: clientError, reload: reloadClient } = useClientDetail();
  const [snapshot, setSnapshot] = useState<ClientSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !client?.id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSalesClientSnapshot(token, client.id);
      setSnapshot(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la vista 360°");
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, [token, client?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const timeline = useMemo(() => (snapshot ? buildClient360Timeline(snapshot) : []), [snapshot]);

  const provision = async () => {
    if (!token || !client) return;
    try {
      await provisionSalesServiceClient(token, client.id);
      reloadClient();
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo activar en operación");
    }
  };

  if (clientError) return <DetailError message={clientError} onRetry={reloadClient} />;
  if (!client) return null;

  return (
    <>
      {!client.serviceClientId && (
        <div style={{ marginBottom: 14 }}>
          <InlineAlert
            message="Este cliente aún no está vinculado a operaciones. Actívalo para ver actividades, tickets y contratos en la vista 360°."
            variant="info"
          />
          <Button size="sm" variant="secondary" onClick={() => void provision()} style={{ marginTop: 8 }}>
            Activar en operación
          </Button>
        </div>
      )}

      {loading && (
        <EmptyState icon="⏳" title="Cargando vista 360°…" description="Agregando ventas, operación y finanzas." />
      )}

      {!loading && error && <DetailError message={error} onRetry={() => void load()} />}

      {!loading && !error && snapshot && (
        <Customer360Dashboard client={client} snapshot={snapshot} timeline={timeline} />
      )}
    </>
  );
}
