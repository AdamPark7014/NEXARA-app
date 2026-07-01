"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { buildApiUrl } from "@/lib/api-base";
import EmptyState from "@/components/ui/EmptyState";
import { Tag } from "@/components/ui/DataTable";
import { DetailError, DetailSection, formatDate } from "@/components/detail/DetailFrame";
import { useClientDetail } from "@/components/crm/ClientDetailShell";
import { useUser } from "@/components/UserContext";
import { listClientInvoices, type ClientInvoiceRow } from "@/lib/sales-api";

const STATUS_VARIANT: Record<string, "positive" | "warning" | "neutral" | "danger"> = {
  PAID: "positive",
  SENT: "positive",
  DRAFT: "warning",
  CANCELLED: "danger",
};

function money(value: number | string, currency = "MXN") {
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(n);
}

export default function ClientInvoicesPage() {
  const { client, error, reload } = useClientDetail();
  const { user } = useUser();
  const token = user?.token ?? "";
  const [invoices, setInvoices] = useState<ClientInvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !client?.id) return;
    setLoading(true);
    setLoadErr(null);
    void listClientInvoices(token, client.id)
      .then(setInvoices)
      .catch((e) => setLoadErr(e instanceof Error ? e.message : "Error al cargar facturas"))
      .finally(() => setLoading(false));
  }, [token, client?.id]);

  if (error) return <DetailError message={error} onRetry={reload} />;
  if (!client) return null;

  const docs = (client.documents ?? []).filter((d) => /factura|invoice|cfdi/i.test(d.type));

  return (
    <>
      <DetailSection title="Facturas CFDI (contabilidad)">
        {loadErr && <p style={{ color: "var(--danger)", fontSize: 13 }}>{loadErr}</p>}
        {loading && invoices.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>Cargando facturas…</p>
        ) : invoices.length === 0 ? (
          <EmptyState
            icon="🧾"
            title="Sin facturas registradas"
            description="Las facturas se generan desde Proyectos CRM → Orden de cierre → ERP Facturación."
            action={
              <Link href="/erp/invoicing" style={{ color: "var(--primary)", fontWeight: 600, fontSize: 13 }}>
                Ir a facturación →
              </Link>
            }
          />
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
            {invoices.map((inv) => (
              <li
                key={inv.id}
                style={{
                  padding: 14,
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{inv.invoiceNumber}</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                    {formatDate(inv.issueDate)} · {money(inv.totalAmount, inv.currency ?? "MXN")}
                    {inv.salesProjectOrder?.project?.name
                      ? ` · Proyecto: ${inv.salesProjectOrder.project.name}`
                      : ""}
                  </div>
                  {inv.cfdiUuid && (
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
                      UUID: {inv.cfdiUuid}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Tag variant={STATUS_VARIANT[inv.status] ?? "neutral"}>{inv.status}</Tag>
                  <Link
                    href={`/erp/invoicing?highlight=${inv.id}`}
                    style={{ fontSize: 13, fontWeight: 600, color: "var(--primary)" }}
                  >
                    Ver en ERP →
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DetailSection>

      {docs.length > 0 && (
        <DetailSection title="PDFs en expediente">
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
            {docs.map((d) => (
              <li
                key={d.id}
                style={{
                  padding: 14,
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 14 }}>{d.fileName || d.type}</div>
                <a
                  href={buildApiUrl(d.fileUrl.replace(/^\//, ""))}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 13, fontWeight: 600, color: "var(--primary)" }}
                >
                  Ver PDF
                </a>
              </li>
            ))}
          </ul>
        </DetailSection>
      )}
    </>
  );
}
