"use client";

import Link from "next/link";
import CrossPanelLink from "@/components/CrossPanelLink";
import { useEffect, useMemo, useState } from "react";
import { useUser } from "@/components/UserContext";
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";
import { Tag, Money } from "@/components/ui/DataTable";
import {
  closeSalesProject,
  getSalesProjectOrder,
  invoiceSalesProject,
  type SalesProjectOrder,
} from "@/lib/sales-api";
import { DetailError, DetailSection, formatDateTime } from "@/components/detail/DetailFrame";
import KpiCard from "@/components/ui/KpiCard";
import { useProjectDetail } from "@/components/crm/ProjectDetailShell";
import { getErpFinanceSectionConfig } from "@/lib/section-views";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import { resolveCrossPanelHref } from "@/lib/cross-panel-handoff";

const ORDER_STATUS_LABEL: Record<string, string> = {
  CONFIRMED: "Confirmada",
  OPEN: "Abierta",
  CLOSED: "Cerrada",
};

export default function ProjectOrderPage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const { id, summary, error, reload } = useProjectDetail();
  const invoiceCfg = useMemo(() => getErpFinanceSectionConfig(user, "invoicing"), [user]);
  const [order, setOrder] = useState<SalesProjectOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [invoicing, setInvoicing] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [selectedLineIds, setSelectedLineIds] = useState<number[]>([]);

  useEffect(() => {
    if (!token || !id) return;
    setLoading(true);
    setOrderError(null);
    void getSalesProjectOrder(token, id)
      .then((loaded) => {
        setOrder(loaded);
        const pending = (loaded.lines ?? []).filter((l) => !l.invoiceItem).map((l) => l.id);
        setSelectedLineIds(pending);
      })
      .catch((e) => setOrderError(e instanceof Error ? e.message : "Sin orden de venta"))
      .finally(() => setLoading(false));
  }, [token, id, summary]);

  const closeProject = () => {
    if (!token) return;
    setConfirmState({
      message: "¿Finalizar proyecto y generar PDF de cierre de la orden?",
      confirmLabel: "Cerrar proyecto",
      fn: async () => {
        try {
          const created = await closeSalesProject(token, id);
          setOrder(created);
          reload();
        } catch (e) {
          setSaveErr(e instanceof Error ? e.message : "No se pudo cerrar el proyecto");
        }
      },
    });
  };

  const pendingLines = useMemo(
    () => (order?.lines ?? []).filter((line) => !line.invoiceItem),
    [order?.lines],
  );

  const toggleLine = (lineId: number) => {
    setSelectedLineIds((prev) =>
      prev.includes(lineId) ? prev.filter((x) => x !== lineId) : [...prev, lineId],
    );
  };

  const generateInvoice = () => {
    if (!token || selectedLineIds.length === 0) {
      setSaveErr("Selecciona al menos una línea pendiente de facturar");
      return;
    }
    const partial = selectedLineIds.length < pendingLines.length;
    setConfirmState({
      message: partial
        ? `¿Generar factura borrador con ${selectedLineIds.length} línea(s) seleccionada(s)?`
        : "¿Generar factura borrador con todas las líneas pendientes?",
      confirmLabel: "Generar factura",
      fn: async () => {
        setInvoicing(true);
        try {
          const inv = await invoiceSalesProject(token, id, selectedLineIds);
          reload();
          const refreshed = await getSalesProjectOrder(token, id);
          setOrder(refreshed);
          const stillPending = (refreshed.lines ?? []).filter((l) => !l.invoiceItem).map((l) => l.id);
          setSelectedLineIds(stillPending);
          const invoicingPath = `/erp/invoicing?highlight=${inv.id}`;
          const userJson = user ? JSON.stringify(user) : null;
          window.location.assign(resolveCrossPanelHref(invoicingPath, userJson, "crm"));
        } catch (e) {
          setSaveErr(e instanceof Error ? e.message : "No se pudo generar la factura");
        } finally {
          setInvoicing(false);
        }
      },
    });
  };

  if (error) return <DetailError message={error} onRetry={reload} />;
  if (!summary) return null;

  const orderSummary = summary.order;
  const activeOrder = order ?? orderSummary;
  const invoices = order?.invoices ?? orderSummary?.invoices ?? [];

  const orderLines = order?.lines ?? [];
  const pendingLineCount = orderLines.filter((l) => !l.invoiceItem).length;
  const invoicedLines = orderLines.filter((l) => Boolean(l.invoiceItem)).length;

  return (
    <>
    {!loading && activeOrder && (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 14 }}>
        <KpiCard label="Estado" value={ORDER_STATUS_LABEL[activeOrder.status] ?? activeOrder.status} variant={activeOrder.status === "CLOSED" ? "positive" : "accent"} icon="📋" />
        <KpiCard label="Partidas" value={orderLines.length} icon="📝" />
        <KpiCard label="Facturadas" value={invoicedLines} variant={invoicedLines > 0 ? "positive" : "default"} icon="✅" />
        <KpiCard label="Pendientes" value={pendingLineCount} variant={pendingLineCount > 0 ? "warning" : "positive"} icon="⏳" />
      </div>
    )}
    {!loading && orderLines.length > 0 && (() => {
      const total = orderLines.length;
      const invoicedCount = orderLines.filter((l) => Boolean(l.invoiceItem)).length;
      const pendingCount = total - invoicedCount;
      return (
        <div style={{ marginBottom: 14, padding: "12px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Facturación de partidas</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {([
              { label: "Facturadas", count: invoicedCount, color: "var(--success)" },
              { label: "Pendientes", count: pendingCount, color: "var(--warning)" },
            ] as { label: string; count: number; color: string }[]).filter((r) => r.count > 0).map((r) => (
              <div key={r.label} style={{ display: "grid", gridTemplateColumns: "90px 1fr 36px", gap: 10, alignItems: "center" }}>
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
    <DetailSection title="Orden de venta">
      {summary.project.status !== "CLOSED" && activeOrder && (
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12, lineHeight: 1.5 }}>
          La orden se creó al abrir el proyecto. Puedes facturar parcialmente en cualquier momento y cerrar el proyecto al terminar la ejecución.
        </p>
      )}
      {summary.project.status !== "CLOSED" && (
        <div style={{ marginBottom: 16 }}>
          <Button variant="secondary" onClick={() => void closeProject()}>
            Cerrar proyecto y finalizar orden
          </Button>
        </div>
      )}
      {loading ? (
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>Cargando orden…</p>
      ) : orderError && !order && !orderSummary ? (
        <EmptyState icon="📄" title="Sin orden" description={orderError} />
      ) : (
        <>
          {activeOrder && (
            <div style={{ padding: 14, border: "1px solid var(--border)", borderRadius: 10, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 700 }}>{activeOrder.orderId}</span>
                <Tag variant="accent">{ORDER_STATUS_LABEL[activeOrder.status] ?? activeOrder.status}</Tag>
              </div>
              {order?.createdAt && (
                <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 6 }}>{formatDateTime(order.createdAt)}</p>
              )}
              {order?.orderPdfUrl && (
                <a href={order.orderPdfUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 600, color: "var(--primary)", display: "inline-block", marginTop: 8 }}>
                  Descargar PDF
                </a>
              )}
            </div>
          )}
          {order?.lines && order.lines.length > 0 && (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
              {order.lines.map((line) => {
                const invoiced = Boolean(line.invoiceItem);
                return (
                  <li
                    key={line.id}
                    style={{
                      padding: "10px 12px",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 10,
                      opacity: invoiced ? 0.65 : 1,
                    }}
                  >
                    <label style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, cursor: invoiced ? "default" : "pointer" }}>
                      {!invoiced && invoiceCfg.canCreate && (
                        <input
                          type="checkbox"
                          checked={selectedLineIds.includes(line.id)}
                          onChange={() => toggleLine(line.id)}
                        />
                      )}
                      <span style={{ fontSize: 13 }}>
                        {line.qty}× {line.name}
                        {invoiced && line.invoiceItem?.invoice && (
                          <span style={{ color: "var(--text-tertiary)", fontSize: 11.5, marginLeft: 8 }}>
                            → {line.invoiceItem.invoice.invoiceNumber}
                          </span>
                        )}
                      </span>
                    </label>
                    <Money value={Number(line.lineTotal)} />
                  </li>
                );
              })}
            </ul>
          )}
          {pendingLines.length > 0 && invoiceCfg.canCreate && (
            <div style={{ marginTop: 16 }}>
              {saveErr && <p role="alert" style={{ color: "var(--danger)", fontSize: 12, marginBottom: 8 }}>{saveErr}</p>}
              <Button variant="primary" onClick={generateInvoice} disabled={invoicing || selectedLineIds.length === 0}>
                {invoicing
                  ? "Generando…"
                  : selectedLineIds.length < pendingLines.length
                    ? `Facturar ${selectedLineIds.length} línea(s)`
                    : "Generar factura borrador"}
              </Button>
            </div>
          )}
          {invoices.length > 0 && (
            <div style={{ marginTop: 16, display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase" }}>Facturas emitidas</div>
              {invoices.map((inv) => (
                <CrossPanelLink key={inv.id} href={`/erp/invoicing?highlight=${inv.id}`} style={{ fontSize: 13, fontWeight: 600, color: "var(--primary)" }}>
                  {inv.invoiceNumber} · {inv.status}
                </CrossPanelLink>
              ))}
            </div>
          )}
        </>
      )}
      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} danger={false} />
    </DetailSection>
    </>
  );
}
