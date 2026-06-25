"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { getErpGovernanceSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";

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

export default function DocumentsPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getErpGovernanceSectionConfig(user, "documents"), [user]);
  const token = user?.token ?? "";

  const [docs, setDocs] = useState<ManagedDoc[]>([]);
  const [cats, setCats] = useState<DocCategory[]>([]);
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
      const [docsData, catsData] = await Promise.all([
        apiFetch("documents", token),
        apiFetch("documents/categories", token).catch(() => []),
      ]);
      setDocs(Array.isArray(docsData) ? docsData : (docsData?.data ?? []));
      setCats(Array.isArray(catsData) ? catsData : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar documentos");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter((d) => d.title.toLowerCase().includes(q) || d.documentNumber.toLowerCase().includes(q));
  }, [docs, search]);

  const pendientes = docs.filter((d) => d.status === "PENDING_APPROVAL").length;
  const aprobados = docs.filter((d) => d.status === "APPROVED").length;

  const submit = async () => {
    if (!token || !form.title) return;
    setSaving(true);
    try {
      await apiFetch("documents", token, {
        method: "POST",
        body: JSON.stringify({
          title: form.title,
          description: form.description || undefined,
          categoryId: form.categoryId ? Number(form.categoryId) : undefined,
          fileUrl: form.fileUrl || undefined,
        }),
      });
      setShowForm(false); setForm({ ...emptyForm });
      void load();
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally { setSaving(false); }
  };

  const approve = async (d: ManagedDoc) => {
    if (!token) return;
    try {
      await apiFetch(`documents/${d.id}/approve`, token, { method: "PATCH" });
      void load();
    } catch (e) { alert(`Error: ${e instanceof Error ? e.message : "desconocido"}`); }
  };

  const archive = async (d: ManagedDoc) => {
    if (!token || !confirm(`¿Archivar "${d.title}"?`)) return;
    try {
      await apiFetch(`documents/${d.id}/archive`, token, { method: "PATCH" });
      void load();
    } catch (e) { alert(`Error: ${e instanceof Error ? e.message : "desconocido"}`); }
  };

  const statusVariant = (s: string): "positive" | "warning" | "default" =>
    s === "APPROVED" ? "positive" : s === "PENDING_APPROVAL" ? "warning" : "default";

  const inp: React.CSSProperties = { width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--foreground)", fontSize: 13 };

  const columns: Column<ManagedDoc>[] = [
    { key: "documentNumber", label: "Folio", render: (d) => <code style={{ fontSize: 11.5 }}>{d.documentNumber}</code>, width: 120 },
    {
      key: "title", label: "Documento",
      render: (d) => (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{d.title}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{d.category?.name ?? "Sin categoría"} · {d.createdBy?.nombre ?? "—"}</div>
        </div>
      ),
    },
    { key: "status", label: "Estado", render: (d) => <Tag variant={statusVariant(d.status)}>{d.status.replace(/_/g, " ")}</Tag>, width: 160 },
    { key: "createdAt", label: "Creado", render: (d) => <span style={{ fontSize: 12 }}>{d.createdAt ? new Date(d.createdAt).toLocaleDateString("es-MX") : "—"}</span>, width: 100 },
    {
      key: "acciones" as keyof ManagedDoc, label: "",
      render: (d) => (
        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
          {d.fileUrl && <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); window.open(buildApiUrl(d.fileUrl!), "_blank"); }}>Ver</Button>}
          {cfg.canApprove && d.status === "PENDING_APPROVAL" && (
            <Button size="sm" variant="primary" onClick={(e) => { e.stopPropagation(); void approve(d); }}>Aprobar</Button>
          )}
          {cfg.canApprove && d.status !== "ARCHIVED" && (
            <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); void archive(d); }}>Archivar</Button>
          )}
        </div>
      ),
      width: 200,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="ERP · Logística"
        title="Gestión documental"
        subtitle="Repositorio único de contratos, manuales, certificados y actas. Versionado y aprobación incluidos."
        actions={
          <>
            <Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>
            {cfg.canCreate && <Button variant="primary" iconLeft="+" onClick={() => setShowForm(true)}>Nuevo documento</Button>}
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        <KpiCard label="Total documentos" value={docs.length} icon="📂" />
        <KpiCard label="Pendientes de aprobar" value={pendientes} variant={pendientes > 0 ? "warning" : "positive"} icon="⏳" />
        <KpiCard label="Aprobados" value={aprobados} variant="positive" icon="✅" />
      </div>

      <div style={{ marginBottom: 12 }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por título o folio…" style={{ width: "100%", maxWidth: 400, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--foreground)", fontSize: 13 }} />
      </div>

      <Section title={loading ? "Cargando…" : `${filtered.length} documentos`}>
        {loading && <EmptyState icon="⏳" title="Cargando documentos…" description="Consultando el repositorio." />}
        {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}
        {!loading && !error && <DataTable columns={columns} rows={filtered} rowKey={(d) => d.id} emptyTitle="Sin documentos" emptyDescription="Sube el primer documento al repositorio." />}
      </Section>

      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowForm(false)}>
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: 28, width: 460, maxWidth: "calc(100vw - 32px)", boxShadow: "0 24px 56px rgba(0,0,0,0.24)", border: "1px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Nuevo documento</div>
            <div style={{ display: "grid", gap: 14 }}>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Título</span>
                <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Contrato de arrendamiento CEDIS Puebla" style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Categoría</span>
                <select value={form.categoryId} onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))} style={inp}>
                  <option value="">— Sin categoría —</option>
                  {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>URL del archivo</span>
                <input value={form.fileUrl} onChange={(e) => setForm((f) => ({ ...f, fileUrl: e.target.value }))} placeholder="/uploads/documents/archivo.pdf" style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Descripción</span>
                <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} style={{ ...inp, resize: "vertical" }} /></label>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button variant="primary" onClick={() => void submit()} disabled={saving || !form.title}>{saving ? "Guardando…" : "Crear"}</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
