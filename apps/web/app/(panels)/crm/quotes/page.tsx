"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { getCrmSalesSectionConfig } from "@/lib/section-views";
import { formatQuoteStatus, listSalesQuotes, type SalesQuote } from "@/lib/sales-api";

export default function QuotesPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getCrmSalesSectionConfig(user, "quotes"), [user]);
  const token = user?.token ?? "";
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");

  const [items, setItems] = useState<SalesQuote[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      setItems(await listSalesQuotes(token));
    } catch {
      /* skip */
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    let rows = items;
    if (highlightId) {
      const id = Number(highlightId);
      if (!Number.isNaN(id)) {
        rows = [...rows].sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : 0));
      }
    }
    return rows;
  }, [items, highlightId]);

  const total = visible.reduce((s, q) => s + Number(q.total ?? 0), 0);
  const firmadas = visible.filter((q) => q.status === "APPROVED").reduce((s, q) => s + Number(q.total ?? 0), 0);
  const pendientes = visible.filter((q) => ["DRAFT", "SENT"].includes(q.status ?? "")).length;

  const estadoVariant = (status?: string): "accent" | "warning" | "neutral" | "danger" =>
    status === "APPROVED" ? "neutral" : status === "SENT" ? "accent" : "warning";

  const columns: Column<SalesQuote>[] = [
    {
      key: "quoteNumber",
      label: "Folio",
      render: (q) => (
        <Link href={`/crm/quotes/${q.id}`} style={{ fontSize: 11.5, color: "var(--primary)", fontWeight: 600, textDecoration: "none" }}>
          <code>{q.quoteNumber ?? `COT-${q.id}`}</code>
        </Link>
      ),
      width: 120,
    },
    {
      key: "clientName",
      label: "Cliente / Proyecto",
      render: (q) => (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{q.clientCompany ?? q.clientName ?? "—"}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{q.projectName?.slice(0, 50)}</div>
        </div>
      ),
    },
    { key: "total", label: "Monto", render: (q) => <Money value={Number(q.total ?? 0)} />, width: 120 },
    { key: "status", label: "Estado", render: (q) => <Tag variant={estadoVariant(q.status)}>{formatQuoteStatus(q.status)}</Tag>, width: 100 },
    {
      key: "issueDate",
      label: "Emitida",
      accessor: (q) => (q.issueDate ? new Date(q.issueDate).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) : "—"),
      width: 90,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="CRM · Ventas"
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={<Button variant="ghost" onClick={load}>Actualizar</Button>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 20 }}>
        <KpiCard label="Total cotizado" value={`$${(total / 1000000).toFixed(1)}M`} />
        <KpiCard label="Firmado / ganado" value={`$${(firmadas / 1000000).toFixed(1)}M`} />
        <KpiCard label="Pendientes" value={pendientes} />
      </div>

      <Section title={loading ? "Cargando…" : `${visible.length} cotizaciones`}>
        {highlightId && (
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
            Mostrando cotización <strong>#{highlightId}</strong> desde enlace directo.
          </p>
        )}
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
        ) : (
          <DataTable
            columns={columns}
            rows={visible}
            rowKey={(q) => q.id}
            emptyTitle="Sin cotizaciones"
            emptyDescription="Las cotizaciones se generan desde una oportunidad."
          />
        )}
      </Section>
    </>
  );
}
