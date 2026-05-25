"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";

type Ticket = { id: number; anNumber: string; titulo: string; estatus: string; prioridad: string; fechaAsignacion?: string; responsable?: { nombre: string } };

export default function SupportInboxPage() {
  const { user } = useUser();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user?.token) return;
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl(`activities?ticketType=CORRECTIVO`), { headers: { Authorization: `Bearer ${user.token}` } });
      if (res.ok) {
        const data = await res.json();
        const list = (Array.isArray(data) ? data : data.data || []).filter((t: any) => t.titulo?.startsWith("[Helpdesk"));
        setTickets(list);
      }
    } finally {
      setLoading(false);
    }
  }, [user?.token]);

  useEffect(() => { refresh(); }, [refresh]);

  const open = tickets.filter((t) => t.estatus !== "Finalizado" && t.estatus !== "Cancelado");
  const closed = tickets.filter((t) => t.estatus === "Finalizado");

  return (
    <div style={{ padding: 24, maxWidth: 1280, margin: "0 auto" }}>
      <h1 style={{ margin: 0 }}>📥 Bandeja de Helpdesk (Agente)</h1>
      <p style={{ color: "var(--text-secondary)", margin: 0 }}>Todos los tickets internos pendientes de atención.</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12, marginTop: 16 }}>
        <Kpi label="Total" value={tickets.length} color="#6b7280" />
        <Kpi label="Abiertos" value={open.length} color="#dc2626" />
        <Kpi label="Cerrados" value={closed.length} color="#16a34a" />
        <Kpi label="Alta prioridad" value={tickets.filter((t) => t.prioridad === "Alta" && t.estatus !== "Finalizado").length} color="#f59e0b" />
      </div>

      {loading ? <p>Cargando…</p> : (
        <div style={{ marginTop: 16 }}>
          <h3>🔥 Tickets abiertos ({open.length})</h3>
          {open.length === 0 ? <p style={{ color: "var(--text-secondary)" }}>Sin tickets abiertos 🎉</p> : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr><Th>OT</Th><Th>Título</Th><Th>Solicitante</Th><Th>Prioridad</Th><Th>Estatus</Th><Th>Fecha</Th></tr>
              </thead>
              <tbody>
                {open.map((t) => (
                  <tr key={t.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <Td><strong>{t.anNumber}</strong></Td>
                    <Td>{t.titulo.replace(/^\[Helpdesk · [^\]]+\]\s*/, "")}</Td>
                    <Td>{t.responsable?.nombre || "—"}</Td>
                    <Td>{t.prioridad}</Td>
                    <Td>{t.estatus}</Td>
                    <Td>{t.fechaAsignacion ? new Date(t.fechaAsignacion).toLocaleString("es-MX") : "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: number; color: string }) {
  return <div style={{ padding: 12, background: "var(--bg-secondary)", borderRadius: 10, borderLeft: `4px solid ${color}` }}><div style={{ fontSize: 10, color: "var(--text-secondary)", textTransform: "uppercase" }}>{label}</div><div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div></div>;
}
function Th({ children }: { children: React.ReactNode }) { return <th style={{ textAlign: "left", padding: 10, background: "var(--bg-secondary)", fontSize: 12 }}>{children}</th>; }
function Td({ children }: { children: React.ReactNode }) { return <td style={{ padding: 10, fontSize: 13 }}>{children}</td>; }
