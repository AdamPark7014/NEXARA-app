"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { useCrmManagerGuard } from "@/lib/useCrmManagerGuard";
import { getCrmManagerSubmoduleConfig } from "@/lib/section-views";

interface Tender {
  id: number;
  tenderNumber: string;
  title: string;
  tenderType: "PUBLIC_GOV" | "PRIVATE_RFP" | string;
  status: "PROSPECT" | "IN_REVIEW" | "PREPARING_BID" | "SUBMITTED" | "AWARDED" | "LOST" | "CANCELLED" | "DISQUALIFIED" | string;
  conveningEntity: string;
  budgetCeiling: number | string;
  ourBidAmount: number | string;
  submissionDeadline?: string | null;
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

const STATUSES = ["PROSPECT", "IN_REVIEW", "PREPARING_BID", "SUBMITTED", "AWARDED", "LOST", "CANCELLED", "DISQUALIFIED"];
const emptyForm = { title: "", tenderType: "PUBLIC_GOV", conveningEntity: "", budgetCeiling: 0, ourBidAmount: 0, submissionDeadline: "" };

export default function TendersPage() {
  const { user } = useUser();
  const cfg = useCrmManagerGuard();
  const viewCfg = useMemo(() => getCrmManagerSubmoduleConfig(user, "tenders"), [user]);
  const token = user?.token ?? "";
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");

  const [items, setItems] = useState<Tender[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const data = await apiFetch("tenders", token);
      setItems(Array.isArray(data) ? data : (data?.data ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar licitaciones");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  if (!cfg.canAccess) return null;

  const abiertas = items.filter((t) => !["AWARDED", "LOST", "CANCELLED", "DISQUALIFIED"].includes(t.status)).length;
  const ganadas = items.filter((t) => t.status === "AWARDED").length;
  const pipelineValue = items.filter((t) => !["LOST", "CANCELLED", "DISQUALIFIED"].includes(t.status)).reduce((s, t) => s + Number(t.ourBidAmount || t.budgetCeiling), 0);

  const submit = async () => {
    if (!token || !form.title || !form.conveningEntity) return;
    setSaving(true);
    try {
      await apiFetch("tenders", token, {
        method: "POST",
        body: JSON.stringify({ ...form, submissionDeadline: form.submissionDeadline ? new Date(form.submissionDeadline).toISOString() : undefined }),
      });
      setShowForm(false); setForm({ ...emptyForm });
      void load();
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally { setSaving(false); }
  };

  const setStatus = async (t: Tender, status: string) => {
    if (!token) return;
    try {
      await apiFetch(`tenders/${t.id}/status`, token, { method: "PATCH", body: JSON.stringify({ status }) });
      setItems((prev) => prev.map((i) => (i.id === t.id ? { ...i, status } : i)));
    } catch (e) { alert(`Error: ${e instanceof Error ? e.message : "desconocido"}`); }
  };

  const promote = async (t: Tender) => {
    if (!token || !confirm(`¿Promover "${t.title}" a Oportunidad?`)) return;
    try {
      await apiFetch(`tenders/${t.id}/promote-opportunity`, token, { method: "POST" });
      alert("Oportunidad creada.");
    } catch (e) { alert(`Error: ${e instanceof Error ? e.message : "desconocido"}`); }
  };

  const statusVariant = (s: string): "positive" | "warning" | "danger" | "accent" | "default" => {
    if (s === "AWARDED") return "positive";
    if (["LOST", "CANCELLED", "DISQUALIFIED"].includes(s)) return "danger";
    if (s === "SUBMITTED" || s === "PREPARING_BID") return "accent";
    return "warning";
  };

  const inp: React.CSSProperties = { width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--foreground)", fontSize: 13 };

  const visibleItems = useMemo(() => {
    if (!highlightId) return items;
    const id = Number(highlightId);
    if (Number.isNaN(id)) return items;
    return [...items].sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : 0));
  }, [items, highlightId]);

  const columns: Column<Tender>[] = [
    { key: "tenderNumber", label: "Folio", render: (t) => <code style={{ fontSize: 11.5 }}>{t.tenderNumber}</code>, width: 120 },
    {
      key: "title", label: "Licitación",
      render: (t) => (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{t.title}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{t.conveningEntity} · {t.tenderType === "PUBLIC_GOV" ? "Gobierno" : "Privada"}</div>
        </div>
      ),
    },
    { key: "ourBidAmount", label: "Nuestra propuesta", render: (t) => <Money value={Number(t.ourBidAmount) || Number(t.budgetCeiling)} />, width: 140 },
    { key: "submissionDeadline", label: "Cierre", render: (t) => <span style={{ fontSize: 12 }}>{t.submissionDeadline ? new Date(t.submissionDeadline).toLocaleDateString("es-MX") : "—"}</span>, width: 100 },
    {
      key: "status", label: "Estado",
      render: (t) => cfg.canEdit ? (
        <select value={t.status} onChange={(e) => void setStatus(t, e.target.value)} style={{ fontSize: 12, border: "1px solid var(--border)", borderRadius: 6, padding: "3px 6px", background: "var(--surface)", color: "var(--foreground)" }}>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </select>
      ) : <Tag variant={statusVariant(t.status)}>{t.status.replace(/_/g, " ")}</Tag>,
      width: 160,
    },
    ...(cfg.canEdit ? [{
      key: "acciones" as keyof Tender, label: "",
      render: (t: Tender) => t.status === "AWARDED" ? <Button size="sm" variant="primary" onClick={(e) => { e.stopPropagation(); void promote(t); }}>→ Oportunidad</Button> : null,
      width: 140,
    }] : []),
  ];

  return (
    <>
      <PageHeader
        eyebrow="CRM · Proyectos"
        title={viewCfg.title}
        subtitle={viewCfg.subtitle}
        actions={
          <>
            <Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>
            {cfg.canCreate && <Button variant="primary" iconLeft="+" onClick={() => setShowForm(true)}>Nueva licitación</Button>}
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        <KpiCard label="Abiertas" value={abiertas} icon="📜" />
        <KpiCard label="Ganadas" value={ganadas} variant="positive" icon="🏆" />
        <KpiCard label="Pipeline en licitación" value={`$${(pipelineValue / 1000000).toFixed(1)}M`} icon="💰" />
      </div>

      <Section title={loading ? "Cargando…" : `${visibleItems.length} licitaciones`}>
        {highlightId && (
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
            Mostrando licitación <strong>#{highlightId}</strong> desde enlace directo.
          </p>
        )}
        {loading && <EmptyState icon="⏳" title="Cargando…" description="Consultando licitaciones." />}
        {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}
        {!loading && !error && <DataTable columns={columns} rows={visibleItems} rowKey={(t) => t.id} emptyTitle="Sin licitaciones" emptyDescription="Registra la primera licitación en seguimiento." />}
      </Section>

      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowForm(false)}>
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: 28, width: 460, maxWidth: "calc(100vw - 32px)", boxShadow: "0 24px 56px rgba(0,0,0,0.24)", border: "1px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Nueva licitación</div>
            <div style={{ display: "grid", gap: 14 }}>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Título</span>
                <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Suministro e instalación CCTV — Municipio de Puebla" style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Convocante</span>
                <input value={form.conveningEntity} onChange={(e) => setForm((f) => ({ ...f, conveningEntity: e.target.value }))} style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Tipo</span>
                <select value={form.tenderType} onChange={(e) => setForm((f) => ({ ...f, tenderType: e.target.value }))} style={inp}>
                  <option value="PUBLIC_GOV">Gobierno (Compranet)</option>
                  <option value="PRIVATE_RFP">Privada (RFP)</option>
                </select></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Techo presupuestal ($)</span>
                <input type="number" min={0} value={form.budgetCeiling} onChange={(e) => setForm((f) => ({ ...f, budgetCeiling: Number(e.target.value) }))} style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Fecha límite de propuesta</span>
                <input type="date" value={form.submissionDeadline} onChange={(e) => setForm((f) => ({ ...f, submissionDeadline: e.target.value }))} style={inp} /></label>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button variant="primary" onClick={() => void submit()} disabled={saving || !form.title || !form.conveningEntity}>{saving ? "Guardando…" : "Crear"}</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
