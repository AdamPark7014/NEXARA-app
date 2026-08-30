"use client";

import { useCallback, useEffect, useState } from "react";
import {
  IgBtn,
  IgError,
  IgPage,
  IgPanel,
  IgTable,
  IgToolbar,
} from "../_Console";
import { integraApi } from "../_lib";

type AuditRow = {
  id: number;
  action: string;
  entityId?: string | null;
  createdAt: string;
  userEmail?: string | null;
  userName?: string | null;
  changes?: unknown;
};

export default function IntegraAuditPage() {
  const [items, setItems] = useState<AuditRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await integraApi<{ items: AuditRow[] }>("integra/audit?limit=100");
      setItems(data.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("es-MX", { hour12: false });

  return (
    <IgPage>
      <IgToolbar
        title="Auditoría"
        meta={`${items.length} mutaciones`}
        actions={
          <IgBtn onClick={() => void load()} disabled={busy}>
            Actualizar
          </IgBtn>
        }
      />
      <IgError>{error}</IgError>
      <IgPanel title="Bitácora Integra">
        <IgTable
          columns={[
            { key: "t", label: "Cuando", width: "150px" },
            { key: "a", label: "Acción" },
            { key: "u", label: "Usuario", width: "160px" },
            { key: "d", label: "Detalle" },
          ]}
          rows={items.map((r) => ({
            key: String(r.id),
            cells: {
              t: fmt(r.createdAt),
              a: r.action,
              u: r.userName || r.userEmail || "—",
              d: r.changes ? JSON.stringify(r.changes).slice(0, 120) : r.entityId || "—",
            },
          }))}
          empty="Sin entradas de auditoría"
        />
      </IgPanel>
    </IgPage>
  );
}
