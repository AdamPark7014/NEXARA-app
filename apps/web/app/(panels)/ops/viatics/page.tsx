"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { getViaticsSectionConfig } from "@/lib/section-views";
import { useOpsCanonicalRoute } from "@/lib/use-ops-canonical-route";
import { buildApiUrl } from "@/lib/api-base";

interface Viatic {
  id: number;
  concepto?: string;
  monto?: number;
  estado?: string;
  fecha?: string;
  tipo?: string;
  user?: { nombre?: string };
  activity?: { id?: number; anNumber?: string };
  actividadId?: number;
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");
  const cfg = useMemo(() => getViaticsSectionConfig(user), [user]);
  useOpsCanonicalRoute(user, "viatics");
  const token = user?.token ?? "";

  const [items, setItems] = useState<Viatic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const data = await apiFetch("viatics", token);
      setItems(Array.isArray(data) ? data : (data.data ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar viaticos");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const patchEstado = async (id: number, estado: string) => {
    if (!token) return;
    try {
      await apiFetch(`viatics/${id}`, token, { method: "PATCH", body: JSON.stringify({ estado }) });
      setItems(prev => prev.map(v => v.id === id ? { ...v, estado } : v));
    } catch (e) { alert(e instanceof Error ? e.message : "Error al actualizar viatico"); }
  };

  const pendientes = items.filter(v => v.estado?.startsWith("PENDIENTE")).length;
  const totalAprobado = items.filter(v => v.estado === "APROBADO").reduce((s, v) => s + (v.monto ?? 0), 0);
  const totalPendiente = items.filter(v => v.estado?.startsWith("PENDIENTE")).reduce((s, v) => s + (v.monto ?? 0), 0);

  const visibleItems = useMemo(() => {
    if (!highlightId) return items;
    const id = Number(highlightId);
    if (Number.isNaN(id)) return items;
    return [...items].sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : 0));
  }, [items, highlightId]);

  void ESTADOS; // used for future estado filter

  const columns: Column<Viatic>[] = [
    { key: "id", label: "ID", render: v => <Tag variant="accent">V-{v.id}</Tag>, width: 80 },
    { key: "user", label: "Ingeniero", accessor: v => v.user?.nombre ?? "—", width: 140 },
    { key: "activity", label: "OT", render: v => {
      const activityId = v.activity?.id ?? v.actividadId;
      const label = v.activity?.anNumber ?? (activityId ? `ACT-${activityId}` : "—");
      return activityId ? (
        <Link href={`/ops/activities/${activityId}`} style={{ fontSize: 13, fontWeight: 600, color: "var(--primary)", textDecoration: "none" }}>{label}</Link>
      ) : label;
    }, width: 100 },
    { key: "concepto", label: "Concepto", render: v => <span style={{ fontSize: 13 }}>{v.concepto ?? "—"}</span> },
    { key: "monto", label: "Monto", render: v => <Money value={v.monto ?? 0} />, width: 110 },
    { key: "fecha", label: "Fecha", accessor: v => v.fecha ? new Date(v.fecha).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) : "—", width: 90 },
    { key: "estado", label: "Estado", render: v => (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Tag variant={v.estado === "APROBADO" ? "neutral" : v.estado === "RECHAZADO" ? "danger" : "warning"}>
          {(v.estado ?? "—").replace(/_/g, " ")}
        </Tag>
        {v.estado === "PENDIENTE_COORD" && cfg.canApprove && (
          <>
            <button onClick={() => patchEstado(v.id, "PENDIENTE_ADMIN")} style={{ fontSize: 11, background: "#1F5F4E", color: "#fff", border: "none", borderRadius: 4, padding: "2px 7px", cursor: "pointer" }}>✓ Coord</button>
            <button onClick={() => patchEstado(v.id, "RECHAZADO")} style={{ fontSize: 11, background: "var(--danger)", color: "#fff", border: "none", borderRadius: 4, padding: "2px 7px", cursor: "pointer" }}>✕</button>
          </>
        )}
        {v.estado === "PENDIENTE_ADMIN" && cfg.canApprove && (
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
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={<Button variant="ghost" onClick={load}>Actualizar</Button>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 20 }}>
        <KpiCard label="Pendientes" value={pendientes} />
        <KpiCard label="Por aprobar ($)" value={`$${(totalPendiente / 1000).toFixed(0)}k`} />
        <KpiCard label="Aprobado ($)" value={`$${(totalAprobado / 1000).toFixed(0)}k`} />
      </div>

      <Section title={loading ? "Cargando…" : `${visibleItems.length} viaticos`}>
        {highlightId && (
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
            Mostrando viatico <strong>#{highlightId}</strong> desde enlace directo.
          </p>
        )}
        {loading && <EmptyState icon="⏳" title="Cargando…" description="Consultando viaticos de campo." />}
        {!loading && error && (
          <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />
        )}
        {!loading && !error && (
          <DataTable columns={columns} rows={visibleItems} rowKey={v => v.id} emptyTitle="Sin viaticos" emptyDescription="No hay gastos de campo registrados." />
        )}
      </Section>
    </>
  );
}
