"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";

type PerformanceRow = {
  targetId: number;
  ownerId: number;
  ownerName: string;
  period: string;
  year: number;
  month?: number | null;
  revenueTarget: number;
  revenueAchieved: number;
  attainmentPct: number;
  opportunitiesTarget: number;
  opportunitiesCreated: number;
  newClientsTarget: number;
  newClientsAchieved: number;
  baseCommissionPct: number;
  bonusCommissionPct: number;
  bonusThresholdPct: number;
  commission: number;
  reachedBonus: boolean;
};

type PerformancePayload = {
  year: number;
  month: number;
  performance: PerformanceRow[];
  totals: {
    revenueTarget: number;
    revenueAchieved: number;
    totalCommissions: number;
    avgAttainmentPct: number;
  };
};

const fmt = (n: number) => `$${Number(n || 0).toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;

export default function CuotasPage() {
  const { user } = useUser();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<PerformancePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    ownerId: "",
    revenueTarget: 0,
    opportunitiesTarget: 0,
    newClientsTarget: 0,
    baseCommissionPct: 0,
    bonusCommissionPct: 0,
    bonusThresholdPct: 100,
  });
  const [showForm, setShowForm] = useState(false);

  const refresh = useCallback(async () => {
    if (!user?.token) return;
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl(`sales-targets/performance?year=${year}&month=${month}`), {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const payload = await res.json();
      setData(payload);
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [user?.token, year, month]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleSave = async () => {
    if (!form.ownerId) {
      setMsg("Selecciona un vendedor");
      return;
    }
    try {
      const res = await fetch(buildApiUrl(`sales-targets`), {
        method: "POST",
        headers: { Authorization: `Bearer ${user?.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerId: +form.ownerId,
          year,
          month,
          period: "MONTHLY",
          revenueTarget: form.revenueTarget,
          opportunitiesTarget: form.opportunitiesTarget,
          newClientsTarget: form.newClientsTarget,
          baseCommissionPct: form.baseCommissionPct,
          bonusCommissionPct: form.bonusCommissionPct,
          bonusThresholdPct: form.bonusThresholdPct,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setMsg("Meta guardada");
      setShowForm(false);
      await refresh();
    } catch (err) {
      setMsg((err as Error).message);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1280, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>🎯 Cuotas y comisiones</h1>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>
            Metas mensuales por vendedor con cálculo automático de comisión base y bono por logro.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select value={month} onChange={(e) => setMonth(+e.target.value)} style={pickerStyle}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>{new Date(2000, m - 1, 1).toLocaleString("es-MX", { month: "long" })}</option>
            ))}
          </select>
          <select value={year} onChange={(e) => setYear(+e.target.value)} style={pickerStyle}>
            {[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button type="button" className="button-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? "Cancelar" : "+ Asignar meta"}
          </button>
        </div>
      </div>

      {msg && <div style={{ padding: 10, background: "#dcfce7", color: "#166534", borderRadius: 8, marginTop: 12 }}>{msg}</div>}

      {showForm && (
        <div style={{ marginTop: 16, padding: 16, background: "var(--bg-secondary)", borderRadius: 12 }}>
          <h3 style={{ marginTop: 0 }}>Asignar meta — {month}/{year}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <Field label="Owner ID *">
              <input style={inputStyle} value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })} />
            </Field>
            <Field label="Meta de ingreso (MXN)">
              <input type="number" style={inputStyle} value={form.revenueTarget} onChange={(e) => setForm({ ...form, revenueTarget: +e.target.value })} />
            </Field>
            <Field label="Meta oportunidades">
              <input type="number" style={inputStyle} value={form.opportunitiesTarget} onChange={(e) => setForm({ ...form, opportunitiesTarget: +e.target.value })} />
            </Field>
            <Field label="Meta nuevos clientes">
              <input type="number" style={inputStyle} value={form.newClientsTarget} onChange={(e) => setForm({ ...form, newClientsTarget: +e.target.value })} />
            </Field>
            <Field label="Comisión base %">
              <input type="number" step="0.5" style={inputStyle} value={form.baseCommissionPct} onChange={(e) => setForm({ ...form, baseCommissionPct: +e.target.value })} />
            </Field>
            <Field label="Bono % (extra al alcanzar meta)">
              <input type="number" step="0.5" style={inputStyle} value={form.bonusCommissionPct} onChange={(e) => setForm({ ...form, bonusCommissionPct: +e.target.value })} />
            </Field>
            <Field label="Umbral bono %">
              <input type="number" style={inputStyle} value={form.bonusThresholdPct} onChange={(e) => setForm({ ...form, bonusThresholdPct: +e.target.value })} />
            </Field>
          </div>
          <button type="button" className="button-primary" onClick={handleSave} style={{ marginTop: 12 }}>Guardar meta</button>
        </div>
      )}

      {loading ? <p>Cargando…</p> : data && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 16 }}>
            <Kpi label="Meta total" value={fmt(data.totals.revenueTarget)} color="#6b7280" />
            <Kpi label="Logrado" value={fmt(data.totals.revenueAchieved)} color="#16a34a" />
            <Kpi label="Comisión total" value={fmt(data.totals.totalCommissions)} color="#8b5cf6" />
            <Kpi label="Promedio logro %" value={`${data.totals.avgAttainmentPct}%`} color={data.totals.avgAttainmentPct >= 80 ? "#16a34a" : "#f59e0b"} />
          </div>

          <div style={{ marginTop: 16, padding: 16, background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 12 }}>
            {data.performance.length === 0 ? (
              <p style={{ color: "var(--text-secondary)" }}>No hay metas asignadas para este periodo.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <Th>Vendedor</Th>
                    <Th align="right">Meta</Th>
                    <Th align="right">Logrado</Th>
                    <Th>Avance</Th>
                    <Th align="right">Ops</Th>
                    <Th align="right">Comisión</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.performance.map((row) => (
                    <tr key={row.targetId} style={{ borderTop: "1px solid var(--border)" }}>
                      <Td>
                        <strong>{row.ownerName}</strong>
                        {row.reachedBonus && <span style={{ marginLeft: 6, color: "#f59e0b" }}>🌟 Bono</span>}
                      </Td>
                      <Td align="right">{fmt(row.revenueTarget)}</Td>
                      <Td align="right" style={{ color: row.revenueAchieved >= row.revenueTarget ? "#16a34a" : "#0ea5e9", fontWeight: 600 }}>{fmt(row.revenueAchieved)}</Td>
                      <Td>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ flex: 1, height: 8, background: "var(--bg-secondary)", borderRadius: 4, overflow: "hidden" }}>
                            <div style={{ width: `${Math.min(row.attainmentPct, 100)}%`, height: "100%", background: row.attainmentPct >= 100 ? "#16a34a" : row.attainmentPct >= 70 ? "#0ea5e9" : "#f59e0b" }} />
                          </div>
                          <span style={{ fontSize: 12, minWidth: 50, textAlign: "right" }}>{row.attainmentPct}%</span>
                        </div>
                      </Td>
                      <Td align="right">{row.opportunitiesCreated}/{row.opportunitiesTarget}</Td>
                      <Td align="right" style={{ color: "#8b5cf6", fontWeight: 600 }}>{fmt(row.commission)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div style={{ padding: 12, background: "var(--bg-secondary)", borderRadius: 10, borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 10, color: "var(--text-secondary)", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}
function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return <th style={{ textAlign: align || "left", padding: 10, background: "var(--bg-secondary)", fontSize: 12 }}>{children}</th>;
}
function Td({ children, align, style }: { children: React.ReactNode; align?: "right"; style?: React.CSSProperties }) {
  return <td style={{ padding: 10, textAlign: align || "left", fontSize: 13, ...style }}>{children}</td>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)" }}>{label}{children}</label>;
}
const pickerStyle: React.CSSProperties = { padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-secondary)" };
const inputStyle: React.CSSProperties = { display: "block", width: "100%", padding: 8, borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)", marginTop: 4 };
