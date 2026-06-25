"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@/components/UserContext";
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";
import { Tag, Money } from "@/components/ui/DataTable";
import { closeSalesProject, getSalesProjectOrder, type SalesProjectOrder } from "@/lib/sales-api";
import { DetailError, DetailSection, formatDateTime } from "@/components/detail/DetailFrame";
import { useProjectDetail } from "@/components/crm/ProjectDetailShell";

export default function ProjectOrderPage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const { id, summary, error, reload } = useProjectDetail();
  const [order, setOrder] = useState<SalesProjectOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [orderError, setOrderError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !id) return;
    setLoading(true);
    setOrderError(null);
    void getSalesProjectOrder(token, id)
      .then(setOrder)
      .catch((e) => setOrderError(e instanceof Error ? e.message : "Sin orden de cierre"))
      .finally(() => setLoading(false));
  }, [token, id, summary]);

  const closeProject = async () => {
    if (!token || !confirm("¿Generar orden de cierre para este proyecto?")) return;
    try {
      const created = await closeSalesProject(token, id);
      setOrder(created);
      reload();
    } catch {
      /* ignore */
    }
  };

  if (error) return <DetailError message={error} onRetry={reload} />;
  if (!summary) return null;

  const orderSummary = summary.order;

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
          {(order ?? orderSummary) && (
            <div style={{ padding: 14, border: "1px solid var(--border)", borderRadius: 10, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 700 }}>{order?.orderId ?? orderSummary?.orderId}</span>
                <Tag variant="accent">{order?.status ?? orderSummary?.status}</Tag>
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
          {(order?.invoice ?? orderSummary?.invoice) && (
            <p style={{ marginTop: 16, fontSize: 13 }}>
              <Link href="/erp/invoicing" style={{ color: "var(--primary)", fontWeight: 600 }}>
                Ver factura {(order?.invoice ?? orderSummary?.invoice)?.invoiceNumber} en ERP →
              </Link>
            </p>
          )}
        </>
      )}
    </DetailSection>
  );
}
