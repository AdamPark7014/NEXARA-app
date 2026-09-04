"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import InlineAlert from "@/components/ui/InlineAlert";
import { useUser } from "@/components/UserContext";
import { getViaticsSectionConfig } from "@/lib/section-views";
import { useOpsCanonicalRoute } from "@/lib/use-ops-canonical-route";
import { buildApiUrl } from "@/lib/api-base";
import { isViaticoPending, normalizeViaticoRow, viaticoEstatusVariant, type ViaticoRow } from "@/lib/viatics-display";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToExcel } from "@/lib/export-excel";
import ListExportActions from "@/components/ui/ListExportActions";
import { patchViatico, postViatico, downloadViaticsReportPdf } from "@/lib/viatics-api";
import FileDropzone from "@/components/ui/FileDropzone";
import { toast } from "@/components/Toast";

async function apiFetch(path: string, token: string) {
  const res = await fetch(buildApiUrl(path), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

const emptyForm = {
  concepto: "",
  montoSolicitado: 0,
  comprobanteUrl: "",
  categoria: "OTROS",
  projectId: "",
  actividadId: "",
  vehicleId: "",
};

export default function MyViaticsPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getViaticsSectionConfig(user), [user]);
  useOpsCanonicalRoute(user, "viatics");
  const token = user?.token ?? "";
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");

  const [items, setItems] = useState<ViaticoRow[]>([]);
  const [searchQ, setSearchQ] = useState("");
  const [filterEstatus, setFilterEstatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<ViaticoRow | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [projects, setProjects] = useState<{ id: number; name: string }[]>([]);
  const [vehicles, setVehicles] = useState<{ id: number; nombre: string; placas?: string | null }[]>([]);
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
      setError(e instanceof Error ? e.message : "Error al cargar tus viáticos");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!token) return;
    void apiFetch("ventas/proyectos", token)
      .then((data) => {
        const rows = Array.isArray(data) ? data : (data?.data ?? []);
        setProjects(rows.map((p: { id: number; name?: string }) => ({ id: p.id, name: p.name || `#${p.id}` })));
      })
      .catch(() => setProjects([]));
    void apiFetch("vehicles/inventory", token)
      .then((data) => {
        const rows = Array.isArray(data) ? data : (data?.data ?? []);
        setVehicles(
          rows.map((v: { id: number; nombre?: string; placas?: string | null }) => ({
            id: v.id,
            nombre: v.nombre || `Vehículo #${v.id}`,
            placas: v.placas,
          })),
        );
      })
      .catch(() => setVehicles([]));
  }, [token]);

  const visibleItems = useMemo(() => {
    let rows = items;
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      rows = rows.filter((v) => (v.concepto ?? "").toLowerCase().includes(q));
    }
    if (filterEstatus) rows = rows.filter((v) => v.estatus === filterEstatus);
    if (highlightId) {
      const id = Number(highlightId);
      if (!Number.isNaN(id)) rows = [...rows].sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : 0));
    }
    return rows;
  }, [items, searchQ, filterEstatus, highlightId]);

  const pendiente = items.filter((v) => v.estatus !== "Rechazado" && v.estatus !== "Pagado").reduce((s, v) => s + (v.montoSolicitado ?? 0), 0);
  const pagado = items.filter((v) => v.estatus === "Pagado").reduce((s, v) => s + (v.montoSolicitado ?? 0), 0);

  const openCreate = () => {
    setEditTarget(null);
    setForm({ ...emptyForm });
    setEvidenceFile(null);
    setActionErr(null);
    setShowForm(true);
  };

  const openEdit = (v: ViaticoRow) => {
    setEditTarget(v);
    setForm({
      concepto: v.concepto ?? "",
      montoSolicitado: v.montoSolicitado ?? 0,
      comprobanteUrl: v.comprobante ?? "",
      categoria: (v as { categoria?: string }).categoria || "OTROS",
      projectId: (v as { projectId?: number }).projectId ? String((v as { projectId?: number }).projectId) : "",
      actividadId: v.actividadId ? String(v.actividadId) : "",
      vehicleId: (v as { vehicleId?: number }).vehicleId ? String((v as { vehicleId?: number }).vehicleId) : "",
    });
    setEvidenceFile(null);
    setActionErr(null);
    setShowForm(true);
  };

  const submit = async () => {
    if (!token || !form.concepto.trim() || !form.montoSolicitado) return;
    if (!editTarget && !form.projectId && !form.actividadId) {
      setActionErr("Debes ligar la solicitud a un proyecto o una actividad");
      return;
    }
    if (!editTarget && !evidenceFile && !form.comprobanteUrl.trim()) {
      setActionErr("Debes adjuntar el ticket o comprobante");
      return;
    }
    setSaving(true);
    setActionErr(null);
    try {
      const payload = {
        motivo: form.concepto.trim(),
        montoSolicitado: form.montoSolicitado,
        comprobanteUrl: form.comprobanteUrl.trim() || undefined,
        categoria: form.categoria,
        projectId: form.projectId ? Number(form.projectId) : null,
        actividadId: form.actividadId ? Number(form.actividadId) : null,
        vehicleId: form.vehicleId ? Number(form.vehicleId) : null,
      };
      if (editTarget) {
        const updated = await patchViatico(token, editTarget.id, payload, evidenceFile);
        setItems((prev) => prev.map((v) => (v.id === editTarget.id ? normalizeViaticoRow({ ...(v as unknown as Record<string, unknown>), ...(updated ?? {}) }) : v)));
      } else {
        await postViatico(
          token,
          { usuarioId: user?.id, ...payload },
          evidenceFile,
        );
        await load();
      }
      setShowForm(false);
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const inp: React.CSSProperties = { width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--foreground)", fontSize: 13 };

  const columns: Column<ViaticoRow>[] = [
    { key: "concepto", label: "Concepto", accessor: (v) => v.concepto ?? "—" },
    { key: "montoSolicitado", label: "Monto", align: "right" as const, render: (v) => <Money value={v.montoSolicitado ?? 0} />, width: 110 },
    { key: "fechaSolicitud", label: "Fecha", render: (v) => <span style={{ fontSize: 12 }}>{v.fechaSolicitud ? new Date(v.fechaSolicitud).toLocaleDateString("es-MX") : "—"}</span>, width: 100 },
    { key: "estatus", label: "Estado", render: (v) => <Tag variant={viaticoEstatusVariant(v.estatus)}>{(v.estatus ?? "Pendiente").replace(/_/g, " ")}</Tag>, width: 160 },
    {
      key: "acciones" as keyof ViaticoRow,
      label: "",
      render: (v) => isViaticoPending(v.estatus) ? (
        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); openEdit(v); }}>Editar</Button>
      ) : null,
      width: 90,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="OPS · Campo"
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={
          <>
            <Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>
            {cfg.canCreate && <Button variant="primary" iconLeft="+" onClick={openCreate}>Solicitar viático</Button>}
          </>
        }
      />

      {highlightId && (
        <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", fontSize: 13 }}>
          Mostrando viático <strong>#{highlightId}</strong> desde enlace directo.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
        <KpiCard label="Total solicitudes" value={items.length} icon="📋" />
        <KpiCard label="Pendiente de cobro" value={<Money value={pendiente} compact />} variant="warning" icon="⏳" />
        <KpiCard label="Pagado" value={<Money value={pagado} compact />} variant="positive" icon="💳" />
        <KpiCard label="Aprobadas" value={items.filter((v) => v.estatus === "Aprobado" || v.estatus === "APROBADO").length} variant="accent" icon="✅" />
      </div>

      {!loading && items.length > 0 && (() => {
        const byEstatus: Record<string, number> = {};
        for (const v of items) { const s = v.estatus ?? "Pendiente"; byEstatus[s] = (byEstatus[s] ?? 0) + 1; }
        const total = items.length;
        const estatusColors: Record<string, string> = { Pendiente: "var(--warning)", Aprobado: "var(--success)", Pagado: "var(--primary)", Rechazado: "var(--danger)", "Pre-aprobado": "color-mix(in srgb, var(--success) 60%, var(--warning))" };
        return (
          <div style={{ marginBottom: 16, padding: "12px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Distribución por estatus</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {Object.entries(byEstatus).sort((a, b) => b[1] - a[1]).map(([s, count]) => (
                <div key={s} style={{ display: "grid", gridTemplateColumns: "110px 1fr 36px", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>{s.replace(/_/g, " ")}</span>
                  <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(count / total) * 100}%`, background: estatusColors[s] ?? "var(--primary)", borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "right" }}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {actionErr && <InlineAlert message={actionErr} onDismiss={() => setActionErr(null)} />}

      <FilterToolbar
        search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar por concepto…" }}
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
        rightActions={items.length > 0 ? (
          <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToExcel(visibleItems, [
            { key: "concepto", label: "Concepto" },
            { key: "montoSolicitado", label: "Monto" },
            { key: "estatus", label: "Estado" },
            { key: "fechaSolicitud", label: "Fecha", format: (v) => v ? String(v).slice(0, 10) : "" },
          ], "mis-viaticos")}>Excel</Button>
        ) : undefined}
      />
      <Section title={loading ? "Cargando…" : `${visibleItems.length} solicitudes`}>
        {loading && <EmptyState icon="⏳" title="Cargando…" description="Consultando tus viáticos." />}
        {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}
        {!loading && !error && <DataTable columns={columns} rows={visibleItems} rowKey={(v) => v.id} emptyTitle="Sin solicitudes" emptyDescription="Solicita tu primer viático con el botón de arriba." />}
      </Section>

      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowForm(false)}>
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: 28, width: 440, maxWidth: "calc(100vw - 32px)", boxShadow: "0 24px 56px rgba(0,0,0,0.24)", border: "1px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>{editTarget ? `Editar viático #${editTarget.id}` : "Solicitar viático"}</div>
            {actionErr && <InlineAlert variant="danger" message={actionErr} />}
            <div style={{ display: "grid", gap: 14 }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Categoría</span>
                <select value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))} style={inp}>
                  {["COMBUSTIBLE", "CASETA", "HOSPEDAJE", "ALIMENTACION", "TRANSPORTE", "OTROS"].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Proyecto</span>
                <select value={form.projectId} onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))} style={inp}>
                  <option value="">— Seleccionar —</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>ID actividad OPS</span>
                <input value={form.actividadId} onChange={(e) => setForm((f) => ({ ...f, actividadId: e.target.value }))} placeholder="Opcional si hay proyecto" style={inp} />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Vehículo (opcional)</span>
                <select value={form.vehicleId} onChange={(e) => setForm((f) => ({ ...f, vehicleId: e.target.value }))} style={inp}>
                  <option value="">— Sin vehículo —</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>{v.nombre}{v.placas ? ` · ${v.placas}` : ""}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Concepto</span>
                <input value={form.concepto} onChange={(e) => setForm((f) => ({ ...f, concepto: e.target.value }))} placeholder="Hospedaje + gasolina Puebla" style={inp} />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Monto solicitado ($)</span>
                <input type="number" min={0} value={form.montoSolicitado} onChange={(e) => setForm((f) => ({ ...f, montoSolicitado: Number(e.target.value) }))} style={inp} />
              </label>
              <FileDropzone
                file={evidenceFile}
                onFile={setEvidenceFile}
                label="Ticket / comprobante"
                required
                hint="Obligatorio · PDF o imagen"
              />
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>URL comprobante (alternativa)</span>
                <input value={form.comprobanteUrl} onChange={(e) => setForm((f) => ({ ...f, comprobanteUrl: e.target.value }))} placeholder="https://…" style={inp} />
              </label>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button variant="primary" onClick={() => void submit()} disabled={saving || !form.concepto.trim() || !form.montoSolicitado || (!editTarget && !evidenceFile && !form.comprobanteUrl.trim())}>
                {saving ? "Guardando…" : editTarget ? "Guardar cambios" : "Enviar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
