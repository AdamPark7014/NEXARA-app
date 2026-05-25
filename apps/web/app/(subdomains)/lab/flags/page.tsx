"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";

type Flag = {
  id: number;
  key: string;
  scope: string;
  description: string | null;
  enabled: boolean;
  metadata?: any;
};

export default function FeatureFlagsPage() {
  const { user } = useUser();
  const [flags, setFlags] = useState<Flag[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ key: "", scope: "", description: "", enabled: false });
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user?.token) return;
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl("lab/flags"), { headers: { Authorization: `Bearer ${user.token}` } });
      if (res.ok) setFlags(await res.json());
    } finally {
      setLoading(false);
    }
  }, [user?.token]);

  useEffect(() => { refresh(); }, [refresh]);

  const toggle = async (key: string, enabled: boolean) => {
    if (!user?.token) return;
    setFlags((prev) => prev.map((f) => (f.key === key ? { ...f, enabled } : f)));
    const res = await fetch(buildApiUrl(`lab/flags/${encodeURIComponent(key)}`), {
      method: "PATCH",
      headers: { Authorization: `Bearer ${user.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) {
      setMsg(`Error: ${await res.text()}`);
      refresh();
    }
  };

  const createFlag = async () => {
    if (!form.key || !form.scope) {
      setMsg("Key y scope son obligatorios");
      return;
    }
    const res = await fetch(buildApiUrl("lab/flags"), {
      method: "POST",
      headers: { Authorization: `Bearer ${user?.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setShowForm(false);
      setForm({ key: "", scope: "", description: "", enabled: false });
      setMsg("✅ Flag creado");
      refresh();
    } else {
      setMsg(`Error: ${await res.text()}`);
    }
  };

  const remove = async (key: string) => {
    if (!confirm(`¿Eliminar flag "${key}"?`)) return;
    await fetch(buildApiUrl(`lab/flags/${encodeURIComponent(key)}`), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${user?.token}` },
    });
    refresh();
  };

  const byScope = flags.reduce<Record<string, Flag[]>>((acc, f) => {
    if (!acc[f.scope]) acc[f.scope] = [];
    acc[f.scope].push(f);
    return acc;
  }, {});

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>🚩 Feature flags</h1>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>Persistidos en base de datos · {flags.length} flag(s)</p>
        </div>
        <button type="button" onClick={() => setShowForm(!showForm)} style={{ padding: "8px 16px", background: "#8b5cf6", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>
          {showForm ? "✕ Cancelar" : "➕ Nuevo flag"}
        </button>
      </div>

      {msg && <div style={{ marginTop: 12, padding: 10, background: msg.startsWith("✅") ? "#dcfce7" : "#fee2e2", color: msg.startsWith("✅") ? "#166534" : "#7f1d1d", borderRadius: 8 }}>{msg}</div>}

      {showForm && (
        <div style={{ marginTop: 12, padding: 16, background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
            <input placeholder="key (ej. lab.something.feature)" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} style={inputStyle} />
            <input placeholder="scope (ej. lab)" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} style={inputStyle} />
          </div>
          <input placeholder="Descripción" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ ...inputStyle, marginTop: 8 }} />
          <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 12 }}>
            <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> Activado por defecto
          </label>
          <button type="button" onClick={createFlag} style={{ marginTop: 12, padding: "10px 18px", background: "#8b5cf6", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>
            Crear flag
          </button>
        </div>
      )}

      {loading ? <p>Cargando…</p> : Object.entries(byScope).map(([scope, items]) => (
        <div key={scope} style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 8, fontSize: 14, color: "#8b5cf6", textTransform: "uppercase" }}>{scope}</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {items.map((f) => (
              <div key={f.key} style={{ padding: 12, background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 10, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ fontFamily: "monospace", fontSize: 13 }}>{f.key}</strong>
                  {f.description && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{f.description}</div>}
                </div>
                <button type="button" onClick={() => remove(f.key)} style={{ background: "transparent", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 14 }}>🗑️</button>
                <button
                  type="button"
                  onClick={() => toggle(f.key, !f.enabled)}
                  style={{
                    width: 52, height: 28, borderRadius: 999,
                    background: f.enabled ? "#8b5cf6" : "#cbd5e1",
                    border: "none", position: "relative", cursor: "pointer", transition: "background 0.2s",
                  }}
                >
                  <span style={{ display: "block", width: 22, height: 22, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: f.enabled ? 27 : 3, transition: "left 0.2s" }} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const inputStyle: React.CSSProperties = { display: "block", width: "100%", padding: 8, borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)" };
