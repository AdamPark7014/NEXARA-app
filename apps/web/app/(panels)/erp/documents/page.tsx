"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageChrome from "@/components/ui/PageChrome";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { getErpGovernanceSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import { toast } from "@/components/Toast";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToExcel } from "@/lib/export-excel";
import chrome from "@/components/erp/erp-chrome.module.css";

interface DocCategory { id: number; name: string }
interface ManagedDoc {
  id: number;
  documentNumber: string;
  title: string;
  description?: string | null;
  status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | string;
  categoryId?: number | null;
  category?: { id: number; name: string } | null;
  fileUrl?: string | null;
  createdBy?: { nombre: string } | null;
  createdAt?: string;
}

async function apiFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers as Record<string, string> ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  if (res.status === 204) return null;
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

const emptyForm = { title: "", description: "", categoryId: "", fileUrl: "" };

export default function DocumentsPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getErpGovernanceSectionConfig(user, "documents"), [user]);
  const token = user?.token ?? "";

  const [docs, setDocs] = useState<ManagedDoc[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [cats, setCats] = useState<DocCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ManagedDoc | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [formErr, setFormErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCategory, setFilterCategory] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const [docsData, catsData] = await Promise.all([
        apiFetch("documents", token),
        apiFetch("documents/categories", token).catch(() => []),
      ]);
      setDocs(Array.isArray(docsData) ? docsData : (docsData?.data ?? []));
      setCats(Array.isArray(catsData) ? catsData : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar documentos");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    let rows = docs;
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((d) => d.title.toLowerCase().includes(q) || d.documentNumber.toLowerCase().includes(q));
    }
    if (filterStatus) rows = rows.filter((d) => d.status === filterStatus);
    if (filterCategory) rows = rows.filter((d) => String(d.categoryId ?? "") === filterCategory);
    return rows;
  }, [docs, search, filterStatus, filterCategory]);

  const pendientes = docs.filter((d) => d.status === "PENDING_APPROVAL").length;
  const aprobados = docs.filter((d) => d.status === "APPROVED").length;

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setFormErr(null);
    setShowForm(true);
  };

  const openEdit = async (d: ManagedDoc) => {
    if (d.status === "APPROVED" || d.status === "ARCHIVED" || d.status === "OBSOLETE") {
      toast.warning("Solo se pueden editar documentos en borrador o pendientes de aprobación.");
      return;
    }
    setEditing(d);
    setFormErr(null);
    setShowForm(true);
    setForm({
      title: d.title,
      description: d.description ?? "",
      categoryId: d.categoryId != null ? String(d.categoryId) : "",
      fileUrl: d.fileUrl ?? "",
    });
    try {
      const full = await apiFetch(`documents/${d.id}`, token) as ManagedDoc;
      setForm({
        title: full.title ?? d.title,
        description: full.description ?? "",
        categoryId: full.categoryId != null ? String(full.categoryId) : "",
        fileUrl: full.fileUrl ?? "",
      });
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : "No se pudo cargar el documento");
    }
  };

  const submit = async () => {
    if (!token || !form.title) return;
    setSaving(true);
    setFormErr(null);
    try {
      const body = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        categoryId: form.categoryId ? Number(form.categoryId) : undefined,
        fileUrl: form.fileUrl.trim() || undefined,
      };
      if (editing) {
        await apiFetch(`documents/${editing.id}`, token, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await apiFetch("documents", token, { method: "POST", body: JSON.stringify(body) });
      }
      setShowForm(false);
      setEditing(null);
      setForm({ ...emptyForm });
      void load();
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : "No se pudo guardar");
    } finally { setSaving(false); }
  };

  const approve = async (d: ManagedDoc) => {
    if (!token) return;
    try {
      await apiFetch(`documents/${d.id}/approve`, token, { method: "PATCH" });
      void load();
    } catch (e) { toast.error(`Error: ${e instanceof Error ? e.message : "desconocido"}`); }
  };

  const archive = async (d: ManagedDoc) => {
    if (!token) return;
    setConfirmState({ message: `¿Archivar "${d.title}"?`, confirmLabel: "Archivar", fn: async () => {
    try {
      await apiFetch(`documents/${d.id}/archive`, token, { method: "PATCH" });
      void load();
    } catch (e) { toast.error(`Error: ${e instanceof Error ? e.message : "desconocido"}`); }
  } });
  };

  const statusVariant = (s: string): "positive" | "warning" | "default" =>
    s === "APPROVED" ? "positive" : s === "PENDING_APPROVAL" ? "warning" : "default";

  const inp: React.CSSProperties = { width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--foreground)", fontSize: 13 };

  const columns: Column<ManagedDoc>[] = [
    { key: "documentNumber", label: "Folio", render: (d) => <code style={{ fontSize: 11.5 }}>{d.documentNumber}</code>, width: 120 },
    {
      key: "title", label: "Documento",
      render: (d) => (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{d.title}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{d.category?.name ?? "Sin categoría"} · {d.createdBy?.nombre ?? "—"}</div>
        </div>
      ),
    },
    { key: "status", label: "Estado", render: (d) => <Tag variant={statusVariant(d.status)}>{d.status.replace(/_/g, " ")}</Tag>, width: 160 },
    {
      key: "createdAt", label: "Antigüedad",
      render: (d) => {
        if (!d.createdAt) return <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>—</span>;
        const days = Math.floor((Date.now() - new Date(d.createdAt).getTime()) / 86400000);
        const isPending = d.status === "DRAFT" || d.status === "PENDING_APPROVAL";
        const color = !isPending ? "var(--text-tertiary)" : days >= 14 ? "var(--danger)" : days >= 7 ? "var(--warning)" : "var(--text-secondary)";
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>{new Date(d.createdAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}</span>
            {isPending && <span style={{ fontSize: 10.5, fontWeight: days >= 7 ? 700 : 400, color }}>{days}d pendiente</span>}
          </div>
        );
      },
      width: 110,
    },
    {
      key: "acciones" as keyof ManagedDoc, label: "",
      render: (d) => (
        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
          {d.fileUrl && <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); window.open(buildApiUrl(d.fileUrl!), "_blank"); }}>Ver</Button>}
          {cfg.canCreate && d.status !== "APPROVED" && d.status !== "ARCHIVED" && d.status !== "OBSOLETE" && (
            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); void openEdit(d); }}>Editar</Button>
          )}
          {cfg.canApprove && d.status === "PENDING_APPROVAL" && (
            <Button size="sm" variant="primary" onClick={(e) => { e.stopPropagation(); void approve(d); }}>Aprobar</Button>
          )}
          {cfg.canApprove && d.status !== "ARCHIVED" && (
            <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); void archive(d); }}>Archivar</Button>
          )}
        </div>
      ),
      width: 200,
    },
  ];

  return (
    <PageChrome
      eyebrow="ERP · Gobierno"
      title="Documentos"
      subtitle="Contratos, manuales, certificados y actas con versionado y aprobación."
      primaryAction={
        cfg.canCreate ? <Button variant="primary" iconLeft="+" onClick={openNew}>Nuevo documento</Button> : undefined
      }
      secondaryActions={
        <Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>
      }
      filters={
        <FilterToolbar
          search={{ value: search, onChange: setSearch, placeholder: "Buscar por título o folio…" }}
          selects={[
            {
              label: "Estado",
              value: filterStatus,
              onChange: setFilterStatus,
              options: [
                { value: "DRAFT", label: "Borrador" },
                { value: "PENDING_APPROVAL", label: "Pendiente de aprobación" },
                { value: "APPROVED", label: "Aprobado" },
                { value: "ARCHIVED", label: "Archivado" },
              ],
            },
            {
              label: "Categoría",
              value: filterCategory,
              onChange: setFilterCategory,
              options: cats.map((c) => ({ value: String(c.id), label: c.name })),
            },
          ]}
          onClear={() => { setSearch(""); setFilterStatus(""); setFilterCategory(""); }}
          resultCount={loading ? null : filtered.length}
          rightActions={filtered.length > 0 ? (
            <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToExcel(filtered, [
              { key: "documentNumber", label: "Folio" },
              { key: "title", label: "Título" },
              { key: "status", label: "Estado" },
            ], "documentos")}>Excel</Button>
          ) : undefined}
        />
      }
    >
      <div className={chrome.kpiStrip}>
        <KpiCard label="Total documentos" value={docs.length} icon="📂" />
        <KpiCard label="Pendientes de aprobar" value={pendientes} variant={pendientes > 0 ? "warning" : "positive"} icon="⏳" />
        <KpiCard label="Aprobados" value={aprobados} variant="positive" icon="✅" />
        <KpiCard label="Tasa de aprobación" value={docs.length > 0 ? `${Math.round((aprobados / docs.length) * 100)}%` : "—"} variant={docs.length > 0 && aprobados / docs.length >= 0.8 ? "positive" : "default"} icon="📈" hint="Aprobados vs total" />
      </div>

      {docs.length > 0 && (() => {
        const byCat = Object.entries(
          docs.reduce<Record<string, number>>((acc, d) => {
            const k = d.category?.name ?? "Sin categoría";
            acc[k] = (acc[k] ?? 0) + 1;
            return acc;
          }, {})
        ).sort((a, b) => b[1] - a[1]).slice(0, 5);
        return (
          <div style={{ marginBottom: 16, padding: "12px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Documentos por categoría</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {byCat.map(([cat, count]) => (
                <div key={cat} style={{ display: "grid", gridTemplateColumns: "150px 1fr 36px", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cat}</span>
                  <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(count / docs.length) * 100}%`, background: "var(--primary)", borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "right" }}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <Section title={loading ? "Cargando…" : `${filtered.length} documentos`} dense>
        {loading && <EmptyState icon="⏳" title="Cargando documentos…" description="Consultando el repositorio." variant="compact" />}
        {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} variant="compact" />}
        {!loading && !error && <DataTable columns={columns} rows={filtered} rowKey={(d) => d.id} emptyTitle="Sin documentos" emptyDescription="Sube el primer documento al repositorio." />}
      </Section>

      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => { setShowForm(false); setEditing(null); }}>
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: 28, width: 460, maxWidth: "calc(100vw - 32px)", boxShadow: "0 24px 56px rgba(0,0,0,0.24)", border: "1px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>{editing ? "Editar documento" : "Nuevo documento"}</div>
            <div style={{ display: "grid", gap: 14 }}>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Título</span>
                <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Contrato de arrendamiento CEDIS Puebla" style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Categoría</span>
                <select value={form.categoryId} onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))} style={inp}>
                  <option value="">— Sin categoría —</option>
                  {cats.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                </select></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>URL del archivo</span>
                <input value={form.fileUrl} onChange={(e) => setForm((f) => ({ ...f, fileUrl: e.target.value }))} placeholder="/uploads/documents/archivo.pdf" style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Descripción</span>
                <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} style={{ ...inp, resize: "vertical" }} /></label>
              {formErr && (
                <div role="alert" style={{ padding: "8px 12px", background: "var(--state-danger-bg, #fef2f2)", border: "1px solid var(--danger)", borderRadius: 8, fontSize: 12, color: "var(--danger)" }}>
                  {formErr}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => { setShowForm(false); setEditing(null); setFormErr(null); }}>Cancelar</Button>
              <Button variant="primary" onClick={() => void submit()} disabled={saving || !form.title}>{saving ? "Guardando…" : editing ? "Guardar" : "Crear"}</Button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </PageChrome>
  );
}
