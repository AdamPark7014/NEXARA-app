"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { useRbacGuard } from "@/lib/useRbacGuard";
import { buildApiUrl } from "@/lib/api-base";

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

const emptyForm = { title: "", excerpt: "", content: "", categoryId: "", visibility: "INTERNAL", tags: "" };

export default function KbPage() {
  const { user } = useUser();
  const { canCreate, canDelete } = useRbacGuard();
  const token = user?.token ?? "";

  const [articles, setArticles] = useState<KbArticle[]>([]);
  const [cats, setCats] = useState<KbCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
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

  const submit = async () => {
    if (!token || !form.title || !form.content) return;
    setSaving(true);
    try {
      await apiFetch("kb/articles", token, {
        method: "POST",
        body: JSON.stringify({
          title: form.title,
          excerpt: form.excerpt || undefined,
          content: form.content,
          categoryId: form.categoryId ? Number(form.categoryId) : undefined,
          visibility: form.visibility,
          tags: form.tags || undefined,
          status: "PUBLISHED",
        }),
      });
      setShowForm(false); setForm({ ...emptyForm });
      void load();
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally { setSaving(false); }
  };

  const remove = async (a: KbArticle) => {
    if (!token || !confirm(`¿Eliminar el artículo "${a.title}"?`)) return;
    try {
      await apiFetch(`kb/articles/${a.id}`, token, { method: "DELETE" });
      setArticles((prev) => prev.filter((x) => x.id !== a.id));
    } catch (e) { alert(`Error: ${e instanceof Error ? e.message : "desconocido"}`); }
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
    ...(canCreate ? [{
      key: "acciones" as keyof KbArticle, label: "",
      render: (a: KbArticle) => (
        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
          <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); void togglePublish(a); }}>
            {a.status === "PUBLISHED" ? "Despublicar" : "Publicar"}
          </Button>
          {canDelete && <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); void remove(a); }}>Eliminar</Button>}
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
            {canCreate && <Button variant="primary" iconLeft="+" onClick={() => setShowForm(true)}>Nuevo artículo</Button>}
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
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowForm(false)}>
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: 28, width: 520, maxWidth: "calc(100vw - 32px)", boxShadow: "0 24px 56px rgba(0,0,0,0.24)", border: "1px solid var(--border)", maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Nuevo artículo</div>
            <div style={{ display: "grid", gap: 14 }}>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Título</span>
                <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Instalación CCTV residencial — checklist" style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Resumen</span>
                <input value={form.excerpt} onChange={(e) => setForm((f) => ({ ...f, excerpt: e.target.value }))} style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Contenido (Markdown)</span>
                <textarea value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} rows={8} style={{ ...inp, resize: "vertical", fontFamily: "monospace" }} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Categoría</span>
                <select value={form.categoryId} onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))} style={inp}>
                  <option value="">— Sin categoría —</option>
                  {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Visibilidad</span>
                <select value={form.visibility} onChange={(e) => setForm((f) => ({ ...f, visibility: e.target.value }))} style={inp}>
                  <option value="PUBLIC">Pública</option>
                  <option value="INTERNAL">Interna (todo el equipo)</option>
                  <option value="RESTRICTED">Restringida (Dirección)</option>
                </select></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Tags (separados por coma)</span>
                <input value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} placeholder="cctv, instalacion, checklist" style={inp} /></label>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button variant="primary" onClick={() => void submit()} disabled={saving || !form.title || !form.content}>{saving ? "Guardando…" : "Publicar"}</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
