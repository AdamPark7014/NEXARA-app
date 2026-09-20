"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
import { toast } from "@/components/Toast";

type Period = {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  isClosed: boolean;
  closedAt?: string | null;
};

export default function CierresPage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const [rows, setRows] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(buildApiUrl("accounting/accounts/fiscal-periods"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setRows(Array.isArray(data) ? data : data?.items ?? []);
    } catch (e) {
      setError(formatApiError(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function closePeriod(id: number) {
    if (!window.confirm("¿Cerrar este periodo fiscal? Bloqueará pólizas nuevas en el rango.")) return;
    setBusyId(id);
    try {
      const res = await fetch(buildApiUrl(`accounting/accounts/fiscal-periods/${id}/close`), {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Periodo cerrado");
      await load();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setBusyId(null);
    }
  }

  const columns: Column<Period>[] = [
    { key: "name", label: "Periodo" },
    {
      key: "range",
      label: "Rango",
      render: (r) =>
        `${r.startDate ? new Date(r.startDate).toLocaleDateString("es-MX") : "—"} → ${
          r.endDate ? new Date(r.endDate).toLocaleDateString("es-MX") : "—"
        }`,
    },
    {
      key: "status",
      label: "Estado",
      render: (r) => (
        <Tag variant={r.isClosed ? "neutral" : "positive"}>{r.isClosed ? "Cerrado" : "Abierto"}</Tag>
      ),
    },
    {
      key: "actions",
      label: "Checklist",
      render: (r) =>
        r.isClosed ? (
          <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
            {r.closedAt ? new Date(r.closedAt).toLocaleString("es-MX") : "—"}
          </span>
        ) : (
          <Button size="sm" variant="secondary" disabled={busyId === r.id} onClick={() => void closePeriod(r.id)}>
            Cerrar periodo
          </Button>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="ERP · Contabilidad"
        title="Cierres fiscales"
        subtitle="Checklist sobre FiscalPeriod. Al cerrar, el service bloquea journal del periodo."
        density="ops"
        actions={<Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>Actualizar</Button>}
      />
      <ul style={{ margin: "0 0 14px", paddingLeft: 18, fontSize: 13, color: "var(--text-secondary)", display: "grid", gap: 4 }}>
        <li>Revisar CxC/CxP vencidas en el hub</li>
        <li>Conciliar movimientos bancarios pendientes</li>
        <li>Confirmar prenómina del periodo</li>
        <li>Cerrar periodo → lock de pólizas</li>
      </ul>
      {error && <div style={{ color: "var(--danger)", marginBottom: 12, fontSize: 13 }}>{error}</div>}
      {loading ? (
        <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Cargando…</p>
      ) : rows.length === 0 ? (
        <EmptyState title="Sin periodos" description="Crea periodos desde Contabilidad general." />
      ) : (
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} density="compact" />
      )}
    </>
  );
}
