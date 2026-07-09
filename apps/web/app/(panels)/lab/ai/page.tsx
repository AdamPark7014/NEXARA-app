"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import { Tag } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { getLabSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";

interface AiResult {
  output: string;
  model: string;
  provider: string;
  elapsedMs: number;
  isMock?: boolean;
}

interface FeatureFlag {
  key: string;
  enabled: boolean;
  description?: string | null;
}

interface Run {
  id: number;
  model: string;
  prompt: string;
  systemPrompt?: string;
  result: AiResult;
  ts: Date;
}

const MODELS = [
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", provider: "Anthropic", note: "Equilibrio inteligencia / velocidad" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", provider: "Anthropic", note: "Más rápido, menor costo" },
  { id: "gpt-4o-mini", label: "GPT-4o mini", provider: "OpenAI", note: "Alternativa económica" },
  { id: "gpt-4o", label: "GPT-4o", provider: "OpenAI", note: "Máxima capacidad OpenAI" },
];

const EXAMPLES = [
  {
    label: "Extraer cotización de email",
    icon: "📧",
    system: "Eres un asistente que extrae información estructurada de correos de clientes NEXARA. Responde solo con JSON.",
    prompt: `Extrae los campos relevantes de este correo:\n\n"Buenas tardes, les escribo para solicitar cotización de 8 cámaras tipo domo con visión nocturna para nuestras instalaciones en Puebla, más la instalación y garantía de 1 año. Somos Constructora Reyes, RFC CRE123456789. Contáctanos con Jorge Reyes al 222-555-0100."`,
  },
  {
    label: "Categorizar ticket de soporte",
    icon: "🎫",
    system: "Categoriza tickets de soporte de NEXARA. Responde con JSON: {categoria, prioridad, resumen}. Categorías: CCTV, REDES, COMPUTO, MANTENIMIENTO, FACTURACION, OTRO.",
    prompt: `Ticket: "La cámara del acceso principal del almacén dejó de grabar desde ayer por la noche. Ya reiniciamos el NVR pero sigue sin imagen. Necesitamos solución urgente porque hay auditoría mañana."`,
  },
  {
    label: "Resumen ejecutivo de proyecto",
    icon: "📊",
    system: "Genera resúmenes ejecutivos concisos para el CEO de NEXARA. Máximo 3 párrafos, lenguaje profesional en español.",
    prompt: `Proyecto: Instalación CCTV Soriana Querétaro\nEstado: 75% completado\nPresupuesto: $320,000 MXN\nGastado: $198,000 MXN\nActividades pendientes: Configuración DVR zona 3, cableado piso 2, entrega de hojas de servicio\nFecha entrega: 15 julio 2026\nIncidentes: 1 cámara dañada en tránsito (reposición en camino)\n\nGenera el resumen ejecutivo.`,
  },
  {
    label: "Redactar comunicado interno",
    icon: "📢",
    system: "Redactas comunicados internos para NEXARA, empresa de tecnología en seguridad y redes con 45 empleados en México.",
    prompt: `Redacta un comunicado para informar que a partir del 1 de julio 2026, todos los ingenieros de campo deberán registrar sus actividades en la app móvil antes de salir del sitio del cliente. Incluye el porqué (trazabilidad y facturación) y los pasos a seguir.`,
  },
];

async function apiFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> ?? {}),
    },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return res.json();
}

const inp: React.CSSProperties = {
  width: "100%", padding: "10px 12px", border: "1px solid var(--border)",
  borderRadius: 8, background: "var(--surface)", color: "var(--foreground)",
  fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", outline: "none",
  resize: "vertical",
};

export default function AiSandboxPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getLabSectionConfig(user, "ai"), [user]);
  const token = user?.token ?? "";

  const [model, setModel] = useState(MODELS[0].id);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [prompt, setPrompt] = useState("");
  const [showSystem, setShowSystem] = useState(false);
  const [loading, setLoading] = useState(false);
  const [queryErr, setQueryErr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [flagsLoading, setFlagsLoading] = useState(true);
  const runIdRef = useRef(0);
  const outputRef = useRef<HTMLDivElement>(null);

  const loadFlags = useCallback(async () => {
    if (!token) return;
    setFlagsLoading(true);
    try {
      const data = await apiFetch("lab/flags?scope=lab", token);
      setFlags(Array.isArray(data) ? data : []);
    } catch { /* non-blocking */ } finally {
      setFlagsLoading(false);
    }
  }, [token]);

  useEffect(() => { void loadFlags(); }, [loadFlags]);

  const liveFlag = flags.find((f) => f.key === "lab.ai.live");
  const isLive = liveFlag?.enabled === true;

  const submit = async () => {
    if (!prompt.trim() || !token) return;
    setLoading(true);
    setError(null);
    try {
      const result: AiResult = await apiFetch("lab/ai", token, {
        method: "POST",
        body: JSON.stringify({ model, prompt: prompt.trim(), systemPrompt: systemPrompt.trim() || undefined }),
      });
      const run: Run = {
        id: ++runIdRef.current, model, prompt: prompt.trim(),
        systemPrompt: systemPrompt.trim() || undefined, result, ts: new Date(),
      };
      setRuns((prev) => [run, ...prev]);
      setTimeout(() => outputRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al invocar el modelo");
    } finally {
      setLoading(false);
    }
  };

  const loadExample = (ex: typeof EXAMPLES[0]) => {
    setSystemPrompt(ex.system);
    setPrompt(ex.prompt);
    setShowSystem(true);
  };

  const toggleFlag = async (key: string, enabled: boolean) => {
    if (!token) return;
    try {
      await apiFetch(`lab/flags/${key}`, token, { method: "PATCH", body: JSON.stringify({ enabled }) });
      setFlags((prev) => prev.map((f) => f.key === key ? { ...f, enabled } : f));
    } catch (e) {
      setQueryErr(e instanceof Error ? e.message : "Error al consultar IA");
    }
  };

  const totalRuns = runs.length;
  const avgMs = totalRuns > 0 ? Math.round(runs.reduce((s, r) => s + r.result.elapsedMs, 0) / totalRuns) : 0;
  const mockRuns = runs.filter((r) => r.result.isMock).length;

  return (
    <>
      <PageHeader
        eyebrow="LAB · AI Sandbox"
        title={cfg.title}
        subtitle={cfg.subtitle}
        variant="hero"
        meta={
          <>
            <Tag variant={isLive ? "positive" : "warning"} dot>
              {flagsLoading ? "Verificando…" : isLive ? "Live · Llamadas reales" : "Mock · Sin clave API"}
            </Tag>
            <Tag variant="accent">{MODELS.find((m) => m.id === model)?.provider ?? "Anthropic"}</Tag>
          </>
        }
        actions={
          <Button variant="ghost" iconLeft="🔄" onClick={() => void loadFlags()} disabled={flagsLoading}>
            Sync flags
          </Button>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        <KpiCard label="Ejecuciones" value={totalRuns} icon="💬" />
        <KpiCard label="Latencia promedio" value={totalRuns > 0 ? `${avgMs} ms` : "—"} icon="⚡" variant={avgMs > 2000 ? "warning" : avgMs > 0 ? "positive" : "default"} />
        <KpiCard label="Live vs Mock" value={totalRuns > 0 ? `${totalRuns - mockRuns}/${totalRuns}` : "—"} variant={mockRuns === 0 && totalRuns > 0 ? "positive" : "warning"} icon={isLive ? "🟢" : "🎭"} hint={isLive ? "Modo live activo" : "Activa lab.ai.live"} />
        <KpiCard label="Modelos distintos" value={new Set(runs.map((r) => r.model)).size} icon="🧠" hint="Modelos usados esta sesión" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16, alignItems: "start" }}>

        {/* ── Panel principal ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Selector de modelo */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-tertiary)", marginBottom: 10 }}>
              Modelo
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 8 }}>
              {MODELS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setModel(m.id)}
                  style={{
                    padding: "10px 12px", borderRadius: 10, textAlign: "left", cursor: "pointer",
                    fontFamily: "inherit",
                    border: `2px solid ${model === m.id ? "var(--primary)" : "var(--border)"}`,
                    background: model === m.id ? "color-mix(in srgb, var(--primary) 8%, transparent)" : "var(--surface-2)",
                    transition: "all 150ms ease",
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: model === m.id ? "var(--primary)" : "var(--text-primary)" }}>
                    {m.label}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginTop: 2 }}>
                    {m.provider} · {m.note}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* System prompt (colapsable) */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
            <button
              onClick={() => setShowSystem((v) => !v)}
              style={{
                display: "flex", alignItems: "center", gap: 8, background: "none", border: "none",
                cursor: "pointer", fontFamily: "inherit", color: "var(--text-primary)", padding: 0, width: "100%",
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-tertiary)" }}>
                System prompt
              </span>
              <span style={{ fontSize: 11, color: "var(--text-tertiary)", marginLeft: "auto" }}>
                {showSystem ? "▲ ocultar" : "▼ mostrar"}
              </span>
              {systemPrompt && <Tag variant="accent">activo</Tag>}
            </button>
            {showSystem && (
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Instrucciones del sistema para el modelo (opcional)…"
                rows={4}
                style={{ ...inp, marginTop: 10 }}
              />
            )}
          </div>

          {/* Prompt */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-tertiary)", marginBottom: 10 }}>
              Prompt de usuario
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Escribe tu prompt aquí o elige un ejemplo en el panel lateral…"
              rows={8}
              style={inp}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void submit(); }
              }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
              <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                {prompt.length} chars · ⌘Enter para ejecutar
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <Button
                  variant="ghost"
                  onClick={() => { setPrompt(""); setSystemPrompt(""); }}
                  disabled={loading || (!prompt && !systemPrompt)}
                >
                  Limpiar
                </Button>
                <Button
                  variant="primary"
                  iconLeft="▶"
                  onClick={() => void submit()}
                  disabled={loading || !prompt.trim()}
                >
                  {loading ? "Ejecutando…" : "Ejecutar"}
                </Button>
              </div>
            </div>
          </div>

          {error && (
            <div style={{
              padding: "12px 16px",
              background: "var(--state-danger-bg)",
              border: "1px solid var(--state-danger-border)",
              borderRadius: 10,
              color: "var(--state-danger-text)",
              fontSize: 13,
            }}>
              ⚠️ {error}
            </div>
          )}

          {/* Historial de respuestas */}
          <div ref={outputRef}>
            {runs.map((run) => (
              <div
                key={run.id}
                style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 18, marginBottom: 14 }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                  <Tag variant={run.result.isMock ? "warning" : "positive"} dot>
                    {run.result.isMock ? "Mock" : "Live"}
                  </Tag>
                  <Tag variant="neutral">{run.result.model}</Tag>
                  <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{run.result.elapsedMs} ms</span>
                  <span style={{ fontSize: 11, color: "var(--text-tertiary)", marginLeft: "auto" }}>
                    {run.ts.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                </div>

                <details style={{ marginBottom: 12 }}>
                  <summary style={{ fontSize: 11.5, color: "var(--text-tertiary)", cursor: "pointer", userSelect: "none" }}>
                    Prompt enviado ({run.prompt.length} chars)
                  </summary>
                  {run.systemPrompt && (
                    <pre style={{ fontSize: 11.5, margin: "8px 0 4px", padding: "8px 10px", background: "var(--surface-2)", borderRadius: 8, whiteSpace: "pre-wrap", wordBreak: "break-word", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                      <strong>System:</strong> {run.systemPrompt}
                    </pre>
                  )}
                  <pre style={{ fontSize: 11.5, margin: "4px 0 0", padding: "8px 10px", background: "var(--surface-2)", borderRadius: 8, whiteSpace: "pre-wrap", wordBreak: "break-word", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    {run.prompt}
                  </pre>
                </details>

                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-tertiary)", marginBottom: 8 }}>
                  Respuesta
                </div>
                <pre style={{ margin: 0, padding: "12px 14px", background: "var(--surface-2)", borderRadius: 10, fontSize: 13, lineHeight: 1.65, whiteSpace: "pre-wrap", wordBreak: "break-word", color: "var(--text-primary)", fontFamily: "inherit" }}>
                  {run.result.output}
                </pre>
              </div>
            ))}
          </div>

          {runs.length === 0 && !loading && (
            <EmptyState
              icon="🤖"
              title="Sin ejecuciones aún"
              description="Escribe un prompt o usa uno de los ejemplos del panel lateral y pulsa Ejecutar."
            />
          )}
        </div>

        {/* ── Panel lateral ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Ejemplos */}
          <Section eyebrow="Casos NEXARA" title="Ejemplos" subtitle="Clic para cargar en el editor">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.label}
                  onClick={() => loadExample(ex)}
                  style={{
                    padding: "11px 13px", borderRadius: 10, textAlign: "left", cursor: "pointer",
                    fontFamily: "inherit", border: "1px solid var(--border)", background: "var(--surface)",
                    display: "flex", alignItems: "center", gap: 10, transition: "border-color 150ms ease",
                  }}
                >
                  <span style={{ fontSize: 18 }}>{ex.icon}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", flex: 1 }}>{ex.label}</span>
                  <span style={{ color: "var(--text-tertiary)", fontSize: 14 }}>→</span>
                </button>
              ))}
            </div>
          </Section>

          {/* Feature flags */}
          <Section eyebrow="Configuración" title="Feature flags" subtitle="Activa o desactiva capacidades del Lab">
            {flagsLoading ? (
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", padding: "8px 0" }}>Cargando flags…</div>
            ) : flags.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", padding: "8px 0" }}>
                Sin flags en scope lab.*
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {flags.map((f) => (
                  <div
                    key={f.key}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                      background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-primary)", fontFamily: "monospace", wordBreak: "break-all" }}>
                        {f.key}
                      </div>
                      {f.description && (
                        <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>{f.description}</div>
                      )}
                    </div>
                    <button
                      onClick={() => void toggleFlag(f.key, !f.enabled)}
                      title={f.enabled ? "Desactivar" : "Activar"}
                      style={{
                        width: 36, height: 20, borderRadius: 999, border: "none", cursor: "pointer",
                        background: f.enabled ? "var(--primary)" : "var(--border)",
                        position: "relative", flexShrink: 0, transition: "background 200ms ease",
                      }}
                    >
                      <span style={{
                        position: "absolute", top: 2,
                        left: f.enabled ? 18 : 2,
                        width: 16, height: 16, borderRadius: "50%",
                        background: "#fff", transition: "left 200ms ease",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                      }} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {!isLive && !flagsLoading && (
              <div style={{ marginTop: 12, padding: "10px 12px", background: "var(--state-warning-bg)", border: "1px solid var(--state-warning-border)", borderRadius: 10, fontSize: 11.5, color: "var(--state-warning-text)", lineHeight: 1.5 }}>
                Activa <code style={{ fontWeight: 700 }}>lab.ai.live</code> y configura <code>ANTHROPIC_API_KEY</code> o <code>OPENAI_API_KEY</code> en el .env del API para llamadas reales.
              </div>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}
