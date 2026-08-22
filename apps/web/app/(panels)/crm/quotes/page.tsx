"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { getCrmSalesSectionConfig } from "@/lib/section-views";
import { listSalesQuotes, type SalesQuote } from "@/lib/sales-api";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToExcel } from "@/lib/export-excel";
import { buildApiUrl } from "@/lib/api-base";
import { smartQuoteCtStatus } from "@/lib/smart-quote-api";
import styles from "./quotes.module.css";

const toDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getCurrentMonthPeriod = () => {
  const today = new Date();
  return {
    from: toDateInput(new Date(today.getFullYear(), today.getMonth(), 1)),
    to: toDateInput(today),
  };
};

function formatStatus(s: string) {
  const m: Record<string, string> = {
    DRAFT: "Borrador",
    SENT: "Enviada",
    APPROVED: "Aprobada",
    REJECTED: "Rechazada",
    EXPIRED: "Vencida",
  };
  return m[s] ?? s;
}

export default function QuotesPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getCrmSalesSectionConfig(user, "quotes"), [user]);
  const token = user?.token ?? "";
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");

  const [items, setItems] = useState<SalesQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pdfBusyId, setPdfBusyId] = useState<number | null>(null);
  const [pdfErr, setPdfErr] = useState<string | null>(null);
  const [ctStatus, setCtStatus] = useState<{
    total: number;
    lastSync: { finishedAt?: string } | null;
  } | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setLoadError(null);
    try {
      setItems(await listSalesQuotes(token));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "No se pudieron cargar las cotizaciones");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const currentMonth = getCurrentMonthPeriod();
    setPeriodFrom(currentMonth.from);
    setPeriodTo(currentMonth.to);
  }, []);

  useEffect(() => {
    if (!token) return;
    smartQuoteCtStatus(token)
      .then((s) => setCtStatus({ total: s.total, lastSync: s.lastSync }))
      .catch(() => setCtStatus(null));
  }, [token]);

  const periodItems = useMemo(
    () =>
      items.filter((quote) => {
        const issueDay = String(quote.issueDate ?? "").slice(0, 10);
        if (periodFrom && issueDay < periodFrom) return false;
        if (periodTo && issueDay > periodTo) return false;
        return true;
      }),
    [items, periodFrom, periodTo],
  );

  const highlighted = useMemo(() => {
    let rows = periodItems;
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      rows = rows.filter(
        (qt) =>
          (qt.quoteNumber ?? "").toLowerCase().includes(q) ||
          (qt.clientCompany ?? "").toLowerCase().includes(q) ||
          (qt.clientName ?? "").toLowerCase().includes(q) ||
          (qt.projectName ?? "").toLowerCase().includes(q),
      );
    }
    if (filterStatus) rows = rows.filter((qt) => qt.status === filterStatus);
    if (highlightId) {
      const id = Number(highlightId);
      rows = [...rows].sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : 0));
    }
    return rows;
  }, [periodItems, highlightId, searchQ, filterStatus]);

  const downloadQuotePdf = async (q: SalesQuote) => {
    if (!token || pdfBusyId !== null) return;
    setPdfBusyId(q.id);
    setPdfErr(null);
    try {
      const res = await fetch(buildApiUrl(`cotizaciones/${q.id}/pdf`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cotizacion-${q.quoteNumber ?? q.id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setPdfErr(
        `No se pudo descargar el PDF de ${q.quoteNumber}: ${e instanceof Error ? e.message : "error desconocido"}`,
      );
    } finally {
      setPdfBusyId(null);
    }
  };

  const exportQuotesExcel = () => {
    if (periodItems.length === 0) return;
    const formatPeriodDay = (value: string) =>
      new Date(`${value}T12:00:00`).toLocaleDateString("es-MX", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    const periodo =
      periodFrom && periodTo
        ? `Periodo: ${formatPeriodDay(periodFrom)} — ${formatPeriodDay(periodTo)}`
        : undefined;

    const aprobadas = periodItems.filter((q) => q.status === "APPROVED");
    const valorTotal = periodItems.reduce((s, q) => s + Number(q.total ?? 0), 0);
    const valorAprobado = aprobadas.reduce((s, q) => s + Number(q.total ?? 0), 0);
    const countBy = (s: string) => periodItems.filter((q) => q.status === s).length;

    exportToExcel(
      periodItems,
      [
        { key: "quoteNumber", label: "Folio" },
        {
          key: "issueDate",
          label: "Emisión",
          format: (v) => (v ? String(v).slice(0, 10) : ""),
        },
        { key: "clientCompany", label: "Cliente" },
        { key: "clientName", label: "Contacto" },
        { key: "projectName", label: "Proyecto" },
        { key: "total", label: "Total" },
        { key: "status", label: "Estado", format: (v) => formatStatus(String(v ?? "")) },
        {
          key: "validUntil",
          label: "Vigencia",
          format: (v) => (v ? String(v).slice(0, 10) : ""),
        },
      ],
      `cotizaciones-${new Date().toISOString().slice(0, 10)}`,
      {
        title: "RESUMEN DE COTIZACIONES",
        subtitle: periodo,
        summaryRows: [
          { label: "Cotizaciones en el periodo", value: periodItems.length },
          { label: "Borrador", value: countBy("DRAFT") },
          { label: "Enviadas", value: countBy("SENT") },
          { label: "Aprobadas", value: aprobadas.length },
          { label: "Rechazadas", value: countBy("REJECTED") },
          { label: "Valor total cotizado", value: valorTotal },
          { label: "Valor aprobado", value: valorAprobado },
          {
            label: "Tasa de aprobación",
            value: `${Math.round((aprobadas.length / periodItems.length) * 100)}%`,
          },
        ],
      },
    );
  };

  const columns: Column<SalesQuote>[] = [
    {
      key: "quoteNumber",
      label: "Cotización",
      render: (q) => (
        <div>
          <Link
            href={`/crm/quotes/${q.id}`}
            style={{ fontWeight: 700, fontSize: 13, color: "var(--primary)", textDecoration: "none" }}
          >
            {q.quoteNumber}
          </Link>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
            {new Date(q.issueDate).toLocaleDateString("es-MX", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </div>
        </div>
      ),
    },
    {
      key: "clientCompany",
      label: "Cliente",
      render: (q) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{q.clientCompany ?? "—"}</div>
          {q.clientName && (
            <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{q.clientName}</div>
          )}
        </div>
      ),
    },
    {
      key: "projectName",
      label: "Proyecto",
      render: (q) => q.projectName ?? "—",
      width: 160,
    },
    {
      key: "total",
      label: "Total",
      align: "right",
      render: (q) => <Money value={Number(q.total)} />,
      width: 110,
    },
    {
      key: "validUntil",
      label: "Vigencia",
      render: (q) => {
        if (!q.validUntil) return <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>—</span>;
        const daysLeft = Math.ceil((new Date(q.validUntil).getTime() - Date.now()) / 86400000);
        const isActive = q.status !== "APPROVED" && q.status !== "REJECTED";
        if (!isActive) {
          return (
            <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
              {new Date(q.validUntil).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}
            </span>
          );
        }
        const color =
          daysLeft < 0
            ? "var(--danger)"
            : daysLeft <= 5
              ? "var(--danger)"
              : daysLeft <= 14
                ? "var(--warning)"
                : "var(--text-secondary)";
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 12, color }}>
              {new Date(q.validUntil).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}
            </span>
            <span style={{ fontSize: 10.5, fontWeight: 700, color }}>
              {daysLeft < 0 ? "EXPIRADA" : `${daysLeft}d`}
            </span>
          </div>
        );
      },
      width: 90,
    },
    {
      key: "status",
      label: "Estado",
      render: (q) => {
        const s = q.status;
        const v =
          s === "APPROVED"
            ? "positive"
            : s === "REJECTED" || s === "EXPIRED"
              ? "danger"
              : s === "SENT"
                ? "accent"
                : "neutral";
        return <Tag variant={v}>{formatStatus(s)}</Tag>;
      },
      width: 100,
    },
    {
      key: "id",
      label: "Acciones",
      align: "center",
      render: (q) => (
        <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
          <Link href={`/crm/quotes/${q.id}`}>
            <Button variant="ghost" size="sm">
              Ver
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            iconLeft="📄"
            loading={pdfBusyId === q.id}
            disabled={pdfBusyId !== null && pdfBusyId !== q.id}
            onClick={() => void downloadQuotePdf(q)}
            title={`Descargar PDF de ${q.quoteNumber}`}
          >
            PDF
          </Button>
        </div>
      ),
      width: 140,
    },
  ];

  const syncLabel = ctStatus?.lastSync?.finishedAt
    ? `CT ${ctStatus.total.toLocaleString("es-MX")} SKUs · sync ${new Date(
        ctStatus.lastSync.finishedAt,
      ).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`
    : ctStatus
      ? `CT ${ctStatus.total.toLocaleString("es-MX")} SKUs`
      : null;

  return (
    <>
      <PageHeader
        eyebrow="CRM · Ventas"
        title={cfg.title}
        subtitle="Arma propuestas rápidas con el mayorista o una cotización formal completa."
        actions={
          <>
            <Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>
              Actualizar
            </Button>
            {cfg.canCreate && (
              <>
                <Link href="/crm/quotes/new">
                  <Button variant="secondary" iconLeft="📝">
                    Formulario completo
                  </Button>
                </Link>
                <Link href="/crm/quotes/builder">
                  <Button variant="primary" iconLeft="⚡">
                    Cotizar en minutos
                  </Button>
                </Link>
              </>
            )}
          </>
        }
      />

      {cfg.canCreate && (
        <div className={styles.quotesHero}>
          <Link href="/crm/quotes/builder" className={`${styles.quotesPathCard} ${styles.quotesPathCardPrimary}`}>
            <div className={styles.quotesPathEyebrow}>Recomendado</div>
            <div className={styles.quotesPathTitle}>Cotizar en minutos</div>
            <p className={styles.quotesPathText}>
              Busca en CT Online, compara precio/stock/margen y arma la cotización guiada con mano de obra.
            </p>
            <span className={styles.quotesPathCta}>Empezar ahora →</span>
          </Link>
          <Link href="/crm/quotes/new" className={styles.quotesPathCard}>
            <div className={styles.quotesPathEyebrow}>Formal</div>
            <div className={styles.quotesPathTitle}>Formulario completo</div>
            <p className={styles.quotesPathText}>
              Condiciones comerciales, alcance, anticipo, catálogo Nexara y partidas con mano de obra.
            </p>
            <span className={styles.quotesPathCta}>Abrir formulario →</span>
          </Link>
        </div>
      )}

      {syncLabel && (
        <div style={{ marginBottom: 14 }}>
          <span className={`${styles.quotesStatusChip} ${styles.quotesCtChipOk}`}>{syncLabel}</span>
        </div>
      )}

      {!loading && periodItems.length > 0 && (() => {
        const aprobadas = periodItems.filter((q) => q.status === "APPROVED");
        const valorAprobado = aprobadas.reduce((s, q) => s + Number(q.total ?? 0), 0);
        const valorTotal = periodItems.reduce((s, q) => s + Number(q.total ?? 0), 0);
        const tasaAprobacion = Math.round((aprobadas.length / periodItems.length) * 100);
        const byStatus = [
          {
            label: "Borrador",
            count: periodItems.filter((q) => q.status === "DRAFT").length,
            color: "var(--text-tertiary)",
          },
          {
            label: "Enviada",
            count: periodItems.filter((q) => q.status === "SENT").length,
            color: "var(--primary)",
          },
          { label: "Aprobada", count: aprobadas.length, color: "var(--success)" },
          {
            label: "Rechazada",
            count: periodItems.filter((q) => q.status === "REJECTED").length,
            color: "var(--danger)",
          },
        ].filter((x) => x.count > 0);
        return (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                gap: 12,
                marginBottom: 14,
              }}
            >
              <KpiCard label="Total" value={periodItems.length} icon="📋" />
              <KpiCard
                label="Aprobadas"
                value={aprobadas.length}
                variant="positive"
                icon="✅"
                hint={`${tasaAprobacion}% aprobación`}
              />
              <KpiCard
                label="Valor aprobado"
                value={<Money value={valorAprobado} compact />}
                variant="positive"
                icon="💰"
                hint={`de ${new Intl.NumberFormat("es-MX", {
                  style: "currency",
                  currency: "MXN",
                  notation: "compact",
                }).format(valorTotal)} total`}
              />
              <KpiCard
                label="Rechazadas"
                value={periodItems.filter((q) => q.status === "REJECTED").length}
                variant="danger"
                icon="❌"
              />
            </div>
            {byStatus.length > 0 && (
              <div
                style={{
                  marginBottom: 16,
                  padding: "12px 16px",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--text-tertiary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: 10,
                  }}
                >
                  Estado de cotizaciones
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {byStatus.map(({ label, count, color }) => (
                    <div
                      key={label}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "90px 1fr 36px",
                        gap: 10,
                        alignItems: "center",
                      }}
                    >
                      <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>
                        {label}
                      </span>
                      <div
                        style={{
                          height: 6,
                          borderRadius: 3,
                          background: "var(--surface)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${(count / periodItems.length) * 100}%`,
                            background: color,
                            borderRadius: 3,
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "right" }}>
                        {count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        );
      })()}

      <FilterToolbar
        search={{
          value: searchQ,
          onChange: setSearchQ,
          placeholder: "Buscar por folio, cliente o proyecto…",
        }}
        dates={[
          { label: "Desde", value: periodFrom, onChange: setPeriodFrom },
          { label: "Hasta", value: periodTo, onChange: setPeriodTo },
        ]}
        selects={[
          {
            label: "Estado",
            value: filterStatus,
            onChange: setFilterStatus,
            options: [
              { value: "DRAFT", label: "Borrador" },
              { value: "SENT", label: "Enviada" },
              { value: "APPROVED", label: "Aprobada" },
              { value: "REJECTED", label: "Rechazada" },
              { value: "EXPIRED", label: "Vencida" },
            ],
            allowAll: true,
          },
        ]}
        onClear={() => {
          const currentMonth = getCurrentMonthPeriod();
          setSearchQ("");
          setFilterStatus("");
          setPeriodFrom(currentMonth.from);
          setPeriodTo(currentMonth.to);
        }}
        resultCount={loading ? null : highlighted.length}
        rightActions={
          periodItems.length > 0 ? (
            <Button variant="ghost" size="sm" iconLeft="⬇" onClick={exportQuotesExcel}>
              Excel
            </Button>
          ) : undefined
        }
      />

      {pdfErr && (
        <p
          style={{
            margin: "10px 0",
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid var(--danger)",
            color: "var(--danger)",
            fontSize: 12,
          }}
        >
          {pdfErr}
        </p>
      )}

      <Section
        title={loading ? "Cargando…" : `${highlighted.length} cotización${highlighted.length === 1 ? "" : "es"}`}
      >
        {loading && (
          <EmptyState icon="⏳" title="Cargando cotizaciones…" description="Consultando documentos." />
        )}
        {!loading && loadError && (
          <EmptyState
            icon="⚠️"
            title="No se pudo cargar"
            description={loadError}
            action={
              <Button size="sm" variant="secondary" onClick={() => void load()}>
                Reintentar
              </Button>
            }
          />
        )}
        {!loading && !loadError && highlighted.length === 0 && (
          <div className={styles.quotesEmptyBoost}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Aún no hay cotizaciones</div>
              <p style={{ margin: 0, fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.45 }}>
                Empieza por la ruta rápida con catálogo CT, o abre el formulario completo si ya tienes el
                alcance cerrado.
              </p>
            </div>
            {cfg.canCreate && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Link href="/crm/quotes/builder">
                  <Button variant="primary" iconLeft="⚡">
                    Cotizar en minutos
                  </Button>
                </Link>
                <Link href="/crm/quotes/new">
                  <Button variant="secondary" iconLeft="📝">
                    Formulario completo
                  </Button>
                </Link>
              </div>
            )}
          </div>
        )}
        {!loading && !loadError && highlighted.length > 0 && (
          <DataTable columns={columns} rows={highlighted} rowKey={(q) => q.id} />
        )}
      </Section>
    </>
  );
}
