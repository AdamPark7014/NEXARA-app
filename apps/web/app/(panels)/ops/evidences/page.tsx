"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import KpiCard from "@/components/ui/KpiCard";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { getEvidencesSectionConfig, getEvidencesCanonicalPath } from "@/lib/section-views";
import { useOpsCanonicalRoute } from "@/lib/use-ops-canonical-route";

interface Evidence {
  id: number;
  tipo?: string;
  descripcion?: string;
  estado?: string;
  creadoEn?: string;
  actividadId?: number;
  activity?: { id?: number; anNumber?: string; clienteNombre?: string };
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const activityFilter = searchParams.get("activityId");
  const cfg = useMemo(() => getEvidencesSectionConfig(user), [user]);
  useOpsCanonicalRoute(user, "evidences");
  const token = user?.token ?? "";

  const [items, setItems] = useState<Evidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const data = await apiFetch("evidences?limit=60", token);
      setItems(Array.isArray(data) ? data : (data.data ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar evidencias");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const patchEstado = async (id: number, estado: string) => {
    if (!token) return;
    try {
      await apiFetch(`evidences/${id}`, token, { method: "PATCH", body: JSON.stringify({ estado }) });
      setItems(prev => prev.map(e => e.id === id ? { ...e, estado } : e));
    } catch (e) { alert(e instanceof Error ? e.message : "Error al actualizar estado"); }
  };

  const remove = async (id: number) => {
    if (!token || !confirm("¿Eliminar esta evidencia?")) return;
    try {
      await apiFetch(`evidences/${id}`, token, { method: "DELETE" });
      setItems(prev => prev.filter(e => e.id !== id));
    } catch (e) { alert(e instanceof Error ? e.message : "Error al eliminar"); }
  };

  const pending = items.filter(e => e.estado === "PENDIENTE_REVISION").length;

  const visibleItems = useMemo(() => {
    if (!activityFilter) return items;
    const aid = Number(activityFilter);
    if (Number.isNaN(aid)) return items;
    return items.filter(e => (e.activity?.id ?? e.actividadId) === aid);
  }, [items, activityFilter]);

  const columns: Column<Evidence>[] = [
    { key: "id", label: "ID", render: e => <Tag variant="accent">E-{e.id}</Tag>, width: 80 },
    { key: "tipo", label: "Tipo", render: e => <Tag variant="neutral">{e.tipo ?? "—"}</Tag>, width: 130 },
    { key: "activity", label: "OT / Cliente", render: e => {
      const activityId = e.activity?.id ?? e.actividadId;
      const label = e.activity?.anNumber ?? (activityId ? `ACT-${activityId}` : "—");
      return (
        <div>
          {activityId ? (
            <Link href={`/ops/activities/${activityId}`} style={{ fontWeight: 700, fontSize: 13, color: "var(--primary)", textDecoration: "none" }}>
              {label}
            </Link>
          ) : (
            <div style={{ fontWeight: 700, fontSize: 13 }}>{label}</div>
          )}
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{e.activity?.clienteNombre ?? e.descripcion?.slice(0, 40)}</div>
        </div>
      );
    }},
    { key: "uploadedBy", label: "Ingeniero", accessor: e => e.uploadedBy?.nombre ?? "—", width: 140 },
    { key: "creadoEn", label: "Capturada", accessor: e => e.creadoEn ? new Date(e.creadoEn).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) : "—", width: 90 },
    { key: "estado", label: "Estado", render: e => (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Tag variant={e.estado === "APROBADA" ? "neutral" : e.estado === "RECHAZADA" ? "danger" : "warning"}>
          {(e.estado ?? "—").replace(/_/g, " ")}
        </Tag>
        {e.estado === "PENDIENTE_REVISION" && cfg.canApprove && (
          <>
            <button onClick={() => patchEstado(e.id, "APROBADA")} style={{ fontSize: 11, background: "#1F5F4E", color: "#fff", border: "none", borderRadius: 4, padding: "2px 7px", cursor: "pointer" }}>✓</button>
            <button onClick={() => patchEstado(e.id, "RECHAZADA")} style={{ fontSize: 11, background: "var(--danger)", color: "#fff", border: "none", borderRadius: 4, padding: "2px 7px", cursor: "pointer" }}>✕</button>
          </>
        )}
      </div>
    ), width: 220 },
    { key: "id", label: "", render: e => (
      cfg.canDelete ? <button onClick={() => remove(e.id)} title="Eliminar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 8px" }}>✕</button> : null
    ), width: 40 },
  ];

  void ESTADOS; // used for future estado filter

  return (
    <>
      <PageHeader
        eyebrow="OPS · Supervisión"
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={
          <Button variant="ghost" onClick={load}>
            {pending > 0 ? `${pending} pendientes` : "Actualizar"}
          </Button>
        }
      />

      {!loading && !error && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
          <KpiCard label="Total" value={items.length} icon="📸" />
          <KpiCard label="Pendientes revision" value={pending} variant={pending > 0 ? "warning" : "positive"} icon="⏳" />
          <KpiCard label="Aprobadas" value={items.filter(e => e.estado === "APROBADA").length} icon="✅" />
          <KpiCard label="Rechazadas" value={items.filter(e => e.estado === "RECHAZADA").length} variant={items.filter(e => e.estado === "RECHAZADA").length > 0 ? "danger" : "default"} icon="❌" />
        </div>
      )}

      <Section title={loading ? "Cargando…" : `${visibleItems.length} evidencias`}>
        {activityFilter && (
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
            Filtrando por actividad <strong>#{activityFilter}</strong>.{" "}
            <Link href={getEvidencesCanonicalPath(user)} style={{ color: "var(--primary)" }}>Ver todas</Link>
          </p>
        )}
        {loading && <EmptyState icon="⏳" title="Cargando…" description="Consultando evidencias." />}
        {!loading && error && (
          <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />
        )}
        {!loading && !error && (
          <DataTable columns={columns} rows={visibleItems} rowKey={e => e.id} emptyTitle="Sin evidencias pendientes" emptyDescription="No hay evidencias en cola de revision." />
        )}
      </Section>
    </>
  );
}
