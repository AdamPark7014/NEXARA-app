"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import DataTable, { Money, Tag, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";

type ProjectRow = {
  projectKey: string;
  projectId: number | null;
  label: string;
  income: number;
  expense: number;
  linked: boolean;
};

export default function ContabilidadProyectosPage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const [rows, setRows] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(buildApiUrl("accounting/invoices?limit=200"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const invoices = Array.isArray(data) ? data : data?.items ?? [];
      const map = new Map<string, ProjectRow>();
      for (const inv of invoices) {
        const pid = inv.projectId ?? null;
        const key = pid != null ? `p-${pid}` : "unlinked";
        const cur = map.get(key) ?? {
          projectKey: key,
          projectId: pid,
          label: pid != null ? `Proyecto #${pid}` : "Sin vínculo a proyecto",
          income: 0,
          expense: 0,
          linked: pid != null,
        };
        const amt = Number(inv.totalAmount || 0);
        const isAr = inv.type === "ACCOUNTS_RECEIVABLE" || inv.type === "INCOME";
        if (isAr) cur.income += amt;
        else cur.expense += amt;
        map.set(key, cur);
      }
      setRows(Array.from(map.values()).sort((a, b) => Number(b.linked) - Number(a.linked)));
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

  const columns: Column<ProjectRow>[] = useMemo(
    () => [
      {
        key: "label",
        label: "Proyecto",
        render: (r) => (
          <span>
            {r.label}{" "}
            {!r.linked && <Tag variant="warning">sin vínculo</Tag>}
          </span>
        ),
      },
      { key: "income", label: "Ingresos", align: "right", numeric: true, render: (r) => <Money value={r.income} /> },
      { key: "expense", label: "Costos", align: "right", numeric: true, render: (r) => <Money value={r.expense} /> },
      {
        key: "pl",
        label: "P&L",
        align: "right",
        numeric: true,
        render: (r) => <Money value={r.income - r.expense} />,
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        eyebrow="ERP · Contabilidad"
        title="P&L por proyecto"
        subtitle="Solo métricas con datos reales de facturas. Sin projectId → «sin vínculo»."
        density="ops"
        actions={<Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>Actualizar</Button>}
      />
      {error && <div style={{ color: "var(--danger)", marginBottom: 12, fontSize: 13 }}>{error}</div>}
      {loading ? (
        <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Cargando…</p>
      ) : rows.length === 0 ? (
        <EmptyState title="Sin datos" description="No hay facturas para agrupar por proyecto." />
      ) : (
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.projectKey} density="compact" />
      )}
    </>
  );
}
