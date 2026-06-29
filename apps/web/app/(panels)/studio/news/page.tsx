"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { getStudioSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";

interface NewsPost {
  id: number;
  title: string;
  slug: string;
  summary?: string | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED" | string;
  publishedAt?: string | null;
  createdAt: string;
}

async function apiFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(buildApiUrl(path), { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers as Record<string, string> ?? {}) } });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  if (res.status === 204) return null;
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

export default function StudioNewsPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getStudioSectionConfig(user, "news"), [user]);
  const token = user?.token ?? "";

  const [items, setItems] = useState<NewsPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const data = await apiFetch("news", token);
      setItems(Array.isArray(data) ? data : (data?.data ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar noticias");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const submit = async () => {
    if (!token || title.length < 4 || content.length < 20) return;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("title", title);
      if (summary) fd.append("summary", summary);
      fd.append("content", content);
      fd.append("status", "DRAFT");
      await apiFetch("news", token, { method: "POST", body: fd });
      setShowForm(false); setTitle(""); setSummary(""); setContent("");
      void load();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Error al guardar noticia");
    } finally { setSaving(false); }
  };

  const remove = async (n: NewsPost) => {
    if (!token) return;
    setConfirmState({ message: `¿Eliminar "${n.title}"?`, fn: async () => {
    try {
      await apiFetch(`news/${n.id}`, token, { method: "DELETE" });
      setItems((prev) => prev.filter((i) => i.id !== n.id));
    } catch (e) { setActionErr(e instanceof Error ? e.message : "Error al eliminar"); }
  } });
  };

  const togglePublish = async (n: NewsPost) => {
    if (!token) return;
    const nextStatus = n.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
    try {
      await apiFetch(`news/${n.id}`, token, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus, ...(nextStatus === "PUBLISHED" ? { publishedAt: new Date().toISOString() } : {}) }),
      });
      setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, status: nextStatus, publishedAt: nextStatus === "PUBLISHED" ? new Date().toISOString() : i.publishedAt } : i)));
    } catch (e) { setActionErr(e instanceof Error ? e.message : "Error al eliminar"); }
  };

  const inp: React.CSSProperties = { width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--foreground)", fontSize: 13 };

  const columns: Column<NewsPost>[] = [
    {
      key: "title", label: "Publicación",
      render: (n) => (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{n.title}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>/{n.slug}</div>
        </div>
      ),
    },
    { key: "status", label: "Estado", render: (n) => <Tag variant={n.status === "PUBLISHED" ? "positive" : "warning"}>{n.status}</Tag>, width: 120 },
    { key: "publishedAt", label: "Publicado", render: (n) => <span style={{ fontSize: 12 }}>{n.publishedAt ? new Date(n.publishedAt).toLocaleDateString("es-MX") : "—"}</span>, width: 110 },
    ...(cfg.canCreate ? [{
      key: "acciones" as keyof NewsPost, label: "",
      render: (n: NewsPost) => (
        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
          <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); void togglePublish(n); }}>
            {n.status === "PUBLISHED" ? "Despublicar" : "Publicar"}
          </Button>
          {cfg.canDelete && <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); void remove(n); }}>Eliminar</Button>}
        </div>
      ),
      width: 200,
    }] : []),
  ];

  return (
    <>
      <PageHeader
        eyebrow="STUDIO · Contenido"
        title="Noticias y blog"
        subtitle="Publicaciones del blog público (SEO) que aparecen en /noticias del sitio."
        actions={
          <>
            <Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>
            {cfg.canCreate && <Button variant="primary" iconLeft="+" onClick={() => setShowForm(true)}>Nueva publicación</Button>}
          </>
        }
      />

      {actionErr && (
        <div role="alert" style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, border: "1px solid var(--danger)", color: "var(--danger)", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{actionErr}</span>
          <button type="button" onClick={() => setActionErr(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontWeight: 700, fontSize: 16, lineHeight: 1, padding: "0 4px" }}>×</button>
        </div>
      )}
      <Section title={loading ? "Cargando…" : `${items.length} publicaciones`}>
        {loading && <EmptyState icon="⏳" title="Cargando…" description="Consultando el blog público." />}
        {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}
        {!loading && !error && <DataTable columns={columns} rows={items} rowKey={(n) => n.id} emptyTitle="Sin publicaciones" emptyDescription="Escribe la primera entrada del blog." />}
      </Section>

      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowForm(false)}>
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: 28, width: 520, maxWidth: "calc(100vw - 32px)", boxShadow: "0 24px 56px rgba(0,0,0,0.24)", border: "1px solid var(--border)", maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Nueva publicación</div>
            <div style={{ display: "grid", gap: 14 }}>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Título</span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Mínimo 4 caracteres" style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Resumen</span>
                <input value={summary} onChange={(e) => setSummary(e.target.value)} style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Contenido</span>
                <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Mínimo 20 caracteres" rows={8} style={{ ...inp, resize: "vertical" }} /></label>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
              {saveErr && <p style={{ color: "var(--danger)", fontSize: 12, margin: "0 0 8px" }}>{saveErr}</p>}
              <Button variant="secondary" onClick={() => { setShowForm(false); setSaveErr(null); }}>Cancelar</Button>
              <Button variant="primary" onClick={() => void submit()} disabled={saving || title.length < 4 || content.length < 20}>{saving ? "Guardando…" : "Crear borrador"}</Button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}
