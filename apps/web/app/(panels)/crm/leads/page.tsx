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
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SalesLead | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      setItems(await listSalesLeads(token));
    } catch {
      /* skip */
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
      alert(e instanceof Error ? e.message : "No se pudo guardar el lead");
    }
  };

  const convertToOpportunity = async (l: SalesLead) => {
    if (!token || l.status === "CONVERTED") return;
    const value = Number(window.prompt("Valor estimado de la oportunidad (MXN):", "50000") ?? "0");
    if (!value) return;
    try {
      await createSalesOpportunity(token, {
        title: l.company ? `${l.company} — ${l.name}` : l.name ?? "Nueva oportunidad",
        description: l.notes ?? `Lead desde ${l.source ?? "captación"}`,
        stage: "DISCOVERY",
        value,
        probability: Math.min(100, Number(l.score ?? 20)),
        leadId: l.id,
        clientName: l.company ?? l.name ?? undefined,
      });
      await updateSalesLead(token, l.id, { status: "CONVERTED" });
      setItems((prev) => prev.map((row) => (row.id === l.id ? { ...row, status: "CONVERTED" } : row)));
      window.alert("Oportunidad creada. Revisa el pipeline comercial.");
    } catch (e) {
      alert(e instanceof Error ? e.message : "No se pudo convertir el lead");
    }
  };

  const patchStatus = async (id: number, status: string) => {
    if (!token) return;
    try {
      const updated = await updateSalesLead(token, id, { status });
      setItems((prev) => prev.map((l) => (l.id === id ? { ...l, ...updated } : l)));
    } catch (e) {
      alert(e instanceof Error ? e.message : "No se pudo actualizar el estado");
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
            <button onClick={() => void convertToOpportunity(l)} title="Convertir a oportunidad" style={{ fontSize: 11, background: "var(--primary)", color: "#fff", border: "none", borderRadius: 4, padding: "3px 8px", cursor: "pointer" }}>
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
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            { label: "Empresa", key: "company", ph: "Nombre de la empresa" },
            { label: "Contacto", key: "name", ph: "Nombre del contacto" },
            { label: "Email", key: "email", ph: "correo@empresa.com" },
            { label: "Teléfono", key: "phone", ph: "222 555 1234" },
          ].map(({ label, key, ph }) => (
            <div key={key}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>{label}</label>
              <input value={(form as Record<string, string | number>)[key] as string} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} placeholder={ph} style={inp} />
            </div>
          ))}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Fuente</label>
            <select value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))} style={inp}>
              {FUENTES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Score</label>
            <input type="number" min={0} value={form.score} onChange={(e) => setForm((f) => ({ ...f, score: +e.target.value }))} style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Estado</label>
            <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} style={inp}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {formatLeadStatus(s)}
                </option>
              ))}
            </select>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Notas</label>
            <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} style={inp} />
          </div>
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button variant="primary" onClick={save}>{editing ? "Guardar" : "Crear lead"}</Button>
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
          <DataTable columns={columns} rows={visibleItems} rowKey={(l) => l.id} emptyTitle="Sin leads" emptyDescription="Agrega el primer lead." />
        )}
      </Section>
    </>
  );
}
