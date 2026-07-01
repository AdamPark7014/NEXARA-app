"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
import { formatApiError } from "@/lib/erp-api";
import { approveViatico } from "@/lib/viatics-api";
import {
  formatApprovalProgress,
  isViaticoPending,
  normalizeViaticoRow,
  viaticoEstatusVariant,
  type ViaticoRow,
} from "@/lib/viatics-display";

async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  if (res.status === 204) return null;
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

export default function OpsViaticsPage() {
  const { user } = useUser();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");
  const cfg = useMemo(() => getViaticsSectionConfig(user), [user]);
  useOpsCanonicalRoute(user, "viatics");
  const token = user?.token ?? "";

  const [items, setItems] = useState<ViaticoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ViaticoRow | null>(null);
  const [approveNote, setApproveNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch("viatics", token);
      const rows = Array.isArray(data) ? data : (data?.data ?? []);
      setItems(rows.map((r: Record<string, unknown>) => normalizeViaticoRow(r)));
    } catch (e) {
      setError(formatApiError(e, "Error al cargar viáticos"));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const actOnViatic = async (id: number, action: "approve" | "reject") => {
    if (!token) return;
    setSaving(true);
    setActionErr(null);
    try {
      const updated = await approveViatico(token, id, action, approveNote || undefined);
      setItems((prev) =>
        prev.map((v) =>
          v.id === id ? normalizeViaticoRow({ ...(v as unknown as Record<string, unknown>), ...(updated ?? {}) }) : v,
        ),
      );
      setSelected(null);
      setApproveNote("");
    } catch (e) {
      setActionErr(formatApiError(e, "Error al actualizar viático"));
    } finally {
      setSaving(false);
    }
  };

  const openApprove = (v: ViaticoRow) => {
    setSelected(v);
    setApproveNote("");
    setActionErr(null);
  };

  const pendientes = items.filter((v) => isViaticoPending(v.estatus)).length;
  const totalAprobado = items
    .filter((v) => v.estatus === "Aprobado" || v.estatus === "Pagado")
    .reduce((s, v) => s + (v.montoSolicitado ?? 0), 0);
  const totalPendiente = items
    .filter((v) => isViaticoPending(v.estatus))
    .reduce((s, v) => s + (v.montoSolicitado ?? 0), 0);

  const visibleItems = useMemo(() => {
    if (!highlightId) return items;
    const id = Number(highlightId);
    if (Number.isNaN(id)) return items;
    return [...items].sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : 0));
  }, [items, highlightId]);

  const columns: Column<ViaticoRow>[] = [
    { key: "id", label: "ID", render: (v) => <Tag variant="accent">V-{v.id}</Tag>, width: 80 },
    { key: "usuario", label: "Ingeniero", accessor: (v) => v.usuario?.nombre ?? "—", width: 140 },
    {
      key: "actividad",
      label: "OT",
      render: (v) => {
        const activityId = v.actividad?.id ?? v.actividadId;
        const label = v.actividad?.anNumber ?? v.actividad?.folio ?? (activityId ? `ACT-${activityId}` : "—");
        return activityId ? (
          <Link href={`/ops/activities/${activityId}`} style={{ fontSize: 13, fontWeight: 600, color: "var(--primary)", textDecoration: "none" }}>
            {label}
          </Link>
        ) : label;
      },
      width: 100,
    },
    { key: "concepto", label: "Concepto", render: (v) => <span style={{ fontSize: 13 }}>{v.concepto ?? "—"}</span> },
    { key: "montoSolicitado", label: "Monto", render: (v) => <Money value={v.montoSolicitado ?? 0} />, width: 110 },
    {
      key: "fechaSolicitud",
      label: "Fecha",
      accessor: (v) =>
        v.fechaSolicitud ? new Date(v.fechaSolicitud).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) : "—",
      width: 90,
    },
    {
      key: "estatus",
      label: "Estado",
      render: (v) => (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <Tag variant={viaticoEstatusVariant(v.estatus)}>{(v.estatus ?? "—").replace(/_/g, " ")}</Tag>
          {isViaticoPending(v.estatus) && (
            <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
              {formatApprovalProgress(v.approvalStep, v.approvalTrail)}
            </span>
          )}
          {cfg.canApprove && isViaticoPending(v.estatus) && (
            <>
              <button type="button" onClick={() => openApprove(v)} style={{ fontSize: 11, background: "#1F5F4E", color: "#fff", border: "none", borderRadius: 4, padding: "2px 7px", cursor: "pointer" }}>
                ✓ Autorizar
              </button>
              <button type="button" onClick={() => void actOnViatic(v.id, "reject")} style={{ fontSize: 11, background: "var(--danger)", color: "#fff", border: "none", borderRadius: 4, padding: "2px 7px", cursor: "pointer" }}>
                ✕
              </button>
            </>
          )}
        </div>
      ),
      width: 260,
    },
  ];

  const inp: React.CSSProperties = {
    width: "100%", padding: "8px 12px", border: "1px solid var(--border)",
    borderRadius: 8, background: "var(--surface-2)", color: "var(--foreground)", fontSize: 13,
  };

  return (
    <>
      <PageHeader
        eyebrow="OPS · Finanzas campo"
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={<Button variant="ghost" onClick={() => void load()}>Actualizar</Button>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 20 }}>
        <KpiCard label="Pendientes" value={pendientes} variant={pendientes > 0 ? "warning" : "positive"} icon="⏳" hint="Esperando aprobación" />
        <KpiCard label="Por aprobar" value={<Money value={totalPendiente} compact />} variant={totalPendiente > 0 ? "warning" : "default"} icon="📋" />
        <KpiCard label="Aprobado" value={<Money value={totalAprobado} compact />} variant="positive" icon="✅" />
      </div>

      {actionErr && (
        <div role="alert" style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, border: "1px solid var(--danger)", color: "var(--danger)", fontSize: 13 }}>
          {actionErr}
        </div>
      )}

      <Section title={loading ? "Cargando…" : `${visibleItems.length} viáticos`}>
        {highlightId && (
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
            Mostrando viático <strong>#{highlightId}</strong> desde enlace directo.
          </p>
        )}
        {loading && <EmptyState icon="⏳" title="Cargando…" description="Consultando viáticos de campo." />}
        {!loading && error && (
          <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />
        )}
        {!loading && !error && (
          <DataTable columns={columns} rows={visibleItems} rowKey={(v) => v.id} emptyTitle="Sin viáticos" emptyDescription="No hay gastos de campo registrados." />
        )}
      </Section>

      {selected && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setSelected(null)}>
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: 24, width: 400, maxWidth: "calc(100vw - 32px)", border: "1px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>Autorizar viático V-{selected.id}</div>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 8px" }}>{selected.concepto} · <Money value={selected.montoSolicitado ?? 0} /></p>
            <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "0 0 16px" }}>
              {formatApprovalProgress(selected.approvalStep, selected.approvalTrail)} — el CEO da la autorización final.
            </p>
            <label style={{ display: "grid", gap: 4, marginBottom: 16 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Notas (opcional)</span>
              <textarea value={approveNote} onChange={(e) => setApproveNote(e.target.value)} rows={3} style={{ ...inp, resize: "vertical" }} placeholder="Comentarios para el siguiente nivel o el solicitante" />
            </label>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setSelected(null)}>Cancelar</Button>
              <Button variant="primary" disabled={saving} onClick={() => void actOnViatic(selected.id, "approve")}>
                {saving ? "Guardando…" : "Pre-autorizar / Aprobar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
