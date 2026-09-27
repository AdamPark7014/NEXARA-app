"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
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

interface KbCategory { id: number; name: string; slug: string }
interface KbArticle {
  id: number;
  slug: string;
  title: string;
  excerpt?: string | null;
  status: "DRAFT" | "PUBLISHED" | string;
  visibility: "PUBLIC" | "INTERNAL" | "RESTRICTED" | string;
  categoryId?: number | null;
  category?: { id: number; name: string } | null;
  viewCount?: number;
  tags?: string | null;
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

const emptyForm = { title: "", content: "", categoryId: "", visibility: "INTERNAL", tags: "" };

const VISIBILITY_LABEL: Record<string, string> = {
  INTERNAL: "Todo el equipo",
  RESTRICTED: "Solo dirección",
  PUBLIC: "Público",
};

const STATUS_LABEL: Record<string, string> = {
  PUBLISHED: "Publicado",
  DRAFT: "Borrador",
};

function splitTags(tags?: string | null): string[] {
  return (tags ?? "").split(",").map((t) => t.trim()).filter(Boolean);
}

const inp: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)",
  background: "var(--surface)", color: "var(--foreground)", minHeight: 40, boxSizing: "border-box",
};

export default function KbPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getErpGovernanceSectionConfig(user, "kb"), [user]);
  const token = user?.token ?? "";

  const [articles, setArticles] = useState<KbArticle[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [cats, setCats] = useState<KbCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<KbArticle | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [initialForm, setInitialForm] = useState({ ...emptyForm });
  const [touched, setTouched] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterVisibility, setFilterVisibility] = useState("");
  const [filterCategory, setFilterCategory] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const [artData, catData] = await Promise.all([
        apiFetch("kb/articles", token),
        apiFetch("kb/categories", token).catch(() => []),
      ]);
      setArticles(Array.isArray(artData) ? artData : (artData?.data ?? []));
      setCats(Array.isArray(catData) ? catData : []);
      setLoaded(true);
    } catch (e) {
      setError(formatApiError(e, "No se pudo cargar la base de conocimiento."));
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    let rows = articles;
    const q = deferredSearch.trim().toLowerCase();
    if (q) {
      rows = rows.filter((a) =>
        a.title.toLowerCase().includes(q) ||
        (a.excerpt ?? "").toLowerCase().includes(q) ||
        (a.tags ?? "").toLowerCase().includes(q) ||
        (a.category?.name ?? "").toLowerCase().includes(q),
      );
    }
    if (filterStatus) rows = rows.filter((a) => a.status === filterStatus);
    if (filterVisibility) rows = rows.filter((a) => a.visibility === filterVisibility);
    if (filterCategory) rows = rows.filter((a) => String(a.categoryId ?? a.category?.id ?? "") === filterCategory);
    return rows;
  }, [articles, deferredSearch, filterStatus, filterVisibility, filterCategory]);

  const stats = useMemo(() => {
    let published = 0;
    let drafts = 0;
    let views = 0;
    for (const a of articles) {
      if (a.status === "PUBLISHED") published += 1;
      else if (a.status === "DRAFT") drafts += 1;
      views += a.viewCount ?? 0;
    }
    return { published, drafts, views };
  }, [articles]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setInitialForm({ ...emptyForm });
    setFormErr(null);
    setTouched(false);
    setShowForm(true);
  };

  const openEdit = async (a: KbArticle) => {
    setEditing(a);
    setFormErr(null);
    setTouched(false);
    setShowForm(true);
    const base = {
      title: a.title,
      content: "",
      categoryId: a.categoryId != null ? String(a.categoryId) : "",
      visibility: a.visibility,
      tags: a.tags ?? "",
    };
    setForm(base);
    setInitialForm(base);
    setLoadingEdit(true);
    try {
      const full = await apiFetch(`kb/articles/${a.id}`, token) as KbArticle & { content?: string };
      const next = {
        title: full.title ?? a.title,
        content: full.content ?? "",
        categoryId: full.categoryId != null ? String(full.categoryId) : (a.categoryId != null ? String(a.categoryId) : ""),
        visibility: full.visibility ?? a.visibility,
        tags: full.tags ?? a.tags ?? "",
      };
      setForm(next);
      setInitialForm(next);
    } catch (e) {
      setFormErr(formatApiError(e, "No se pudo cargar el contenido del artículo."));
    } finally {
      setLoadingEdit(false);
    }
  };

  const closeForm = () => { setShowForm(false); setEditing(null); setFormErr(null); };

  const dirty = (Object.keys(form) as Array<keyof typeof form>).some((k) => form[k] !== initialForm[k]);
  const titleError = touched && !form.title.trim() ? "Escribe un título." : null;
  const contentError = touched && !loadingEdit && !form.content.trim() ? "Escribe el contenido del artículo." : null;

  const submit = async () => {
    setTouched(true);
    if (!token || !form.title.trim() || !form.content.trim()) return;
    setSaving(true);
    setFormErr(null);
    try {
      const excerpt = form.content.trim().slice(0, 160).replace(/\s+/g, " ");
      const body = {
        title: form.title.trim(),
        excerpt: excerpt || undefined,
        content: form.content.trim(),
        categoryId: form.categoryId ? Number(form.categoryId) : undefined,
        visibility: form.visibility,
        tags: form.tags.trim() || undefined,
      };
      if (editing) {
        await apiFetch(`kb/articles/${editing.id}`, token, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await apiFetch("kb/articles", token, {
          method: "POST",
          body: JSON.stringify({ ...body, status: "PUBLISHED" }),
        });
      }
      toast.success(editing ? "Artículo actualizado" : "Artículo publicado");
      setShowForm(false);
      setEditing(null);
      setForm({ ...emptyForm });
      void load();
    } catch (e) {
      setFormErr(formatApiError(e, "No se pudo guardar el artículo."));
    } finally { setSaving(false); }
  };

  const remove = (a: KbArticle) => {
    if (!token) return;
    setConfirmState({
      title: "Eliminar artículo",
      message: `Se eliminará «${a.title}». Esta acción no se puede deshacer.`,
      confirmLabel: "Eliminar",
      danger: true,
      fn: async () => {
        try {
          await apiFetch(`kb/articles/${a.id}`, token, { method: "DELETE" });
          setArticles((prev) => prev.filter((x) => x.id !== a.id));
          toast.success("Artículo eliminado");
        } catch (e) {
          toast.error(formatApiError(e, "No se pudo eliminar el artículo"));
        }
      },
    });
  };

  const togglePublish = async (a: KbArticle) => {
    if (!token) return;
    const nextStatus = a.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
    try {
      await apiFetch(`kb/articles/${a.id}`, token, { method: "PATCH", body: JSON.stringify({ status: nextStatus }) });
      setArticles((prev) => prev.map((x) => (x.id === a.id ? { ...x, status: nextStatus } : x)));
      toast.success(nextStatus === "PUBLISHED" ? "Artículo publicado" : "Artículo movido a borradores");
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo cambiar el estado"));
    }
  };

  const columns: Column<KbArticle>[] = [
    {
      key: "title", label: "Artículo",
      render: (a) => {
        const tags = splitTags(a.tags);
        return (
          <div style={{ minWidth: 0, maxWidth: 520 }}>
            <div style={{ fontWeight: 650, fontSize: 13.5 }}>{a.title}</div>
            {a.excerpt && (
              <div
                style={{
                  fontSize: 12.5, color: "var(--text-tertiary)", lineHeight: 1.45, marginTop: 2,
                  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                }}
              >
                {a.excerpt}
              </div>
            )}
            {tags.length > 0 && (
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                {tags.slice(0, 4).map((t) => (
                  <span key={t} style={{ fontSize: 11, padding: "1px 7px", borderRadius: 999, background: "var(--surface-2)", color: "var(--text-secondary)" }}>
                    #{t}
                  </span>
                ))}
                {tags.length > 4 && <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>+{tags.length - 4}</span>}
              </div>
            )}
          </div>
        );
      },
    },
    { key: "category", label: "Categoría", accessor: (a) => a.category?.name ?? "Sin categoría", width: 150 },
    {
      key: "visibility", label: "Quién lo ve", width: 140,
      render: (a) => <Tag variant={a.visibility === "RESTRICTED" ? "warning" : a.visibility === "PUBLIC" ? "accent" : "default"} size="sm">{VISIBILITY_LABEL[a.visibility] ?? "Todo el equipo"}</Tag>,
    },
    {
      key: "status", label: "Estado", width: 110,
      render: (a) => <Tag variant={a.status === "PUBLISHED" ? "positive" : "warning"} size="sm" dot>{STATUS_LABEL[a.status] ?? "Borrador"}</Tag>,
    },
    { key: "viewCount", label: "Lecturas", numeric: true, align: "right", accessor: (a) => (a.viewCount ?? 0).toLocaleString("es-MX"), width: 90 },
    ...(cfg.canCreate ? [{
      key: "acciones" as keyof KbArticle, label: "Acciones", align: "right" as const,
      render: (a: KbArticle) => (
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); void openEdit(a); }}>Editar</Button>
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); void togglePublish(a); }}>
            {a.status === "PUBLISHED" ? "Pasar a borrador" : "Publicar"}
          </Button>
          {cfg.canDelete && (
            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); remove(a); }} style={{ color: "var(--danger)" }}>
              Eliminar
            </Button>
          )}
        </div>
      ),
      width: 280,
    }] : []),
  ];

  const initialLoading = loading && !loaded;
  const clearFilters = () => { setSearch(""); setFilterStatus(""); setFilterVisibility(""); setFilterCategory(""); };

  return (
    <>
      <PageHeader
        eyebrow="Gobierno · Base de conocimiento"
        title="Base de conocimiento"
        subtitle="Procedimientos, manuales técnicos, listas de verificación y políticas internas, con búsqueda y control de quién puede verlos."
        actions={
          <>
            <Button variant="secondary" iconLeft="↻" loading={loading && loaded} onClick={() => void load()}>Actualizar</Button>
            {cfg.canCreate && <Button variant="primary" iconLeft="+" onClick={openNew}>Nuevo artículo</Button>}
          </>
        }
      />

      {loaded && articles.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <MetricStrip
            ariaLabel="Resumen de la base de conocimiento"
            metrics={[
              { label: "Artículos", value: articles.length },
              { label: "Publicados", value: stats.published, tone: "success", onClick: () => setFilterStatus("PUBLISHED") },
              { label: "Borradores", value: stats.drafts, tone: stats.drafts ? "warning" : "default", hint: stats.drafts ? "Pendientes de revisar" : undefined, onClick: () => setFilterStatus("DRAFT") },
              { label: "Lecturas", value: stats.views.toLocaleString("es-MX") },
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

      <FilterToolbar
        search={{ value: search, onChange: setSearch, placeholder: "Buscar por título, contenido, categoría o etiqueta…", ariaLabel: "Buscar artículos" }}
        selects={[
          ...(cats.length > 0 ? [{
            label: "Categoría",
            value: filterCategory,
            onChange: setFilterCategory,
            options: cats.map((c) => ({ value: String(c.id), label: c.name })),
            allowAll: true,
            allLabel: "Todas",
          }] : []),
          {
            label: "Estado",
            value: filterStatus,
            onChange: setFilterStatus,
            options: [
              { value: "PUBLISHED", label: "Publicados" },
              { value: "DRAFT", label: "Borradores" },
            ],
            allowAll: true,
          },
          {
            label: "Quién lo ve",
            value: filterVisibility,
            onChange: setFilterVisibility,
            options: Object.entries(VISIBILITY_LABEL).map(([value, label]) => ({ value, label })),
            allowAll: true,
          },
        ]}
        onClear={clearFilters}
        resultCount={initialLoading ? null : filtered.length}
        rightActions={articles.length > 0 ? (
          <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToExcel(filtered, [
            { key: "title", label: "Título" },
            { key: "category", label: "Categoría", format: (v) => (v as KbArticle["category"])?.name ?? "Sin categoría" },
            { key: "status", label: "Estado", format: (v) => STATUS_LABEL[String(v)] ?? String(v ?? "") },
            { key: "visibility", label: "Quién lo ve", format: (v) => VISIBILITY_LABEL[String(v)] ?? String(v ?? "") },
            { key: "viewCount", label: "Lecturas" },
            { key: "tags", label: "Etiquetas" },
          ], "base-de-conocimiento")}>Exportar a Excel</Button>
        ) : undefined}
      />

      <Section title={initialLoading ? "Cargando artículos" : `${filtered.length} ${filtered.length === 1 ? "artículo" : "artículos"}`}>
        {initialLoading && !error && <SkeletonList rows={5} tableLike />}
        {!loaded && !loading && error && (
          <InlineAlert
            variant="danger"
            title="No se pudo cargar la base de conocimiento"
            message={error}
            action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}
          />
        )}
        {loaded && (
          <DataTable
            columns={columns}
            rows={filtered}
            rowKey={(a) => a.id}
            ariaLabel="Artículos"
            emptyTitle={articles.length === 0 ? "Aún no hay artículos" : "Sin coincidencias"}
            emptyDescription={articles.length === 0 ? "Documenta el primer procedimiento para que el equipo lo consulte." : "Ningún artículo coincide con la búsqueda o los filtros."}
            emptyAction={
              articles.length === 0
                ? (cfg.canCreate ? <Button size="sm" variant="primary" onClick={openNew}>Nuevo artículo</Button> : undefined)
                : <Button size="sm" variant="secondary" onClick={clearFilters}>Limpiar filtros</Button>
            }
          />
        )}
      </Section>

      <Modal
        open={showForm}
        onClose={closeForm}
        dirty={dirty && !saving}
        maxWidth={720}
        title={editing ? "Editar artículo" : "Nuevo artículo"}
        footer={
          <>
            <Button variant="ghost" onClick={closeForm}>Cancelar</Button>
            <Button variant="primary" onClick={() => void submit()} loading={saving} disabled={loadingEdit || (!!editing && !dirty)}>
              {editing ? "Guardar cambios" : "Publicar artículo"}
            </Button>
          </>
        }
      >
        {!editing && (
          <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
            Procedimiento o guía para el equipo. Se publica de inmediato.
          </p>
        )}
        <FormGrid>
          <FormField label="Título" fullWidth error={titleError}>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Ej. Instalación de CCTV residencial: lista de verificación"
              style={inp}
              aria-invalid={!!titleError}
            />
          </FormField>
          <FormField label="Contenido" fullWidth error={contentError} hint="Puedes usar formato Markdown: **negritas**, listas con guiones y títulos con #.">
            {loadingEdit ? (
              <SkeletonList rows={4} />
            ) : (
              <textarea
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                placeholder="Pasos, requisitos y notas técnicas…"
                rows={10}
                style={{ ...inp, resize: "vertical", minHeight: 180, fontFamily: "inherit", lineHeight: 1.55 }}
                aria-invalid={!!contentError}
              />
            )}
          </FormField>
          {cats.length > 0 && (
            <FormField label="Categoría" optional>
              <select value={form.categoryId} onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))} style={inp}>
                <option value="">Sin categoría</option>
                {cats.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
              </select>
            </FormField>
          )}
          <FormField label="Quién puede verlo" fullWidth={cats.length === 0}>
            <select value={form.visibility} onChange={(e) => setForm((f) => ({ ...f, visibility: e.target.value }))} style={inp}>
              <option value="INTERNAL">Todo el equipo</option>
              <option value="RESTRICTED">Solo dirección</option>
              <option value="PUBLIC">Público (portal de clientes)</option>
            </select>
          </FormField>
          <FormField label="Etiquetas" optional fullWidth hint="Separadas por comas.">
            <input
              value={form.tags}
              onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
              placeholder="cctv, instalación, lista de verificación"
              style={inp}
            />
          </FormField>
        </FormGrid>
        {formErr && <InlineAlert message={formErr} style={{ marginTop: 14 }} />}
      </Modal>
      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}
