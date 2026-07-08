"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { Tag } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { getCrmSalesSectionConfig } from "@/lib/section-views";
import { formatLeadStatus, updateSalesLead, createSalesClient, createSalesOpportunity, type SalesLead } from "@/lib/sales-api";
import { toast } from "@/components/Toast";

const STATUSES = ["NEW", "QUALIFIED", "NURTURING", "LOST", "CONVERTED"] as const;
const FUENTES = ["Web", "Referido", "LinkedIn", "Llamada", "Feria", "Otro"];

const STATUS_VARIANT: Record<string, "warning" | "accent" | "positive" | "danger" | "neutral"> = {
  NEW: "warning",
  QUALIFIED: "accent",
  NURTURING: "accent",
  LOST: "danger",
  CONVERTED: "positive",
};

async function apiFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...((init.headers ?? {}) as Record<string, string>) },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return res.json();
}

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8,
  background: "var(--surface)", color: "var(--foreground)", fontSize: 13, boxSizing: "border-box",
};

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { user } = useUser();
  const cfg = useMemo(() => getCrmSalesSectionConfig(user, "leads"), [user]);
  const token = user?.token ?? "";

  const [lead, setLead] = useState<SalesLead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", company: "", email: "", phone: "", source: "Web", status: "NEW", score: 0, notes: "" });

  const [converting, setConverting] = useState(false);
  const [convertStage, setConvertStage] = useState("DISCOVERY");
  const [convertValue, setConvertValue] = useState("50000");
  const [convertErr, setConvertErr] = useState<string | null>(null);
  const [converted, setConverted] = useState(false);

  const load = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch(`sales/leads/${id}`, token);
      setLead(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el lead");
    } finally { setLoading(false); }
  }, [token, id]);

  useEffect(() => { void load(); }, [load]);

  const openEdit = () => {
    if (!lead) return;
    setForm({ name: lead.name ?? "", company: lead.company ?? "", email: lead.email ?? "", phone: lead.phone ?? "", source: lead.source ?? "Web", status: lead.status ?? "NEW", score: Number(lead.score ?? 0), notes: lead.notes ?? "" });
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!token) return;
    setSaving(true);
    try {
      const updated = await updateSalesLead(token, id, form);
      setLead((prev) => prev ? { ...prev, ...updated } : prev);
      setEditing(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally { setSaving(false); }
  };

  const submitConvert = async () => {
    if (!token || !lead) return;
    const value = parseFloat(convertValue);
    if (!value || value <= 0) { setConvertErr("Ingresa un valor válido mayor a 0."); return; }
    setConverted(false);
    setConvertErr(null);
    setSaving(true);
    try {
      let clientId: number | undefined;
      const clientLabel = lead.company?.trim() || lead.name?.trim();
      if (clientLabel) {
        const client = await createSalesClient(token, { name: clientLabel, legalName: clientLabel, billingEmail: lead.email?.trim() || "", billingPhone: lead.phone?.trim() || "", industry: "", website: "", taxId: "" });
        clientId = client.id;
      }
      await createSalesOpportunity(token, { title: `Oportunidad · ${lead.name ?? lead.company ?? "Lead"}`, clientId, value, stage: convertStage, probability: 30, leadId: lead.id });
      await updateSalesLead(token, id, { status: "CONVERTED" });
      setLead((prev) => prev ? { ...prev, status: "CONVERTED" } : prev);
      setConverting(false);
      setConverted(true);
    } catch (e) {
      setConvertErr(e instanceof Error ? e.message : "Error al convertir lead");
    } finally { setSaving(false); }
  };

  if (loading) return <EmptyState icon="⏳" title="Cargando lead…" description="Consultando datos del CRM." />;
  if (error) return <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />;
  if (!lead) return null;

  const scoreColor = lead.score >= 70 ? "var(--success)" : lead.score >= 40 ? "var(--primary)" : "var(--warning)";

  return (
    <>
      <PageHeader
        eyebrow="CRM · Leads"
        title={lead.name ?? lead.company ?? `Lead #${id}`}
        subtitle={[lead.company, lead.source ? `Fuente: ${lead.source}` : null].filter(Boolean).join(" · ")}
        meta={
          <>
            <Tag variant={STATUS_VARIANT[lead.status] ?? "neutral"} dot>{formatLeadStatus(lead.status)}</Tag>
            {lead.score > 0 && <Tag variant="neutral">Score: {lead.score}</Tag>}
          </>
        }
        actions={
          <>
            <Link href="/crm/leads" style={{ textDecoration: "none" }}>
              <Button variant="ghost">← Volver</Button>
            </Link>
            {lead.status !== "CONVERTED" && !editing && cfg.canEdit && (
              <Button variant="secondary" onClick={() => { setConverting(true); setConvertErr(null); }}>
                🔄 Convertir a oportunidad
              </Button>
            )}
            {!editing && cfg.canEdit && (
              <Button variant="primary" iconLeft="✎" onClick={openEdit}>Editar</Button>
            )}
          </>
        }
      />

      {converted && (
        <div style={{ marginBottom: 16, padding: "12px 16px", background: "color-mix(in srgb, var(--success) 10%, var(--surface))", border: "1px solid color-mix(in srgb, var(--success) 30%, var(--border))", borderRadius: 10, fontSize: 13, color: "var(--success)", fontWeight: 600 }}>
          ✅ Lead convertido exitosamente. Se creó un cliente y una oportunidad en CRM.{" "}
          <Link href="/crm/pipeline" style={{ color: "var(--primary)" }}>Ver pipeline →</Link>
        </div>
      )}

      {/* Score bar */}
      {lead.score > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
            Score de calificación · {lead.score}/100
          </div>
          <div style={{ height: 8, borderRadius: 4, background: "var(--surface-2)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${lead.score}%`, background: scoreColor, borderRadius: 4, transition: "width .4s" }} />
          </div>
        </div>
      )}

      {editing ? (
        <Section title="Editar lead">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Nombre del contacto *</label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={inp} autoFocus />
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Empresa</label>
              <input value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} placeholder="Empresa S.A. de C.V." style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Teléfono</label>
              <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Fuente</label>
              <select value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))} style={inp}>
                {FUENTES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Estado</label>
              <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} style={inp}>
                {STATUSES.map((s) => <option key={s} value={s}>{formatLeadStatus(s)}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Score (0-100)</label>
              <input type="number" min={0} max={100} value={form.score} onChange={(e) => setForm((f) => ({ ...f, score: Number(e.target.value) }))} style={inp} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Notas</label>
              <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={4} style={{ ...inp, resize: "vertical" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 18, justifyContent: "flex-end" }}>
            <Button variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button>
            <Button variant="primary" onClick={() => void saveEdit()} disabled={saving || !form.name.trim()}>
              {saving ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        </Section>
      ) : (
        <Section title="Información del lead" actions={<Button size="sm" variant="ghost" iconLeft="✎" onClick={openEdit}>Editar</Button>}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {[
              { label: "Empresa", value: lead.company },
              { label: "Email", value: lead.email },
              { label: "Teléfono", value: lead.phone },
              { label: "Fuente", value: lead.source },
              { label: "Estado", value: formatLeadStatus(lead.status) },
              { label: "Propietario", value: lead.owner?.nombre },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 13, color: value ? "var(--text-primary)" : "var(--text-tertiary)" }}>{value ?? "—"}</div>
              </div>
            ))}
          </div>
          {lead.notes && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Notas</div>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>{lead.notes}</p>
            </div>
          )}
        </Section>
      )}

      {/* Convert modal */}
      {converting && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setConverting(false)}>
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: "24px 28px", width: 420, maxWidth: "calc(100vw - 32px)", boxShadow: "0 24px 56px rgba(0,0,0,0.24)", border: "1px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Convertir a oportunidad</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 18 }}>Se creará un cliente y una oportunidad en el pipeline CRM.</div>
            <div style={{ display: "grid", gap: 14 }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Valor estimado (MXN) *</span>
                <input type="number" min="1" step="1000" value={convertValue} onChange={(e) => setConvertValue(e.target.value)} style={inp} autoFocus />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Etapa inicial</span>
                <select value={convertStage} onChange={(e) => setConvertStage(e.target.value)} style={inp}>
                  {["DISCOVERY", "QUALIFICATION", "PROPOSAL"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              {convertErr && <p style={{ color: "var(--danger)", fontSize: 12, margin: 0 }}>{convertErr}</p>}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setConverting(false)}>Cancelar</Button>
              <Button variant="primary" onClick={() => void submitConvert()} disabled={saving}>
                {saving ? "Convirtiendo…" : "Convertir"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
