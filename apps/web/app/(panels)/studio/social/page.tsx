"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import KpiCard from "@/components/ui/KpiCard";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { getStudioSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import StudioImageHint from "@/components/studio/StudioImageHint";
import { getSocialImageSpec, studioImageHintLine } from "@/lib/studio-image-specs";
import { toast } from "@/components/Toast";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToExcel } from "@/lib/export-excel";

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

const EMPTY_FORM = { red: "Instagram", titulo: "", contenido: "", mediaUrl: "", cuando: "", estado: "Borrador" };

export default function StudioSocialPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getStudioSectionConfig(user, "social"), [user]);
  const token = user?.token ?? "";

  const [items, setItems]     = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [filterRed, setFilterRed] = useState("");
  const [filterEstado, setFilterEstado] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState<SocialPost | null>(null);
  const [form, setForm]         = useState({ ...EMPTY_FORM });
  const [saving, setSaving]     = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);

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
    setForm({ red: p.red, titulo: p.titulo, contenido: p.contenido ?? "", mediaUrl: p.mediaUrl ?? "", cuando: p.cuando.slice(0, 16), estado: p.estado });
    setShowForm(true);
  };

  const socialImageSpec = useMemo(() => getSocialImageSpec(form.red), [form.red]);

  const save = async () => {
    if (!form.titulo || !form.cuando) { setSaveErr("Título y fecha son requeridos."); return; }
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
      setSaveErr(e instanceof Error ? e.message : "Error al guardar post");
    } finally {
      setSaving(false);
    }
  };

  const setEstado = async (id: number, estado: string) => {
    try {
      const updated = await apiFetch(`social-posts/${id}/estado`, token, { method: "PATCH", body: JSON.stringify({ estado }) });
      setItems(prev => prev.map(p => p.id === id ? { ...p, estado: updated.estado } : p));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar el estado");
    }
  };

  const remove = async (id: number) => {
    setConfirmState({ message: "¿Eliminar este post?", fn: async () => {
    try {
      await apiFetch(`social-posts/${id}`, token, { method: "DELETE" });
      setItems(prev => prev.filter(p => p.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar");
    }
  } });
  };

  const field = (key: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }));

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 10px", fontSize: 13,
    border: "1px solid var(--border)", borderRadius: 8,
    background: "var(--surface)", color: "var(--foreground)", boxSizing: "border-box",
  };

  const scheduled = items.filter((p) => p.estado === "Programado");
  const published  = items.filter((p) => p.estado === "Publicado");
  const drafts     = items.filter((p) => p.estado === "Borrador");

  const visibleItems = useMemo(() => {
    let rows = items;
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      rows = rows.filter((p) => (p.titulo ?? "").toLowerCase().includes(q) || (p.contenido ?? "").toLowerCase().includes(q));
    }
    if (filterRed) rows = rows.filter((p) => p.red === filterRed);
    if (filterEstado) rows = rows.filter((p) => p.estado === filterEstado);
    return rows;
  }, [items, searchQ, filterRed, filterEstado]);

  return (
    <>
      <PageHeader
        eyebrow="STUDIO · Contenido"
        title={cfg.title}
        subtitle={`${cfg.subtitle} ${studioImageHintLine(getSocialImageSpec("Instagram"))}`}
        actions={
          cfg.canCreate ? <Button variant="primary" iconLeft="✏️" onClick={openNew}>Crear post</Button> : undefined
        }
      />

      {error && (
        <div style={{ padding: 12, borderRadius: 10, background: "color-mix(in srgb, var(--danger) 10%, transparent)", color: "var(--danger)", marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 18 }}>
        <KpiCard label="Programados" value={scheduled.length} hint="Próximas publicaciones" variant="warning" icon="📅" />
        <KpiCard label="Publicados" value={published.length} hint="Total histórico" variant="positive" icon="✅" />
        <KpiCard label="Borradores" value={drafts.length} hint="Sin programar aún" variant="default" icon="📝" />
        <KpiCard label="Total posts" value={items.length} hint="En todas las redes" variant="accent" icon="📊" />
      </div>

      {items.length > 0 && (() => {
        const byRed = Object.entries(
          items.reduce<Record<string, number>>((acc, p) => { acc[p.red] = (acc[p.red] ?? 0) + 1; return acc; }, {})
        ).sort((a, b) => b[1] - a[1]);
        return (
          <div style={{ marginBottom: 18, padding: "14px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Distribución por red social</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {byRed.map(([red, count]) => (
                <div key={red} style={{ display: "grid", gridTemplateColumns: "120px 1fr 56px", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>{RED_EMOJI[red] ?? "🌐"} {red}</span>
                  <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(count / items.length) * 100}%`, background: "var(--primary)", borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "right" }}>{count} · {((count / items.length) * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

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
            <div style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>URL de imagen o video (opcional)</label>
              <input
                style={inputStyle}
                type="url"
                value={form.mediaUrl}
                onChange={field("mediaUrl")}
                placeholder="https://…"
              />
              <StudioImageHint spec={socialImageSpec} />
              {form.red === "Instagram" && (
                <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.45 }}>
                  Para historias o Reels usa 1080×1920 px (9:16) en lugar del cuadrado del feed.
                </p>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center" }}>
            {saveErr && <p style={{ color: "var(--danger)", fontSize: 12, margin: 0, flex: 1 }}>{saveErr}</p>}
            <Button variant="primary" onClick={save}>{saving ? "Guardando…" : (editing ? "Guardar" : "Crear post")}</Button>
            <Button variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      <FilterToolbar
        search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar por título o contenido…" }}
        selects={[
          {
            label: "Red",
            value: filterRed,
            onChange: setFilterRed,
            options: ["Instagram", "LinkedIn", "Facebook", "Twitter", "TikTok"].map((r) => ({ value: r, label: r })),
            allowAll: true,
          },
          {
            label: "Estado",
            value: filterEstado,
            onChange: setFilterEstado,
            options: ["Borrador", "Programado", "Publicado", "Cancelado"].map((s) => ({ value: s, label: s })),
            allowAll: true,
          },
        ]}
        onClear={() => { setSearchQ(""); setFilterRed(""); setFilterEstado(""); }}
        resultCount={loading ? null : visibleItems.length}
        rightActions={items.length > 0 ? (
          <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToExcel(visibleItems, [
            { key: "id", label: "ID" },
            { key: "red", label: "Red" },
            { key: "titulo", label: "Título" },
            { key: "estado", label: "Estado" },
            { key: "cuando", label: "Publicación", format: (v) => v ? String(v).slice(0, 16).replace("T", " ") : "" },
          ], "social-posts")}>Excel</Button>
        ) : undefined}
      />

      <Section title={loading ? "Cargando…" : `${visibleItems.length} posts`}>
        {loading && (
          <EmptyState icon="⏳" title="Cargando…" description="Consultando el calendario social." />
        )}
        {!loading && error && (
          <EmptyState
            icon="⚠️"
            title="No se pudo cargar"
            description={error}
            action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}
          />
        )}
        {!loading && !error && items.length === 0 ? (
          <EmptyState
            icon="📱"
            title="Sin posts"
            description="Programa la primera publicación en redes."
            action={
              cfg.canCreate ? (
                <Button size="sm" variant="primary" onClick={openNew}>Crear post</Button>
              ) : undefined
            }
          />
        ) : !loading && !error ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {visibleItems.map(p => (
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
                {cfg.canEdit && <button onClick={() => openEdit(p)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--text-tertiary)", padding: "4px 6px" }}>✎</button>}
                {cfg.canDelete && <button onClick={() => remove(p.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--danger)", padding: "4px 6px" }}>✕</button>}
              </article>
            ))}
          </div>
        ) : null}
      </Section>
      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}
