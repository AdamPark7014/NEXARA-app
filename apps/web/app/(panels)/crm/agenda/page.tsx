"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import { Tag } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { getCrmSalesSectionConfig } from "@/lib/section-views";

interface CrmActivity {
  id: number;
  activityType: "CALL" | "EMAIL" | "MEETING" | "TASK" | "WHATSAPP" | "VISIT" | "NOTE";
  status: "PENDING" | "COMPLETED" | "CANCELLED" | "OVERDUE";
  subject: string;
  description?: string | null;
  dueDate: string;
  leadId?: number | null;
  opportunityId?: number | null;
  lead?: { id: number; name: string; company?: string } | null;
  opportunity?: { id: number; title: string } | null;
  tender?: { id: number; tenderNumber: string } | null;
}

interface MyAgenda {
  pendingToday: CrmActivity[];
  overdue: CrmActivity[];
  upcoming: CrmActivity[];
  recentlyCompleted: CrmActivity[];
}

interface LeadLite { id: number; name: string; company?: string | null }
interface OppLite { id: number; title: string }

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

const TYPE_ICON: Record<string, string> = { CALL: "📞", EMAIL: "✉️", MEETING: "🤝", TASK: "✅", WHATSAPP: "💬", VISIT: "🚗", NOTE: "📝" };
const TYPES = ["CALL", "EMAIL", "MEETING", "TASK", "WHATSAPP", "VISIT", "NOTE"];

const EMPTY_FORM = { subject: "", description: "", activityType: "TASK", dueDate: "", leadId: "", opportunityId: "" };

export default function AgendaPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getCrmSalesSectionConfig(user, "agenda"), [user]);
  const token = user?.token ?? "";

  const [agenda, setAgenda] = useState<MyAgenda | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create/edit form
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  // Lead/opp options
  const [leads, setLeads] = useState<LeadLite[]>([]);
  const [opps, setOpps] = useState<OppLite[]>([]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const data = await apiFetch("crm-activities/my-agenda", token);
      setAgenda(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar tu agenda");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  // Load leads+opps when form opens
  useEffect(() => {
    if (!showForm || !token) return;
    if (!leads.length) apiFetch("ventas/leads", token).then((d) => setLeads(Array.isArray(d) ? d : (d?.data ?? []))).catch(() => { });
    if (!opps.length) apiFetch("ventas/oportunidades", token).then((d) => setOpps(Array.isArray(d) ? d : (d?.data ?? []))).catch(() => { });
  }, [showForm, token, leads.length, opps.length]);

  const complete = async (a: CrmActivity) => {
    if (!token) return;
    try {
      await apiFetch(`crm-activities/${a.id}/complete`, token, { method: "PATCH", body: JSON.stringify({ outcome: "Completado" }) });
      void load();
    } catch (e) { alert(`Error: ${e instanceof Error ? e.message : "desconocido"}`); }
  };

  const remove = async (a: CrmActivity) => {
    if (!token || !confirm(`¿Eliminar "${a.subject}"?`)) return;
    try {
      await apiFetch(`crm-activities/${a.id}`, token, { method: "DELETE" });
      void load();
    } catch (e) { alert(`Error: ${e instanceof Error ? e.message : "desconocido"}`); }
  };

  const openNew = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setShowForm(true);
  };

  const openEdit = (a: CrmActivity) => {
    setEditingId(a.id);
    setForm({
      subject: a.subject,
      description: a.description ?? "",
      activityType: a.activityType,
      dueDate: a.dueDate ? new Date(a.dueDate).toISOString().slice(0, 16) : "",
      leadId: a.leadId ? String(a.leadId) : "",
      opportunityId: a.opportunityId ? String(a.opportunityId) : "",
    });
    setShowForm(true);
  };

  const submit = async () => {
    if (!token || !form.subject || !form.dueDate) return;
    setSaving(true);
    try {
      const body = {
        subject: form.subject,
        description: form.description || undefined,
        activityType: form.activityType,
        dueDate: new Date(form.dueDate).toISOString(),
        leadId: form.leadId ? Number(form.leadId) : undefined,
        opportunityId: form.opportunityId ? Number(form.opportunityId) : undefined,
      };
      if (editingId) {
        await apiFetch(`crm-activities/${editingId}`, token, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await apiFetch("crm-activities", token, { method: "POST", body: JSON.stringify(body) });
      }
      setShowForm(false);
      setForm({ ...EMPTY_FORM });
      void load();
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally { setSaving(false); }
  };

  const inp: React.CSSProperties = {
    width: "100%", padding: "8px 12px", borderRadius: 8,
    border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--foreground)", fontSize: 13,
  };

  const lbl = (t: string) => (
    <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>{t}</span>
  );

  const renderItem = (a: CrmActivity, danger?: boolean) => (
    <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, marginBottom: 6 }}>
      <span style={{ fontSize: 18 }}>{TYPE_ICON[a.activityType] ?? "📌"}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{a.subject}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
          {a.lead?.name ?? a.opportunity?.title ?? a.tender?.tenderNumber ?? ""}
          {(a.lead?.name ?? a.opportunity?.title) ? " · " : ""}
          {new Date(a.dueDate).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
        </div>
        {a.description && <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginTop: 2 }}>{a.description}</div>}
      </div>
      {danger && <Tag variant="danger">Vencida</Tag>}
      <Button size="sm" variant="ghost" onClick={() => openEdit(a)}>✎</Button>
      <Button size="sm" variant="secondary" onClick={() => void complete(a)}>✓ Completar</Button>
      {cfg.canDelete && <Button size="sm" variant="danger" onClick={() => void remove(a)}>✕</Button>}
    </div>
  );

  return (
    <>
      <PageHeader
        eyebrow="CRM · Pipeline"
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={
          <>
            <Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>
            {cfg.canCreate && <Button variant="primary" iconLeft="+" onClick={openNew}>Nueva actividad</Button>}
          </>
        }
      />

      {loading && <EmptyState icon="⏳" title="Cargando agenda…" description="Consultando tus actividades." />}
      {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}

      {!loading && !error && agenda && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
            <KpiCard label="Hoy" value={agenda.pendingToday.length} icon="📅" />
            <KpiCard label="Vencidas" value={agenda.overdue.length} variant={agenda.overdue.length > 0 ? "danger" : "positive"} icon="⚠️" />
            <KpiCard label="Próximos 7 días" value={agenda.upcoming.length} icon="🗓️" />
            <KpiCard label="Completadas recientes" value={agenda.recentlyCompleted.length} variant="positive" icon="✅" />
          </div>

          {agenda.overdue.length > 0 && (
            <Section title="Vencidas" tone="accent">{agenda.overdue.map((a) => renderItem(a, true))}</Section>
          )}
          <Section title="Hoy">
            {agenda.pendingToday.length === 0
              ? <EmptyState icon="🎉" title="Nada para hoy" description="No tienes actividades pendientes para hoy." />
              : agenda.pendingToday.map((a) => renderItem(a))}
          </Section>
          <Section title="Próximos 7 días">
            {agenda.upcoming.length === 0
              ? <EmptyState icon="📭" title="Sin próximas actividades" description="Agenda tu siguiente seguimiento." />
              : agenda.upcoming.map((a) => renderItem(a))}
          </Section>
        </>
      )}

      {/* ── Modal: Nueva / Editar actividad ─────────────────────────────── */}
      {showForm && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => setShowForm(false)}
        >
          <div
            style={{ background: "var(--surface)", borderRadius: 16, padding: 28, width: 480, maxWidth: "calc(100vw - 32px)", boxShadow: "0 24px 56px rgba(0,0,0,0.24)", border: "1px solid var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>
              {editingId ? "Editar actividad" : "Nueva actividad"}
            </div>
            <div style={{ display: "grid", gap: 14 }}>
              <label style={{ display: "grid", gap: 4 }}>
                {lbl("Asunto *")}
                <input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} placeholder="Ej. Llamar a contacto para seguimiento" style={inp} autoFocus />
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label style={{ display: "grid", gap: 4 }}>
                  {lbl("Tipo")}
                  <select value={form.activityType} onChange={(e) => setForm((f) => ({ ...f, activityType: e.target.value }))} style={inp}>
                    {TYPES.map((t) => <option key={t} value={t}>{TYPE_ICON[t]} {t}</option>)}
                  </select>
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  {lbl("Fecha y hora *")}
                  <input type="datetime-local" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} style={inp} />
                </label>
              </div>

              {/* Vincular a lead u oportunidad */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label style={{ display: "grid", gap: 4 }}>
                  {lbl("Vincular a lead")}
                  <select value={form.leadId} onChange={(e) => setForm((f) => ({ ...f, leadId: e.target.value, opportunityId: "" }))} style={inp}>
                    <option value="">— ninguno —</option>
                    {leads.map((l) => <option key={l.id} value={l.id}>{l.name}{l.company ? ` (${l.company})` : ""}</option>)}
                  </select>
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  {lbl("Vincular a oportunidad")}
                  <select value={form.opportunityId} onChange={(e) => setForm((f) => ({ ...f, opportunityId: e.target.value, leadId: "" }))} style={inp}>
                    <option value="">— ninguna —</option>
                    {opps.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
                  </select>
                </label>
              </div>

              <label style={{ display: "grid", gap: 4 }}>
                {lbl("Descripción / notas")}
                <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} style={{ ...inp, resize: "vertical" }} placeholder="Detalles, acuerdos, resultados esperados…" />
              </label>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button variant="primary" onClick={() => void submit()} disabled={saving || !form.subject || !form.dueDate}>
                {saving ? "Guardando…" : editingId ? "Guardar cambios" : "Crear actividad"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
