"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import DataTable, { Money, type Column } from "@/components/ui/DataTable";
import FilterToolbar from "@/components/FilterToolbar";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";

type Movement = {
  id: string;
  date: string;
  kind: "INGRESO" | "EGRESO" | "PAGO";
  ref: string;
  party: string;
  amount: number;
  status: string;
};

async function apiFetch(path: string, token: string) {
  const res = await fetch(buildApiUrl(path), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function MovimientosPage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const [rows, setRows] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const inv = await apiFetch("accounting/invoices?limit=100", token);
      const invoices = Array.isArray(inv) ? inv : inv?.items ?? [];
      const mapped: Movement[] = invoices.map((r: any) => {
        const isAr = r.type === "ACCOUNTS_RECEIVABLE" || r.type === "INCOME";
        return {
          id: `inv-${r.id}`,
          date: r.issueDate,
          kind: isAr ? "INGRESO" : "EGRESO",
          ref: r.invoiceNumber || `#${r.id}`,
          party: r.receptorName || r.emisorName || "—",
          amount: Number(r.totalAmount || 0),
          status: r.status,
        };
      });
      setRows(mapped.sort((a, b) => String(b.date).localeCompare(String(a.date))));
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
    return rows.filter((r) => {
      if (kind && r.kind !== kind) return false;
      const needle = q.trim().toLowerCase();
      if (!needle) return true;
      return [r.ref, r.party, r.status, r.kind].some((v) => v.toLowerCase().includes(needle));
    });
  }, [rows, q, kind]);

  const columns: Column<Movement>[] = [
    { key: "date", label: "Fecha", render: (r) => (r.date ? new Date(r.date).toLocaleDateString("es-MX") : "—") },
    {
      key: "kind",
      label: "Tipo",
      render: (r) => (
        <span style={{ fontSize: 12.5, fontWeight: 600, color: r.kind === "INGRESO" ? "var(--success)" : "var(--text-secondary)" }}>
          {r.kind === "INGRESO" ? "Ingreso" : r.kind === "EGRESO" ? "Egreso" : "Pago"}
        </span>
      ),
    },
    { key: "ref", label: "Referencia", render: (r) => r.ref },
    { key: "party", label: "Contraparte", render: (r) => r.party },
    { key: "amount", label: "Monto", align: "right", numeric: true, render: (r) => <Money value={r.amount} /> },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Contabilidad"
        title="Movimientos"
        subtitle="Ingresos y egresos del periodo. Registra uno nuevo desde facturación."
        density="ops"
        actions={
          <>
            <Link
              href="/erp/invoicing"
              style={{
                fontSize: 12,
                fontWeight: 700,
                padding: "6px 12px",
                borderRadius: 8,
                background: "var(--primary)",
                color: "#fff",
                textDecoration: "none",
              }}
            >
              Registrar movimiento
            </Link>
            <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>Actualizar</Button>
          </>
        }
      />
      <div style={{ marginBottom: 12 }}>
        <FilterToolbar
          search={{ value: q, onChange: setQ, placeholder: "Buscar…" }}
          selects={[
            {
              label: "Tipo",
              value: kind,
              onChange: setKind,
              options: [
                { value: "", label: "Todos" },
                { value: "INGRESO", label: "Ingresos" },
                { value: "EGRESO", label: "Egresos" },
              ],
            },
          ]}
          resultCount={filtered.length}
        />
      </div>
      {error && <div style={{ color: "var(--danger)", marginBottom: 12, fontSize: 13 }}>{error}</div>}
      {loading ? (
        <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Cargando…</p>
      ) : filtered.length === 0 ? (
        <EmptyState title="Sin movimientos" description="Cuando haya facturas, verás ingresos y egresos aquí." />
      ) : (
        <DataTable columns={columns} rows={filtered} rowKey={(r) => r.id} density="compact" />
      )}
    </>
  );
}
