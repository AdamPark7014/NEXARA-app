"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@/components/UserContext";
import {
  ACTIVITY_STATUS_COLOR,
  ACTIVITY_TYPE_LABEL,
  completeCrmActivity,
  createCrmActivity,
  getMyAgenda,
  type AgendaPayload,
  type CrmActivity,
  type CrmActivityType,
} from "@/lib/crm-activities-api";

export default function AgendaPage() {
  const { user } = useUser();
  const [data, setData] = useState<AgendaPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    activityType: "TASK" as CrmActivityType,
    subject: "",
    description: "",
    dueDate: "",
    opportunityId: "",
    leadId: "",
  });
  const [showForm, setShowForm] = useState(false);

  const refresh = useCallback(async () => {
    if (!user?.token) return;
    setLoading(true);
    try {
      const agenda = await getMyAgenda(user.token);
      setData(agenda);
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [user?.token]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleCreate = async () => {
    if (!form.subject || !form.dueDate) {
      setMsg("Asunto y fecha son obligatorios");
      return;
    }
    if (!form.opportunityId && !form.leadId) {
      setMsg("Asocia la actividad a una oportunidad o lead");
      return;
    }
    try {
      await createCrmActivity(user?.token || "", {
        activityType: form.activityType,
        subject: form.subject,
        description: form.description,
        dueDate: form.dueDate,
        opportunityId: form.opportunityId ? +form.opportunityId : undefined,
        leadId: form.leadId ? +form.leadId : undefined,
      });
      setForm({ ...form, subject: "", description: "", dueDate: "", opportunityId: "", leadId: "" });
      setShowForm(false);
      setMsg("Actividad creada");
      await refresh();
    } catch (err) {
      setMsg((err as Error).message);
    }
  };

  const handleComplete = async (id: number) => {
    try {
      await completeCrmActivity(user?.token || "", id);
      await refresh();
    } catch (err) {
      setMsg((err as Error).message);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1280, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>📅 Mi agenda comercial</h1>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>
            Tareas, llamadas, reuniones y seguimientos comerciales. Todo en un solo lugar.
          </p>
        </div>
        <button type="button" className="button-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancelar" : "+ Nueva actividad"}
        </button>
      </div>

      {msg && <div style={{ padding: 10, background: "#dcfce7", color: "#166534", borderRadius: 8, marginTop: 12 }}>{msg}</div>}

      {showForm && (
        <div style={{ marginTop: 16, padding: 16, background: "var(--bg-secondary)", borderRadius: 12 }}>
          <h3 style={{ marginTop: 0 }}>Nueva actividad</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            <Field label="Tipo">
              <select value={form.activityType} onChange={(e) => setForm({ ...form, activityType: e.target.value as CrmActivityType })} style={inputStyle}>
                {Object.entries(ACTIVITY_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
            <Field label="Asunto *">
              <input style={inputStyle} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            </Field>
            <Field label="Vence *">
              <input type="datetime-local" style={inputStyle} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </Field>
            <Field label="Oportunidad ID">
              <input style={inputStyle} value={form.opportunityId} onChange={(e) => setForm({ ...form, opportunityId: e.target.value })} placeholder="opcional" />
            </Field>
            <Field label="Lead ID">
              <input style={inputStyle} value={form.leadId} onChange={(e) => setForm({ ...form, leadId: e.target.value })} placeholder="opcional" />
            </Field>
            <Field label="Descripción">
              <textarea style={{ ...inputStyle, minHeight: 40 }} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
          </div>
          <button type="button" className="button-primary" onClick={handleCreate} style={{ marginTop: 12 }}>Guardar</button>
        </div>
      )}

      {loading ? <p>Cargando agenda…</p> : data && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginTop: 16 }}>
            <Kpi label="Hoy" value={data.pendingToday.length} color="#3b82f6" />
            <Kpi label="Vencidas" value={data.overdue.length} color="#dc2626" />
            <Kpi label="Próximos 7 días" value={data.upcoming.length} color="#f59e0b" />
            <Kpi label="Completadas (10 últimas)" value={data.recentlyCompleted.length} color="#16a34a" />
          </div>

          {data.overdue.length > 0 && (
            <Section title={`⚠️ Vencidas (${data.overdue.length})`} color="#dc2626">
              <ActivityList items={data.overdue} onComplete={handleComplete} />
            </Section>
          )}

          <Section title={`🌟 Hoy (${data.pendingToday.length})`} color="#3b82f6">
            {data.pendingToday.length === 0 ? <Empty>Sin pendientes para hoy 🎉</Empty> : <ActivityList items={data.pendingToday} onComplete={handleComplete} />}
          </Section>

          <Section title={`🔜 Próximos 7 días (${data.upcoming.length})`} color="#f59e0b">
            {data.upcoming.length === 0 ? <Empty>Tu agenda está despejada.</Empty> : <ActivityList items={data.upcoming} onComplete={handleComplete} />}
          </Section>

          {data.recentlyCompleted.length > 0 && (
            <Section title={`✅ Completadas recientemente`} color="#16a34a">
              <ActivityList items={data.recentlyCompleted} readOnly />
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function ActivityList({ items, onComplete, readOnly }: { items: CrmActivity[]; onComplete?: (id: number) => void; readOnly?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((a) => {
        const overdue = !readOnly && new Date(a.dueDate) < new Date() && a.status === "PENDING";
        return (
          <div key={a.id} style={{ padding: 12, background: "var(--bg-secondary)", borderRadius: 8, border: "1px solid var(--border)", borderLeft: `4px solid ${overdue ? "#dc2626" : ACTIVITY_STATUS_COLOR[a.status]}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{ACTIVITY_TYPE_LABEL[a.activityType]}</div>
                <strong style={{ fontSize: 14 }}>{a.subject}</strong>
                {a.description && <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>{a.description}</div>}
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>
                  ⏰ {new Date(a.dueDate).toLocaleString("es-MX")}
                  {a.opportunity && <Link href={`/oportunidades?id=${a.opportunity.id}`} style={{ marginLeft: 8, color: "var(--primary)" }}>· Opp #{a.opportunity.id} {a.opportunity.title}</Link>}
                  {a.lead && <Link href={`/leads?id=${a.lead.id}`} style={{ marginLeft: 8, color: "var(--primary)" }}>· Lead {a.lead.name || a.lead.company}</Link>}
                  {a.tender && <Link href={`/licitaciones/${a.tender.id}`} style={{ marginLeft: 8, color: "var(--primary)" }}>· Lic. {a.tender.tenderNumber}</Link>}
                </div>
              </div>
              {!readOnly && onComplete && a.status === "PENDING" && (
                <button type="button" onClick={() => onComplete(a.id)} style={{ padding: "6px 12px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600, alignSelf: "flex-start" }}>
                  ✓ Marcar como completada
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 16 }}>
      <h3 style={{ marginTop: 0, marginBottom: 8, paddingLeft: 8, borderLeft: `4px solid ${color}` }}>{title}</h3>
      {children}
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p style={{ color: "var(--text-secondary)", fontStyle: "italic" }}>{children}</p>;
}
function Kpi({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ padding: 12, background: "var(--bg-secondary)", borderRadius: 10, borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 10, color: "var(--text-secondary)", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)" }}>{label}{children}</label>;
}

const inputStyle: React.CSSProperties = {
  display: "block", width: "100%", padding: 8, borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)", marginTop: 4,
};
