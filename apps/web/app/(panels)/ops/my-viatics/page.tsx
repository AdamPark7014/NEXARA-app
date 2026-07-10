"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { patchViatico, postViatico } from "@/lib/viatics-api";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToCsv } from "@/lib/export-csv";
import FileDropzone from "@/components/ui/FileDropzone";

async function apiFetch(path: string, token: string) {
  const res = await fetch(buildApiUrl(path), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

const emptyForm = { concepto: "", montoSolicitado: 0, comprobanteUrl: "" };

export default function MyViaticsPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getViaticsSectionConfig(user), [user]);
  useOpsCanonicalRoute(user, "viatics");
  const token = user?.token ?? "";

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

  const visibleItems = useMemo(() => {
    let rows = items;
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      rows = rows.filter((v) => (v.concepto ?? "").toLowerCase().includes(q));
    }
    if (filterEstatus) rows = rows.filter((v) => v.estatus === filterEstatus);
    return rows;
  }, [items, searchQ, filterEstatus]);

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
    });
    setEvidenceFile(null);
    setActionErr(null);
    setShowForm(true);
  };

  const submit = async () => {
    if (!token || !form.concepto.trim() || !form.montoSolicitado) return;
    if (!editTarget && !evidenceFile && !form.comprobanteUrl.trim()) {
      setActionErr("Debes adjuntar el ticket o comprobante");
      return;
    }
    setSaving(true);
    setActionErr(null);
    try {
      if (editTarget) {
        const updated = await patchViatico(
          token,
          editTarget.id,
          { motivo: form.concepto.trim(), montoSolicitado: form.montoSolicitado, comprobanteUrl: form.comprobanteUrl.trim() || undefined },
          evidenceFile,
        );
        setItems((prev) => prev.map((v) => (v.id === editTarget.id ? normalizeViaticoRow({ ...(v as unknown as Record<string, unknown>), ...(updated ?? {}) }) : v)));
      } else {
        await postViatico(
          token,
          { usuarioId: user?.id, motivo: form.concepto.trim(), montoSolicitado: form.montoSolicitado, comprobanteUrl: form.comprobanteUrl.trim() || undefined },
          evidenceFile,
        );
        void load();
      }
      setShowForm(false);
      setEditTarget(null);
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Error al guardar");
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
        <KpiCard label="Total solicitudes" value={items.length} icon="📋" />
        <KpiCard label="Pendiente de cobro" value={<Money value={pendiente} compact />} variant="warning" icon="⏳" />
        <KpiCard label="Pagado" value={<Money value={pagado} compact />} variant="positive" icon="💳" />
        <KpiCard label="Aprobadas" value={items.filter((v) => v.estatus === "Aprobado" || v.estatus === "APROBADO").length} variant="accent" icon="✅" />
      </div>

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
          <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToCsv(visibleItems, [
            { key: "concepto", label: "Concepto" },
            { key: "montoSolicitado", label: "Monto" },
            { key: "estatus", label: "Estado" },
            { key: "fechaSolicitud", label: "Fecha", format: (v) => v ? String(v).slice(0, 10) : "" },
          ], "mis-viaticos")}>CSV</Button>
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
            <div style={{ display: "grid", gap: 14 }}>
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
