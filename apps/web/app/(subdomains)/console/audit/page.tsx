"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";

type AuditLog = {
  id: number;
  entityType: string;
  entityId: number;
  action: string;
  changes?: any;
  previousData?: any;
  user?: { id: number; nombre: string; email: string } | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
};

const ACTION_COLOR: Record<string, string> = {
  CREATE: "#16a34a",
  UPDATE: "#0ea5e9",
  DELETE: "#dc2626",
  LOGIN: "#8b5cf6",
  STATUS_CHANGE: "#f59e0b",
};

export default function AuditPage() {
  const { user } = useUser();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ entityType: "", action: "", userId: "", from: "", to: "" });
  const [selected, setSelected] = useState<AuditLog | null>(null);

  const refresh = useCallback(async () => {
    if (!user?.token) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), limit: "50" });
      if (filters.entityType) qs.set("entityType", filters.entityType);
      if (filters.action) qs.set("action", filters.action);
      if (filters.userId) qs.set("userId", filters.userId);
      if (filters.from) qs.set("from", filters.from);
      if (filters.to) qs.set("to", filters.to);
      const res = await fetch(buildApiUrl(`audit?${qs.toString()}`), { headers: { Authorization: `Bearer ${user.token}` } });
      if (res.ok) {
        const payload = await res.json();
        setLogs(payload.data || []);
        setTotal(payload.total || 0);
      }
    } finally {
      setLoading(false);
    }
  }, [user?.token, page, filters]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div style={{ padding: 24, maxWidth: 1280, margin: "0 auto" }}>
      <h1 style={{ margin: 0 }}>🛡️ Audit log</h1>
      <p style={{ color: "var(--text-secondary)", margin: 0 }}>
        Registro completo de cambios en el sistema. {total} eventos.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8, marginTop: 16, padding: 12, background: "var(--bg-secondary)", borderRadius: 10 }}>
        <Field label="Entidad"><input style={inputStyle} placeholder="Activity, Invoice…" value={filters.entityType} onChange={(e) => { setFilters({ ...filters, entityType: e.target.value }); setPage(1); }} /></Field>
        <Field label="Acción"><input style={inputStyle} placeholder="CREATE, UPDATE, DELETE" value={filters.action} onChange={(e) => { setFilters({ ...filters, action: e.target.value }); setPage(1); }} /></Field>
        <Field label="User ID"><input style={inputStyle} value={filters.userId} onChange={(e) => { setFilters({ ...filters, userId: e.target.value }); setPage(1); }} /></Field>
        <Field label="Desde"><input type="date" style={inputStyle} value={filters.from} onChange={(e) => { setFilters({ ...filters, from: e.target.value }); setPage(1); }} /></Field>
        <Field label="Hasta"><input type="date" style={inputStyle} value={filters.to} onChange={(e) => { setFilters({ ...filters, to: e.target.value }); setPage(1); }} /></Field>
      </div>

      {loading ? <p>Cargando…</p> : (
        <>
          <div style={{ marginTop: 16, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
              <thead>
                <tr><Th>Fecha</Th><Th>Usuario</Th><Th>Acción</Th><Th>Entidad</Th><Th>ID</Th><Th>IP</Th><Th>Ver</Th></tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <Td>{new Date(l.createdAt).toLocaleString("es-MX")}</Td>
                    <Td>{l.user?.nombre || "(sistema)"}</Td>
                    <Td><Badge color={ACTION_COLOR[l.action] || "#6b7280"}>{l.action}</Badge></Td>
                    <Td>{l.entityType}</Td>
                    <Td>#{l.entityId}</Td>
                    <Td style={{ fontFamily: "monospace", fontSize: 11 }}>{l.ipAddress || "—"}</Td>
                    <Td><button type="button" onClick={() => setSelected(l)} style={btnSmall}>🔍</button></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Página {page} · {logs.length} de {total}</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} style={navBtnStyle}>◀ Anterior</button>
              <button type="button" disabled={logs.length < 50} onClick={() => setPage(page + 1)} style={navBtnStyle}>Siguiente ▶</button>
            </div>
          </div>
        </>
      )}

      {selected && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setSelected(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--bg-primary)", padding: 20, borderRadius: 12, maxWidth: 700, width: "92%", maxHeight: "85vh", overflow: "auto" }}>
            <h3 style={{ marginTop: 0 }}>Audit log #{selected.id}</h3>
            <div style={{ fontSize: 13, marginBottom: 12 }}>
              <p><strong>Fecha:</strong> {new Date(selected.createdAt).toLocaleString("es-MX")}</p>
              <p><strong>Usuario:</strong> {selected.user?.nombre || "—"} ({selected.user?.email || "sistema"})</p>
              <p><strong>Acción:</strong> {selected.action}</p>
              <p><strong>Entidad:</strong> {selected.entityType} #{selected.entityId}</p>
              {selected.ipAddress && <p><strong>IP:</strong> {selected.ipAddress}</p>}
              {selected.userAgent && <p style={{ fontSize: 11, color: "var(--text-secondary)" }}><strong>User-Agent:</strong> {selected.userAgent}</p>}
            </div>
            {selected.previousData && (
              <details open>
                <summary style={{ cursor: "pointer", fontWeight: 700 }}>Valores anteriores</summary>
                <pre style={preStyle}>{JSON.stringify(selected.previousData, null, 2)}</pre>
              </details>
            )}
            {selected.changes && (
              <details open>
                <summary style={{ cursor: "pointer", fontWeight: 700, marginTop: 12 }}>Cambios</summary>
                <pre style={preStyle}>{JSON.stringify(selected.changes, null, 2)}</pre>
              </details>
            )}
            <button type="button" onClick={() => setSelected(null)} style={{ marginTop: 12, padding: "8px 14px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", cursor: "pointer" }}>Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)" }}>{label}{children}</label>;
}
function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return <th style={{ textAlign: align || "left", padding: 8, background: "var(--bg-secondary)", fontSize: 12 }}>{children}</th>;
}
function Td({ children, align, style }: { children: React.ReactNode; align?: "right"; style?: React.CSSProperties }) {
  return <td style={{ padding: 8, textAlign: align || "left", fontSize: 12, ...style }}>{children}</td>;
}
function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return <span style={{ display: "inline-block", padding: "2px 8px", background: `${color}22`, color, borderRadius: 999, fontSize: 11, fontWeight: 700 }}>{children}</span>;
}
const inputStyle: React.CSSProperties = { display: "block", width: "100%", padding: 6, borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)", marginTop: 2 };
const btnSmall: React.CSSProperties = { padding: "2px 8px", borderRadius: 6, border: "none", background: "#3b82f6", color: "#fff", cursor: "pointer", fontSize: 11 };
const navBtnStyle: React.CSSProperties = { padding: "6px 12px", border: "1px solid var(--border)", background: "var(--bg-secondary)", cursor: "pointer", borderRadius: 6 };
const preStyle: React.CSSProperties = { background: "var(--bg-secondary)", padding: 10, borderRadius: 6, fontSize: 11, maxHeight: 240, overflow: "auto" };
