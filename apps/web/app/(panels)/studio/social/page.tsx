"use client";

import { useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import KpiCard from "@/components/ui/KpiCard";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { useRbacGuard } from "@/lib/useRbacGuard";
import { buildApiUrl } from "@/lib/api-base";

interface SocialPost {
  id: number;
  red: string;
  titulo: string;
  contenido?: string;
  mediaUrl?: string;
  cuando: string;
  estado: string;
  autor?: { id: number; nombre: string };
}

const RED_EMOJI: Record<string, string> = {
  Instagram: "📷", LinkedIn: "💼", Facebook: "📘", Twitter: "🐦", TikTok: "🎵",
};

const ESTADO_VARIANT: Record<string, "neutral" | "warning" | "positive" | "accent"> = {
  Borrador: "neutral", Programado: "warning", Publicado: "positive", Cancelado: "neutral",
};

async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) + " · " +
    d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

const EMPTY_FORM = { red: "Instagram", titulo: "", contenido: "", cuando: "", estado: "Borrador" };

export default function StudioSocialPage() {
  const { user } = useUser();
  const { canCreate, canEdit, canDelete } = useRbacGuard();
  const token = user?.token ?? "";

  const [items, setItems]     = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState<SocialPost | null>(null);
  const [form, setForm]         = useState({ ...EMPTY_FORM });
  const [saving, setSaving]     = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch("social-posts?limit=50", token);
      setItems(Array.isArray(data) ? data : (data.data ?? []));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    now.setHours(now.getHours() + 1);
    setEditing(null);
    setForm({ ...EMPTY_FORM, cuando: now.toISOString().slice(0, 16) });
    setShowForm(true);
  };

  const openEdit = (p: SocialPost) => {
    setEditing(p);
    setForm({ red: p.red, titulo: p.titulo, contenido: p.contenido ?? "", cuando: p.cuando.slice(0, 16), estado: p.estado });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.titulo || !form.cuando) return alert("Título y fecha son requeridos.");
    setSaving(true);
    try {
      const body = { ...form, cuando: new Date(form.cuando).toISOString() };
      if (editing) {
        const updated = await apiFetch(`social-posts/${editing.id}`, token, { method: "PATCH", body: JSON.stringify(body) });
        setItems(prev => prev.map(p => p.id === editing.id ? updated : p));
      } else {
        const created = await apiFetch("social-posts", token, { method: "POST", body: JSON.stringify(body) });
        setItems(prev => [created, ...prev]);
      }
      setShowForm(false);
    } catch (e: unknown) {
      alert("Error: " + (e instanceof Error ? e.message : "Error"));
    } finally {
      setSaving(false);
    }
  };

  const setEstado = async (id: number, estado: string) => {
    try {
      const updated = await apiFetch(`social-posts/${id}/estado`, token, { method: "PATCH", body: JSON.stringify({ estado }) });
      setItems(prev => prev.map(p => p.id === id ? { ...p, estado: updated.estado } : p));
    } catch { /* ignore */ }
  };

  const remove = async (id: number) => {
    if (!confirm("¿Eliminar este post?")) return;
    try {
      await apiFetch(`social-posts/${id}`, token, { method: "DELETE" });
      setItems(prev => prev.filter(p => p.id !== id));
    } catch { /* ignore */ }
  };

  const field = (key: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }));

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 10px", fontSize: 13,
    border: "1px solid var(--border)", borderRadius: 8,
    background: "var(--surface)", color: "var(--foreground)", boxSizing: "border-box",
  };

  const scheduled = items.filter(p => p.estado === "Programado");
  const published  = items.filter(p => p.estado === "Publicado");
  const drafts     = items.filter(p => p.estado === "Borrador");

  return (
    <>
      <PageHeader
        eyebrow="STUDIO · Contenido"
        title="Redes sociales"
        subtitle="Calendario editorial y posts programados para las cuentas de NEXARA."
        actions={
          canCreate ? <Button variant="primary" iconLeft="✏️" onClick={openNew}>Crear post</Button> : undefined
        }
      />

      {error && (
        <div style={{ padding: 12, borderRadius: 10, background: "color-mix(in srgb, var(--danger) 10%, transparent)", color: "var(--danger)", marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 18 }}>
        <KpiCard label="Programados" value={scheduled.length} hint="Próximas publicaciones" variant="default" icon="📅" />
        <KpiCard label="Publicados" value={published.length} hint="Total histórico" variant="positive" icon="✅" />
        <KpiCard label="Borradores" value={drafts.length} hint="Sin programar aún" variant="default" icon="📝" />
        <KpiCard label="Total posts" value={items.length} hint="En todas las redes" variant="accent" icon="📊" />
      </div>

      {showForm && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 20, marginBottom: 18 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>
            {editing ? "Editar post" : "Nuevo post"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>Red social</label>
              <select style={inputStyle} value={form.red} onChange={field("red")}>
                {["Instagram", "LinkedIn", "Facebook", "Twitter", "TikTok"].map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>Estado</label>
              <select style={inputStyle} value={form.estado} onChange={field("estado")}>
                {["Borrador", "Programado", "Publicado", "Cancelado"].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>Fecha y hora</label>
              <input type="datetime-local" style={inputStyle} value={form.cuando} onChange={field("cuando")} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>Título / descripción corta *</label>
              <input style={inputStyle} value={form.titulo} onChange={field("titulo")} placeholder="ej. Reel — Instalación CCTV Casa Garza" />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>Contenido / caption (opcional)</label>
              <textarea style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} value={form.contenido} onChange={field("contenido")} placeholder="Escribe el texto del post…" />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <Button variant="primary" onClick={save}>{saving ? "Guardando…" : (editing ? "Guardar" : "Crear post")}</Button>
            <Button variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      <Section title={loading ? "Cargando…" : `${items.length} posts`}>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
        ) : items.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>
            No hay posts aún.{" "}
            <button onClick={openNew} style={{ color: "var(--primary)", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Crea el primero →</button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {items.map(p => (
              <article key={p.id} style={{
                display: "grid", gridTemplateColumns: "auto 1fr auto auto auto", gap: 14, alignItems: "center",
                padding: 14, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12,
              }}>
                <span style={{ fontSize: 26 }}>{RED_EMOJI[p.red] ?? "📱"}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{p.titulo}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>{p.red} · {fmtDate(p.cuando)}</div>
                </div>
                <select
                  value={p.estado}
                  onChange={e => setEstado(p.id, e.target.value)}
                  style={{ fontSize: 11.5, border: "1px solid var(--border)", borderRadius: 6, padding: "3px 6px", background: "var(--surface)", color: "var(--foreground)", cursor: "pointer" }}
                >
                  {["Borrador", "Programado", "Publicado", "Cancelado"].map(s => <option key={s}>{s}</option>)}
                </select>
                {canEdit && <button onClick={() => openEdit(p)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--text-tertiary)", padding: "4px 6px" }}>✎</button>}
                {canDelete && <button onClick={() => remove(p.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--danger)", padding: "4px 6px" }}>✕</button>}
              </article>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
