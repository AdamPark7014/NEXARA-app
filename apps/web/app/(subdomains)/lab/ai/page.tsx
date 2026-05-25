"use client";

import { useState } from "react";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";

const TEMPLATES = [
  { name: "Cotización en frío", prompt: "Eres un agente de ventas de Nexara. Escribe un mensaje de prospección frío para un retailer mediano interesado en CCTV con IA." },
  { name: "Email seguimiento", prompt: "Escribe un email amable de seguimiento a un cliente que pidió cotización hace 5 días y no ha respondido." },
  { name: "Resumen ticket", prompt: "Resume el siguiente ticket técnico de servicio en 3 bullets para mi supervisor: \"...\"" },
  { name: "SOW Proyecto", prompt: "Genera un SOW de 1 página para un proyecto de instalación de 24 cámaras Hikvision con switch PoE y monitoreo central." },
];

export default function AiSandboxPage() {
  const { user } = useUser();
  const [prompt, setPrompt] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [model, setModel] = useState("claude-3-5-sonnet-20241022");
  const [output, setOutput] = useState("");
  const [meta, setMeta] = useState<{ provider?: string; elapsedMs?: number; isMock?: boolean } | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    if (!prompt.trim() || !user?.token) return;
    setRunning(true);
    setOutput("");
    setMeta(null);
    try {
      const res = await fetch(buildApiUrl("lab/ai"), {
        method: "POST",
        headers: { Authorization: `Bearer ${user.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt, systemPrompt: systemPrompt || undefined }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setOutput(data.output || "(sin respuesta)");
      setMeta({ provider: data.provider, elapsedMs: data.elapsedMs, isMock: data.isMock });
    } catch (err) {
      setOutput("❌ Error: " + (err as Error).message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ margin: 0 }}>🤖 AI Sandbox</h1>
      <p style={{ color: "var(--text-secondary)", margin: 0 }}>
        Conectado al endpoint <code>POST /lab/ai</code>. Necesitas activar el flag <code>lab.ai.live</code> y configurar la API key correspondiente en el .env del backend.
      </p>

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        {TEMPLATES.map((t) => (
          <button key={t.name} type="button" onClick={() => setPrompt(t.prompt)} style={{ padding: "6px 12px", background: "#fce7f3", color: "#831843", border: "none", borderRadius: 999, fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
            {t.name}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>Modelo:</label>
        <select value={model} onChange={(e) => setModel(e.target.value)} style={{ padding: 8, borderRadius: 6, border: "1px solid var(--border)" }}>
          <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
          <option value="claude-3-opus-20240229">Claude 3 Opus</option>
          <option value="claude-3-haiku-20240307">Claude 3 Haiku</option>
          <option value="gpt-4o">GPT-4o</option>
          <option value="gpt-4o-mini">GPT-4o Mini</option>
          <option value="gpt-4-turbo">GPT-4 Turbo</option>
        </select>
      </div>

      <textarea
        placeholder="System prompt (opcional)…"
        value={systemPrompt}
        onChange={(e) => setSystemPrompt(e.target.value)}
        style={{ width: "100%", marginTop: 8, padding: 10, borderRadius: 8, border: "1px solid var(--border)", fontSize: 12, minHeight: 60, fontFamily: "monospace" }}
      />
      <textarea
        placeholder="Prompt del usuario…"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        style={{ width: "100%", marginTop: 8, padding: 12, borderRadius: 8, border: "1px solid var(--border)", fontSize: 13, minHeight: 160 }}
      />

      <button type="button" onClick={run} disabled={!prompt.trim() || running} style={{ marginTop: 12, padding: "10px 18px", background: "#ec4899", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: running ? "wait" : prompt.trim() ? "pointer" : "not-allowed" }}>
        {running ? "Pensando…" : "▶ Ejecutar"}
      </button>

      {output && (
        <>
          {meta && (
            <div style={{ marginTop: 16, fontSize: 12, color: "var(--text-secondary)", display: "flex", gap: 8 }}>
              <span>📦 {meta.provider}</span>
              <span>⏱️ {meta.elapsedMs}ms</span>
              {meta.isMock && <span style={{ color: "#dc2626" }}>⚠️ MOCK (revisa el flag y env keys)</span>}
            </div>
          )}
          <pre style={{ marginTop: 8, padding: 14, background: "#0f172a", color: "#fbcfe8", borderRadius: 8, fontSize: 12, whiteSpace: "pre-wrap" }}>
            {output}
          </pre>
        </>
      )}
    </div>
  );
}
