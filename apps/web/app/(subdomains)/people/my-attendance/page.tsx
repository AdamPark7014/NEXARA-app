"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";

type Record = { id: number; type: string; createdAt: string; date?: string };

export default function MyAttendancePage() {
  const { user } = useUser();
  const [records, setRecords] = useState<Record[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user?.token) return;
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl("attendance/history"), { headers: { Authorization: `Bearer ${user.token}` } });
      if (res.ok) {
        const data = await res.json();
        setRecords(Array.isArray(data) ? data : data.records || []);
      }
    } finally {
      setLoading(false);
    }
  }, [user?.token]);

  useEffect(() => { refresh(); }, [refresh]);

  const checkIn = async (type: string) => {
    if (!user?.token) return;
    await fetch(buildApiUrl("attendance"), {
      method: "POST",
      headers: { Authorization: `Bearer ${user.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
    });
    refresh();
  };

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ margin: 0 }}>⏱️ Mi asistencia</h1>
      <p style={{ color: "var(--text-secondary)", margin: 0 }}>Registra tus entradas, salidas y consulta tu historial.</p>

      <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
        <button type="button" onClick={() => checkIn("CHECK_IN")} style={btnStyle("#16a34a")}>🟢 Check-in</button>
        <button type="button" onClick={() => checkIn("BREAK_START")} style={btnStyle("#f59e0b")}>☕ Inicio break</button>
        <button type="button" onClick={() => checkIn("BREAK_END")} style={btnStyle("#0ea5e9")}>🔄 Fin break</button>
        <button type="button" onClick={() => checkIn("CHECK_OUT")} style={btnStyle("#dc2626")}>🔴 Check-out</button>
      </div>

      <h3 style={{ marginTop: 24 }}>Historial</h3>
      {loading ? <p>Cargando…</p> : records.length === 0 ? (
        <p style={{ color: "var(--text-secondary)" }}>Sin registros aún.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><Th>Tipo</Th><Th>Fecha</Th><Th>Hora</Th></tr></thead>
          <tbody>
            {records.slice(0, 50).map((r) => {
              const d = new Date(r.createdAt);
              return (
                <tr key={r.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <Td>{r.type}</Td>
                  <Td>{d.toLocaleDateString("es-MX")}</Td>
                  <Td>{d.toLocaleTimeString("es-MX")}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function btnStyle(color: string): React.CSSProperties {
  return { padding: "12px 18px", background: color, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700 };
}
function Th({ children }: { children: React.ReactNode }) { return <th style={{ textAlign: "left", padding: 8, background: "var(--bg-secondary)", fontSize: 12 }}>{children}</th>; }
function Td({ children }: { children: React.ReactNode }) { return <td style={{ padding: 8, fontSize: 13 }}>{children}</td>; }
