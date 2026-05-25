"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";

type Invoice = {
  id: number;
  invoiceNumber: string;
  type: string;
  status: string;
  issueDate: string;
  dueDate: string;
  receptorName?: string | null;
  receptorRfc?: string | null;
  subtotal: string | number;
  totalAmount: string | number;
  paidAmount: string | number;
  cfdiUuid?: string | null;
  cfdiSerie?: string | null;
  cfdiFolio?: string | null;
  cfdiVersion?: string | null;
  pdfUrl?: string | null;
  cfdiXml?: string | null;
  isCancelled?: boolean;
  cancellationReason?: string | null;
};

type PacInfo = {
  provider: string;
  fallback: boolean;
  configured: boolean;
};

const fmt = (n: number | string) =>
  `$${Number(n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "#6b7280",
  SENT: "#3b82f6",
  PAID: "#16a34a",
  PARTIALLY_PAID: "#f59e0b",
  OVERDUE: "#dc2626",
  CANCELLED: "#dc2626",
};

const CANCEL_REASONS = [
  { code: "01", label: "01 - Comprobante emitido con errores con relación" },
  { code: "02", label: "02 - Comprobante emitido con errores sin relación" },
  { code: "03", label: "03 - No se llevó a cabo la operación" },
  { code: "04", label: "04 - Operación nominativa relacionada en una factura global" },
];

export default function CfdiPage() {
  const { user } = useUser();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [pacInfo, setPacInfo] = useState<PacInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [stamping, setStamping] = useState<number | null>(null);
  const [cancelDialog, setCancelDialog] = useState<{ id: number; reason: string; substitution: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");

  const refresh = useCallback(async () => {
    if (!user?.token) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (statusFilter) qs.set("status", statusFilter);
      const [invRes, pacRes] = await Promise.all([
        fetch(buildApiUrl(`accounting/invoices${qs.toString() ? `?${qs.toString()}` : ""}`), {
          headers: { Authorization: `Bearer ${user.token}` },
        }),
        fetch(buildApiUrl("accounting/invoices/pac-info"), {
          headers: { Authorization: `Bearer ${user.token}` },
        }),
      ]);
      if (!invRes.ok) throw new Error(await invRes.text());
      const invData = await invRes.json();
      setInvoices(Array.isArray(invData) ? invData : invData.data || []);
      if (pacRes.ok) setPacInfo(await pacRes.json());
    } catch (err) {
      setMsg({ kind: "err", text: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }, [user?.token, statusFilter]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleStamp = async (id: number) => {
    setStamping(id);
    setMsg(null);
    try {
      const res = await fetch(buildApiUrl(`accounting/invoices/${id}/stamp`), {
        method: "POST",
        headers: { Authorization: `Bearer ${user?.token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      setMsg({ kind: "ok", text: "Factura timbrada exitosamente" });
      await refresh();
    } catch (err) {
      setMsg({ kind: "err", text: (err as Error).message });
    } finally {
      setStamping(null);
    }
  };

  const handleCancel = async () => {
    if (!cancelDialog) return;
    try {
      const res = await fetch(buildApiUrl(`accounting/invoices/${cancelDialog.id}/cancel`), {
        method: "PATCH",
        headers: { Authorization: `Bearer ${user?.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: cancelDialog.reason,
          substitutionUuid: cancelDialog.reason === "01" ? cancelDialog.substitution : undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setMsg({ kind: "ok", text: "Factura cancelada ante el SAT" });
      setCancelDialog(null);
      await refresh();
    } catch (err) {
      setMsg({ kind: "err", text: (err as Error).message });
    }
  };

  const stampedCount = invoices.filter((i) => i.cfdiUuid).length;
  const draftCount = invoices.filter((i) => i.status === "DRAFT").length;
  const cancelledCount = invoices.filter((i) => i.isCancelled).length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>📑 CFDI 4.0 y timbrado</h2>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>
            Gestión de timbrado/cancelación ante el SAT vía PAC certificado.
          </p>
        </div>
        {pacInfo && (
          <div style={{ padding: 8, borderRadius: 8, background: pacInfo.fallback ? "#fef3c7" : "#dcfce7", color: pacInfo.fallback ? "#92400e" : "#166534", fontSize: 13 }}>
            <strong>PAC:</strong> {pacInfo.provider.toUpperCase()}
            {pacInfo.fallback && <span style={{ marginLeft: 8 }}>⚠️ Modo fallback (mock)</span>}
            {!pacInfo.configured && <span style={{ marginLeft: 8 }}>· sin credenciales</span>}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
        <Kpi label="Total facturas" value={invoices.length} color="#6b7280" />
        <Kpi label="Timbradas" value={stampedCount} color="#16a34a" />
        <Kpi label="Borradores" value={draftCount} color="#f59e0b" />
        <Kpi label="Canceladas" value={cancelledCount} color="#dc2626" />
      </div>

      {msg && (
        <div style={{ padding: 12, borderRadius: 8, marginBottom: 12, background: msg.kind === "ok" ? "#dcfce7" : "#fee2e2", color: msg.kind === "ok" ? "#166534" : "#991b1b" }}>
          {msg.text}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <FilterPill active={!statusFilter} onClick={() => setStatusFilter("")}>Todas</FilterPill>
        <FilterPill active={statusFilter === "DRAFT"} onClick={() => setStatusFilter("DRAFT")}>Borrador</FilterPill>
        <FilterPill active={statusFilter === "SENT"} onClick={() => setStatusFilter("SENT")}>Emitidas</FilterPill>
        <FilterPill active={statusFilter === "PAID"} onClick={() => setStatusFilter("PAID")}>Pagadas</FilterPill>
        <FilterPill active={statusFilter === "CANCELLED"} onClick={() => setStatusFilter("CANCELLED")}>Canceladas</FilterPill>
      </div>

      {loading ? <p>Cargando facturas…</p> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <Th>Folio</Th>
                <Th>Receptor</Th>
                <Th>Tipo</Th>
                <Th>F. emisión</Th>
                <Th align="right">Total</Th>
                <Th align="right">Pagado</Th>
                <Th>Estado</Th>
                <Th>CFDI UUID</Th>
                <Th>Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} style={{ borderTop: "1px solid var(--border)", opacity: inv.isCancelled ? 0.6 : 1 }}>
                  <Td><strong>{inv.invoiceNumber}</strong></Td>
                  <Td>
                    {inv.receptorName || "—"}
                    {inv.receptorRfc && <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{inv.receptorRfc}</div>}
                  </Td>
                  <Td><span style={{ fontSize: 12 }}>{inv.type === "ACCOUNTS_RECEIVABLE" ? "Por cobrar" : "Por pagar"}</span></Td>
                  <Td>{new Date(inv.issueDate).toLocaleDateString("es-MX")}</Td>
                  <Td align="right" style={{ fontWeight: 600 }}>{fmt(inv.totalAmount)}</Td>
                  <Td align="right">{fmt(inv.paidAmount)}</Td>
                  <Td><Badge color={inv.isCancelled ? "#dc2626" : STATUS_COLOR[inv.status] || "#6b7280"}>{inv.isCancelled ? "CANCELADA" : inv.status}</Badge></Td>
                  <Td>
                    {inv.cfdiUuid ? (
                      <div>
                        <code style={{ fontSize: 10, color: "var(--text-secondary)" }}>{inv.cfdiUuid.slice(0, 18)}…</code>
                        {inv.pdfUrl && <a href={inv.pdfUrl} target="_blank" rel="noreferrer" style={{ marginLeft: 6, color: "var(--primary)", fontSize: 11 }}>PDF</a>}
                      </div>
                    ) : (
                      <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Sin timbrar</span>
                    )}
                  </Td>
                  <Td>
                    <div style={{ display: "flex", gap: 6 }}>
                      {!inv.cfdiUuid && !inv.isCancelled && (
                        <button
                          type="button"
                          onClick={() => handleStamp(inv.id)}
                          disabled={stamping === inv.id}
                          style={btnSmall}
                        >
                          {stamping === inv.id ? "Timbrando…" : "🔖 Timbrar"}
                        </button>
                      )}
                      {inv.cfdiUuid && !inv.isCancelled && (
                        <button
                          type="button"
                          onClick={() => setCancelDialog({ id: inv.id, reason: "02", substitution: "" })}
                          style={btnDanger}
                        >
                          🚫 Cancelar
                        </button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {cancelDialog && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "grid", placeItems: "center", zIndex: 1000 }}>
          <div style={{ background: "var(--bg-primary)", padding: 24, borderRadius: 12, minWidth: 480, maxWidth: 560 }}>
            <h3 style={{ marginTop: 0 }}>Cancelar CFDI</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>
              Selecciona el motivo de cancelación ante el SAT.
            </p>
            <label style={{ display: "block", fontSize: 13, marginTop: 8 }}>
              Motivo
              <select value={cancelDialog.reason} onChange={(e) => setCancelDialog({ ...cancelDialog, reason: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-secondary)" }}>
                {CANCEL_REASONS.map((r) => (
                  <option key={r.code} value={r.code}>{r.label}</option>
                ))}
              </select>
            </label>
            {cancelDialog.reason === "01" && (
              <label style={{ display: "block", fontSize: 13, marginTop: 8 }}>
                UUID de sustitución (requerido para motivo 01)
                <input
                  type="text"
                  value={cancelDialog.substitution}
                  onChange={(e) => setCancelDialog({ ...cancelDialog, substitution: e.target.value })}
                  placeholder="00000000-0000-0000-0000-000000000000"
                  style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-secondary)" }}
                />
              </label>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setCancelDialog(null)} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", cursor: "pointer" }}>Cancelar</button>
              <button type="button" onClick={handleCancel} style={btnDanger}>Confirmar cancelación</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div style={{ padding: 12, background: "var(--bg-secondary)", borderRadius: 10, borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 10, color: "var(--text-secondary)", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return <th style={{ textAlign: align || "left", padding: 8, background: "var(--bg-secondary)", fontSize: 12 }}>{children}</th>;
}
function Td({ children, align, style }: { children: React.ReactNode; align?: "right"; style?: React.CSSProperties }) {
  return <td style={{ padding: 8, textAlign: align || "left", fontSize: 13, ...style }}>{children}</td>;
}
function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return <span style={{ display: "inline-block", padding: "2px 8px", background: `${color}22`, color, borderRadius: 999, fontSize: 11, fontWeight: 700 }}>{children}</span>;
}
function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={{ padding: "6px 12px", borderRadius: 999, border: "none", background: active ? "var(--primary)" : "var(--bg-secondary)", color: active ? "#fff" : "var(--text-primary)", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
      {children}
    </button>
  );
}

const btnSmall: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: 6,
  border: "none",
  background: "#3b82f6",
  color: "#fff",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 600,
};
const btnDanger: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: 6,
  border: "none",
  background: "#dc2626",
  color: "#fff",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 600,
};
