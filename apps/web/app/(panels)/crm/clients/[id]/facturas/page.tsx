"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { buildApiUrl } from "@/lib/api-base";
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import { Tag } from "@/components/ui/DataTable";
import { DetailError, DetailSection, formatDate } from "@/components/detail/DetailFrame";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToCsv } from "@/lib/export-csv";
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
  const [searchQ, setSearchQ] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const visibleInvoices = useMemo(() => {
    let rows = invoices;
    if (filterStatus) rows = rows.filter((inv) => inv.status === filterStatus);
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      rows = rows.filter((inv) =>
        inv.invoiceNumber.toLowerCase().includes(q) ||
        (inv.cfdiUuid ?? "").toLowerCase().includes(q) ||
        (inv.salesProjectOrder?.project?.name ?? "").toLowerCase().includes(q)
      );
    }
    return rows;
  }, [invoices, searchQ, filterStatus]);

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

  const totalFacturado = invoices.reduce((s, inv) => s + Number(inv.totalAmount ?? 0), 0);
  const pagadas = invoices.filter((inv) => inv.status === "PAID" || inv.status === "SENT").length;

  return (
    <>
      {!loading && invoices.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 14 }}>
          <KpiCard label="Total facturas" value={invoices.length} icon="📄" />
          <KpiCard label="Pagadas" value={pagadas} variant={pagadas === invoices.length ? "positive" : "accent"} icon="✅" />
          <KpiCard label="Total facturado" value={money(totalFacturado)} variant="accent" icon="💰" />
          <KpiCard label="Tasa de cobro" value={`${invoices.length > 0 ? Math.round((pagadas / invoices.length) * 100) : 0}%`} variant={pagadas === invoices.length ? "positive" : "warning"} icon="📊" />
        </div>
      )}
      {!loading && invoices.length > 0 && (() => {
        const byStatus: Record<string, number> = {};
        for (const inv of invoices) byStatus[inv.status] = (byStatus[inv.status] ?? 0) + 1;
        const total = invoices.length;
        const statusColors: Record<string, string> = { PAID: "var(--success)", SENT: "var(--primary)", DRAFT: "var(--warning)", CANCELLED: "var(--danger)" };
        const statusLabels: Record<string, string> = { PAID: "Pagada", SENT: "Enviada", DRAFT: "Borrador", CANCELLED: "Cancelada" };
        return (
          <div style={{ marginBottom: 14, padding: "12px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Distribución por estado</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {Object.entries(byStatus).sort((a, b) => b[1] - a[1]).map(([s, count]) => (
                <div key={s} style={{ display: "grid", gridTemplateColumns: "90px 1fr 36px", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>{statusLabels[s] ?? s}</span>
                  <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(count / total) * 100}%`, background: statusColors[s] ?? "var(--primary)", borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "right" }}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
      <DetailSection title="Facturas CFDI (contabilidad)">
        {loadErr && <p style={{ color: "var(--danger)", fontSize: 13 }}>{loadErr}</p>}
        {loading && invoices.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>Cargando facturas…</p>
        ) : invoices.length > 0 ? (
          <>
            <FilterToolbar
              search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar por número, UUID o proyecto…" }}
              selects={[{
                label: "Estado",
                value: filterStatus,
                onChange: setFilterStatus,
                options: [
                  { value: "PAID", label: "Pagada" },
                  { value: "SENT", label: "Enviada" },
                  { value: "DRAFT", label: "Borrador" },
                  { value: "CANCELLED", label: "Cancelada" },
                ],
                allowAll: true,
              }]}
              onClear={() => { setSearchQ(""); setFilterStatus(""); }}
              resultCount={visibleInvoices.length}
              rightActions={
                <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToCsv(visibleInvoices, [
                  { key: "invoiceNumber", label: "Número" },
                  { key: "status", label: "Estado" },
                  { key: "totalAmount", label: "Total" },
                  { key: "currency", label: "Moneda" },
                  { key: "issueDate", label: "Fecha", format: (v) => v ? new Date(String(v)).toLocaleDateString("es-MX") : "" },
                  { key: "cfdiUuid", label: "UUID" },
                ], "facturas-cliente")}>CSV</Button>
              }
            />
            {visibleInvoices.length === 0 ? (
              <EmptyState icon="🔍" title="Sin resultados" description="Ajusta los filtros." />
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
                {visibleInvoices.map((inv) => (
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
          </>
        ) : (
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
