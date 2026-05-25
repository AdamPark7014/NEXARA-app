"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";

type SlaPayload = {
  total: number;
  stillOpen: number;
  responseSla: { onTime: number; late: number; compliancePct: number; avgHours: number };
  resolutionSla: { onTime: number; late: number; compliancePct: number; avgHours: number };
  breaches: Array<{ id: number; anNumber: string; titulo: string; type: string; priority: string; hoursLate: number }>;
  bySeverity: { high: number; medium: number; low: number };
  defaultSla: { responseByPriority: Record<string, number>; resolutionByPriority: Record<string, number> };
};

export default function SlaPage() {
  const { user } = useUser();
  const [data, setData] = useState<SlaPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const now = new Date();
  const [from, setFrom] = useState(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  const refresh = useCallback(async () => {
    if (!user?.token) return;
    setLoading(true);
    try {
      const url = `sla/stats?from=${from}T00:00:00&to=${to}T23:59:59`;
      const res = await fetch(buildApiUrl(url), { headers: { Authorization: `Bearer ${user.token}` } });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [user?.token, from, to]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div style={{ padding: 24, maxWidth: 1280, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>⏱️ SLA Tracker</h1>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>
            Cumplimiento de tiempos de respuesta y resolución en tickets de servicio.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={pickerStyle} />
          <span>→</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={pickerStyle} />
        </div>
      </div>

      {loading ? <p>Cargando…</p> : data && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginTop: 16 }}>
            <Kpi label="Tickets totales" value={data.total} color="#6b7280" />
            <Kpi label="Aún abiertos" value={data.stillOpen} color={data.stillOpen > 0 ? "#f59e0b" : "#16a34a"} />
            <Kpi label="Compliance respuesta" value={`${data.responseSla.compliancePct}%`} color={data.responseSla.compliancePct >= 90 ? "#16a34a" : data.responseSla.compliancePct >= 70 ? "#f59e0b" : "#dc2626"} />
            <Kpi label="Tiempo medio respuesta" value={`${data.responseSla.avgHours} h`} color="#0ea5e9" />
            <Kpi label="Compliance resolución" value={`${data.resolutionSla.compliancePct}%`} color={data.resolutionSla.compliancePct >= 90 ? "#16a34a" : data.resolutionSla.compliancePct >= 70 ? "#f59e0b" : "#dc2626"} />
            <Kpi label="Tiempo medio resolución" value={`${data.resolutionSla.avgHours} h`} color="#8b5cf6" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, marginTop: 16 }}>
            <Panel title="🕐 Respuesta inicial">
              <Bar label="A tiempo" value={data.responseSla.onTime} color="#16a34a" max={data.responseSla.onTime + data.responseSla.late} />
              <Bar label="Tarde" value={data.responseSla.late} color="#dc2626" max={data.responseSla.onTime + data.responseSla.late} />
            </Panel>
            <Panel title="🏁 Resolución completa">
              <Bar label="A tiempo" value={data.resolutionSla.onTime} color="#16a34a" max={data.resolutionSla.onTime + data.resolutionSla.late} />
              <Bar label="Tarde" value={data.resolutionSla.late} color="#dc2626" max={data.resolutionSla.onTime + data.resolutionSla.late} />
            </Panel>
            <Panel title="⚡ Prioridad">
              <Bar label="Alta" value={data.bySeverity.high} color="#dc2626" max={data.total} />
              <Bar label="Media" value={data.bySeverity.medium} color="#f59e0b" max={data.total} />
              <Bar label="Baja" value={data.bySeverity.low} color="#16a34a" max={data.total} />
            </Panel>
          </div>

          <div style={{ marginTop: 16, padding: 14, background: "var(--bg-secondary)", borderRadius: 10 }}>
            <strong style={{ fontSize: 13 }}>⚙️ SLAs configurados (horas)</strong>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 8, fontSize: 12 }}>
              {Object.entries(data.defaultSla.responseByPriority).map(([p, h]) => (
                <div key={p}>
                  <strong>{p}:</strong> respuesta ≤ {h}h · resolución ≤ {data.defaultSla.resolutionByPriority[p]}h
                </div>
              ))}
            </div>
          </div>

          {data.breaches.length > 0 && (
            <div style={{ marginTop: 16, padding: 16, background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 12 }}>
              <h3 style={{ marginTop: 0, color: "#dc2626" }}>⚠️ Top 20 incumplimientos</h3>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr><Th>#</Th><Th>OT</Th><Th>Título</Th><Th>Prioridad</Th><Th>Tipo</Th><Th align="right">Horas tarde</Th></tr>
                </thead>
                <tbody>
                  {data.breaches.map((b, i) => (
                    <tr key={b.id} style={{ borderTop: "1px solid var(--border)" }}>
                      <Td>{i + 1}</Td>
                      <Td><strong>{b.anNumber}</strong></Td>
                      <Td>{b.titulo}</Td>
                      <Td><Badge color={b.priority === "Alta" ? "#dc2626" : b.priority === "Media" ? "#f59e0b" : "#16a34a"}>{b.priority}</Badge></Td>
                      <Td>{b.type === "response" ? "Respuesta" : b.type === "response_open" ? "Sin responder" : "Resolución"}</Td>
                      <Td align="right" style={{ color: "#dc2626", fontWeight: 700 }}>{b.hoursLate} h</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div style={{ padding: 12, background: "var(--bg-secondary)", borderRadius: 10, borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 10, color: "var(--text-secondary)", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: 14, background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 10 }}>
      <strong>{title}</strong>
      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
    </div>
  );
}
function Bar({ label, value, color, max }: { label: string; value: number; color: string; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
        <span>{label}</span>
        <strong>{value} <span style={{ color: "var(--text-secondary)", fontWeight: 400 }}>({pct}%)</span></strong>
      </div>
      <div style={{ height: 8, background: "var(--bg-secondary)", borderRadius: 4, overflow: "hidden", marginTop: 4 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color }} />
      </div>
    </div>
  );
}
function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return <span style={{ display: "inline-block", padding: "2px 8px", background: `${color}22`, color, borderRadius: 999, fontSize: 11, fontWeight: 700 }}>{children}</span>;
}
function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return <th style={{ textAlign: align || "left", padding: 8, background: "var(--bg-secondary)", fontSize: 12 }}>{children}</th>;
}
function Td({ children, align, style }: { children: React.ReactNode; align?: "right"; style?: React.CSSProperties }) {
  return <td style={{ padding: 8, textAlign: align || "left", fontSize: 13, ...style }}>{children}</td>;
}
const pickerStyle: React.CSSProperties = { padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-secondary)" };
