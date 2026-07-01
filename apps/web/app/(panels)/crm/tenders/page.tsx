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
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";

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
  notes?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
}

async function apiFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...((init.headers ?? {}) as Record<string, string>) },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  if (res.status === 204) return null;
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

const STATUSES = ["PROSPECT", "IN_REVIEW", "PREPARING_BID", "SUBMITTED", "AWARDED", "LOST", "CANCELLED", "DISQUALIFIED"];
const STATUS_LABELS: Record<string, string> = {
  PROSPECT: "Prospecto", IN_REVIEW: "En revisión", PREPARING_BID: "Preparando oferta",
  SUBMITTED: "Enviada", AWARDED: "Adjudicada", LOST: "Perdida", CANCELLED: "Cancelada", DISQUALIFIED: "Descalificada",
};

const EMPTY_FORM = {
  title: "", tenderType: "PUBLIC_GOV", conveningEntity: "",
  budgetCeiling: 0, ourBidAmount: 0, submissionDeadline: "",
  contactName: "", contactEmail: "", notes: "",
};

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
  const [editing, setEditing] = useState<Tender | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

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

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setShowForm(true);
  };

  const openEdit = (t: Tender) => {
    setEditing(t);
    setForm({
      title: t.title ?? "",
      tenderType: t.tenderType ?? "PUBLIC_GOV",
      conveningEntity: t.conveningEntity ?? "",
      budgetCeiling: Number(t.budgetCeiling ?? 0),
      ourBidAmount: Number(t.ourBidAmount ?? 0),
      submissionDeadline: t.submissionDeadline ? t.submissionDeadline.slice(0, 10) : "",
      contactName: t.contactName ?? "",
      contactEmail: t.contactEmail ?? "",
      notes: t.notes ?? "",
    });
    setShowForm(true);
  };

  const submit = async () => {
    if (!token || !form.title || !form.conveningEntity) return;
    setSaving(true);
    try {
      const body = {
        ...form,
        submissionDeadline: form.submissionDeadline ? new Date(form.submissionDeadline).toISOString() : undefined,
        budgetCeiling: Number(form.budgetCeiling),
        ourBidAmount: Number(form.ourBidAmount),
      };
      if (editing) {
        await apiFetch(`tenders/${editing.id}`, token, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await apiFetch("tenders", token, { method: "POST", body: JSON.stringify(body) });
      }
      setShowForm(false); setEditing(null); setForm({ ...EMPTY_FORM });
      void load();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "No se pudo guardar la licitación");
    } finally { setSaving(false); }
  };

  const setStatus = async (t: Tender, status: string) => {
    if (!token) return;
    try {
      await apiFetch(`tenders/${t.id}/status`, token, { method: "PATCH", body: JSON.stringify({ status }) });
      setItems((prev) => prev.map((i) => (i.id === t.id ? { ...i, status } : i)));
    } catch (e) { setActionErr(e instanceof Error ? e.message : "Error al actualizar estado"); }
  };

  const promote = async (t: Tender) => {
    if (!token) return;
    setConfirmState({ message: `¿Promover "${t.title}" a Oportunidad?`, confirmLabel: "Promover", fn: async () => {
    try {
      await apiFetch(`tenders/${t.id}/promote-opportunity`, token, { method: "POST" });
      setSuccessMsg("Oportunidad creada en el pipeline de CRM.");
    } catch (e) { setActionErr(e instanceof Error ? e.message : "Error al crear oportunidad"); }
  } });
  };

  const statusVariant = (s: string): "positive" | "warning" | "danger" | "accent" | "neutral" => {
    if (s === "AWARDED") return "positive";
    if (["LOST", "CANCELLED", "DISQUALIFIED"].includes(s)) return "danger";
    if (s === "SUBMITTED" || s === "PREPARING_BID") return "accent";
    return "warning";
  };

  const inp: React.CSSProperties = {
    width: "100%", padding: "8px 12px", borderRadius: 8,
    border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--foreground)", fontSize: 13,
    boxSizing: "border-box",
  };

  const lbl = (t: string, req?: boolean) => (
    <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
      {t}{req && <span style={{ color: "#ef4444" }}> *</span>}
    </span>
  );

  const abiertas = items.filter((t) => !["AWARDED", "LOST", "CANCELLED", "DISQUALIFIED"].includes(t.status)).length;
  const ganadas = items.filter((t) => t.status === "AWARDED").length;
  const pipelineValue = items.filter((t) => !["LOST", "CANCELLED", "DISQUALIFIED"].includes(t.status))
    .reduce((s, t) => s + Number(t.ourBidAmount || t.budgetCeiling), 0);

  const visibleItems = useMemo(() => {
    if (!highlightId) return items;
    const id = Number(highlightId);
    return Number.isNaN(id) ? items : [...items].sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : 0));
  }, [items, highlightId]);

  const columns: Column<Tender>[] = [
    { key: "tenderNumber", label: "Folio", render: (t) => <code style={{ fontSize: 11.5 }}>{t.tenderNumber}</code>, width: 120 },
    {
      key: "title", label: "Licitación",
      render: (t) => (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{t.title}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
            {t.conveningEntity} · {t.tenderType === "PUBLIC_GOV" ? "Gobierno" : "Privada"}
            {t.contactName && ` · ${t.contactName}`}
          </div>
        </div>
      ),
    },
    { key: "ourBidAmount", label: "Nuestra propuesta", render: (t) => <Money value={Number(t.ourBidAmount) || Number(t.budgetCeiling)} />, width: 140 },
    { key: "submissionDeadline", label: "Cierre", render: (t) => <span style={{ fontSize: 12 }}>{t.submissionDeadline ? new Date(t.submissionDeadline).toLocaleDateString("es-MX") : "—"}</span>, width: 100 },
    {
      key: "status", label: "Estado",
      render: (t) => cfg.canEdit ? (
        <select value={t.status} onChange={(e) => void setStatus(t, e.target.value)}
          style={{ fontSize: 12, border: "1px solid var(--border)", borderRadius: 6, padding: "3px 6px", background: "var(--surface)", color: "var(--foreground)" }}>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>)}
        </select>
      ) : <Tag variant={statusVariant(t.status)}>{STATUS_LABELS[t.status] ?? t.status}</Tag>,
      width: 160,
    },
    ...(cfg.canEdit ? [{
      key: "acciones" as keyof Tender, label: "",
      render: (t: Tender) => (
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={(e) => { e.stopPropagation(); openEdit(t); }}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 6px" }} title="Editar">✎</button>
          {t.status === "AWARDED" && (
            <Button size="sm" variant="primary" onClick={(e) => { e.stopPropagation(); void promote(t); }}>→ Opp</Button>
          )}
        </div>
      ),
      width: 100,
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
            {cfg.canCreate && <Button variant="primary" iconLeft="+" onClick={openNew}>Nueva licitación</Button>}
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        <KpiCard label="Abiertas" value={abiertas} icon="📜" />
        <KpiCard label="Adjudicadas" value={ganadas} variant="positive" icon="🏆" />
        <KpiCard label="Pipeline (propuestas)" value={<Money value={pipelineValue} compact />} icon="💰" variant="accent" hint="Valor total de propuestas en proceso" />
      </div>

      {successMsg && (
        <div role="status" style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, border: "1px solid var(--positive)", color: "var(--positive,#16a34a)", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>✓ {successMsg}</span>
          <button type="button" onClick={() => setSuccessMsg(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontWeight: 700, fontSize: 16, lineHeight: 1, padding: "0 4px" }}>×</button>
        </div>
      )}
      {actionErr && (
        <div role="alert" style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, border: "1px solid var(--danger)", color: "var(--danger)", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{actionErr}</span>
          <button type="button" onClick={() => setActionErr(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontWeight: 700, fontSize: 16, lineHeight: 1, padding: "0 4px" }}>×</button>
        </div>
      )}
      <Section title={loading ? "Cargando…" : `${visibleItems.length} licitaciones`}>
        {loading && <EmptyState icon="⏳" title="Cargando…" description="Consultando licitaciones." />}
        {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}
        {!loading && !error && (
          <DataTable columns={columns} rows={visibleItems} rowKey={(t) => t.id}
            emptyTitle="Sin licitaciones" emptyDescription="Registra la primera licitación en seguimiento." />
        )}
      </Section>

      {/* ── Modal: Nueva / Editar licitación ─────────────────────────────── */}
      {showForm && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => setShowForm(false)}
        >
          <div
            style={{ background: "var(--surface)", borderRadius: 16, padding: 28, width: 520, maxWidth: "calc(100vw - 32px)", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 56px rgba(0,0,0,0.28)", border: "1px solid var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>
              {editing ? "Editar licitación" : "Nueva licitación"}
            </div>
            <div style={{ display: "grid", gap: 13 }}>

              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Datos generales</div>

              <div style={{ gridColumn: "1 / -1" }}>
                {lbl("Título", true)}
                <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Suministro e instalación CCTV — Municipio de Puebla" style={inp} autoFocus />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  {lbl("Convocante", true)}
                  <input value={form.conveningEntity} onChange={(e) => setForm((f) => ({ ...f, conveningEntity: e.target.value }))}
                    placeholder="Municipio / empresa" style={inp} />
                </div>
                <div>
                  {lbl("Tipo de licitación")}
                  <select value={form.tenderType} onChange={(e) => setForm((f) => ({ ...f, tenderType: e.target.value }))} style={inp}>
                    <option value="PUBLIC_GOV">Gobierno (Compranet)</option>
                    <option value="PRIVATE_RFP">Privada (RFP)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  {lbl("Techo presupuestal (MXN)")}
                  <input type="number" min={0} value={form.budgetCeiling} onChange={(e) => setForm((f) => ({ ...f, budgetCeiling: Number(e.target.value) }))} style={inp} />
                </div>
                <div>
                  {lbl("Nuestra propuesta (MXN)")}
                  <input type="number" min={0} value={form.ourBidAmount} onChange={(e) => setForm((f) => ({ ...f, ourBidAmount: Number(e.target.value) }))} style={inp} />
                </div>
              </div>

              <div>
                {lbl("Fecha límite de presentación")}
                <input type="date" value={form.submissionDeadline} onChange={(e) => setForm((f) => ({ ...f, submissionDeadline: e.target.value }))} style={inp} />
              </div>

              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", paddingTop: 4 }}>Contacto</div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  {lbl("Nombre del contacto")}
                  <input value={form.contactName} onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
                    placeholder="Lic. García" style={inp} />
                </div>
                <div>
                  {lbl("Email del contacto")}
                  <input type="email" value={form.contactEmail} onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
                    placeholder="licitaciones@municipio.gob.mx" style={inp} />
                </div>
              </div>

              <div>
                {lbl("Notas / alcance")}
                <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3} style={{ ...inp, resize: "vertical" }}
                  placeholder="Partidas clave, requisitos especiales, puntos de evaluación…" />
              </div>
            </div>
            {saveErr && <p style={{ marginBottom: 8, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--danger)", color: "var(--danger)", fontSize: 12 }}>{saveErr}</p>}
            <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => { setShowForm(false); setEditing(null); setSaveErr(null); }}>Cancelar</Button>
              <Button variant="primary" onClick={() => void submit()} disabled={saving || !form.title || !form.conveningEntity}>
                {saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear licitación"}
              </Button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}
