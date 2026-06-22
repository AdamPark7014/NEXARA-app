"use client";

import { useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { useRbacGuard } from "@/lib/useRbacGuard";
import { buildApiUrl } from "@/lib/api-base";

interface Viatic {
  id: number;
  concepto?: string;
  monto?: number;
  estado?: string;
  fecha?: string;
  tipo?: string;
  user?: { nombre?: string };
  activity?: { anNumber?: string };
}

const ESTADOS = ["PENDIENTE_COORD", "PENDIENTE_ADMIN", "APROBADO", "RECHAZADO"];

async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function OpsViaticsPage() {
  const { user } = useUser();
  const { canApprove } = useRbacGuard();
  const token = user?.token ?? "";

  const [items, setItems] = useState<Viatic[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch("viatics", token);
      setItems(Array.isArray(data) ? data : (data.data ?? []));
    } catch { /* skip */ } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const patchEstado = async (id: number, estado: string) => {
    if (!token) return;
    try {
      await apiFetch(`viatics/${id}`, token, { method: "PATCH", body: JSON.stringify({ estado }) });
      setItems(prev => prev.map(v => v.id === id ? { ...v, estado } : v));
    } catch { /* skip */ }
  };

  const pendientes = items.filter(v => v.estado?.startsWith("PENDIENTE")).length;
  const totalAprobado = items.filter(v => v.estado === "APROBADO").reduce((s, v) => s + (v.monto ?? 0), 0);
  const totalPendiente = items.filter(v => v.estado?.startsWith("PENDIENTE")).reduce((s, v) => s + (v.monto ?? 0), 0);

  const columns: Column<Viatic>[] = [
    { key: "id", label: "ID", render: v => <Tag variant="accent">V-{v.id}</Tag>, width: 80 },
    { key: "user", label: "Ingeniero", accessor: v => v.user?.nombre ?? "—", width: 140 },
    { key: "activity", label: "OT", accessor: v => v.activity?.anNumber ?? "—", width: 100 },
    { key: "concepto", label: "Concepto", render: v => <span style={{ fontSize: 13 }}>{v.concepto ?? "—"}</span> },
    { key: "monto", label: "Monto", render: v => <Money value={v.monto ?? 0} />, width: 110 },
    { key: "fecha", label: "Fecha", accessor: v => v.fecha ? new Date(v.fecha).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) : "—", width: 90 },
    { key: "estado", label: "Estado", render: v => (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Tag variant={v.estado === "APROBADO" ? "neutral" : v.estado === "RECHAZADO" ? "danger" : "warning"}>
          {(v.estado ?? "—").replace(/_/g, " ")}
        </Tag>
        {v.estado === "PENDIENTE_COORD" && canApprove && (
          <>
            <button onClick={() => patchEstado(v.id, "PENDIENTE_ADMIN")} style={{ fontSize: 11, background: "#1F5F4E", color: "#fff", border: "none", borderRadius: 4, padding: "2px 7px", cursor: "pointer" }}>✓ Coord</button>
            <button onClick={() => patchEstado(v.id, "RECHAZADO")} style={{ fontSize: 11, background: "var(--danger)", color: "#fff", border: "none", borderRadius: 4, padding: "2px 7px", cursor: "pointer" }}>✕</button>
          </>
        )}
        {v.estado === "PENDIENTE_ADMIN" && canApprove && (
          <>
            <button onClick={() => patchEstado(v.id, "APROBADO")} style={{ fontSize: 11, background: "#1F5F4E", color: "#fff", border: "none", borderRadius: 4, padding: "2px 7px", cursor: "pointer" }}>✓ Admin</button>
            <button onClick={() => patchEstado(v.id, "RECHAZADO")} style={{ fontSize: 11, background: "var(--danger)", color: "#fff", border: "none", borderRadius: 4, padding: "2px 7px", cursor: "pointer" }}>✕</button>
          </>
        )}
      </div>
    ), width: 240 },
  ];

  return (
    <>
      <PageHeader
        eyebrow="OPS · Finanzas campo"
        title="Viáticos"
        subtitle="Gastos de campo: gasolina, casetas, comida, hospedaje. Aprobación de coordinador → administración."
        actions={<Button variant="ghost" onClick={load}>Actualizar</Button>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 20 }}>
        <KpiCard label="Pendientes" value={pendientes} />
        <KpiCard label="Por aprobar ($)" value={`$${(totalPendiente / 1000).toFixed(0)}k`} />
        <KpiCard label="Aprobado ($)" value={`$${(totalAprobado / 1000).toFixed(0)}k`} />
      </div>

      <Section title={loading ? "Cargando…" : `${items.length} viáticos`}>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
        ) : (
          <DataTable columns={columns} rows={items} rowKey={v => v.id} emptyTitle="Sin viáticos" emptyDescription="No hay gastos de campo registrados." />
        )}
      </Section>
    </>
  );
}
