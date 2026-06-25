"use client";

import Link from "next/link";
import { buildApiUrl } from "@/lib/api-base";
import EmptyState from "@/components/ui/EmptyState";
import { DetailError, DetailSection, formatDateTime } from "@/components/detail/DetailFrame";
import { useClientDetail } from "@/components/crm/ClientDetailShell";

export default function ClientQuotesPage() {
  const { client, error, reload } = useClientDetail();

  if (error) return <DetailError message={error} onRetry={reload} />;
  if (!client) return null;

  const docs = (client.documents ?? []).filter((d) => /cotiz|quote|propuesta/i.test(d.type));

  return (
    <DetailSection title="Cotizaciones y documentos comerciales">
      {docs.length === 0 ? (
        <EmptyState
          icon="📝"
          title="Sin cotizaciones archivadas"
          description="Sube PDFs comerciales desde el módulo de clientes o vincula oportunidades."
          action={
            <Link href="/crm/quotes" style={{ color: "var(--primary)", fontWeight: 600, fontSize: 13 }}>
              Ir a cotizaciones →
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
                  {d.type} · v{d.version} · {formatDateTime(d.createdAt)}
                </div>
              </div>
              <a
                href={buildApiUrl(d.fileUrl.replace(/^\//, ""))}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 13, fontWeight: 600, color: "var(--primary)" }}
              >
                PDF
              </a>
            </li>
          ))}
        </ul>
      )}
    </DetailSection>
  );
}
