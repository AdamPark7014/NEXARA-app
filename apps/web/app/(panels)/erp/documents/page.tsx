"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import PageChrome from "@/components/ui/PageChrome";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import MetricStrip from "@/components/ui/MetricStrip";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import InlineAlert from "@/components/ui/InlineAlert";
import Modal from "@/components/ui/Modal";
import { FormField, FormGrid } from "@/components/ui/FormField";
import { SkeletonList } from "@/components/PageState";
import { useUser } from "@/components/UserContext";
import { getErpGovernanceSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import { toast } from "@/components/Toast";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToExcel } from "@/lib/export-excel";

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

const STATUS_META: Record<string, { label: string; variant: "positive" | "warning" | "default" | "neutral" | "danger" }> = {
  DRAFT: { label: "Borrador", variant: "default" },
  PENDING_APPROVAL: { label: "Por aprobar", variant: "warning" },
  APPROVED: { label: "Aprobado", variant: "positive" },
  ARCHIVED: { label: "Archivado", variant: "neutral" },
  OBSOLETE: { label: "Obsoleto", variant: "neutral" },
};

const LOCKED_STATUSES = new Set(["APPROVED", "ARCHIVED", "OBSOLETE"]);

function statusMeta(s: string) {
  return STATUS_META[s] ?? { label: "Borrador", variant: "default" as const };
}

function fileIcon(url?: string | null): { icon: string; label: string } {
  const ext = (url ?? "").split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return { icon: "📕", label: "PDF" };
  if (["doc", "docx", "odt", "rtf"].includes(ext)) return { icon: "📘", label: "Word" };
  if (["xls", "xlsx", "csv", "ods"].includes(ext)) return { icon: "📗", label: "Excel" };
  if (["ppt", "pptx", "odp"].includes(ext)) return { icon: "📙", label: "Presentación" };
  if (["png", "jpg", "jpeg", "gif", "webp", "heic"].includes(ext)) return { icon: "🖼️", label: "Imagen" };
  if (["zip", "rar", "7z"].includes(ext)) return { icon: "🗜️", label: "Comprimido" };
  if (url) return { icon: "📎", label: "Archivo" };
  return { icon: "📄", label: "Sin archivo" };
}

const DAY_MS = 86_400_000;

const inp: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)",
  background: "var(--surface)", color: "var(--foreground)", minHeight: 40, boxSizing: "border-box",
};

export default function DocumentsPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getErpGovernanceSectionConfig(user, "documents"), [user]);
  const token = user?.token ?? "";

  const [docs, setDocs] = useState<ManagedDoc[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [cats, setCats] = useState<DocCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ManagedDoc | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [initialForm, setInitialForm] = useState({ ...emptyForm });
  const [touched, setTouched] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
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
      setLoaded(true);
    } catch (e) {
      setError(formatApiError(e, "No se pudieron cargar los documentos."));
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    let rows = docs;
    const q = deferredSearch.trim().toLowerCase();
    if (q) {
      rows = rows.filter((d) =>
        d.title.toLowerCase().includes(q) ||
        d.documentNumber.toLowerCase().includes(q) ||
        (d.description ?? "").toLowerCase().includes(q) ||
        (d.createdBy?.nombre ?? "").toLowerCase().includes(q),
      );
    }
    if (filterStatus) rows = rows.filter((d) => d.status === filterStatus);
    if (filterCategory) rows = rows.filter((d) => String(d.categoryId ?? "") === filterCategory);
    return rows;
  }, [docs, deferredSearch, filterStatus, filterCategory]);

  const stats = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let stale = 0;
    const now = Date.now();
    for (const d of docs) {
      if (d.status === "PENDING_APPROVAL") {
        pending += 1;
        if (d.createdAt && now - new Date(d.createdAt).getTime() >= 7 * DAY_MS) stale += 1;
      } else if (d.status === "APPROVED") approved += 1;
    }
    return { pending, approved, stale };
  }, [docs]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setInitialForm({ ...emptyForm });
    setFormErr(null);
    setTouched(false);
    setShowForm(true);
  };

  const openEdit = async (d: ManagedDoc) => {
    if (LOCKED_STATUSES.has(d.status)) {
      toast.warning("Solo se pueden editar documentos en borrador o por aprobar.");
      return;
    }
    setEditing(d);
    setFormErr(null);
    setTouched(false);
    setShowForm(true);
    const base = {
      title: d.title,
      description: d.description ?? "",
      categoryId: d.categoryId != null ? String(d.categoryId) : "",
      fileUrl: d.fileUrl ?? "",
    };
    setForm(base);
    setInitialForm(base);
    try {
      const full = await apiFetch(`documents/${d.id}`, token) as ManagedDoc;
      const next = {
        title: full.title ?? d.title,
        description: full.description ?? "",
        categoryId: full.categoryId != null ? String(full.categoryId) : "",
        fileUrl: full.fileUrl ?? "",
      };
      setForm(next);
      setInitialForm(next);
    } catch (e) {
      setFormErr(formatApiError(e, "No se pudo cargar el documento completo."));
    }
  };

  const closeForm = () => { setShowForm(false); setEditing(null); setFormErr(null); };
  const dirty = (Object.keys(form) as Array<keyof typeof form>).some((k) => form[k] !== initialForm[k]);
  const titleError = touched && !form.title.trim() ? "Escribe un título." : null;

  const submit = async () => {
    setTouched(true);
    if (!token || !form.title.trim()) return;
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
      toast.success(editing ? "Documento actualizado" : "Documento creado");
      setShowForm(false);
      setEditing(null);
      setForm({ ...emptyForm });
      void load();
    } catch (e) {
      setFormErr(formatApiError(e, "No se pudo guardar el documento."));
    } finally { setSaving(false); }
  };

  const approve = async (d: ManagedDoc) => {
    if (!token) return;
    setApproving(d.id);
    try {
      await apiFetch(`documents/${d.id}/approve`, token, { method: "PATCH" });
      toast.success("Documento aprobado");
      void load();
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo aprobar el documento"));
    } finally {
      setApproving(null);
    }
  };

  const archive = (d: ManagedDoc) => {
    if (!token) return;
    setConfirmState({
      title: "Archivar documento",
      message: `«${d.title}» dejará de estar vigente y ya no podrá editarse.`,
      confirmLabel: "Archivar",
      danger: true,
      fn: async () => {
        try {
          await apiFetch(`documents/${d.id}/archive`, token, { method: "PATCH" });
          toast.success("Documento archivado");
          void load();
        } catch (e) {
          toast.error(formatApiError(e, "No se pudo archivar el documento"));
        }
      },
    });
  };

  const columns: Column<ManagedDoc>[] = [
    {
      key: "title", label: "Documento",
      render: (d) => {
        const f = fileIcon(d.fileUrl);
        return (
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", minWidth: 0 }}>
            <span aria-hidden="true" title={f.label} style={{ fontSize: 20, lineHeight: 1.2 }}>{f.icon}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 650, fontSize: 13.5 }}>{d.title}</div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{d.documentNumber}</span>
                <span>· {d.category?.name ?? "Sin categoría"}</span>
                {d.createdBy?.nombre && <span>· {d.createdBy.nombre}</span>}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      key: "status", label: "Estado", width: 130,
      render: (d) => {
        const m = statusMeta(d.status);
        return <Tag variant={m.variant} size="sm" dot>{m.label}</Tag>;
      },
    },
    {
      key: "createdAt", label: "Creado", width: 130,
      render: (d) => {
        if (!d.createdAt) return <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>—</span>;
        const days = Math.floor((Date.now() - new Date(d.createdAt).getTime()) / DAY_MS);
        const isPending = d.status === "DRAFT" || d.status === "PENDING_APPROVAL";
        const color = days >= 14 ? "var(--state-danger-text)" : days >= 7 ? "var(--state-warning-text)" : "var(--text-tertiary)";
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <time dateTime={d.createdAt} style={{ fontSize: 12.5, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
              {new Date(d.createdAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
            </time>
            {isPending && days > 0 && (
              <span style={{ fontSize: 11.5, fontWeight: days >= 7 ? 650 : 400, color }}>
                {days === 1 ? "1 día sin cerrar" : `${days} días sin cerrar`}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: "acciones" as keyof ManagedDoc, label: "Acciones", align: "right",
      render: (d) => (
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
          {d.fileUrl && (
            <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); window.open(buildApiUrl(d.fileUrl!), "_blank", "noopener"); }}>
              Abrir
            </Button>
          )}
          {cfg.canCreate && !LOCKED_STATUSES.has(d.status) && (
            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); void openEdit(d); }}>Editar</Button>
          )}
          {cfg.canApprove && d.status === "PENDING_APPROVAL" && (
            <Button size="sm" variant="primary" loading={approving === d.id} onClick={(e) => { e.stopPropagation(); void approve(d); }}>Aprobar</Button>
          )}
          {cfg.canApprove && d.status !== "ARCHIVED" && (
            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); archive(d); }} style={{ color: "var(--danger)" }}>Archivar</Button>
          )}
        </div>
      ),
      width: 280,
    },
  ];

  const initialLoading = loading && !loaded;
  const clearFilters = () => { setSearch(""); setFilterStatus(""); setFilterCategory(""); };

  return (
    <PageChrome
      eyebrow="Gobierno · Documentos"
      title="Documentos"
      subtitle="Contratos, manuales, certificados y actas con control de versiones y aprobación."
      primaryAction={
        cfg.canCreate ? <Button variant="primary" iconLeft="+" onClick={openNew}>Nuevo documento</Button> : undefined
      }
      secondaryActions={
        <Button variant="secondary" iconLeft="↻" loading={loading && loaded} onClick={() => void load()}>Actualizar</Button>
      }
      filters={
        <FilterToolbar
          search={{ value: search, onChange: setSearch, placeholder: "Buscar por título, folio, descripción o autor…", ariaLabel: "Buscar documentos" }}
          selects={[
            {
              label: "Estado",
              value: filterStatus,
              onChange: setFilterStatus,
              options: ["DRAFT", "PENDING_APPROVAL", "APPROVED", "ARCHIVED"].map((s) => ({ value: s, label: STATUS_META[s].label })),
              allowAll: true,
            },
            ...(cats.length > 0 ? [{
              label: "Categoría",
              value: filterCategory,
              onChange: setFilterCategory,
              options: cats.map((c) => ({ value: String(c.id), label: c.name })),
              allowAll: true,
              allLabel: "Todas",
            }] : []),
          ]}
          onClear={clearFilters}
          resultCount={initialLoading ? null : filtered.length}
          rightActions={filtered.length > 0 ? (
            <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToExcel(filtered, [
              { key: "documentNumber", label: "Folio" },
              { key: "title", label: "Título" },
              { key: "category", label: "Categoría", format: (v) => (v as ManagedDoc["category"])?.name ?? "Sin categoría" },
              { key: "status", label: "Estado", format: (v) => statusMeta(String(v ?? "")).label },
              { key: "createdBy", label: "Autor", format: (v) => (v as ManagedDoc["createdBy"])?.nombre ?? "" },
              { key: "createdAt", label: "Creado", format: (v) => (v ? new Date(String(v)).toLocaleDateString("es-MX") : "") },
            ], "documentos")}>Exportar a Excel</Button>
          ) : undefined}
        />
      }
    >
      {loaded && docs.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <MetricStrip
            ariaLabel="Resumen de documentos"
            metrics={[
              { label: "Documentos", value: docs.length },
              {
                label: "Por aprobar",
                value: stats.pending,
                tone: stats.pending ? "warning" : "success",
                hint: stats.stale ? `${stats.stale} con más de 7 días` : undefined,
                onClick: () => setFilterStatus("PENDING_APPROVAL"),
              },
              { label: "Aprobados", value: stats.approved, tone: "success", onClick: () => setFilterStatus("APPROVED") },
              { label: "Aprobados del total", value: `${Math.round((stats.approved / docs.length) * 100)}%` },
            ]}
          />
        </div>
      )}

      {error && loaded && (
        <InlineAlert
          variant="warning"
          title="No se pudo actualizar"
          message={`${error} Mostramos la última información cargada.`}
          action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}
          style={{ marginBottom: 16 }}
        />
      )}

      <Section title={initialLoading ? "Cargando documentos" : `${filtered.length} ${filtered.length === 1 ? "documento" : "documentos"}`} dense>
        {initialLoading && !error && <SkeletonList rows={5} tableLike />}
        {!loaded && !loading && error && (
          <InlineAlert
            variant="danger"
            title="No se pudieron cargar los documentos"
            message={error}
            action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}
          />
        )}
        {loaded && (
          <DataTable
            columns={columns}
            rows={filtered}
            rowKey={(d) => d.id}
            ariaLabel="Documentos"
            emptyTitle={docs.length === 0 ? "Aún no hay documentos" : "Sin coincidencias"}
            emptyDescription={docs.length === 0 ? "Registra el primer contrato, manual o certificado." : "Ningún documento coincide con la búsqueda o los filtros."}
            emptyAction={
              docs.length === 0
                ? (cfg.canCreate ? <Button size="sm" variant="primary" onClick={openNew}>Nuevo documento</Button> : undefined)
                : <Button size="sm" variant="secondary" onClick={clearFilters}>Limpiar filtros</Button>
            }
          />
        )}
      </Section>

      <Modal
        open={showForm}
        onClose={closeForm}
        dirty={dirty && !saving}
        maxWidth={560}
        title={editing ? "Editar documento" : "Nuevo documento"}
        footer={
          <>
            <Button variant="ghost" onClick={closeForm}>Cancelar</Button>
            <Button variant="primary" onClick={() => void submit()} loading={saving} disabled={!!editing && !dirty}>
              {editing ? "Guardar cambios" : "Crear documento"}
            </Button>
          </>
        }
      >
        <FormGrid>
          <FormField label="Título" fullWidth error={titleError}>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Contrato de arrendamiento CEDIS Puebla"
              style={inp}
              aria-invalid={!!titleError}
            />
          </FormField>
          <FormField label="Categoría" optional fullWidth>
            <select value={form.categoryId} onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))} style={inp}>
              <option value="">Sin categoría</option>
              {cats.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
            </select>
          </FormField>
          <FormField label="Ubicación del archivo" optional fullWidth hint="Ruta o enlace donde está guardado el archivo.">
            <input
              value={form.fileUrl}
              onChange={(e) => setForm((f) => ({ ...f, fileUrl: e.target.value }))}
              placeholder="/uploads/documents/archivo.pdf"
              style={inp}
              autoCapitalize="off"
              spellCheck={false}
            />
          </FormField>
          <FormField label="Descripción" optional fullWidth>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={4}
              style={{ ...inp, resize: "vertical", lineHeight: 1.5 }}
            />
          </FormField>
        </FormGrid>
        {formErr && <InlineAlert message={formErr} style={{ marginTop: 14 }} />}
      </Modal>
      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </PageChrome>
  );
}
