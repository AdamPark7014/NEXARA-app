"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";

type Member = {
  id: number;
  nombre: string;
  email?: string;
  cargo?: string;
  avatarUrl?: string;
  isSuperAdmin?: boolean;
  rolesCustom?: Array<{ name: string }>;
  rolesPlatform?: Array<{ name: string }>;
};

export default function TeamPage() {
  const { user } = useUser();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

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

  const filtered = members.filter((m) => {
    if (!q) return true;
    const txt = `${m.nombre} ${m.email} ${m.cargo || ""}`.toLowerCase();
    return txt.includes(q.toLowerCase());
  });

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ margin: 0 }}>👥 Directorio del equipo</h1>
      <p style={{ color: "var(--text-secondary)", margin: 0 }}>{members.length} colaborador(es)</p>

      <input
        type="text"
        placeholder="🔍 Buscar por nombre, email o cargo…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ width: "100%", marginTop: 12, padding: 10, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)" }}
      />

      {loading ? <p>Cargando…</p> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12, marginTop: 16 }}>
          {filtered.map((m) => {
            const roleLabel = m.isSuperAdmin
              ? "Super Admin"
              : m.rolesPlatform?.[0]?.name || m.rolesCustom?.[0]?.name || "—";
            return (
              <div key={m.id} style={{ padding: 14, background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 10, textAlign: "center" }}>
                {m.avatarUrl ? (
                  <img src={m.avatarUrl} alt="" style={{ width: 64, height: 64, borderRadius: "50%", margin: "0 auto", objectFit: "cover" }} />
                ) : (
                  <div style={{ width: 64, height: 64, borderRadius: "50%", margin: "0 auto", background: "#16a34a", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 700 }}>
                    {m.nombre.charAt(0).toUpperCase()}
                  </div>
                )}
                <strong style={{ display: "block", marginTop: 8, fontSize: 14 }}>{m.nombre}</strong>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{m.cargo || roleLabel}</div>
                {m.email && <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4, wordBreak: "break-all" }}>📧 {m.email}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
