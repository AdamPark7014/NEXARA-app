"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import Button from "@/components/ui/Button";
import { useUser } from "@/components/UserContext";
import { getErpGovernanceSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToCsv } from "@/lib/export-csv";
import { toast } from "@/components/Toast";

type Tab = "comunicados" | "newsletter";

interface Comunicado {
  id: number;
  titulo: string;
  cuerpo?: string;
  audiencia: string;
  prioridad: string;
  estado: string;
  lecturas: number;
  totalDestinatarios: number;
  scheduledAt?: string | null;
  sentAt?: string | null;
  createdAt: string;
  autor?: { id: number; nombre: string };
}

interface NewsletterSubscriber {
  id: number;
  email: string;
  name?: string | null;
  source?: string | null;
  subscribedAt: string;
}

const ESTADO_VARIANT: Record<string, "neutral" | "warning" | "positive"> = {
  Borrador: "neutral", Programado: "warning", Enviado: "positive",
};
const PRIORIDAD_VARIANT: Record<string, "neutral" | "warning" | "danger"> = {
  Normal: "neutral", Alta: "warning", Crítica: "danger",
};

async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const EMPTY_FORM = { titulo: "", cuerpo: "", audiencia: "Todo NEXARA", prioridad: "Normal", estado: "Borrador", scheduledAt: "" };

function TabButton({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: string; label: string; count: number }) {
  return (
    <button type="button" role="tab" aria-selected={active} onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 8,
      background: active ? "var(--surface)" : "transparent",
      border: active ? "1px solid var(--border)" : "1px solid transparent",
      color: active ? "var(--foreground)" : "var(--text-secondary)",
      fontWeight: 600, fontSize: 13, cursor: "pointer",
      boxShadow: active ? "0 1px 2px rgba(0,0,0,0.04)" : "none",
    }}>
      <span>{icon}</span><span>{label}</span>
      <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 999,
        background: active ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "var(--surface-2)",
        color: active ? "var(--primary)" : "var(--text-secondary)", fontWeight: 700 }}>
        {count}
      </span>
    </button>
  );
}

export default function ComunicacionesInternasPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getErpGovernanceSectionConfig(user, "news"), [user]);
  const token = user?.token ?? "";

  const [tab, setTab]         = useState<Tab>("comunicados");
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [items, setItems]     = useState<Comunicado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState<Comunicado | null>(null);
  const [form, setForm]         = useState({ ...EMPTY_FORM });
  const [saving, setSaving]     = useState(false);
  const [subs, setSubs]         = useState<NewsletterSubscriber[]>([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [subsErr, setSubsErr] = useState<string | null>(null);
  const [subSearch, setSubSearch]     = useState("");
  const [comSearch, setComSearch] = useState("");
  const [comEstado, setComEstado] = useState("");
  const [comPrioridad, setComPrioridad] = useState("");

  const loadSubs = useCallback(async (q?: string) => {
    if (!token) return;
    setSubsLoading(true);
    setSubsErr(null);
    try {
      const qs = q ? `?search=${encodeURIComponent(q)}` : "";
      const data = await apiFetch(`newsletter${qs}`, token);
      setSubs(Array.isArray(data) ? data : (data?.data ?? []));
    } catch (e) {
      setSubsErr(e instanceof Error ? e.message : "No se pudo cargar la lista");
    } finally { setSubsLoading(false); }
  }, [token]);

  useEffect(() => { if (tab === "newsletter") void loadSubs(); }, [tab, loadSubs]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch("internal-comunicados?limit=50", token);
      setItems(Array.isArray(data) ? data : (data.data ?? []));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setForm({ ...EMPTY_FORM }); setShowForm(true); };

  const openEdit = async (c: Comunicado) => {
    setEditing(c);
    setShowForm(true);
    setForm({
      titulo: c.titulo,
      cuerpo: "",
      audiencia: c.audiencia,
      prioridad: c.prioridad,
      estado: c.estado,
      scheduledAt: c.scheduledAt?.slice(0, 16) ?? "",
    });
    try {
      const full = await apiFetch(`internal-comunicados/${c.id}`, token) as Comunicado & { cuerpo?: string };
      setForm({
        titulo: full.titulo ?? c.titulo,
        cuerpo: full.cuerpo ?? "",
        audiencia: full.audiencia ?? c.audiencia,
        prioridad: full.prioridad ?? c.prioridad,
        estado: full.estado ?? c.estado,
        scheduledAt: full.scheduledAt?.slice(0, 16) ?? "",
      });
    } catch (e) {
      toast.error("No se pudo cargar el contenido: " + (e instanceof Error ? e.message : "error"));
    }
  };

  const save = async () => {
    if (!form.titulo || !form.audiencia) return toast.warning("Título y audiencia son requeridos.");
    setSaving(true);
    try {
      const body: Record<string, unknown> = { ...form };
      if (!body.scheduledAt) delete body.scheduledAt;
      else body.scheduledAt = new Date(form.scheduledAt).toISOString();
      if (editing) {
        const updated = await apiFetch(`internal-comunicados/${editing.id}`, token, { method: "PATCH", body: JSON.stringify(body) });
        setItems(prev => prev.map(c => c.id === editing.id ? { ...c, ...updated } : c));
      } else {
        const created = await apiFetch("internal-comunicados", token, { method: "POST", body: JSON.stringify(body) });
        setItems(prev => [created, ...prev]);
      }
      setShowForm(false);
    } catch (e: unknown) {
      toast.error("Error: " + (e instanceof Error ? e.message : "Error"));
    } finally {
      setSaving(false);
    }
  };

  const enviar = async (id: number) => {
    setConfirmState({ message: "¿Enviar este comunicado ahora?", confirmLabel: "Enviar", fn: async () => {
    try {
      const updated = await apiFetch(`internal-comunicados/${id}/enviar`, token, { method: "PATCH" });
      setItems(prev => prev.map(c => c.id === id ? { ...c, ...updated } : c));
    } catch (e: unknown) {
      toast.error("Error al enviar: " + (e instanceof Error ? e.message : "error"));
    }
  } });
  };

  const remove = async (id: number) => {
    setConfirmState({ message: "¿Eliminar este comunicado?", fn: async () => {
    try {
      await apiFetch(`internal-comunicados/${id}`, token, { method: "DELETE" });
      setItems(prev => prev.filter(c => c.id !== id));
    } catch (e: unknown) {
      toast.error("Error al eliminar: " + (e instanceof Error ? e.message : "error"));
    }
  } });
  };

  const field = (key: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }));

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 10px", fontSize: 13,
    border: "1px solid var(--border)", borderRadius: 8,
    background: "var(--surface)", color: "var(--foreground)", boxSizing: "border-box",
  };

  const visibleComunicados = useMemo(() => {
    let rows = items;
    if (comSearch.trim()) {
      const q = comSearch.toLowerCase();
      rows = rows.filter((c) => c.titulo.toLowerCase().includes(q) || (c.audiencia ?? "").toLowerCase().includes(q) || (c.autor?.nombre ?? "").toLowerCase().includes(q));
    }
    if (comEstado) rows = rows.filter((c) => c.estado === comEstado);
    if (comPrioridad) rows = rows.filter((c) => c.prioridad === comPrioridad);
    return rows;
  }, [items, comSearch, comEstado, comPrioridad]);

  const enviados  = items.filter(c => c.estado === "Enviado");
  const borradores= items.filter(c => c.estado === "Borrador");
  const progr     = items.filter(c => c.estado === "Programado");
  const totalLect = items.reduce((s, c) => s + c.lecturas, 0);

  const columns: Column<Comunicado>[] = [
    { key: "titulo", label: "Título", render: c => <strong style={{ fontSize: 13 }}>{c.titulo}</strong> },
    { key: "audiencia", label: "Audiencia", render: c => <Tag variant="neutral">{c.audiencia}</Tag>, width: 150 },
    { key: "autor", label: "Autor", accessor: c => c.autor?.nombre ?? "—", width: 130 },
    { key: "prioridad", label: "Prioridad", render: c => <Tag variant={PRIORIDAD_VARIANT[c.prioridad] ?? "neutral"}>{c.prioridad}</Tag>, width: 100 },
    { key: "estado", label: "Estado", render: c => <Tag variant={ESTADO_VARIANT[c.estado] ?? "neutral"}>{c.estado}</Tag>, width: 100 },
    {
      key: "lecturas", label: "Lecturas", width: 90, align: "right" as const,
      render: c => <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-secondary)" }}>
        {c.estado === "Enviado" ? `${c.lecturas}/${c.totalDestinatarios}` : "—"}
      </span>,
    },
    {
      key: "id", label: "", width: 120,
      render: c => (
        <div style={{ display: "flex", gap: 4 }}>
          {c.estado !== "Enviado" && cfg.canApprove && (
            <button onClick={() => enviar(c.id)} title="Enviar ahora" style={{
              fontSize: 11, padding: "3px 7px", borderRadius: 6, cursor: "pointer",
              background: "color-mix(in srgb, var(--primary) 12%, transparent)",
              color: "var(--primary)", border: "1px solid color-mix(in srgb, var(--primary) 30%, transparent)", fontWeight: 600,
            }}>Enviar</button>
          )}
          {cfg.canEdit && <button onClick={() => void openEdit(c)} title="Editar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--text-tertiary)", padding: "3px 6px" }}>✎</button>}
          {cfg.canDelete && <button onClick={() => remove(c.id)} title="Eliminar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--danger)", padding: "3px 6px" }}>✕</button>}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="ERP · Comunicación"
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={
          cfg.canCreate ? <Button variant="primary" iconLeft="📣" onClick={openNew}>Nuevo comunicado</Button> : undefined
        }
      />

      {error && (
        <div style={{ padding: 12, borderRadius: 10, background: "color-mix(in srgb, var(--danger) 10%, transparent)", color: "var(--danger)", marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 18 }}>
        <KpiCard label="Enviados" value={enviados.length} hint="Total histórico" variant="positive" icon="📤" />
        <KpiCard label="Programados" value={progr.length} hint="Pendientes de envío" variant="default" icon="📅" />
        <KpiCard label="Borradores" value={borradores.length} hint="En edición" variant="default" icon="📝" />
        <KpiCard label="Lecturas totales" value={totalLect} hint="Suma de todos los comunicados" variant="accent" icon="👁️" />
      </div>

      {items.length > 0 && (() => {
        const total = items.length;
        const statusRows = [
          { label: "Enviados", count: enviados.length, color: "var(--success)" },
          { label: "Programados", count: progr.length, color: "var(--primary)" },
          { label: "Borradores", count: borradores.length, color: "var(--warning)" },
        ].filter(r => r.count > 0);
        return (
          <div style={{ marginBottom: 16, padding: "12px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Distribución por estado</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {statusRows.map(r => (
                <div key={r.label} style={{ display: "grid", gridTemplateColumns: "100px 1fr 36px", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>{r.label}</span>
                  <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(r.count / total) * 100}%`, background: r.color, borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "right" }}>{r.count}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <div style={{ display: "flex", gap: 6, padding: "4px 4px", background: "var(--surface-2)", borderRadius: 10, alignSelf: "flex-start", marginBottom: 16, width: "fit-content" }}>
        <TabButton active={tab === "comunicados"} onClick={() => setTab("comunicados")} icon="📣" label="Comunicados" count={items.length} />
        <TabButton active={tab === "newsletter"} onClick={() => setTab("newsletter")} icon="📰" label="Newsletter" count={0} />
      </div>

      {showForm && tab === "comunicados" && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 20, marginBottom: 18 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>
            {editing ? "Editar comunicado" : "Nuevo comunicado"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>Título *</label>
              <input style={inputStyle} value={form.titulo} onChange={field("titulo")} placeholder="ej. Nueva política de viáticos" />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>Audiencia *</label>
              <select style={inputStyle} value={form.audiencia} onChange={field("audiencia")}>
                {["Todo NEXARA", "Comercial", "Operaciones", "Ingeniería", "NOC", "Administración", "Dirección"].map(a => <option key={a}>{a}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>Prioridad</label>
              <select style={inputStyle} value={form.prioridad} onChange={field("prioridad")}>
                {["Normal", "Alta", "Crítica"].map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>Programar envío (opcional)</label>
              <input type="datetime-local" style={inputStyle} value={form.scheduledAt} onChange={field("scheduledAt")} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>Cuerpo del mensaje</label>
              <textarea style={{ ...inputStyle, minHeight: 100, resize: "vertical" }} value={form.cuerpo} onChange={field("cuerpo")} placeholder="Escribe el comunicado…" />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <Button variant="primary" onClick={save}>{saving ? "Guardando…" : (editing ? "Guardar" : "Crear comunicado")}</Button>
            <Button variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      {tab === "comunicados" ? (
        <Section title={`Comunicados internos (${visibleComunicados.length})`} subtitle="Avisos puntuales al equipo. Haz clic en Enviar para despachar inmediatamente.">
          <FilterToolbar
            search={{ value: comSearch, onChange: setComSearch, placeholder: "Buscar por título, audiencia o autor…" }}
            selects={[
              {
                label: "Estado",
                value: comEstado,
                onChange: setComEstado,
                options: ["Borrador", "Programado", "Enviado"].map((v) => ({ value: v, label: v })),
                allowAll: true,
              },
              {
                label: "Prioridad",
                value: comPrioridad,
                onChange: setComPrioridad,
                options: ["Normal", "Alta", "Crítica"].map((v) => ({ value: v, label: v })),
                allowAll: true,
              },
            ]}
            onClear={() => { setComSearch(""); setComEstado(""); setComPrioridad(""); }}
            resultCount={loading ? null : visibleComunicados.length}
            rightActions={items.length > 0 ? (
              <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToCsv(visibleComunicados, [
                { key: "id", label: "ID" },
                { key: "titulo", label: "Título" },
                { key: "audiencia", label: "Audiencia" },
                { key: "prioridad", label: "Prioridad" },
                { key: "estado", label: "Estado" },
                { key: "lecturas", label: "Lecturas" },
                { key: "autor", label: "Autor", format: (v) => (v as Comunicado["autor"])?.nombre ?? "—" },
                { key: "sentAt", label: "Enviado", format: (v) => v ? String(v).slice(0, 10) : "—" },
              ], "comunicados-internos")}>CSV</Button>
            ) : undefined}
          />
          {loading ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
          ) : (
            <DataTable
              columns={columns}
              rows={visibleComunicados}
              rowKey={c => c.id}
              emptyTitle="Sin comunicados"
              emptyDescription="Crea el primero con el botón superior."
            />
          )}
        </Section>
      ) : (
        <Section title="Suscriptores del newsletter" subtitle="Captados desde el formulario público del sitio web — exporta la lista para tu siguiente envío.">
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
            <input
              value={subSearch}
              onChange={(e) => { setSubSearch(e.target.value); void loadSubs(e.target.value); }}
              placeholder="Buscar por email o nombre…"
              style={{ flex: 1, maxWidth: 320, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--foreground)", fontSize: 13 }}
            />
            <KpiCard label="Suscriptores" value={subs.length} />
          </div>
          {subsErr && <p role="alert" style={{ color: "var(--danger)", fontSize: 12, marginBottom: 8 }}>{subsErr}</p>}
          {subsLoading ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
          ) : (
            <DataTable
              columns={[
                { key: "email", label: "Email", width: 240 },
                { key: "name", label: "Nombre", accessor: (s: NewsletterSubscriber) => s.name ?? "—" },
                { key: "source", label: "Origen", render: (s: NewsletterSubscriber) => <Tag variant="neutral">{s.source ?? "web"}</Tag>, width: 120 },
                { key: "subscribedAt", label: "Suscrito", render: (s: NewsletterSubscriber) => <span style={{ fontSize: 12 }}>{new Date(s.subscribedAt).toLocaleDateString("es-MX")}</span>, width: 110 },
              ]}
              rows={subs}
              rowKey={(s: NewsletterSubscriber) => s.id}
              emptyTitle="Sin suscriptores"
              emptyDescription="Aún nadie se ha registrado desde el formulario público."
            />
          )}
        </Section>
      )}
      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}
