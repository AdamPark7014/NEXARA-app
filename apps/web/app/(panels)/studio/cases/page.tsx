"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import { Tag } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { getStudioSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import StudioFileInput from "@/components/studio/StudioFileInput";
import { STUDIO_IMAGE_SPECS, studioImageHintLine } from "@/lib/studio-image-specs";
import { toast } from "@/components/Toast";

const CASE_COVER_SPEC = STUDIO_IMAGE_SPECS.caseCover;

interface CaseStudy {
  id: number;
  titulo: string;
  cliente: string;
  vertical: string;
  impacto: string;
  descripcion?: string;
  cover?: string;
  imageUrl?: string | null;
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

async function apiFormData(path: string, token: string, formData: FormData, method = "POST") {
  const res = await fetch(buildApiUrl(path), {
    method,
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function resolveCaseStudyImageUrl(imageUrl?: string | null): string {
  if (!imageUrl) return "";
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  return buildApiUrl(imageUrl.replace(/^\//, ""));
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
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [saving, setSaving]     = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);

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

  const openNew = () => { setEditing(null); setForm({ ...EMPTY_FORM }); setCoverFile(null); setShowForm(true); };
  const openEdit = (c: CaseStudy) => {
    setEditing(c);
    setForm({ titulo: c.titulo, cliente: c.cliente, vertical: c.vertical, impacto: c.impacto, descripcion: c.descripcion ?? "", cover: c.cover ?? "🏆" });
    setCoverFile(null);
    setShowForm(true);
  };

  const save = async () => {
    if (!form.titulo || !form.cliente) { setSaveErr("Título y cliente son requeridos."); return; }
    setSaving(true);
    setSaveErr(null);
    try {
      if (coverFile) {
        const fd = new FormData();
        Object.entries(form).forEach(([key, value]) => fd.append(key, value));
        fd.append("coverImage", coverFile);
        if (editing) {
          const updated = await apiFormData(`case-studies/${editing.id}`, token, fd, "PATCH");
          setItems(prev => prev.map(c => c.id === editing.id ? updated : c));
        } else {
          const created = await apiFormData("case-studies", token, fd);
          setItems(prev => [created, ...prev]);
        }
      } else if (editing) {
        const updated = await apiFetch(`case-studies/${editing.id}`, token, { method: "PATCH", body: JSON.stringify(form) });
        setItems(prev => prev.map(c => c.id === editing.id ? updated : c));
      } else {
        const created = await apiFetch("case-studies", token, { method: "POST", body: JSON.stringify(form) });
        setItems(prev => [created, ...prev]);
      }
      setShowForm(false);
      setCoverFile(null);
    } catch (e: unknown) {
      setSaveErr(e instanceof Error ? e.message : "Error al guardar caso");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (c: CaseStudy) => {
    try {
      const updated = await apiFetch(`case-studies/${c.id}/toggle-publicado`, token, { method: "PATCH" });
      setItems(prev => prev.map(x => x.id === c.id ? { ...x, publicado: updated.publicado } : x));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar el estado");
    }
  };

  const remove = async (id: number) => {
    setConfirmState({ message: "¿Eliminar este caso de éxito?", fn: async () => {
    try {
      await apiFetch(`case-studies/${id}`, token, { method: "DELETE" });
      setItems(prev => prev.filter(c => c.id !== id));
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

  return (
    <>
      <PageHeader
        eyebrow="STUDIO · Contenido"
        title={cfg.title}
        subtitle={`${cfg.subtitle} ${studioImageHintLine(CASE_COVER_SPEC)}`}
        actions={
          cfg.canCreate ? <Button variant="primary" iconLeft="🏆" onClick={openNew}>Nuevo caso</Button> : undefined
        }
      />

      {error && (
        <div style={{ padding: 12, borderRadius: 10, background: "color-mix(in srgb, var(--danger) 10%, transparent)", color: "var(--danger)", marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      {!loading && items.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 18 }}>
          <KpiCard label="Casos totales" value={items.length} icon="🏆" />
          <KpiCard label="Publicados" value={items.filter(c => c.publicado).length} variant="positive" icon="✅" hint="Visibles en el sitio" />
          <KpiCard label="Borradores" value={items.filter(c => !c.publicado).length} variant={items.filter(c => !c.publicado).length > 0 ? "warning" : "default"} icon="📝" hint="Pendientes de publicar" />
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
            <div style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1 / -1" }}>
              <StudioFileInput
                spec={CASE_COVER_SPEC}
                label="Foto de portada (opcional)"
                showDetailHint
                compactHint={false}
                fileName={
                  coverFile
                    ? coverFile.name
                    : editing?.imageUrl
                      ? "Imagen actual en servidor"
                      : null
                }
                onChange={setCoverFile}
                onError={(msg) => toast.error(msg)}
                inputStyle={inputStyle}
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center" }}>
            {saveErr && <p style={{ color: "var(--danger)", fontSize: 12, margin: 0, flex: 1 }}>{saveErr}</p>}
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
            {items.map(c => {
              const coverSrc = resolveCaseStudyImageUrl(c.imageUrl);
              return (
              <article key={c.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
                <div style={{
                  height: 120,
                  background: coverSrc
                    ? "#0a1419"
                    : "linear-gradient(135deg, color-mix(in srgb, var(--primary) 25%, transparent), color-mix(in srgb, var(--accent) 15%, transparent))",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 52, position: "relative",
                  overflow: "hidden",
                }}>
                  {coverSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coverSrc} alt={c.titulo} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    c.cover ?? "🏆"
                  )}
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
            );})}
          </div>
        )}
      </Section>
      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}
