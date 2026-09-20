"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import DataTable, { Money, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";

type BudgetRow = {
  id: number;
  name: string;
  year: number;
  month?: number | null;
  plannedAmount: number | string;
  actualAmount: number | string;
  costCenter?: { name?: string } | null;
};

export default function PresupuestosPage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const [rows, setRows] = useState<BudgetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(buildApiUrl("accounting/budgets"), {
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

  const columns: Column<BudgetRow>[] = [
    { key: "name", label: "Presupuesto" },
    { key: "cc", label: "Centro", render: (r) => r.costCenter?.name || "—" },
    { key: "period", label: "Periodo", render: (r) => `${r.year}${r.month ? `-${String(r.month).padStart(2, "0")}` : ""}` },
    {
      key: "planned",
      label: "Plan",
      align: "right",
      numeric: true,
      render: (r) => <Money value={Number(r.plannedAmount || 0)} />,
    },
    {
      key: "actual",
      label: "Real",
      align: "right",
      numeric: true,
      render: (r) => <Money value={Number(r.actualAmount || 0)} />,
    },
    {
      key: "var",
      label: "Variación",
      align: "right",
      numeric: true,
      render: (r) => {
        const v = Number(r.plannedAmount || 0) - Number(r.actualAmount || 0);
        return <Money value={v} />;
      },
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Contabilidad"
        title="Presupuestos"
        subtitle="Plan vs real por centro de costo."
        density="ops"
        actions={<Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>Actualizar</Button>}
      />
      {error && <div style={{ color: "var(--danger)", marginBottom: 12, fontSize: 13 }}>{error}</div>}
      {loading ? (
        <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Cargando…</p>
      ) : rows.length === 0 ? (
        <EmptyState title="Sin presupuestos" description="Crea presupuestos desde Contabilidad general." />
      ) : (
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} density="compact" />
      )}
    </>
  );
}
