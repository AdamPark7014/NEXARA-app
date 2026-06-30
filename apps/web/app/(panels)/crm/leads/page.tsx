"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { filterRowsByScope, getCrmSalesSectionConfig } from "@/lib/section-views";
import { toast } from "@/components/Toast";
import {
  createSalesLead,
  createSalesOpportunity,
  formatLeadStatus,
  listSalesLeads,
  updateSalesLead,
  type SalesLead,
} from "@/lib/sales-api";

const STATUSES = ["NEW", "QUALIFIED", "NURTURING", "LOST", "CONVERTED"] as const;
const FUENTES = ["Web", "Referido", "LinkedIn", "Llamada", "Feria"];

const emptyForm = {
  name: "",
  company: "",
  email: "",
  phone: "",
  source: "Web",
  status: "NEW",
  score: 0,
  notes: "",
};

export default function LeadsPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getCrmSalesSectionConfig(user, "leads"), [user]);
  const token = user?.token ?? "";
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");

  const [items, setItems] = useState<SalesLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SalesLead | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [convertLead, setConvertLead] = useState<SalesLead | null>(null);
  const [convertValue, setConvertValue] = useState("50000");
  const [convertStage, setConvertStage] = useState("DISCOVERY");
  const [converting, setConverting] = useState(false);
  const [convertErr, setConvertErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setLoadError(null);
    try {
      setItems(await listSalesLeads(token));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "No se pudieron cargar los datos");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const visibleItems = useMemo(() => {
    let rows = filterRowsByScope(items, user, cfg.defaultScope);
    if (highlightId) {
      const id = Number(highlightId);
      if (!Number.isNaN(id)) {
        rows = [...rows].sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : 0));
      }
    }
    return rows;
  }, [items, user, cfg.defaultScope, highlightId]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setShowForm(true);
  };

  const openEdit = (l: SalesLead) => {
    setEditing(l);
    setForm({
      name: l.name ?? "",
      company: l.company ?? "",
      email: l.email ?? "",
      phone: l.phone ?? "",
      source: l.source ?? "Web",
      status: l.status ?? "NEW",
      score: Number(l.score ?? 0),
      notes: l.notes ?? "",
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!token) return;
    try {
      if (editing) {
        const updated = await updateSalesLead(token, editing.id, form);
        setItems((prev) => prev.map((l) => (l.id === editing.id ? { ...l, ...updated } : l)));
      } else {
        const created = await createSalesLead(token, form);
        setItems((prev) => [created, ...prev]);
      }
      setShowForm(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el lead");
    }
  };

  const openConvert = (l: SalesLead) => {
    if (l.status === "CONVERTED") return;
    setConvertLead(l);
    setConvertValue("50000");
    setConvertStage("DISCOVERY");
    setConvertErr(null);
  };

  const submitConvert = async () => {
    if (!token || !convertLead) return;
    const value = parseFloat(convertValue);
    if (!value || value <= 0) { setConvertErr("Ingresa un valor válido mayor a 0."); return; }
    setConverting(true); setConvertErr(null);
    try {
      await createSalesOpportunity(token, {
        title: convertLead.company ? `${convertLead.company} — ${convertLead.name}` : convertLead.name ?? "Nueva oportunidad",
        description: convertLead.notes ?? `Lead desde ${convertLead.source ?? "captación"}`,
        stage: convertStage,
        value,
        probability: Math.min(100, Number(convertLead.score ?? 20)),
        leadId: convertLead.id,
        clientName: convertLead.company ?? convertLead.name ?? undefined,
      });
      await updateSalesLead(token, convertLead.id, { status: "CONVERTED" });
      setItems((prev) => prev.map((row) => (row.id === convertLead.id ? { ...row, status: "CONVERTED" } : row)));
      setConvertLead(null);
    } catch (e) {
      setConvertErr(e instanceof Error ? e.message : "No se pudo convertir el lead");
    } finally { setConverting(false); }
  };

  const patchStatus = async (id: number, status: string) => {
    if (!token) return;
    try {
      const updated = await updateSalesLead(token, id, { status });
      setItems((prev) => prev.map((l) => (l.id === id ? { ...l, ...updated } : l)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar el estado");
    }
  };

  const nuevos = visibleItems.filter((l) => l.status === "NEW").length;
  const calificados = visibleItems.filter((l) => l.status === "QUALIFIED").length;
  const pipeline = visibleItems.filter((l) => l.status !== "LOST").reduce((s, l) => s + Number(l.score ?? 0), 0);

  const inp: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--surface)",
    color: "var(--foreground)",
    fontSize: 13,
    boxSizing: "border-box",
  };

  const columns: Column<SalesLead>[] = [
    {
      key: "company",
      label: "Empresa / Contacto",
      render: (l) => (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{l.company ?? "—"}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
            {l.name} · {l.phone}
          </div>
        </div>
      ),
    },
    { key: "source", label: "Fuente", render: (l) => <Tag variant="neutral">{l.source ?? "—"}</Tag>, width: 100 },
    { key: "score", label: "Score", accessor: (l) => String(l.score ?? 0), width: 80 },
    {
      key: "status",
      label: "Estado",
      render: (l) =>
        cfg.canEdit ? (
          <select
            value={l.status ?? "NEW"}
            onChange={(e) => patchStatus(l.id, e.target.value)}
            style={{
              fontSize: 12,
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "3px 6px",
              background: "var(--surface)",
              color: "var(--foreground)",
              cursor: "pointer",
            }}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {formatLeadStatus(s)}
              </option>
            ))}
          </select>
        ) : (
          <Tag variant="accent">{formatLeadStatus(l.status)}</Tag>
        ),
      width: 140,
    },
    {
      key: "id",
      label: "",
      render: (l) => (
        <div style={{ display: "flex", gap: 4 }}>
          {cfg.canCreate && l.status !== "CONVERTED" && l.status !== "LOST" && (
            <button onClick={() => openConvert(l)} title="Convertir a oportunidad" style={{ fontSize: 11, background: "var(--primary)", color: "#fff", border: "none", borderRadius: 4, padding: "3px 8px", cursor: "pointer" }}>
              → Opp
            </button>
          )}
          {cfg.canEdit && (
            <button onClick={() => openEdit(l)} title="Editar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 6px" }}>
              ✎
            </button>
          )}
        </div>
      ),
      width: 90,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="CRM · Captación"
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={cfg.canCreate ? <Button variant="primary" iconLeft="+" onClick={openNew}>Nuevo lead</Button> : undefined}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 20 }}>
        <KpiCard label="Nuevos" value={nuevos} />
        <KpiCard label="Calificados" value={calificados} />
        <KpiCard label="Score acumulado" value={pipeline} />
      </div>

      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowForm(false)}>
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: 28, width: 520, maxWidth: "calc(100vw - 32px)", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 56px rgba(0,0,0,0.28)", border: "1px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>{editing ? "Editar lead" : "Nuevo lead"}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {([
                { label: "Empresa", key: "company", ph: "Nombre de la empresa" },
                { label: "Contacto *", key: "name", ph: "Nombre del contacto" },
                { label: "Email", key: "email", ph: "correo@empresa.com", type: "email" },
                { label: "Teléfono", key: "phone", ph: "+52 222 555 1234", type: "tel" },
              ] as const).map(({ label, key, ph, ...rest }) => (
                <div key={key}>
                  <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>{label}</label>
                  <input type={"type" in rest ? rest.type : "text"} value={(form as Record<string, string | number>)[key] as string} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} placeholder={ph} style={inp} />
                </div>
              ))}
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Fuente</label>
                <select value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))} style={inp}>
                  {FUENTES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Estado</label>
                <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} style={inp}>
                  {STATUSES.map((s) => <option key={s} value={s}>{formatLeadStatus(s)}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Score de calidad (0–100)</label>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input type="range" min={0} max={100} step={5} value={form.score} onChange={(e) => setForm((f) => ({ ...f, score: +e.target.value }))} style={{ flex: 1, accentColor: "var(--primary)" }} />
                  <span style={{ fontSize: 13, fontWeight: 700, minWidth: 32, textAlign: "right" }}>{form.score}</span>
                </div>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Notas / contexto</label>
                <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3} placeholder="Interés detectado, canal de contacto, próximo paso…" style={{ ...inp, resize: "vertical" }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 24 }}>
              <Button variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button variant="primary" onClick={save} disabled={!form.name.trim()}>{editing ? "Guardar cambios" : "Crear lead"}</Button>
            </div>
          </div>
        </div>
      )}

      <Section title={loading ? "Cargando…" : `${visibleItems.length} leads`}>
        {highlightId && (
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
            Mostrando lead <strong>#{highlightId}</strong> desde enlace directo.
          </p>
        )}
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
        ) : (
          <DataTable columns={columns} rows={visibleItems} rowKey={(l) => l.id} emptyTitle={loadError ? `⚠ ${loadError}` : "Sin leads"} emptyDescription="Agrega el primer lead." />
        )}
      </Section>

      {/* ── Convertir a oportunidad modal ── */}
      {convertLead && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => setConvertLead(null)}>
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: "24px 28px", width: 440, maxWidth: "calc(100vw - 32px)", boxShadow: "0 24px 56px rgba(0,0,0,0.28)", border: "1px solid var(--border)" }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Convertir lead a oportunidad</div>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 18 }}>
              <strong>{convertLead.company ?? convertLead.name}</strong>
              {convertLead.company && <span> · {convertLead.name}</span>}
            </div>
            <div style={{ display: "grid", gap: 14 }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Valor estimado (MXN) *</span>
                <input
                  type="number" min="0" step="1000"
                  value={convertValue}
                  onChange={(e) => setConvertValue(e.target.value)}
                  placeholder="50000"
                  autoFocus
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--foreground)", fontSize: 13 }}
                />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Etapa inicial</span>
                <select value={convertStage} onChange={(e) => setConvertStage(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--foreground)", fontSize: 13 }}>
                  <option value="DISCOVERY">Discovery</option>
                  <option value="PROPOSAL">Propuesta</option>
                  <option value="NEGOTIATION">Negociación</option>
                  <option value="WON">Ganada</option>
                </select>
              </label>
              {convertErr && (
                <div style={{ padding: "8px 12px", background: "var(--state-danger-bg,#fef2f2)", border: "1px solid var(--danger)", borderRadius: 8, fontSize: 12, color: "var(--danger)" }}>
                  {convertErr}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setConvertLead(null)}>Cancelar</Button>
              <Button variant="primary" onClick={() => void submitConvert()} disabled={converting || !convertValue}>
                {converting ? "Convirtiendo…" : "Crear oportunidad"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
