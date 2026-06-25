"use client";

import Link from "next/link";
import { buildApiUrl } from "@/lib/api-base";
import EmptyState from "@/components/ui/EmptyState";
import { DetailError, DetailSection, formatDateTime } from "@/components/detail/DetailFrame";
import { useClientDetail } from "@/components/crm/ClientDetailShell";

export default function ClientInvoicesPage() {
  const { client, error, reload } = useClientDetail();

  if (error) return <DetailError message={error} onRetry={reload} />;
  if (!client) return null;

  const docs = (client.documents ?? []).filter((d) => /factura|invoice|cfdi/i.test(d.type));

  return (
    <DetailSection title="Facturas y documentos fiscales">
      {docs.length === 0 ? (
        <EmptyState
          icon="🧾"
          title="Sin facturas en expediente"
          description="Las facturas timbradas aparecen en ERP Facturación. Aquí se listan PDFs fiscales del expediente del cliente."
          action={
            <Link href="/erp/invoicing" style={{ color: "var(--primary)", fontWeight: 600, fontSize: 13 }}>
              Ir a facturación →
            </Link>
          }
        />
      ) : (
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
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{d.fileName || d.type}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                  {formatDateTime(d.createdAt)}
                </div>
              </div>
              <a
                href={buildApiUrl(d.fileUrl.replace(/^\//, ""))}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 13, fontWeight: 600, color: "var(--primary)" }}
              >
                Ver
              </a>
            </li>
          ))}
        </ul>
      )}
    </DetailSection>
  );
}
