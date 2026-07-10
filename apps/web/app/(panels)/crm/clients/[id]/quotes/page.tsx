"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import { Tag } from "@/components/ui/DataTable";
import { buildApiUrl } from "@/lib/api-base";
import EmptyState from "@/components/ui/EmptyState";
import { DetailError, DetailSection } from "@/components/detail/DetailFrame";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToCsv } from "@/lib/export-csv";
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
  const [searchQ, setSearchQ] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const visibleQuotes = useMemo(() => {
    let rows = quotes;
    if (filterStatus) rows = rows.filter((q) => q.status === filterStatus);
    if (searchQ.trim()) {
      const s = searchQ.toLowerCase();
      rows = rows.filter((q) =>
        q.quoteNumber.toLowerCase().includes(s) ||
        (q.projectName ?? "").toLowerCase().includes(s)
      );
    }
    return rows;
  }, [quotes, searchQ, filterStatus]);

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

  const aprobadas = quotes.filter((q) => q.status === "APPROVED").length;
  const totalAprobado = quotes.filter((q) => q.status === "APPROVED").reduce((s, q) => s + Number(q.total ?? 0), 0);

  return (
    <>
      {!loading && quotes.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 14 }}>
          <KpiCard label="Cotizaciones" value={quotes.length} icon="📄" />
          <KpiCard label="Aprobadas" value={aprobadas} variant={aprobadas > 0 ? "positive" : "default"} icon="✅" />
          <KpiCard label="Total aprobado" value={new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", notation: "compact" }).format(totalAprobado)} variant="accent" icon="💰" />
          <KpiCard label="Tasa aprobación" value={`${quotes.length > 0 ? Math.round((aprobadas / quotes.length) * 100) : 0}%`} variant={aprobadas / Math.max(quotes.length, 1) >= 0.5 ? "positive" : "warning"} icon="📊" />
        </div>
      )}
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

        {quotes.length > 0 && (
          <FilterToolbar
            search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar por número o proyecto…" }}
            selects={[{
              label: "Estado",
              value: filterStatus,
              onChange: setFilterStatus,
              options: Object.entries(STATUS_LABEL).map(([v, l]) => ({ value: v, label: l })),
              allowAll: true,
            }]}
            onClear={() => { setSearchQ(""); setFilterStatus(""); }}
            resultCount={visibleQuotes.length}
            rightActions={
              <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToCsv(visibleQuotes, [
                { key: "quoteNumber", label: "Número" },
                { key: "projectName", label: "Proyecto" },
                { key: "status", label: "Estado", format: (v) => STATUS_LABEL[String(v)] ?? String(v) },
                { key: "total", label: "Total" },
                { key: "issueDate", label: "Fecha", format: (v) => v ? new Date(String(v)).toLocaleDateString("es-MX") : "" },
              ], "cotizaciones-cliente")}>CSV</Button>
            }
          />
        )}

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
            {visibleQuotes.length === 0 && <EmptyState icon="🔍" title="Sin resultados" description="Ajusta los filtros." />}
            {visibleQuotes.map((q) => (
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
