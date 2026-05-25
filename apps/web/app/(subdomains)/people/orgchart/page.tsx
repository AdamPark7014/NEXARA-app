"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";

type Member = {
  id: number;
  nombre: string;
  cargo?: string;
  email?: string;
  isSuperAdmin?: boolean;
  isAdmin?: boolean;
  isOperationalDirector?: boolean;
  isCommercialDirector?: boolean;
  isFinanceDirector?: boolean;
  rolesPlatform?: Array<{ name: string }>;
};

const TIERS: Array<{ label: string; color: string; match: (m: Member) => boolean }> = [
  { label: "👑 Dirección General / CEO", color: "#7c3aed", match: (m) => Boolean(m.isSuperAdmin) },
  { label: "🎯 Dirección Operativa", color: "#0891b2", match: (m) => Boolean(m.isOperationalDirector) },
  { label: "💼 Dirección Comercial", color: "#dc2626", match: (m) => Boolean(m.isCommercialDirector) },
  { label: "💰 Dirección Administrativa & Finanzas", color: "#16a34a", match: (m) => Boolean(m.isFinanceDirector) },
  { label: "🧰 Gerentes / Coordinadores", color: "#f59e0b", match: (m) => Boolean(m.isAdmin) && !m.isSuperAdmin && !m.isOperationalDirector && !m.isCommercialDirector && !m.isFinanceDirector },
  { label: "👤 Colaboradores", color: "#6b7280", match: (m) => !m.isAdmin && !m.isSuperAdmin && !m.isOperationalDirector && !m.isCommercialDirector && !m.isFinanceDirector },
];

export default function OrgchartPage() {
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

  return (
    <div style={{ padding: 24, maxWidth: 1300, margin: "0 auto" }}>
      <h1 style={{ margin: 0 }}>🗂️ Organigrama corporativo</h1>
      <p style={{ color: "var(--text-secondary)", margin: 0 }}>Estructura jerárquica por nivel de autoridad.</p>

      {loading ? <p>Cargando…</p> : (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 16 }}>
          {TIERS.map((tier) => {
            const tierMembers = members.filter(tier.match);
            if (tierMembers.length === 0) return null;
            return (
              <div key={tier.label}>
                <div style={{ fontSize: 13, fontWeight: 700, color: tier.color, marginBottom: 8, paddingLeft: 6, borderLeft: `4px solid ${tier.color}` }}>
                  {tier.label} ({tierMembers.length})
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
                  {tierMembers.map((m) => (
                    <div key={m.id} style={{ padding: 10, background: "var(--bg-primary)", border: `1px solid ${tier.color}33`, borderTop: `3px solid ${tier.color}`, borderRadius: 8 }}>
                      <strong style={{ fontSize: 13 }}>{m.nombre}</strong>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{m.cargo || m.rolesPlatform?.[0]?.name || "—"}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
