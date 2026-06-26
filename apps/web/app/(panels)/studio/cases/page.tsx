"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { getStudioSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";

interface CaseStudy {
  id: number;
  titulo: string;
  cliente: string;
  vertical: string;
  impacto: string;
  descripcion?: string;
  cover?: string;
  publicado: boolean;
  slug: string;
  createdAt: string;
  autor?: { id: number; nombre: string };
}

async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const EMPTY_FORM = { titulo: "", cliente: "", vertical: "Servicios", impacto: "", descripcion: "", cover: "🏆" };

export default function StudioCasesPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getStudioSectionConfig(user, "cases"), [user]);
  const token = user?.token ?? "";

  const [items, setItems]     = useState<CaseStudy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState<CaseStudy | null>(null);
  const [form, setForm]         = useState({ ...EMPTY_FORM });
  const [saving, setSaving]     = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch("case-studies?limit=50", token);
      setItems(Array.isArray(data) ? data : (data.data ?? []));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setForm({ ...EMPTY_FORM }); setShowForm(true); };
  const openEdit = (c: CaseStudy) => {
    setEditing(c);
    setForm({ titulo: c.titulo, cliente: c.cliente, vertical: c.vertical, impacto: c.impacto, descripcion: c.descripcion ?? "", cover: c.cover ?? "🏆" });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.titulo || !form.cliente) return alert("Título y cliente son requeridos.");
    setSaving(true);
    try {
      if (editing) {
        const updated = await apiFetch(`case-studies/${editing.id}`, token, { method: "PATCH", body: JSON.stringify(form) });
        setItems(prev => prev.map(c => c.id === editing.id ? updated : c));
      } else {
        const created = await apiFetch("case-studies", token, { method: "POST", body: JSON.stringify(form) });
        setItems(prev => [created, ...prev]);
      }
      setShowForm(false);
    } catch (e: unknown) {
      alert("Error: " + (e instanceof Error ? e.message : "Error"));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (c: CaseStudy) => {
    try {
      const updated = await apiFetch(`case-studies/${c.id}/toggle-publicado`, token, { method: "PATCH" });
      setItems(prev => prev.map(x => x.id === c.id ? { ...x, publicado: updated.publicado } : x));
    } catch { /* ignore */ }
  };

  const remove = async (id: number) => {
    if (!confirm("¿Eliminar este caso de éxito?")) return;
    try {
      await apiFetch(`case-studies/${id}`, token, { method: "DELETE" });
      setItems(prev => prev.filter(c => c.id !== id));
    } catch { /* ignore */ }
  };

  const field = (key: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }));

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 10px", fontSize: 13,
    border: "1px solid var(--border)", borderRadius: 8,
    background: "var(--surface)", color: "var(--foreground)", boxSizing: "border-box",
  };

  return (
    <>
      <PageHeader
        eyebrow="STUDIO · Contenido"
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={
          cfg.canCreate ? <Button variant="primary" iconLeft="🏆" onClick={openNew}>Nuevo caso</Button> : undefined
        }
      />

      {error && (
        <div style={{ padding: 12, borderRadius: 10, background: "color-mix(in srgb, var(--danger) 10%, transparent)", color: "var(--danger)", marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      {showForm && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 20, marginBottom: 18 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>
            {editing ? "Editar caso" : "Nuevo caso de éxito"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>Título *</label>
              <input style={inputStyle} value={form.titulo} onChange={field("titulo")} placeholder="ej. Soriana — CCTV multi-sucursal" />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>Cliente *</label>
              <input style={inputStyle} value={form.cliente} onChange={field("cliente")} placeholder="ej. Soriana S.A.B." />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>Vertical</label>
              <select style={inputStyle} value={form.vertical} onChange={field("vertical")}>
                {["Servicios", "Productos", "Soluciones", "Mantenimiento", "Consultoría"].map(v => <option key={v}>{v}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>Cover (emoji)</label>
              <input style={inputStyle} value={form.cover} onChange={field("cover")} placeholder="🏆" maxLength={10} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>Impacto (frase clave)</label>
              <input style={inputStyle} value={form.impacto} onChange={field("impacto")} placeholder="ej. 12 sucursales · 99.98% uptime · 18 cámaras" />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>Descripción (opcional)</label>
              <textarea style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} value={form.descripcion} onChange={field("descripcion")} placeholder="Describe el proyecto, la solución implementada y los resultados…" />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <Button variant="primary" onClick={save}>{saving ? "Guardando…" : (editing ? "Guardar cambios" : "Crear caso")}</Button>
            <Button variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      <Section title={loading ? "Cargando…" : `${items.length} casos`}>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
        ) : items.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>
            No hay casos de éxito aún.{" "}
            <button onClick={openNew} style={{ color: "var(--primary)", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Crea el primero →</button>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
            {items.map(c => (
              <article key={c.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
                <div style={{
                  height: 120,
                  background: "linear-gradient(135deg, color-mix(in srgb, var(--primary) 25%, transparent), color-mix(in srgb, var(--accent) 15%, transparent))",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 52, position: "relative",
                }}>
                  {c.cover ?? "🏆"}
                  <div style={{ position: "absolute", top: 8, right: 8 }}>
                    <Tag variant={c.publicado ? "positive" : "warning"}>{c.publicado ? "Publicado" : "Borrador"}</Tag>
                  </div>
                </div>
                <div style={{ padding: 14 }}>
                  <Tag variant={c.vertical === "Servicios" ? "accent" : "neutral"}>{c.vertical}</Tag>
                  <div style={{ fontWeight: 700, fontSize: 14, marginTop: 8 }}>{c.titulo}</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>{c.cliente}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 6, lineHeight: 1.5 }}>{c.impacto}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                    <button
                      onClick={() => toggle(c)}
                      style={{ flex: 1, fontSize: 11, padding: "5px 0", borderRadius: 7, cursor: "pointer", border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--foreground)", fontWeight: 600 }}
                    >
                      {c.publicado ? "Despublicar" : "Publicar"}
                    </button>
                    {cfg.canEdit && (
                      <button
                        onClick={() => openEdit(c)}
                        style={{ fontSize: 11, padding: "5px 10px", borderRadius: 7, cursor: "pointer", border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--foreground)" }}
                      >
                        ✎
                      </button>
                    )}
                    {cfg.canDelete && (
                      <button
                        onClick={() => remove(c.id)}
                        style={{ fontSize: 11, padding: "5px 10px", borderRadius: 7, cursor: "pointer", border: "1px solid var(--danger)", background: "color-mix(in srgb, var(--danger) 8%, transparent)", color: "var(--danger)" }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
