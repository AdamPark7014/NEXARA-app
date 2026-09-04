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
import { approveViatico, assignViatico } from "@/lib/viatics-api";
import { listUsers, type ApiUserRow } from "@/lib/users-api";
import {
  formatApprovalProgress,
  isViaticoPending,
  normalizeViaticoRow,
  viaticoEstatusVariant,
  type ViaticoRow,
} from "@/lib/viatics-display";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToExcel } from "@/lib/export-excel";
import ListExportActions from "@/components/ui/ListExportActions";
import { downloadViaticsReportPdf } from "@/lib/viatics-api";
import { toast } from "@/components/Toast";

const CONCEPTOS = [
  { label: "Gasolina", categoria: "COMBUSTIBLE" },
  { label: "Caseta", categoria: "CASETA" },
  { label: "Alimentos", categoria: "ALIMENTACION" },
  { label: "Hospedaje", categoria: "HOSPEDAJE" },
  { label: "Transporte", categoria: "TRANSPORTE" },
  { label: "Otro", categoria: "OTROS" },
] as const;

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
  const [searchQ, setSearchQ] = useState("");
  const [filterEstatus, setFilterEstatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ViaticoRow | null>(null);
  const [approveNote, setApproveNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [showAssign, setShowAssign] = useState(false);
  const [users, setUsers] = useState<ApiUserRow[]>([]);
  const [assignForm, setAssignForm] = useState({
    usuarioId: "",
    actividadId: "",
    projectId: "",
    concepto: "",
    montoSolicitado: "",
    motivo: "",
  });
  const [assignErr, setAssignErr] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

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

  useEffect(() => {
    if (!token || !cfg.canAssign) return;
    void listUsers(token, { limit: 200 })
      .then(setUsers)
      .catch(() => setUsers([]));
  }, [token, cfg.canAssign]);

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

  const submitAssign = async () => {
    if (!token) return;
    if (!assignForm.usuarioId || !assignForm.concepto || !assignForm.montoSolicitado) {
      setAssignErr("Completa usuario, concepto y monto");
      return;
    }
    if (!assignForm.actividadId && !assignForm.projectId) {
      setAssignErr("Indica actividad o proyecto");
      return;
    }
    setSaving(true);
    setAssignErr(null);
    try {
      const cat = CONCEPTOS.find((c) => c.label === assignForm.concepto)?.categoria ?? "OTROS";
      await assignViatico(token, {
        usuarioId: Number(assignForm.usuarioId),
        actividadId: assignForm.actividadId ? Number(assignForm.actividadId) : null,
        projectId: assignForm.projectId ? Number(assignForm.projectId) : null,
        motivo: (assignForm.motivo || assignForm.concepto).trim(),
        montoSolicitado: parseFloat(assignForm.montoSolicitado),
        categoria: cat,
      });
      setShowAssign(false);
      setAssignForm({
        usuarioId: "",
        actividadId: "",
        projectId: "",
        concepto: "",
        montoSolicitado: "",
        motivo: "",
      });
      void load();
    } catch (e) {
      setAssignErr(formatApiError(e, "Error al asignar viático"));
    } finally {
      setSaving(false);
    }
  };

  const pendientes = items.filter((v) => isViaticoPending(v.estatus)).length;
  const totalAprobado = items
    .filter((v) => v.estatus === "Aprobado" || v.estatus === "Pagado")
    .reduce((s, v) => s + (v.montoSolicitado ?? 0), 0);
  const totalPendiente = items
    .filter((v) => isViaticoPending(v.estatus))
    .reduce((s, v) => s + (v.montoSolicitado ?? 0), 0);

  const visibleItems = useMemo(() => {
    let rows = items;
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      rows = rows.filter((v) =>
        (v.concepto ?? "").toLowerCase().includes(q) ||
        (v.usuario?.nombre ?? "").toLowerCase().includes(q)
      );
    }
    if (filterEstatus) rows = rows.filter((v) => v.estatus === filterEstatus);
    if (highlightId) {
      const id = Number(highlightId);
      if (!Number.isNaN(id)) rows = [...rows].sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : 0));
    }
    return rows;
  }, [items, highlightId, searchQ, filterEstatus]);

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
      label: "Antigüedad",
      render: (v) => {
        if (!v.fechaSolicitud) return <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>—</span>;
        const days = Math.floor((Date.now() - new Date(v.fechaSolicitud).getTime()) / 86400000);
        const isPending = isViaticoPending(v.estatus);
        const color = !isPending ? "var(--text-tertiary)" : days >= 14 ? "var(--danger)" : days >= 7 ? "var(--warning)" : "var(--success)";
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            {isPending && <div style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />}
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>{new Date(v.fechaSolicitud).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}</span>
              {isPending && <span style={{ fontSize: 10.5, fontWeight: days >= 7 ? 700 : 400, color }}>{days}d</span>}
            </div>
          </div>
        );
      },
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
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            {cfg.canAssign && (
              <Button
                variant="primary"
                onClick={() => {
                  setShowAssign(true);
                  setAssignErr(null);
                }}
              >
                Asignar viático
              </Button>
            )}
            <Button variant="ghost" onClick={() => void load()}>Actualizar</Button>
          </div>
        }
      />

      {!loading && items.length > 0 && (() => {
        const pagados = items.filter((v) => v.estatus === "Pagado").length;
        const rechazados = items.filter((v) => v.estatus === "Rechazado").length;
        const byEstatus = [
          { label: "Pendiente", count: items.filter((v) => v.estatus === "Pendiente").length, color: "var(--warning)" },
          { label: "Pre-aprobado", count: items.filter((v) => v.estatus === "Pre-aprobado").length, color: "var(--primary)" },
          { label: "Aprobado", count: items.filter((v) => v.estatus === "Aprobado").length, color: "var(--success)" },
          { label: "Pagado", count: pagados, color: "var(--success)" },
          { label: "Rechazado", count: rechazados, color: "var(--danger)" },
        ].filter((x) => x.count > 0);
        return (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 14 }}>
              <KpiCard label="Total viáticos" value={items.length} icon="🧾" />
              <KpiCard label="Pendientes" value={pendientes} variant={pendientes > 0 ? "warning" : "positive"} icon="⏳" hint="Esperando aprobación" />
              <KpiCard label="Por aprobar" value={<Money value={totalPendiente} compact />} variant={totalPendiente > 0 ? "warning" : "default"} icon="📋" />
              <KpiCard label="Aprobado" value={<Money value={totalAprobado} compact />} variant="positive" icon="✅" />
            </div>
            {byEstatus.length > 0 && (
              <div style={{ marginBottom: 16, padding: "12px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Estado de viáticos</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {byEstatus.map(({ label, count, color }) => (
                    <div key={label} style={{ display: "grid", gridTemplateColumns: "110px 1fr 36px", gap: 10, alignItems: "center" }}>
                      <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>{label}</span>
                      <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${(count / items.length) * 100}%`, background: color, borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "right" }}>{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        );
      })()}

      {actionErr && (
        <div role="alert" style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, border: "1px solid var(--danger)", color: "var(--danger)", fontSize: 13 }}>
          {actionErr}
        </div>
      )}

      <FilterToolbar
        search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar por concepto o ingeniero…" }}
        selects={[{
          label: "Estado",
          value: filterEstatus,
          onChange: setFilterEstatus,
          options: [
            { value: "Pendiente", label: "Pendiente" },
            { value: "Pre-aprobado", label: "Pre-aprobado" },
            { value: "Aprobado", label: "Aprobado" },
            { value: "Rechazado", label: "Rechazado" },
            { value: "Pagado", label: "Pagado" },
          ],
          allowAll: true,
        }]}
        onClear={() => { setSearchQ(""); setFilterEstatus(""); }}
        resultCount={loading ? null : visibleItems.length}
        rightActions={
          <ListExportActions
            onExcel={
              items.length > 0
                ? () =>
                    exportToExcel(
                      visibleItems,
                      [
                        { key: "id", label: "ID" },
                        { key: "concepto", label: "Concepto" },
                        { key: "usuario", label: "Ingeniero", format: (v) => (v as ViaticoRow["usuario"])?.nombre ?? "—" },
                        { key: "montoSolicitado", label: "Monto" },
                        { key: "estatus", label: "Estado" },
                        { key: "fechaSolicitud", label: "Fecha", format: (v) => (v ? String(v).slice(0, 10) : "") },
                      ],
                      "viaticos-campo",
                      { title: "Viáticos de campo" },
                    )
                : undefined
            }
            onPdf={
              token
                ? () => {
                    void (async () => {
                      setPdfBusy(true);
                      try {
                        const to = new Date().toISOString().slice(0, 10);
                        const from = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
                        await downloadViaticsReportPdf(token, { from, to });
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "No se pudo generar el PDF");
                      } finally {
                        setPdfBusy(false);
                      }
                    })();
                  }
                : undefined
            }
            pdfBusy={pdfBusy}
          />
        }
      />

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
          <DataTable
            columns={columns}
            rows={visibleItems}
            rowKey={(v) => v.id}
            emptyTitle="Sin viáticos"
            emptyDescription="Registra el primer gasto de campo o espera solicitudes del equipo en sitio."
            emptyAction={<Button size="sm" variant="secondary" onClick={() => void load()}>Actualizar lista</Button>}
          />
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

      {showAssign && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowAssign(false)}>
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: 24, width: 440, maxWidth: "calc(100vw - 32px)", border: "1px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Asignar viático</div>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 16px" }}>
              Presupuesto anticipado para un ingeniero · ligado a actividad o proyecto.
            </p>
            <div style={{ display: "grid", gap: 12 }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Usuario *</span>
                <select value={assignForm.usuarioId} onChange={(e) => setAssignForm((f) => ({ ...f, usuarioId: e.target.value }))} style={inp} autoFocus>
                  <option value="">— Seleccionar —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.nombre}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>ID actividad (OT)</span>
                <input value={assignForm.actividadId} onChange={(e) => setAssignForm((f) => ({ ...f, actividadId: e.target.value }))} placeholder="Ej. 42" style={inp} />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>ID proyecto (opcional)</span>
                <input value={assignForm.projectId} onChange={(e) => setAssignForm((f) => ({ ...f, projectId: e.target.value }))} placeholder="Si no hay OT" style={inp} />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Concepto *</span>
                <select value={assignForm.concepto} onChange={(e) => setAssignForm((f) => ({ ...f, concepto: e.target.value }))} style={inp}>
                  <option value="">— Seleccionar —</option>
                  {CONCEPTOS.map((c) => <option key={c.label} value={c.label}>{c.label}</option>)}
                </select>
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Monto (MXN) *</span>
                <input type="number" min="0" step="0.01" value={assignForm.montoSolicitado} onChange={(e) => setAssignForm((f) => ({ ...f, montoSolicitado: e.target.value }))} style={inp} />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Motivo</span>
                <textarea value={assignForm.motivo} onChange={(e) => setAssignForm((f) => ({ ...f, motivo: e.target.value }))} rows={2} style={{ ...inp, resize: "vertical" }} />
              </label>
              {assignErr && (
                <div style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--danger)", color: "var(--danger)", fontSize: 12 }}>{assignErr}</div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
              <Button variant="secondary" onClick={() => setShowAssign(false)}>Cancelar</Button>
              <Button variant="primary" disabled={saving} onClick={() => void submitAssign()}>
                {saving ? "Guardando…" : "Asignar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
