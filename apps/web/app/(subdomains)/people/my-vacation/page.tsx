"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";

type LeaveRequest = {
  id: number;
  type: string;
  status: string;
  startDate: string;
  endDate: string;
  days: number;
  reason?: string | null;
  approvedBy?: { id: number; nombre: string } | null;
  rejectionReason?: string | null;
  createdAt: string;
};

type Balance = {
  annualEntitlement: number;
  used: number;
  remaining: number;
  carriedOver?: number;
};

const STATUS_COLOR: Record<string, string> = {
  PENDING: "#f59e0b",
  APPROVED: "#16a34a",
  REJECTED: "#dc2626",
  CANCELLED: "#6b7280",
};

const TYPE_LABEL: Record<string, string> = {
  VACATION: "🏖️ Vacaciones",
  SICK: "🤒 Enfermedad",
  PERSONAL: "👤 Personal",
  MATERNITY: "🤱 Maternidad",
  PATERNITY: "👨‍🍼 Paternidad",
  BEREAVEMENT: "🕊️ Duelo",
  UNPAID: "💰 Sin goce",
};

export default function MyVacationPage() {
  const { user } = useUser();
  const [balance, setBalance] = useState<Balance | null>(null);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: "VACATION", startDate: "", endDate: "", reason: "" });
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user?.token || !user?.id) return;
    setLoading(true);
    try {
      const [balRes, listRes] = await Promise.all([
        fetch(buildApiUrl(`hr/leaves/balance/${user.id}`), { headers: { Authorization: `Bearer ${user.token}` } }),
        fetch(buildApiUrl(`hr/leaves?userId=${user.id}`), { headers: { Authorization: `Bearer ${user.token}` } }),
      ]);
      if (balRes.ok) setBalance(await balRes.json());
      if (listRes.ok) {
        const data = await listRes.json();
        setRequests(Array.isArray(data) ? data : data.data || []);
      }
    } finally {
      setLoading(false);
    }
  }, [user?.token, user?.id]);

  useEffect(() => { refresh(); }, [refresh]);

  const submit = async () => {
    if (!form.startDate || !form.endDate) {
      setMsg("Selecciona fechas de inicio y fin");
      return;
    }
    setSubmitting(true);
    setMsg(null);
    try {
      const start = new Date(form.startDate);
      const end = new Date(form.endDate);
      if (end < start) {
        setMsg("La fecha fin debe ser posterior al inicio");
        setSubmitting(false);
        return;
      }
      const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
      const res = await fetch(buildApiUrl("hr/leaves"), {
        method: "POST",
        headers: { Authorization: `Bearer ${user?.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          type: form.type,
          startDate: form.startDate,
          endDate: form.endDate,
          days,
          reason: form.reason || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setMsg("✅ Solicitud enviada para aprobación");
      setShowForm(false);
      setForm({ type: "VACATION", startDate: "", endDate: "", reason: "" });
      refresh();
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = async (id: number) => {
    if (!confirm("¿Cancelar esta solicitud?")) return;
    await fetch(buildApiUrl(`hr/leaves/${id}/cancel`), {
      method: "PATCH",
      headers: { Authorization: `Bearer ${user?.token}` },
    });
    refresh();
  };

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: "0 auto" }}>
      <h1 style={{ margin: 0 }}>🏖️ Mis vacaciones y permisos</h1>
      <p style={{ color: "var(--text-secondary)", margin: 0 }}>Solicitudes, balance y aprobaciones.</p>

      {msg && (
        <div style={{ marginTop: 12, padding: 10, background: msg.startsWith("✅") ? "#dcfce7" : "#fee2e2", color: msg.startsWith("✅") ? "#166534" : "#7f1d1d", borderRadius: 8 }}>
          {msg}
        </div>
      )}

      {loading ? <p>Cargando…</p> : (
        <>
          {balance && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginTop: 16 }}>
              <Kpi label="Días anuales" value={balance.annualEntitlement} color="#0ea5e9" />
              <Kpi label="Usados" value={balance.used} color="#f59e0b" />
              <Kpi label="Disponibles" value={balance.remaining} color="#16a34a" />
              {balance.carriedOver != null && <Kpi label="Carry over" value={balance.carriedOver} color="#8b5cf6" />}
            </div>
          )}

          <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>Mis solicitudes</h3>
            <button type="button" onClick={() => setShowForm(!showForm)} style={{ padding: "8px 16px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>
              {showForm ? "✕ Cancelar" : "➕ Nueva solicitud"}
            </button>
          </div>

          {showForm && (
            <div style={{ marginTop: 12, padding: 16, background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                <Field label="Tipo">
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} style={inputStyle}>
                    {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </Field>
                <Field label="Desde">
                  <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} style={inputStyle} />
                </Field>
                <Field label="Hasta">
                  <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} style={inputStyle} />
                </Field>
              </div>
              <Field label="Motivo (opcional)">
                <textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} style={{ ...inputStyle, minHeight: 60 }} />
              </Field>
              <button type="button" onClick={submit} disabled={submitting} style={{ marginTop: 12, width: "100%", padding: 12, background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: submitting ? "wait" : "pointer" }}>
                {submitting ? "Enviando…" : "🚀 Enviar solicitud"}
              </button>
            </div>
          )}

          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {requests.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--text-secondary)" }}>Sin solicitudes registradas.</div>
            ) : requests.map((r) => (
              <div key={r.id} style={{ padding: 12, background: "var(--bg-primary)", border: "1px solid var(--border)", borderLeft: `4px solid ${STATUS_COLOR[r.status] || "#6b7280"}`, borderRadius: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <strong>{TYPE_LABEL[r.type] || r.type}</strong>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      {new Date(r.startDate).toLocaleDateString("es-MX")} → {new Date(r.endDate).toLocaleDateString("es-MX")} · {r.days} día(s)
                    </div>
                    {r.reason && <div style={{ fontSize: 12, marginTop: 4 }}>📝 {r.reason}</div>}
                    {r.rejectionReason && <div style={{ fontSize: 12, marginTop: 4, color: "#dc2626" }}>❌ {r.rejectionReason}</div>}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ background: STATUS_COLOR[r.status] + "22", color: STATUS_COLOR[r.status], padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
                      {r.status}
                    </span>
                    {r.status === "PENDING" && (
                      <button type="button" onClick={() => cancel(r.id)} style={{ display: "block", marginTop: 6, padding: "4px 8px", background: "transparent", color: "#dc2626", border: "1px solid #dc2626", borderRadius: 6, cursor: "pointer", fontSize: 11 }}>
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginTop: 8 }}>
      {label}
      {children}
    </label>
  );
}

function Kpi({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ padding: 14, background: "var(--bg-primary)", border: "1px solid var(--border)", borderTop: `3px solid ${color}`, borderRadius: 10, textAlign: "center" }}>
      <div style={{ fontSize: 11, color: "var(--text-secondary)", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>días</div>
    </div>
  );
}

const inputStyle: React.CSSProperties = { display: "block", width: "100%", padding: 8, borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)", marginTop: 4 };
