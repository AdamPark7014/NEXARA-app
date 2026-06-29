"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { getErpGovernanceSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";

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

export default function KbPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getErpGovernanceSectionConfig(user, "kb"), [user]);
  const token = user?.token ?? "";

  const [articles, setArticles] = useState<KbArticle[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [cats, setCats] = useState<KbCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<KbArticle | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [formErr, setFormErr] = useState<string | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar la base de conocimiento");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return articles;
    return articles.filter((a) => a.title.toLowerCase().includes(q) || (a.tags ?? "").toLowerCase().includes(q));
  }, [articles, search]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setFormErr(null);
    setShowForm(true);
  };

  const openEdit = async (a: KbArticle) => {
    setEditing(a);
    setFormErr(null);
    setShowForm(true);
    setForm({
      title: a.title,
      content: "",
      categoryId: a.categoryId != null ? String(a.categoryId) : "",
      visibility: a.visibility,
      tags: a.tags ?? "",
    });
    setLoadingEdit(true);
    try {
      const full = await apiFetch(`kb/articles/${a.id}`, token) as KbArticle & { content?: string };
      setForm({
        title: full.title ?? a.title,
        content: full.content ?? "",
        categoryId: full.categoryId != null ? String(full.categoryId) : (a.categoryId != null ? String(a.categoryId) : ""),
        visibility: full.visibility ?? a.visibility,
        tags: full.tags ?? a.tags ?? "",
      });
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : "No se pudo cargar el artículo");
    } finally {
      setLoadingEdit(false);
    }
  };

  const submit = async () => {
    if (!token || !form.title || !form.content) return;
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
      setShowForm(false);
      setEditing(null);
      setForm({ ...emptyForm });
      void load();
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : "No se pudo guardar");
    } finally { setSaving(false); }
  };

  const remove = async (a: KbArticle) => {
    if (!token) return;
    setConfirmState({ message: `¿Eliminar el artículo "${a.title}"?`, fn: async () => {
    try {
      await apiFetch(`kb/articles/${a.id}`, token, { method: "DELETE" });
      setArticles((prev) => prev.filter((x) => x.id !== a.id));
    } catch (e) { alert(`Error: ${e instanceof Error ? e.message : "desconocido"}`); }
  } });
  };

  const togglePublish = async (a: KbArticle) => {
    if (!token) return;
    const nextStatus = a.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
    try {
      await apiFetch(`kb/articles/${a.id}`, token, { method: "PATCH", body: JSON.stringify({ status: nextStatus }) });
      setArticles((prev) => prev.map((x) => (x.id === a.id ? { ...x, status: nextStatus } : x)));
    } catch (e) { alert(`Error: ${e instanceof Error ? e.message : "desconocido"}`); }
  };

  const inp: React.CSSProperties = { width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--foreground)", fontSize: 13 };

  const columns: Column<KbArticle>[] = [
    {
      key: "title", label: "Artículo",
      render: (a) => (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{a.title}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{a.excerpt?.slice(0, 70) ?? "—"}</div>
        </div>
      ),
    },
    { key: "category", label: "Categoría", accessor: (a) => a.category?.name ?? "—", width: 140 },
    { key: "visibility", label: "Visibilidad", render: (a) => <Tag variant={a.visibility === "RESTRICTED" ? "warning" : "default"}>{a.visibility}</Tag>, width: 120 },
    { key: "status", label: "Estado", render: (a) => <Tag variant={a.status === "PUBLISHED" ? "positive" : "warning"}>{a.status}</Tag>, width: 110 },
    { key: "viewCount", label: "Vistas", accessor: (a) => a.viewCount ?? 0, width: 80 },
    ...(cfg.canCreate ? [{
      key: "acciones" as keyof KbArticle, label: "",
      render: (a: KbArticle) => (
        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); void openEdit(a); }}>Editar</Button>
          <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); void togglePublish(a); }}>
            {a.status === "PUBLISHED" ? "Despublicar" : "Publicar"}
          </Button>
          {cfg.canDelete && <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); void remove(a); }}>Eliminar</Button>}
        </div>
      ),
      width: 200,
    }] : []),
  ];

  return (
    <>
      <PageHeader
        eyebrow="ERP · Gobierno"
        title="Knowledge Base"
        subtitle="Procedimientos, manuales técnicos, checklists y políticas internas — wiki con búsqueda y permisos por visibilidad."
        actions={
          <>
            <Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>
            {cfg.canCreate && <Button variant="primary" iconLeft="+" onClick={openNew}>Nuevo artículo</Button>}
          </>
        }
      />

      <div style={{ marginBottom: 12 }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por título o tag…" style={{ width: "100%", maxWidth: 400, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--foreground)", fontSize: 13 }} />
      </div>

      <Section title={loading ? "Cargando…" : `${filtered.length} artículos`}>
        {loading && <EmptyState icon="⏳" title="Cargando…" description="Consultando la base de conocimiento." />}
        {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}
        {!loading && !error && <DataTable columns={columns} rows={filtered} rowKey={(a) => a.id} emptyTitle="Sin artículos" emptyDescription="Crea el primer artículo de la wiki interna." />}
      </Section>

      {showForm && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(0,0,0,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16,
          }}
          onClick={() => setShowForm(false)}
        >
          <div
            role="dialog"
            aria-labelledby="kb-new-title"
            style={{
              background: "var(--surface)",
              borderRadius: 14,
              width: "100%",
              maxWidth: 520,
              maxHeight: "min(88vh, 560px)",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 20px 48px rgba(0,0,0,0.22)",
              border: "1px solid var(--border)",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: "18px 20px 12px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
              <div id="kb-new-title" style={{ fontSize: 15, fontWeight: 700 }}>{editing ? "Editar artículo" : "Nuevo artículo"}</div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>
                Procedimiento o guía para el equipo. Se publica de inmediato en la wiki interna.
              </div>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "grid", gap: 12 }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Título *</span>
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Ej. Instalación CCTV residencial — checklist"
                  style={inp}
                  autoFocus
                />
              </label>

              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Contenido *</span>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                  placeholder="Pasos, requisitos, notas técnicas… (Markdown permitido)"
                  rows={5}
                  style={{ ...inp, resize: "vertical", minHeight: 96, maxHeight: 180, fontFamily: "inherit", lineHeight: 1.45 }}
                />
              </label>

              <div style={{ display: "grid", gridTemplateColumns: cats.length > 0 ? "1fr 1fr" : "1fr", gap: 12 }}>
                {cats.length > 0 && (
                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Categoría</span>
                    <select value={form.categoryId} onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))} style={inp}>
                      <option value="">Sin categoría</option>
                      {cats.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                    </select>
                  </label>
                )}
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Quién puede verlo</span>
                  <select value={form.visibility} onChange={(e) => setForm((f) => ({ ...f, visibility: e.target.value }))} style={inp}>
                    <option value="INTERNAL">Todo el equipo</option>
                    <option value="RESTRICTED">Solo dirección</option>
                    <option value="PUBLIC">Público (portal)</option>
                  </select>
                </label>
              </div>

              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Etiquetas (opcional)</span>
                <input
                  value={form.tags}
                  onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                  placeholder="cctv, instalación, checklist"
                  style={inp}
                />
              </label>

              {formErr && (
                <div role="alert" style={{ padding: "8px 12px", background: "var(--state-danger-bg, #fef2f2)", border: "1px solid var(--danger)", borderRadius: 8, fontSize: 12, color: "var(--danger)" }}>
                  {formErr}
                </div>
              )}
            </div>

            <div style={{
              display: "flex", gap: 10, padding: "12px 20px 16px",
              justifyContent: "flex-end", borderTop: "1px solid var(--border)", flexShrink: 0,
              background: "var(--surface)",
            }}>
              <Button variant="secondary" onClick={() => { setShowForm(false); setEditing(null); setFormErr(null); }}>Cancelar</Button>
              <Button
                variant="primary"
                onClick={() => void submit()}
                disabled={saving || loadingEdit || !form.title.trim() || !form.content.trim()}
              >
                {saving ? "Guardando…" : loadingEdit ? "Cargando…" : editing ? "Guardar cambios" : "Publicar artículo"}
              </Button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}
