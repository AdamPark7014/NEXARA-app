"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useUser } from "@/components/UserContext";
import {
  createTender,
  getTenderDashboard,
  getTenders,
  promoteTenderToOpportunity,
  setTenderStatus,
  TENDER_STATUS_COLOR,
  TENDER_STATUS_LABEL,
  TENDER_TYPE_LABEL,
  type Tender,
  type TenderDashboard,
  type TenderStatus,
  type TenderType,
} from "@/lib/tenders-api";

const fmtMoney = (n: number | string) =>
  `$${Number(n || 0).toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;

const daysUntil = (iso?: string | null) => {
  if (!iso) return null;
  const diff = (new Date(iso).getTime() - Date.now()) / 86400000;
  return Math.ceil(diff);
};

export default function LicitacionesPage() {
  const { user } = useUser();
  const [list, setList] = useState<Tender[]>([]);
  const [dashboard, setDashboard] = useState<TenderDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [form, setForm] = useState({
    title: "",
    conveningEntity: "",
    tenderType: "PUBLIC_GOV" as TenderType,
    description: "",
    externalReference: "",
    publicationUrl: "",
    budgetCeiling: 0,
    ourBidAmount: 0,
    estimatedCost: 0,
    guaranteeAmount: 0,
    publishDate: "",
    submissionDeadline: "",
    openingDate: "",
    scope: "",
    technicalRequirements: "",
  });

  const refresh = useCallback(async () => {
    if (!user?.token) return;
    setLoading(true);
    try {
      const [tenders, dash] = await Promise.all([
        getTenders(user.token, {
          status: statusFilter || undefined,
          tenderType: typeFilter || undefined,
        }),
        getTenderDashboard(user.token),
      ]);
      setList(tenders);
      setDashboard(dash);
    } catch (err) {
      setMsg({ kind: "err", text: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }, [user?.token, statusFilter, typeFilter]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleCreate = async () => {
    if (!form.title || !form.conveningEntity) {
      setMsg({ kind: "err", text: "Título y entidad convocante son obligatorios" });
      return;
    }
    try {
      await createTender(user?.token || "", {
        ...form,
        budgetCeiling: Number(form.budgetCeiling) || 0,
        ourBidAmount: Number(form.ourBidAmount) || 0,
        estimatedCost: Number(form.estimatedCost) || 0,
        guaranteeAmount: Number(form.guaranteeAmount) || 0,
        publishDate: form.publishDate || undefined,
        submissionDeadline: form.submissionDeadline || undefined,
        openingDate: form.openingDate || undefined,
      });
      setMsg({ kind: "ok", text: "Licitación creada" });
      setShowForm(false);
      setForm({
        ...form,
        title: "",
        conveningEntity: "",
        description: "",
        externalReference: "",
        publicationUrl: "",
        scope: "",
        technicalRequirements: "",
      });
      await refresh();
    } catch (err) {
      setMsg({ kind: "err", text: (err as Error).message });
    }
  };

  const handleSetStatus = async (id: number, status: TenderStatus) => {
    try {
      await setTenderStatus(user?.token || "", id, status);
      if (status === "AWARDED") {
        await promoteTenderToOpportunity(user?.token || "", id);
        setMsg({ kind: "ok", text: "Licitación adjudicada — oportunidad creada en CRM" });
      } else {
        setMsg({ kind: "ok", text: `Estado actualizado a ${TENDER_STATUS_LABEL[status]}` });
      }
      await refresh();
    } catch (err) {
      setMsg({ kind: "err", text: (err as Error).message });
    }
  };

  const statusGroups = useMemo(() => {
    const groups: Record<string, Tender[]> = {};
    list.forEach((t) => {
      groups[t.status] = groups[t.status] || [];
      groups[t.status].push(t);
    });
    return groups;
  }, [list]);

  const totalPipeline = dashboard?.activePipelineValue || 0;
  const totalMargin = dashboard?.activeExpectedMargin || 0;
  const winRate = dashboard?.winRate ?? 0;

  return (
    <div style={{ padding: 24, maxWidth: 1280, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>📋 Licitaciones</h1>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>
            Gestión de licitaciones públicas y privadas, propuesta técnica/económica, fechas críticas y adjudicaciones.
          </p>
        </div>
        <button type="button" className="button-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancelar" : "+ Nueva licitación"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 16 }}>
        <Kpi label="Pipeline activo" value={fmtMoney(totalPipeline)} color="#3b82f6" />
        <Kpi label="Margen esperado" value={fmtMoney(totalMargin)} color="#16a34a" />
        <Kpi label="Win rate" value={`${winRate}%`} color={winRate >= 50 ? "#16a34a" : winRate >= 30 ? "#f59e0b" : "#dc2626"} />
        <Kpi label="Total licitaciones" value={list.length} color="#6b7280" />
      </div>

      {msg && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 8,
            background: msg.kind === "ok" ? "#dcfce7" : "#fee2e2",
            color: msg.kind === "ok" ? "#166534" : "#991b1b",
          }}
        >
          {msg.text}
        </div>
      )}

      {showForm && (
        <div className="card" style={{ padding: 16, marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>Nueva licitación</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            <Field label="Tipo">
              <select
                value={form.tenderType}
                onChange={(e) => setForm({ ...form, tenderType: e.target.value as TenderType })}
                style={inputStyle}
              >
                {Object.entries(TENDER_TYPE_LABEL).map(([k, l]) => (
                  <option key={k} value={k}>{l}</option>
                ))}
              </select>
            </Field>
            <Field label="Título *">
              <input
                style={inputStyle}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Suministro e instalación de CCTV"
              />
            </Field>
            <Field label="Entidad convocante *">
              <input
                style={inputStyle}
                value={form.conveningEntity}
                onChange={(e) => setForm({ ...form, conveningEntity: e.target.value })}
                placeholder="Secretaría de Bienestar / Soriana"
              />
            </Field>
            <Field label="Referencia externa (CompraNet)">
              <input style={inputStyle} value={form.externalReference} onChange={(e) => setForm({ ...form, externalReference: e.target.value })} />
            </Field>
            <Field label="URL publicación">
              <input style={inputStyle} value={form.publicationUrl} onChange={(e) => setForm({ ...form, publicationUrl: e.target.value })} />
            </Field>
            <Field label="Presupuesto techo (MXN)">
              <input type="number" style={inputStyle} value={form.budgetCeiling} onChange={(e) => setForm({ ...form, budgetCeiling: +e.target.value })} />
            </Field>
            <Field label="Nuestra propuesta (MXN)">
              <input type="number" style={inputStyle} value={form.ourBidAmount} onChange={(e) => setForm({ ...form, ourBidAmount: +e.target.value })} />
            </Field>
            <Field label="Costo estimado (MXN)">
              <input type="number" style={inputStyle} value={form.estimatedCost} onChange={(e) => setForm({ ...form, estimatedCost: +e.target.value })} />
            </Field>
            <Field label="Garantía (MXN)">
              <input type="number" style={inputStyle} value={form.guaranteeAmount} onChange={(e) => setForm({ ...form, guaranteeAmount: +e.target.value })} />
            </Field>
            <Field label="Fecha publicación">
              <input type="date" style={inputStyle} value={form.publishDate} onChange={(e) => setForm({ ...form, publishDate: e.target.value })} />
            </Field>
            <Field label="Cierre propuestas">
              <input type="datetime-local" style={inputStyle} value={form.submissionDeadline} onChange={(e) => setForm({ ...form, submissionDeadline: e.target.value })} />
            </Field>
            <Field label="Apertura propuestas">
              <input type="datetime-local" style={inputStyle} value={form.openingDate} onChange={(e) => setForm({ ...form, openingDate: e.target.value })} />
            </Field>
          </div>
          <div style={{ marginTop: 8 }}>
            <Field label="Descripción">
              <textarea style={{ ...inputStyle, width: "100%" }} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Field label="Alcance del proyecto">
              <textarea style={{ ...inputStyle, width: "100%" }} rows={3} value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} />
            </Field>
            <Field label="Requisitos técnicos">
              <textarea style={{ ...inputStyle, width: "100%" }} rows={2} value={form.technicalRequirements} onChange={(e) => setForm({ ...form, technicalRequirements: e.target.value })} />
            </Field>
          </div>
          <button type="button" className="button-primary" onClick={handleCreate} style={{ marginTop: 12 }}>
            Crear licitación
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        <FilterPill active={!statusFilter} onClick={() => setStatusFilter("")}>Todas</FilterPill>
        {(["IN_REVIEW", "PREPARING_BID", "SUBMITTED", "AWARDED", "LOST"] as TenderStatus[]).map((s) => (
          <FilterPill key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: TENDER_STATUS_COLOR[s], display: "inline-block", marginRight: 6 }} />
            {TENDER_STATUS_LABEL[s]}
          </FilterPill>
        ))}
      </div>

      {dashboard && dashboard.upcoming.length > 0 && (
        <div className="card" style={{ padding: 16, marginTop: 16, borderLeft: "4px solid #f59e0b" }}>
          <h3 style={{ marginTop: 0 }}>⏰ Próximos vencimientos (30 días)</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8 }}>
            {dashboard.upcoming.map((u) => {
              const days = daysUntil(u.submissionDeadline);
              return (
                <Link key={u.id} href={`/licitaciones/${u.id}`} style={{ textDecoration: "none" }}>
                  <div style={{ padding: 10, border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-primary)" }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{u.tenderNumber}</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{u.title}</div>
                    <div style={{ fontSize: 11, marginTop: 4, color: days != null && days <= 3 ? "#dc2626" : "#f59e0b", fontWeight: 700 }}>
                      {days != null ? `${days} día${days === 1 ? "" : "s"} restantes` : "Sin fecha"}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        {loading ? (
          <p>Cargando…</p>
        ) : list.length === 0 ? (
          <p style={{ color: "var(--text-secondary)" }}>Sin licitaciones registradas.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <Th>Folio</Th>
                <Th>Título</Th>
                <Th>Convocante</Th>
                <Th>Tipo</Th>
                <Th align="right">Propuesta</Th>
                <Th align="right">Margen esp.</Th>
                <Th>Cierre</Th>
                <Th>Estado</Th>
                <Th>Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {list.map((t) => {
                const days = daysUntil(t.submissionDeadline);
                return (
                  <tr key={t.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <Td>
                      <Link href={`/licitaciones/${t.id}`} style={{ color: "var(--primary)", textDecoration: "none", fontWeight: 600 }}>
                        {t.tenderNumber}
                      </Link>
                    </Td>
                    <Td>{t.title}</Td>
                    <Td><span style={{ fontSize: 12 }}>{t.conveningEntity}</span></Td>
                    <Td>{TENDER_TYPE_LABEL[t.tenderType]}</Td>
                    <Td align="right">{fmtMoney(t.ourBidAmount)}</Td>
                    <Td align="right" style={{ color: Number(t.expectedMargin) >= 0 ? "#16a34a" : "#dc2626", fontWeight: 600 }}>
                      {fmtMoney(t.expectedMargin)}
                    </Td>
                    <Td>
                      {t.submissionDeadline ? (
                        <span style={{ fontSize: 12, color: days != null && days <= 3 ? "#dc2626" : "var(--text-primary)" }}>
                          {new Date(t.submissionDeadline).toLocaleDateString("es-MX")}
                          {days != null && days >= 0 && <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{days} día(s)</div>}
                        </span>
                      ) : "—"}
                    </Td>
                    <Td>
                      <Badge color={TENDER_STATUS_COLOR[t.status]}>{TENDER_STATUS_LABEL[t.status]}</Badge>
                    </Td>
                    <Td>
                      <select
                        value={t.status}
                        onChange={(e) => handleSetStatus(t.id, e.target.value as TenderStatus)}
                        style={{ ...inputStyle, padding: 4, fontSize: 12 }}
                      >
                        {(Object.keys(TENDER_STATUS_LABEL) as TenderStatus[]).map((s) => (
                          <option key={s} value={s}>{TENDER_STATUS_LABEL[s]}</option>
                        ))}
                      </select>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  display: "block",
  padding: 8,
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg-primary)",
  color: "var(--text-primary)",
  marginTop: 4,
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", fontSize: 13, color: "var(--text-secondary)" }}>
      {label}
      {children}
    </label>
  );
}

function Kpi({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="card" style={{ padding: 14, borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 11, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th style={{ textAlign: align || "left", padding: 10, background: "var(--bg-secondary)", fontSize: 12, borderBottom: "1px solid var(--border)" }}>
      {children}
    </th>
  );
}

function Td({ children, align, style }: { children: React.ReactNode; align?: "right"; style?: React.CSSProperties }) {
  return (
    <td style={{ padding: 10, textAlign: align || "left", fontSize: 13, ...style }}>{children}</td>
  );
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        background: `${color}22`,
        color,
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      {children}
    </span>
  );
}

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "6px 12px",
        background: active ? "var(--primary)" : "var(--bg-secondary)",
        color: active ? "#fff" : "var(--text-primary)",
        border: "none",
        borderRadius: 999,
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {children}
    </button>
  );
}
