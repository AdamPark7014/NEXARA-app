"use client";

import { useState } from "react";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";

const PRESETS = [
  { method: "GET", path: "users" },
  { method: "GET", path: "noc/summary" },
  { method: "GET", path: "executive/c-level" },
  { method: "GET", path: "sla/stats?from=2026-05-01T00:00:00&to=2026-05-31T23:59:59" },
  { method: "GET", path: "calendar?from=2026-05-01&to=2026-05-31" },
  { method: "GET", path: "activities" },
  { method: "GET", path: "company/profile" },
];

export default function ApiPlaygroundPage() {
  const { user } = useUser();
  const [method, setMethod] = useState("GET");
  const [path, setPath] = useState("noc/summary");
  const [body, setBody] = useState("");
  const [response, setResponse] = useState<string>("");
  const [status, setStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (!user?.token) return;
    setLoading(true);
    setResponse("");
    setStatus(null);
    try {
      const opts: RequestInit = {
        method,
        headers: { Authorization: `Bearer ${user.token}`, "Content-Type": "application/json" },
      };
      if (method !== "GET" && body.trim()) opts.body = body;
      const t0 = performance.now();
      const res = await fetch(buildApiUrl(path), opts);
      const ms = (performance.now() - t0).toFixed(0);
      setStatus(res.status);
      const text = await res.text();
      try {
        setResponse(JSON.stringify(JSON.parse(text), null, 2) + `\n\n// ${ms}ms`);
      } catch {
        setResponse(text + `\n\n// ${ms}ms`);
      }
    } catch (err) {
      setResponse(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ margin: 0 }}>🧪 API Playground</h1>
      <p style={{ color: "var(--text-secondary)", margin: 0 }}>Ejecuta requests autenticados con tu sesión actual.</p>

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        {PRESETS.map((p) => (
          <button key={p.path} type="button" onClick={() => { setMethod(p.method); setPath(p.path); }} style={{ padding: "6px 10px", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 999, fontSize: 11, cursor: "pointer" }}>
            {p.method} /{p.path.split("?")[0]}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <select value={method} onChange={(e) => setMethod(e.target.value)} style={{ padding: 10, borderRadius: 8, border: "1px solid var(--border)" }}>
          {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => <option key={m}>{m}</option>)}
        </select>
        <span style={{ alignSelf: "center", fontFamily: "monospace", color: "var(--text-secondary)" }}>/api/</span>
        <input value={path} onChange={(e) => setPath(e.target.value)} style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid var(--border)", fontFamily: "monospace" }} />
        <button type="button" onClick={run} disabled={loading} style={{ padding: "10px 18px", background: "#8b5cf6", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: loading ? "wait" : "pointer" }}>
          {loading ? "…" : "▶ Run"}
        </button>
      </div>

      {method !== "GET" && (
        <textarea
          placeholder='Body JSON, e.g. {"foo":"bar"}'
          value={body}
          onChange={(e) => setBody(e.target.value)}
          style={{ width: "100%", marginTop: 8, padding: 10, borderRadius: 8, border: "1px solid var(--border)", fontFamily: "monospace", fontSize: 12, minHeight: 80 }}
        />
      )}

      <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
        {status != null && (
          <div style={{ fontSize: 12, marginBottom: 8 }}>
            Status:{" "}
            <strong style={{ color: status >= 200 && status < 300 ? "#16a34a" : status >= 400 ? "#dc2626" : "#f59e0b" }}>
              {status}
            </strong>
          </div>
        )}
        <pre style={{ background: "#0f172a", color: "#86efac", padding: 14, borderRadius: 8, overflow: "auto", fontSize: 12, maxHeight: 480 }}>
          {response || "// Resultado aparecerá aquí…"}
        </pre>
      </div>
    </div>
  );
}
