"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";
import { buildApiUrl } from "@/lib/api-base";
import EmptyState from "@/components/ui/EmptyState";
import { DetailError, DetailSection } from "@/components/detail/DetailFrame";
import { useClientDetail } from "@/components/crm/ClientDetailShell";
import { useUser } from "@/components/UserContext";
import { listSalesQuotes, type SalesQuote } from "@/lib/sales-api";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador", SENT: "Enviada", APPROVED: "Aprobada",
  REJECTED: "Rechazada", EXPIRED: "Vencida",
};
const STATUS_VARIANT: Record<string, "positive" | "accent" | "warning" | "danger" | "neutral"> = {
  DRAFT: "neutral", SENT: "accent", APPROVED: "positive",
  REJECTED: "danger", EXPIRED: "warning",
};

export default function ClientQuotesPage() {
  const { client, error: clientError, reload: reloadClient } = useClientDetail();
  const { user } = useUser();
  const token = user?.token ?? "";

  const [quotes, setQuotes] = useState<SalesQuote[]>([]);
  const [loading, setLoading] = useState(false);
  const [qError, setQError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !client) return;
    setLoading(true);
    setQError(null);
    try {
      const data = await listSalesQuotes(token, { clientName: client.name });
      setQuotes(data);
    } catch (e) {
      setQError(e instanceof Error ? e.message : "Error al cargar cotizaciones");
    } finally {
      setLoading(false);
    }
  }, [token, client]);

  useEffect(() => { void load(); }, [load]);

  if (clientError) return <DetailError message={clientError} onRetry={reloadClient} />;
  if (!client) return null;

  const pdfDocs = (client.documents ?? []).filter((d) => /cotiz|quote|propuesta/i.test(d.type));

  return (
    <>
      <DetailSection title="Cotizaciones CRM">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
            {quotes.length} cotización{quotes.length !== 1 ? "es" : ""}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="ghost" size="sm" onClick={() => void load()}>Actualizar</Button>
            <Link href="/crm/quotes?new=1" style={{ textDecoration: "none" }}>
              <Button variant="primary" size="sm" iconLeft="+">Nueva cotización</Button>
            </Link>
          </div>
        </div>

        {loading && <EmptyState icon="⏳" title="Cargando cotizaciones…" description="" />}
        {!loading && qError && (
          <EmptyState icon="⚠️" title="No se pudieron cargar" description={qError}
            action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />
        )}
        {!loading && !qError && quotes.length === 0 && (
          <EmptyState icon="📝" title="Sin cotizaciones"
            description="Crea una cotización para este cliente desde la sección de Cotizaciones."
            action={
              <Link href="/crm/quotes?new=1" style={{ textDecoration: "none" }}>
                <Button size="sm" variant="primary">Nueva cotización</Button>
              </Link>
            }
          />
        )}
        {!loading && !qError && quotes.length > 0 && (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
            {quotes.map((q) => (
              <li key={q.id} style={{ padding: "12px 14px", border: "1px solid var(--border)", borderRadius: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                      <Tag variant="accent" size="sm">{q.quoteNumber}</Tag>
                      {q.projectName ?? "—"}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3 }}>
                      {new Date(q.issueDate).toLocaleDateString("es-MX")} · ${Number(q.total).toLocaleString("es-MX")} MXN
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Tag variant={STATUS_VARIANT[q.status] ?? "neutral"}>
                      {STATUS_LABEL[q.status] ?? q.status}
                    </Tag>
                    <Link href={`/crm/quotes/${q.id}`} style={{ fontSize: 12.5, fontWeight: 600, color: "var(--primary)", textDecoration: "none" }}>
                      Ver →
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DetailSection>

      {pdfDocs.length > 0 && (
        <DetailSection title="PDFs adjuntos">
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
            {pdfDocs.map((d) => (
              <li key={d.id} style={{ padding: "12px 14px", border: "1px solid var(--border)", borderRadius: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{d.fileName || d.type}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginTop: 2 }}>
                    {d.type} · v{d.version} · {new Date(d.createdAt).toLocaleDateString("es-MX")}
                  </div>
                </div>
                <a href={buildApiUrl(d.fileUrl.replace(/^\//, ""))} target="_blank" rel="noreferrer"
                  style={{ fontSize: 13, fontWeight: 600, color: "var(--primary)" }}>
                  PDF
                </a>
              </li>
            ))}
          </ul>
        </DetailSection>
      )}
    </>
  );
}
