"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";

type Ticket = {
  id: number;
  anNumber: string;
  titulo: string;
  estatus: string;
  prioridad: string;
  fechaAsignacion?: string;
  fechaFinalizacion?: string;
};

const STATUS_COLOR: Record<string, string> = {
  "Pendiente": "#f59e0b",
  "Asignado": "#3b82f6",
  "En Proceso": "#0ea5e9",
  "Finalizado": "#16a34a",
  "Cancelado": "#6b7280",
};

export default function MySupportTickets() {
  const { user } = useUser();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user?.token) return;
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl(`activities?responsableId=${user.id}`), { headers: { Authorization: `Bearer ${user.token}` } });
      if (res.ok) {
        const data = await res.json();
        setTickets((Array.isArray(data) ? data : data.data || []).filter((t: any) => t.titulo?.startsWith("[Helpdesk")));
      }
    } finally {
      setLoading(false);
    }
  }, [user?.token, user?.id]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>🎟️ Mis tickets de Helpdesk</h1>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>Solicitudes que has levantado al equipo de soporte interno.</p>
        </div>
        <Link href="/support/new-ticket" style={{ padding: "10px 16px", background: "#dc2626", color: "#fff", borderRadius: 8, textDecoration: "none", fontWeight: 700 }}>+ Nuevo ticket</Link>
      </div>

      {loading ? <p>Cargando…</p> : tickets.length === 0 ? (
        <div style={{ marginTop: 24, padding: 32, background: "var(--bg-secondary)", borderRadius: 12, textAlign: "center" }}>
          <div style={{ fontSize: 48 }}>🎉</div>
          <p style={{ color: "var(--text-secondary)", marginTop: 8 }}>No has levantado tickets de Helpdesk.</p>
        </div>
      ) : (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          {tickets.map((t) => (
            <div key={t.id} style={{ padding: 12, background: "var(--bg-primary)", border: "1px solid var(--border)", borderLeft: `4px solid ${STATUS_COLOR[t.estatus] || "#6b7280"}`, borderRadius: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{t.anNumber}</div>
                  <strong style={{ fontSize: 14 }}>{t.titulo.replace(/^\[Helpdesk · [^\]]+\]\s*/, "")}</strong>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ background: STATUS_COLOR[t.estatus] + "22", color: STATUS_COLOR[t.estatus], padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
                    {t.estatus}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{t.prioridad}</span>
                </div>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>
                Levantado: {t.fechaAsignacion ? new Date(t.fechaAsignacion).toLocaleString("es-MX") : "—"}
                {t.fechaFinalizacion && <> · Cerrado: {new Date(t.fechaFinalizacion).toLocaleString("es-MX")}</>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
