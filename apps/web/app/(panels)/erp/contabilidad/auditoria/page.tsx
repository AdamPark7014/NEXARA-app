"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import DataTable, { type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";

type AuditRow = {
  id: number;
  entityType: string;
  entityId: number;
  action: string;
  userId?: number | null;
  createdAt: string;
  changes?: unknown;
};

export default function AuditoriaPage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ limit: "50" });
      const res = await fetch(buildApiUrl(`audit?${qs}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setRows(Array.isArray(data) ? data : data?.items ?? data?.data ?? []);
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

  const columns: Column<AuditRow>[] = [
    {
      key: "createdAt",
      label: "Cuándo",
      render: (r) => (r.createdAt ? new Date(r.createdAt).toLocaleString("es-MX") : "—"),
    },
    { key: "entityType", label: "Entidad" },
    { key: "entityId", label: "ID", align: "right", numeric: true },
    { key: "action", label: "Acción" },
    { key: "userId", label: "Usuario", render: (r) => (r.userId != null ? `#${r.userId}` : "—") },
  ];

  return (
    <>
      <PageHeader
        eyebrow="ERP · Contabilidad"
        title="Auditoría financiera"
        subtitle="Trail quién/qué/antes/después desde AuditLog."
        density="ops"
        actions={<Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>Actualizar</Button>}
      />
      {error && (
        <div style={{ color: "var(--danger)", marginBottom: 12, fontSize: 13 }}>
          {error}
          <div style={{ marginTop: 6, color: "var(--text-tertiary)" }}>
            Si falta permiso AUDIT_VIEW, pide acceso a dirección.
          </div>
        </div>
      )}
      {loading ? (
        <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Cargando…</p>
      ) : rows.length === 0 && !error ? (
        <EmptyState title="Sin eventos" description="Aún no hay entradas de auditoría." />
      ) : rows.length > 0 ? (
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} density="compact" />
      ) : null}
    </>
  );
}
