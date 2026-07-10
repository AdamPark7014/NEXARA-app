"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import KpiCard from "@/components/ui/KpiCard";
import { Tag } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { getStudioSectionConfig } from "@/lib/section-views";
import { toast } from "@/components/Toast";

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
  updatedAt?: string;
  autor?: { id: number; nombre: string };
}

const VERTICALS = ["Servicios", "Manufactura", "Salud", "Educación", "Retail", "Gobierno", "Tecnología", "Otro"];

async function apiFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...((init.headers ?? {}) as Record<string, string>) },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  if (res.status === 204) return null;
  return res.json();
}

function resolveImageUrl(imageUrl?: string | null): string {
  if (!imageUrl) return "";
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  return buildApiUrl(imageUrl.replace(/^\//, ""));
}

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 12px", borderRadius: 8,
  border: "1px solid var(--border)", background: "var(--surface)",
  color: "var(--foreground)", fontSize: 13, boxSizing: "border-box",
};

export default function CaseStudyDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { user } = useUser();
  const cfg = useMemo(() => getStudioSectionConfig(user, "cases"), [user]);
  const token = user?.token ?? "";

  const [caseStudy, setCaseStudy] = useState<CaseStudy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ titulo: "", cliente: "", vertical: "Servicios", impacto: "", descripcion: "" });

  const load = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch(`case-studies/${id}`, token);
      setCaseStudy(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el caso");
    } finally { setLoading(false); }
  }, [token, id]);

  useEffect(() => { void load(); }, [load]);

  const openEdit = () => {
    if (!caseStudy) return;
    setForm({ titulo: caseStudy.titulo ?? "", cliente: caseStudy.cliente ?? "", vertical: caseStudy.vertical ?? "Servicios", impacto: caseStudy.impacto ?? "", descripcion: caseStudy.descripcion ?? "" });
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!token || !id) return;
    setSaving(true);
    try {
      const updated = await apiFetch(`case-studies/${id}`, token, { method: "PATCH", body: JSON.stringify(form) });
      if (updated) setCaseStudy((prev) => prev ? { ...prev, ...updated } : prev);
      else setCaseStudy((prev) => prev ? { ...prev, ...form } : prev);
      setEditing(false);
      toast.success("Caso actualizado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally { setSaving(false); }
  };

  const togglePublish = async () => {
    if (!token || !id || !caseStudy) return;
    setSaving(true);
    try {
      const updated = await apiFetch(`case-studies/${id}`, token, { method: "PATCH", body: JSON.stringify({ publicado: !caseStudy.publicado }) });
      if (updated) setCaseStudy((prev) => prev ? { ...prev, publicado: updated.publicado } : prev);
      else setCaseStudy((prev) => prev ? { ...prev, publicado: !prev.publicado } : prev);
      toast.success(caseStudy.publicado ? "Caso despublicado" : "Caso publicado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al cambiar estado");
    } finally { setSaving(false); }
  };

  if (loading) return <EmptyState icon="⏳" title="Cargando caso…" description="Consultando datos del caso de estudio." />;
  if (error) return <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />;
  if (!caseStudy) return null;

  const imageUrl = resolveImageUrl(caseStudy.imageUrl);

  return (
    <>
      <PageHeader
        eyebrow="STUDIO · Casos de estudio"
        title={caseStudy.titulo}
        subtitle={[caseStudy.cliente, caseStudy.vertical].filter(Boolean).join(" · ")}
        meta={
          <>
            <Tag variant={caseStudy.publicado ? "positive" : "neutral"} dot>{caseStudy.publicado ? "Publicado" : "Borrador"}</Tag>
            {caseStudy.cover && <span style={{ fontSize: 20 }}>{caseStudy.cover}</span>}
          </>
        }
        actions={
          <>
            <Link href="/studio/cases" style={{ textDecoration: "none" }}>
              <Button variant="ghost">← Casos</Button>
            </Link>
            {cfg.canEdit && (
              <Button variant="secondary" onClick={() => void togglePublish()} disabled={saving}>
                {caseStudy.publicado ? "Despublicar" : "Publicar"}
              </Button>
            )}
            {cfg.canEdit && !editing && (
              <Button variant="primary" iconLeft="✎" onClick={openEdit}>Editar</Button>
            )}
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 20 }}>
        <KpiCard label="Estado" value={caseStudy.publicado ? "Publicado" : "Borrador"} variant={caseStudy.publicado ? "positive" : "default"} icon="📢" />
        <KpiCard label="Cliente" value={caseStudy.cliente} icon="🏢" />
        <KpiCard label="Vertical" value={caseStudy.vertical} icon="🏭" />
        <KpiCard label="Creado" value={new Date(caseStudy.createdAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })} icon="📅" />
      </div>

      {imageUrl && (
        <div style={{ marginBottom: 20, borderRadius: 12, overflow: "hidden", maxHeight: 280, border: "1px solid var(--border)" }}>
          <img src={imageUrl} alt={caseStudy.titulo} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        </div>
      )}

      {editing ? (
        <Section title="Editar caso de estudio">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Título *</label>
              <input value={form.titulo} onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))} style={inp} autoFocus />
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Cliente *</label>
              <input value={form.cliente} onChange={(e) => setForm((f) => ({ ...f, cliente: e.target.value }))} style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Vertical</label>
              <select value={form.vertical} onChange={(e) => setForm((f) => ({ ...f, vertical: e.target.value }))} style={inp}>
                {VERTICALS.map((v) => <option key={v}>{v}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Impacto / resultado clave</label>
              <input value={form.impacto} onChange={(e) => setForm((f) => ({ ...f, impacto: e.target.value }))} placeholder="Ej: Reducción del 40% en tiempo de respuesta" style={inp} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Descripción</label>
              <textarea value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} rows={5} style={{ ...inp, resize: "vertical" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 18, justifyContent: "flex-end" }}>
            <Button variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button>
            <Button variant="primary" onClick={() => void saveEdit()} disabled={saving || !form.titulo.trim() || !form.cliente.trim()}>
              {saving ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        </Section>
      ) : (
        <Section
          title="Detalle del caso"
          actions={cfg.canEdit ? <Button size="sm" variant="ghost" iconLeft="✎" onClick={openEdit}>Editar</Button> : undefined}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {[
              { label: "Cliente", value: caseStudy.cliente },
              { label: "Vertical", value: caseStudy.vertical },
              { label: "Autor", value: caseStudy.autor?.nombre },
              { label: "Publicado", value: caseStudy.publicado ? "Sí" : "No" },
              { label: "Slug", value: caseStudy.slug },
              { label: "Creado", value: new Date(caseStudy.createdAt).toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" }) },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 13, color: value ? "var(--text-primary)" : "var(--text-tertiary)" }}>{value ?? "—"}</div>
              </div>
            ))}
          </div>

          {caseStudy.impacto && (
            <div style={{ marginTop: 16, padding: "12px 16px", background: "color-mix(in srgb, var(--primary) 8%, var(--surface))", border: "1px solid color-mix(in srgb, var(--primary) 20%, var(--border))", borderRadius: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Impacto / resultado</div>
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--primary)", margin: 0, lineHeight: 1.5 }}>{caseStudy.impacto}</p>
            </div>
          )}

          {caseStudy.descripcion && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Descripción</div>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7, margin: 0, whiteSpace: "pre-wrap" }}>{caseStudy.descripcion}</p>
            </div>
          )}
        </Section>
      )}
    </>
  );
}
