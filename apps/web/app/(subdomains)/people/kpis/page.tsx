"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";

type Member = { id: number; nombre: string; isSuperAdmin?: boolean; rolesPlatform?: Array<{ name: string }> };

export default function PeopleKpisPage() {
  const { user } = useUser();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user?.token) return;
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl("users"), { headers: { Authorization: `Bearer ${user.token}` } });
      if (res.ok) {
        const data = await res.json();
        setMembers(Array.isArray(data) ? data : data.users || []);
      }
    } finally {
      setLoading(false);
    }
  }, [user?.token]);

  useEffect(() => { refresh(); }, [refresh]);

  const total = members.length;
  const admins = members.filter((m) => m.isSuperAdmin).length;
  const operations = members.filter((m) => m.rolesPlatform?.some((r) => /operac|ingenier/i.test(r.name))).length;
  const sales = members.filter((m) => m.rolesPlatform?.some((r) => /vent|comerc/i.test(r.name))).length;
  const admin = members.filter((m) => m.rolesPlatform?.some((r) => /admin|contab|finan/i.test(r.name))).length;

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ margin: 0 }}>📊 KPIs de Recursos Humanos</h1>
      <p style={{ color: "var(--text-secondary)", margin: 0 }}>Visión rápida de la composición del equipo.</p>

      {loading ? <p>Cargando…</p> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginTop: 16 }}>
          <Kpi label="Headcount" value={total} color="#16a34a" />
          <Kpi label="Direcciones" value={admins} color="#7c3aed" />
          <Kpi label="Operaciones" value={operations} color="#0891b2" />
          <Kpi label="Ventas" value={sales} color="#dc2626" />
          <Kpi label="Administración" value={admin} color="#f59e0b" />
        </div>
      )}

      <div style={{ marginTop: 24, padding: 12, background: "#dbeafe", borderRadius: 10, fontSize: 12, color: "#1e3a8a" }}>
        ℹ️ Los KPIs avanzados (rotación, ausentismo, satisfacción) se calcularán cuando el módulo de RH tenga endpoints dedicados.
      </div>
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ padding: 14, background: "var(--bg-primary)", border: "1px solid var(--border)", borderTop: `3px solid ${color}`, borderRadius: 10, textAlign: "center" }}>
      <div style={{ fontSize: 11, color: "var(--text-secondary)", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 800, color, marginTop: 4 }}>{value}</div>
    </div>
  );
}
