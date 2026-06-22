"use client";

import { useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { useRbacGuard } from "@/lib/useRbacGuard";
import { buildApiUrl } from "@/lib/api-base";

interface Evidence {
  id: number;
  tipo?: string;
  descripcion?: string;
  estado?: string;
  creadoEn?: string;
  activity?: { anNumber?: string; clienteNombre?: string };
  uploadedBy?: { nombre?: string };
  url?: string;
}

const ESTADOS = ["PENDIENTE_REVISION", "APROBADA", "RECHAZADA"];

async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function EvidencesReviewPage() {
  const { user } = useUser();
  const { canApprove, canDelete } = useRbacGuard();
  const token = user?.token ?? "";

  const [items, setItems] = useState<Evidence[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch("evidences?limit=60", token);
      setItems(Array.isArray(data) ? data : (data.data ?? []));
    } catch { /* skip */ } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const patchEstado = async (id: number, estado: string) => {
    if (!token) return;
    try {
      await apiFetch(`evidences/${id}`, token, { method: "PATCH", body: JSON.stringify({ estado }) });
      setItems(prev => prev.map(e => e.id === id ? { ...e, estado } : e));
    } catch { /* skip */ }
  };

  const remove = async (id: number) => {
    if (!token || !confirm("¿Eliminar esta evidencia?")) return;
    try {
      await apiFetch(`evidences/${id}`, token, { method: "DELETE" });
      setItems(prev => prev.filter(e => e.id !== id));
    } catch { /* skip */ }
  };

  const pending = items.filter(e => e.estado === "PENDIENTE_REVISION").length;

  const columns: Column<Evidence>[] = [
    { key: "id", label: "ID", render: e => <Tag variant="accent">E-{e.id}</Tag>, width: 80 },
    { key: "tipo", label: "Tipo", render: e => <Tag variant="neutral">{e.tipo ?? "—"}</Tag>, width: 130 },
    { key: "activity", label: "OT / Cliente", render: e => (
      <div>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{e.activity?.anNumber ?? "—"}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{e.activity?.clienteNombre ?? e.descripcion?.slice(0, 40)}</div>
      </div>
    )},
    { key: "uploadedBy", label: "Ingeniero", accessor: e => e.uploadedBy?.nombre ?? "—", width: 140 },
    { key: "creadoEn", label: "Capturada", accessor: e => e.creadoEn ? new Date(e.creadoEn).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) : "—", width: 90 },
    { key: "estado", label: "Estado", render: e => (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Tag variant={e.estado === "APROBADA" ? "neutral" : e.estado === "RECHAZADA" ? "danger" : "warning"}>
          {(e.estado ?? "—").replace(/_/g, " ")}
        </Tag>
        {e.estado === "PENDIENTE_REVISION" && canApprove && (
          <>
            <button onClick={() => patchEstado(e.id, "APROBADA")} style={{ fontSize: 11, background: "#1F5F4E", color: "#fff", border: "none", borderRadius: 4, padding: "2px 7px", cursor: "pointer" }}>✓</button>
            <button onClick={() => patchEstado(e.id, "RECHAZADA")} style={{ fontSize: 11, background: "var(--danger)", color: "#fff", border: "none", borderRadius: 4, padding: "2px 7px", cursor: "pointer" }}>✕</button>
          </>
        )}
      </div>
    ), width: 220 },
    { key: "id", label: "", render: e => (
      canDelete ? <button onClick={() => remove(e.id)} title="Eliminar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 8px" }}>✕</button> : null
    ), width: 40 },
  ];

  return (
    <>
      <PageHeader
        eyebrow="OPS · Supervisión"
        title="Revisión de evidencias"
        subtitle="Cola de fotos, videos y hojas de servicio pendientes de aprobación por coordinador."
        actions={
          <Button variant="ghost" onClick={load}>
            {pending > 0 ? `${pending} pendientes` : "Actualizar"}
          </Button>
        }
      />

      <Section title={loading ? "Cargando…" : `${items.length} evidencias`}>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
        ) : (
          <DataTable columns={columns} rows={items} rowKey={e => e.id} emptyTitle="Sin evidencias pendientes" emptyDescription="No hay evidencias en cola de revisión." />
        )}
      </Section>
    </>
  );
}
