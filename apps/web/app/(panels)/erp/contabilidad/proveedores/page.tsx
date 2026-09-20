"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import DataTable, { Money, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import FilterToolbar from "@/components/FilterToolbar";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";

type VendorRow = {
  key: string;
  name: string;
  invoiceCount: number;
  total: number;
  paid: number;
  pending: number;
};

export default function ProveedoresPage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const [rows, setRows] = useState<VendorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(buildApiUrl("accounting/invoices?type=ACCOUNTS_PAYABLE&limit=200"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const invoices = Array.isArray(data) ? data : data?.items ?? [];
      const map = new Map<string, VendorRow>();
      for (const inv of invoices) {
        const name = inv.receptorName || inv.emisorName || "Sin nombre";
        const key = name.toLowerCase();
        const cur = map.get(key) ?? { key, name, invoiceCount: 0, total: 0, paid: 0, pending: 0 };
        const total = Number(inv.totalAmount || 0);
        const paid = Number(inv.paidAmount || 0);
        cur.invoiceCount += 1;
        cur.total += total;
        cur.paid += paid;
        cur.pending += total - paid;
        map.set(key, cur);
      }
      setRows(Array.from(map.values()).sort((a, b) => b.pending - a.pending));
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

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(needle));
  }, [rows, q]);

  const columns: Column<VendorRow>[] = [
    { key: "name", label: "Proveedor" },
    { key: "invoiceCount", label: "Facturas", align: "right", numeric: true },
    { key: "total", label: "Total", align: "right", numeric: true, render: (r) => <Money value={r.total} /> },
    { key: "paid", label: "Pagado", align: "right", numeric: true, render: (r) => <Money value={r.paid} /> },
    { key: "pending", label: "Saldo", align: "right", numeric: true, render: (r) => <Money value={r.pending} /> },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Contabilidad"
        title="Proveedores"
        subtitle="A quién le debes y cuánto."
        density="ops"
        actions={<Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>Actualizar</Button>}
      />
      <div style={{ marginBottom: 12 }}>
        <FilterToolbar search={{ value: q, onChange: setQ, placeholder: "Buscar proveedor…" }} resultCount={filtered.length} />
      </div>
      {error && <div style={{ color: "var(--danger)", marginBottom: 12, fontSize: 13 }}>{error}</div>}
      {loading ? (
        <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Cargando…</p>
      ) : filtered.length === 0 ? (
        <EmptyState title="Sin proveedores" description="No hay facturas de egreso." />
      ) : (
        <DataTable columns={columns} rows={filtered} rowKey={(r) => r.key} density="compact" />
      )}
    </>
  );
}
