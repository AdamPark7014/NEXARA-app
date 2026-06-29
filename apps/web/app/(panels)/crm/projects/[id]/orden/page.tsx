"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { useProjectDetail } from "@/components/crm/ProjectDetailShell";
import { getErpFinanceSectionConfig } from "@/lib/section-views";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";

export default function ProjectOrderPage() {
  const { user } = useUser();
  const router = useRouter();
  const token = user?.token ?? "";
  const { id, summary, error, reload } = useProjectDetail();
  const invoiceCfg = useMemo(() => getErpFinanceSectionConfig(user, "invoicing"), [user]);
  const [order, setOrder] = useState<SalesProjectOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [invoicing, setInvoicing] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  useEffect(() => {
    if (!token || !id) return;
    setLoading(true);
    setOrderError(null);
    void getSalesProjectOrder(token, id)
      .then(setOrder)
      .catch((e) => setOrderError(e instanceof Error ? e.message : "Sin orden de cierre"))
      .finally(() => setLoading(false));
  }, [token, id, summary]);

  const closeProject = () => {
    if (!token) return;
    setConfirmState({ message: "¿Generar orden de cierre para este proyecto?", confirmLabel: "Generar orden", fn: async () => {
      try {
        const created = await closeSalesProject(token, id);
        setOrder(created);
        reload();
      } catch { /* ignore */ }
    } });
  };

  const generateInvoice = () => {
    if (!token) return;
    setConfirmState({ message: "¿Generar factura borrador desde esta orden de cierre?", confirmLabel: "Generar factura", fn: async () => {
      setInvoicing(true);
      try {
        const inv = await invoiceSalesProject(token, id);
        reload();
        void getSalesProjectOrder(token, id).then(setOrder).catch(() => undefined);
        router.push(`/erp/invoicing?highlight=${inv.id}`);
      } catch (e) {
        setSaveErr(e instanceof Error ? e.message : "No se pudo generar la factura");
      } finally {
        setInvoicing(false);
      }
    } });
  };

  if (error) return <DetailError message={error} onRetry={reload} />;
  if (!summary) return null;

  const orderSummary = summary.order;
  const activeOrder = order ?? orderSummary;
  const linkedInvoice = order?.invoice ?? orderSummary?.invoice;

  return (
    <DetailSection title="Orden de cierre">
      {summary.project.status !== "CLOSED" && (
        <div style={{ marginBottom: 16 }}>
          <Button variant="secondary" onClick={() => void closeProject()}>
            Generar orden de cierre
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
                <Tag variant="accent">{activeOrder.status}</Tag>
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
              {order.lines.map((line) => (
                <li key={line.id} style={{ padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 8, display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13 }}>{line.qty}× {line.name}</span>
                  <Money value={Number(line.lineTotal)} />
                </li>
              ))}
            </ul>
          )}
          {activeOrder && !linkedInvoice && invoiceCfg.canCreate && (
            <div style={{ marginTop: 16 }}>
              {saveErr && <p role="alert" style={{ color: "var(--danger)", fontSize: 12, marginBottom: 8 }}>{saveErr}</p>}
              <Button variant="primary" onClick={generateInvoice} disabled={invoicing}>
                {invoicing ? "Generando…" : "Generar factura borrador"}
              </Button>
            </div>
          )}
          {linkedInvoice && (
            <p style={{ marginTop: 16, fontSize: 13 }}>
              <Link href={`/erp/invoicing?highlight=${linkedInvoice.id}`} style={{ color: "var(--primary)", fontWeight: 600 }}>
                Ver factura {linkedInvoice.invoiceNumber} en ERP →
              </Link>
            </p>
          )}
        </>
      )}
      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} danger={false} />
    </DetailSection>
  );
}
