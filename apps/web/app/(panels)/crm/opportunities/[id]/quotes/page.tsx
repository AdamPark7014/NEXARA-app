"use client";

import Link from "next/link";
import EmptyState from "@/components/ui/EmptyState";
import { buildApiUrl } from "@/lib/api-base";
import { DetailError, DetailSection, formatDateTime } from "@/components/detail/DetailFrame";
import { useOpportunityDetail } from "@/components/crm/OpportunityDetailShell";

export default function OpportunityQuotesPage() {
  const { opportunity, error, reload } = useOpportunityDetail();

  if (error) return <DetailError message={error} onRetry={reload} />;
  if (!opportunity) return null;

  const quotes = opportunity.quotes ?? [];

  return (
    <DetailSection title="Cotizaciones vinculadas">
      {quotes.length === 0 ? (
        <EmptyState
          icon="📝"
          title="Sin cotizaciones"
          description="Adjunta una cotización desde el módulo de quotes o súbela en la pestaña de adjuntos."
          action={
            <Link href="/crm/quotes" style={{ color: "var(--primary)", fontWeight: 600, fontSize: 13 }}>
              Ir a cotizaciones →
            </Link>
          }
        />
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
          {quotes.map((q) => (
            <li
              key={q.id}
              style={{
                padding: 14,
                borderRadius: 10,
                border: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  {q.versionLabel?.trim() || `Cotización #${q.id}`}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                  {formatDateTime(q.createdAt)}
                  {q.cotizacionId ? ` · Doc #${q.cotizacionId}` : ""}
                </div>
              </div>
              {q.pdfUrl && (
                <a
                  href={buildApiUrl(q.pdfUrl.replace(/^\//, ""))}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 13, fontWeight: 600, color: "var(--primary)" }}
                >
                  Ver PDF
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </DetailSection>
  );
}
