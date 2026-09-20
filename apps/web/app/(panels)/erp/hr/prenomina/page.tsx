"use client";

import { useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";

type Row = {
  userId: number;
  nombre: string;
  email: string;
  totalMinutes: number;
  approvedOvertimeMinutes: number;
  suggestedAmount: number;
  sueldoSemanal: number | null;
  openDays: string[];
};

export default function PrenominaPage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const preview = async () => {
    setLoading(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch(
        buildApiUrl(`employee-payments/preview-period?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setRows(data.rows ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  const drafts = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(buildApiUrl("employee-payments/prenomina/batch"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from, to }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setMsg(`Se crearon ${data.created} borradores de pago.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="RH · Nómina operativa"
        title="Pre-nómina"
        subtitle="Asistencia + extras aprobadas + sueldo semanal → borradores (sin timbrado CFDI)."
      />
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ minHeight: 44, padding: 10 }} />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ minHeight: 44, padding: 10 }} />
        <button type="button" disabled={loading || !from || !to} onClick={() => void preview()} style={{ minHeight: 44, padding: "0 14px" }}>
          Calcular periodo
        </button>
        <button type="button" disabled={loading || rows.length === 0} onClick={() => void drafts()} style={{ minHeight: 44, padding: "0 14px" }}>
          Generar borradores
        </button>
      </div>
      {err && <p style={{ color: "var(--danger)" }}>{err}</p>}
      {msg && <p style={{ color: "var(--success)" }}>{msg}</p>}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr>
              <th align="left">Persona</th>
              <th align="right">Minutos</th>
              <th align="right">Extras apr.</th>
              <th align="right">Sueldo sem.</th>
              <th align="right">Sugerido</th>
              <th align="left">Días abiertos</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.userId} style={{ borderTop: "1px solid var(--border)" }}>
                <td>{r.nombre}</td>
                <td align="right">{r.totalMinutes}</td>
                <td align="right">{r.approvedOvertimeMinutes}</td>
                <td align="right">{r.sueldoSemanal ?? "—"}</td>
                <td align="right">${Number(r.suggestedAmount || 0).toFixed(2)}</td>
                <td>{r.openDays?.length ? r.openDays.join(", ") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
