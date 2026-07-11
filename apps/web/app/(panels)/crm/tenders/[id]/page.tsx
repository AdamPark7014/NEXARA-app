"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import EmptyState from "@/components/ui/EmptyState";
import { Tag, Money } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { toast } from "@/components/Toast";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";

interface TenderDetail {
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
  createdAt?: string;
  updatedAt?: string;
  opportunityId?: number | null;
}

async function apiFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...((init.headers ?? {}) as Record<string, string>) },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  if (res.status === 204) return null;
  return res.json();
}

const STATUSES = ["PROSPECT", "IN_REVIEW", "PREPARING_BID", "SUBMITTED", "AWARDED", "LOST", "CANCELLED", "DISQUALIFIED"];
const STATUS_LABELS: Record<string, string> = {
  PROSPECT: "Prospecto", IN_REVIEW: "En revisión", PREPARING_BID: "Preparando oferta",
  SUBMITTED: "Enviada", AWARDED: "Adjudicada", LOST: "Perdida", CANCELLED: "Cancelada", DISQUALIFIED: "Descalificada",
};

const statusVariant = (s: string): "positive" | "warning" | "danger" | "accent" | "neutral" => {
  if (s === "AWARDED") return "positive";
  if (["LOST", "CANCELLED", "DISQUALIFIED"].includes(s)) return "danger";
  if (s === "SUBMITTED" || s === "PREPARING_BID") return "accent";
  return "warning";
};

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 12px", borderRadius: 8,
  border: "1px solid var(--border)", background: "var(--surface)",
  color: "var(--foreground)", fontSize: 13, boxSizing: "border-box",
};

export default function TenderDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { user } = useUser();
  const token = user?.token ?? "";
  const canEdit = user?.isSuperAdmin || ["ceo", "super_admin", "dir_admin", "coord_admin", "coord_ventas"].includes(user?.roleKey ?? "");

  const [tender, setTender] = useState<TenderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [form, setForm] = useState({
    title: "", conveningEntity: "", tenderType: "PUBLIC_GOV",
    budgetCeiling: 0, ourBidAmount: 0, submissionDeadline: "",
    contactName: "", contactEmail: "", notes: "",
  });

  const load = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch(`tenders/${id}`, token);
      setTender(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la licitación");
    } finally { setLoading(false); }
  }, [token, id]);

  useEffect(() => { void load(); }, [load]);

  const openEdit = () => {
    if (!tender) return;
    setForm({
      title: tender.title ?? "",
      conveningEntity: tender.conveningEntity ?? "",
      tenderType: tender.tenderType ?? "PUBLIC_GOV",
      budgetCeiling: Number(tender.budgetCeiling ?? 0),
      ourBidAmount: Number(tender.ourBidAmount ?? 0),
      submissionDeadline: tender.submissionDeadline ? tender.submissionDeadline.slice(0, 10) : "",
      contactName: tender.contactName ?? "",
      contactEmail: tender.contactEmail ?? "",
      notes: tender.notes ?? "",
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!token || !id) return;
    setSaving(true);
    try {
      const body = {
        ...form,
        budgetCeiling: Number(form.budgetCeiling),
        ourBidAmount: Number(form.ourBidAmount),
        submissionDeadline: form.submissionDeadline ? new Date(form.submissionDeadline).toISOString() : undefined,
      };
      const updated = await apiFetch(`tenders/${id}`, token, { method: "PATCH", body: JSON.stringify(body) });
      setTender((prev) => prev ? { ...prev, ...(updated ?? body) } : prev);
      setEditing(false);
      toast.success("Licitación actualizada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally { setSaving(false); }
  };

  const setStatus = async (status: string) => {
    if (!token || !id) return;
    try {
      await apiFetch(`tenders/${id}/status`, token, { method: "PATCH", body: JSON.stringify({ status }) });
      setTender((prev) => prev ? { ...prev, status } : prev);
      toast.success(`Estado actualizado: ${STATUS_LABELS[status] ?? status}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al actualizar estado");
    }
  };

  const promote = () => {
    setConfirmState({
      message: "¿Promover esta licitación como Oportunidad en el pipeline CRM?",
      confirmLabel: "Promover",
      fn: async () => {
        setPromoting(true);
        try {
          await apiFetch(`tenders/${id}/promote-opportunity`, token, { method: "POST" });
          toast.success("Oportunidad creada en el pipeline de CRM");
          void load();
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Error al crear oportunidad");
        } finally { setPromoting(false); }
      },
    });
  };

  const margin = useMemo(() => {
    if (!tender) return null;
    const ceiling = Number(tender.budgetCeiling);
    const bid = Number(tender.ourBidAmount);
    if (!ceiling || !bid) return null;
    return Math.round(((ceiling - bid) / ceiling) * 100);
  }, [tender]);

  const isDeadlineSoon = useMemo(() => {
    if (!tender?.submissionDeadline) return false;
    const diff = new Date(tender.submissionDeadline).getTime() - Date.now();
    return diff > 0 && diff < 7 * 24 * 60 * 60 * 1000;
  }, [tender]);

  if (loading) return <EmptyState icon="⏳" title="Cargando licitación…" description="Consultando datos de la licitación." />;
  if (error) return <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />;
  if (!tender) return null;

  const isClosed = ["AWARDED", "LOST", "CANCELLED", "DISQUALIFIED"].includes(tender.status);

  return (
    <>
      <PageHeader
        eyebrow="CRM · Licitaciones"
        title={tender.title}
        subtitle={`${tender.conveningEntity} · ${tender.tenderType === "PUBLIC_GOV" ? "Compranet / Gobierno" : "RFP Privada"}`}
        meta={<Tag variant={statusVariant(tender.status)} dot>{STATUS_LABELS[tender.status] ?? tender.status}</Tag>}
        actions={
          <>
            <Link href="/crm/tenders" style={{ textDecoration: "none" }}>
              <Button variant="ghost">← Licitaciones</Button>
            </Link>
            {canEdit && !editing && (
              <Button variant="secondary" iconLeft="✎" onClick={openEdit}>Editar</Button>
            )}
            {canEdit && tender.status === "AWARDED" && !tender.opportunityId && (
              <Button variant="primary" onClick={() => void promote()} disabled={promoting}>
                {promoting ? "Creando…" : "→ Crear oportunidad"}
              </Button>
            )}
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
        <KpiCard label="Techo presupuestal" value={<Money value={Number(tender.budgetCeiling)} compact />} icon="🏦" />
        <KpiCard label="Nuestra propuesta" value={<Money value={Number(tender.ourBidAmount)} compact />} icon="📋" variant="accent" />
        {margin !== null && (
          <KpiCard label="Margen vs techo" value={`${margin}%`} icon="📊" variant={margin >= 20 ? "positive" : margin >= 5 ? "default" : "warning"} hint="(techo − propuesta) / techo" />
        )}
        {tender.submissionDeadline && (
          <KpiCard
            label="Cierre de convocatoria"
            value={new Date(tender.submissionDeadline).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
            icon={isDeadlineSoon ? "⚠️" : "📅"}
            variant={isDeadlineSoon ? "warning" : "default"}
            hint={isDeadlineSoon ? "Vence en menos de 7 días" : undefined}
          />
        )}
      </div>

      {/* Tender lifecycle stepper */}
      {(() => {
        const MAIN = [
          { key: "PROSPECT", label: "Prospecto", icon: "🔍" },
          { key: "IN_REVIEW", label: "En revisión", icon: "📋" },
          { key: "PREPARING_BID", label: "Preparando", icon: "✏️" },
          { key: "SUBMITTED", label: "Enviada", icon: "📤" },
          { key: "AWARDED", label: "Adjudicada", icon: "🏆" },
        ];
        const TERMINAL: Record<string, { key: string; label: string; icon: string }[]> = {
          LOST: [{ key: "PROSPECT", label: "Prospecto", icon: "🔍" }, { key: "SUBMITTED", label: "Enviada", icon: "📤" }, { key: "LOST", label: "Perdida", icon: "✕" }],
          CANCELLED: [{ key: "PROSPECT", label: "Prospecto", icon: "🔍" }, { key: "CANCELLED", label: "Cancelada", icon: "✕" }],
          DISQUALIFIED: [{ key: "PROSPECT", label: "Prospecto", icon: "🔍" }, { key: "IN_REVIEW", label: "En revisión", icon: "📋" }, { key: "DISQUALIFIED", label: "Descalificada", icon: "✕" }],
        };
        const flow = TERMINAL[tender.status] ?? MAIN;
        const activeIdx = flow.findIndex((s) => s.key === tender.status);
        const BAD_KEYS = new Set(["LOST", "CANCELLED", "DISQUALIFIED"]);
        return (
          <div style={{ marginBottom: 16, padding: "12px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Progreso de licitación</div>
            <div style={{ display: "flex", alignItems: "center", overflowX: "auto" }}>
              {flow.map((step, idx) => {
                const done = idx < activeIdx;
                const active = idx === activeIdx;
                const isBad = BAD_KEYS.has(step.key) && active;
                const isWon = step.key === "AWARDED" && active;
                const color = isBad ? "var(--danger)" : (isWon || done || active) ? "var(--success)" : "var(--text-tertiary)";
                const bg = isBad ? "color-mix(in srgb, var(--danger) 15%, var(--surface-2))" : (isWon || done || active) ? "color-mix(in srgb, var(--success) 15%, var(--surface-2))" : "var(--surface)";
                return (
                  <div key={step.key} style={{ display: "flex", alignItems: "center", flex: idx < flow.length - 1 ? 1 : undefined }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, minWidth: 56 }}>
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: bg, border: `2px solid ${active ? color : done ? "color-mix(in srgb, var(--success) 40%, var(--border))" : "var(--border)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: done ? 12 : 14, fontWeight: 700, color }}>
                        {done ? "✓" : step.icon}
                      </div>
                      <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, color: active ? color : done ? "var(--text-secondary)" : "var(--text-tertiary)", textAlign: "center", whiteSpace: "nowrap" }}>{step.label}</span>
                    </div>
                    {idx < flow.length - 1 && <div style={{ flex: 1, height: 2, background: done ? "color-mix(in srgb, var(--success) 35%, var(--border))" : "var(--border)", margin: "0 2px", marginBottom: 18, minWidth: 12 }} />}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Bid vs ceiling bar */}
      {Number(tender.budgetCeiling) > 0 && Number(tender.ourBidAmount) > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
            Propuesta vs techo · {Math.min(100, Math.round((Number(tender.ourBidAmount) / Number(tender.budgetCeiling)) * 100))}% del techo
          </div>
          <div style={{ height: 8, borderRadius: 4, background: "var(--surface-2)", overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${Math.min(100, Math.round((Number(tender.ourBidAmount) / Number(tender.budgetCeiling)) * 100))}%`,
              background: "var(--primary)",
              borderRadius: 4, transition: "width .4s",
            }} />
          </div>
        </div>
      )}

      {editing ? (
        <Section title="Editar licitación">
          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Título *</label>
              <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} style={inp} autoFocus />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Convocante *</label>
                <input value={form.conveningEntity} onChange={(e) => setForm((f) => ({ ...f, conveningEntity: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Tipo</label>
                <select value={form.tenderType} onChange={(e) => setForm((f) => ({ ...f, tenderType: e.target.value }))} style={inp}>
                  <option value="PUBLIC_GOV">Gobierno (Compranet)</option>
                  <option value="PRIVATE_RFP">Privada (RFP)</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Techo presupuestal (MXN)</label>
                <input type="number" min={0} value={form.budgetCeiling} onChange={(e) => setForm((f) => ({ ...f, budgetCeiling: Number(e.target.value) }))} style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Nuestra propuesta (MXN)</label>
                <input type="number" min={0} value={form.ourBidAmount} onChange={(e) => setForm((f) => ({ ...f, ourBidAmount: Number(e.target.value) }))} style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Fecha límite</label>
                <input type="date" value={form.submissionDeadline} onChange={(e) => setForm((f) => ({ ...f, submissionDeadline: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Contacto</label>
                <input value={form.contactName} onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))} placeholder="Nombre del contacto" style={inp} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Email del contacto</label>
                <input type="email" value={form.contactEmail} onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))} placeholder="licitaciones@entidad.gob.mx" style={inp} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Notas / alcance</label>
              <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3} style={{ ...inp, resize: "vertical" }} placeholder="Partidas clave, requisitos especiales…" />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 18, justifyContent: "flex-end" }}>
            <Button variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button>
            <Button variant="primary" onClick={() => void saveEdit()} disabled={saving || !form.title || !form.conveningEntity}>
              {saving ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        </Section>
      ) : (
        <Section title="Información de la licitación" actions={canEdit ? <Button size="sm" variant="ghost" iconLeft="✎" onClick={openEdit}>Editar</Button> : undefined}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {[
              { label: "Folio", value: tender.tenderNumber },
              { label: "Tipo", value: tender.tenderType === "PUBLIC_GOV" ? "Gobierno (Compranet)" : "Privada (RFP)" },
              { label: "Convocante", value: tender.conveningEntity },
              { label: "Contacto", value: tender.contactName },
              { label: "Email contacto", value: tender.contactEmail },
              { label: "Techo presupuestal", value: `$${Number(tender.budgetCeiling).toLocaleString("es-MX")}` },
              { label: "Nuestra propuesta", value: `$${Number(tender.ourBidAmount).toLocaleString("es-MX")}` },
              { label: "Fecha cierre", value: tender.submissionDeadline ? new Date(tender.submissionDeadline).toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" }) : null },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 13, color: value ? "var(--text-primary)" : "var(--text-tertiary)" }}>{value ?? "—"}</div>
              </div>
            ))}
            {tender.notes && (
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Notas / alcance</div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7 }}>{tender.notes}</div>
              </div>
            )}
          </div>
        </Section>
      )}

      {canEdit && !isClosed && !editing && (
        <Section title="Cambiar estado" eyebrow="Avance del proceso">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {STATUSES.filter((s) => s !== tender.status).map((s) => (
              <Button
                key={s}
                variant={s === "AWARDED" ? "primary" : ["LOST", "CANCELLED", "DISQUALIFIED"].includes(s) ? "ghost" : "secondary"}
                size="sm"
                onClick={() => void setStatus(s)}
                style={["LOST", "CANCELLED", "DISQUALIFIED"].includes(s) ? { color: "var(--danger)" } : undefined}
              >
                {STATUS_LABELS[s]}
              </Button>
            ))}
          </div>
        </Section>
      )}
      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}
