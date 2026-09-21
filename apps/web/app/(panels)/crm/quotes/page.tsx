"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import MetricStrip, { type Metric } from "@/components/ui/MetricStrip";
import StatusDot, { type StatusTone } from "@/components/ui/StatusDot";
import InlineAlert from "@/components/ui/InlineAlert";
import DataTable, { Money, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { getCrmSalesSectionConfig } from "@/lib/section-views";
import { listSalesQuotes, type SalesQuote } from "@/lib/sales-api";
import { formatApiError } from "@/lib/erp-api";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToExcel } from "@/lib/export-excel";
import { buildApiUrl } from "@/lib/api-base";
import { smartQuoteCtStatus } from "@/lib/smart-quote-api";
import SupplierStatsBar from "./components/SupplierStatsBar";

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

/**
 * Tono del estado: `neutral` para lo que solo avanza en el flujo, color solo
 * cuando el renglón pide algo o ya salió mal (contrato, regla 3).
 */
function statusTone(s: string): StatusTone {
  if (s === "APPROVED") return "success";
  if (s === "REJECTED" || s === "EXPIRED") return "danger";
  return "neutral";
}

const pesos = (n: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(n);

const shortDay = (value: string) =>
  new Date(value).toLocaleDateString("es-MX", { day: "2-digit", month: "short" });

/**
 * A 375px una tabla de siete columnas se va de ancho y obliga a arrastrar en
 * horizontal para leer un total. Por debajo de 720px el renglón se colapsa a
 * dos columnas y el contexto baja bajo el folio (contrato, regla 2).
 */
function useIsNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(max-width: 720px)");
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return narrow;
}

export default function QuotesPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getCrmSalesSectionConfig(user, "quotes"), [user]);
  const token = user?.token ?? "";
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");
  const narrow = useIsNarrow();

  useEffect(() => {
    if (searchParams.get("new") === "1" && cfg.canCreate) {
      router.replace("/crm/quotes/builder");
    }
  }, [searchParams, cfg.canCreate, router]);

  const [items, setItems] = useState<SalesQuote[]>([]);
  /** Solo la primera carga deja la pantalla en blanco. */
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const loadedOnce = useRef(false);
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
    if (loadedOnce.current) setRefreshing(true);
    else setLoading(true);
    setLoadError(null);
    try {
      setItems(await listSalesQuotes(token));
      loadedOnce.current = true;
    } catch (e) {
      // Un fallo al refrescar no borra lo que ya está en pantalla: la lista
      // anterior sigue siendo cierta hasta que llegue una nueva.
      setLoadError(formatApiError(e, "No se pudieron cargar las cotizaciones"));
    } finally {
      setLoading(false);
      setRefreshing(false);
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
      setPdfErr(`No se pudo descargar el PDF de ${q.quoteNumber}. ${formatApiError(e)}`);
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

  /** Una celda de la tira filtra en el sitio; volver a pulsarla lo deshace. */
  const toggleStatus = (status: string) =>
    setFilterStatus((current) => (current === status ? "" : status));

  const metrics = useMemo<Metric[]>(() => {
    const countBy = (s: string) => periodItems.filter((q) => q.status === s).length;
    const aprobadas = periodItems.filter((q) => q.status === "APPROVED");
    const valorAprobado = aprobadas.reduce((s, q) => s + Number(q.total ?? 0), 0);
    const valorTotal = periodItems.reduce((s, q) => s + Number(q.total ?? 0), 0);
    const enviadas = countBy("SENT");
    const rechazadas = countBy("REJECTED");
    const borradores = countBy("DRAFT");
    const tasa = periodItems.length > 0 ? Math.round((aprobadas.length / periodItems.length) * 100) : 0;

    return [
      {
        label: "cotizaciones",
        value: periodItems.length,
        hint: borradores > 0 ? `${borradores} sin salir de borrador` : "ninguna en borrador",
      },
      {
        label: "enviadas",
        value: enviadas,
        hint: enviadas > 0 ? "esperan respuesta del cliente" : "nada pendiente de respuesta",
        tone: enviadas > 0 ? "warning" : "default",
        onClick: () => toggleStatus("SENT"),
      },
      {
        label: "aprobadas",
        value: aprobadas.length,
        hint: `${tasa}% de las del periodo`,
        tone: aprobadas.length > 0 ? "success" : "default",
        onClick: () => toggleStatus("APPROVED"),
      },
      {
        label: "rechazadas",
        value: rechazadas,
        hint: rechazadas > 0 ? "el cliente dijo que no" : "ninguna rechazada",
        tone: rechazadas > 0 ? "danger" : "default",
        onClick: () => toggleStatus("REJECTED"),
      },
      {
        label: "valor aprobado",
        value: pesos(valorAprobado),
        hint: `de ${pesos(valorTotal)} cotizado`,
        tone: valorAprobado > 0 ? "success" : "default",
      },
    ];
  }, [periodItems]);

  const pdfButton = (q: SalesQuote) => (
    <Button
      variant="ghost"
      size="sm"
      loading={pdfBusyId === q.id}
      disabled={pdfBusyId !== null && pdfBusyId !== q.id}
      onClick={() => void downloadQuotePdf(q)}
      title={`Descargar PDF de ${q.quoteNumber}`}
    >
      PDF
    </Button>
  );

  /** Vigencia: solo grita cuando queda poco y la cotización sigue viva. */
  const vigencia = (q: SalesQuote) => {
    if (!q.validUntil) return null;
    const isActive = q.status !== "APPROVED" && q.status !== "REJECTED";
    const daysLeft = Math.ceil((new Date(q.validUntil).getTime() - Date.now()) / 86400000);
    if (!isActive) {
      return (
        <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
          vence {shortDay(q.validUntil)}
        </span>
      );
    }
    const color =
      daysLeft < 0
        ? "var(--state-danger-text)"
        : daysLeft <= 5
          ? "var(--state-danger-text)"
          : daysLeft <= 14
            ? "var(--state-warning-text)"
            : "var(--text-tertiary)";
    return (
      <span style={{ fontSize: 11.5, color }}>
        {daysLeft < 0 ? `venció ${shortDay(q.validUntil)}` : `vence ${shortDay(q.validUntil)} · ${daysLeft}d`}
      </span>
    );
  };

  const quoteCell = (q: SalesQuote, withStatus: boolean) => {
    const vence = vigencia(q);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <Link
          href={`/crm/quotes/${q.id}`}
          style={{ fontWeight: 650, fontSize: 13, color: "var(--primary)", textDecoration: "none" }}
        >
          {q.quoteNumber}
        </Link>
        <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
          {[q.clientCompany, q.clientName].filter(Boolean).join(" · ") || "Sin cliente"}
        </span>
        {q.projectName && (
          <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{q.projectName}</span>
        )}
        <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
          {shortDay(q.issueDate)}
          {vence ? " · " : ""}
          {vence}
        </span>
        {withStatus && <StatusDot label={formatStatus(q.status)} tone={statusTone(q.status)} />}
      </div>
    );
  };

  // Sin `useMemo`: las celdas cierran sobre `token` y sobre qué PDF se está
  // bajando, y una tabla memoizada se quedaba con la versión anterior.
  const columns: Column<SalesQuote>[] = (() => {
    if (narrow) {
      return [
        {
          key: "quoteNumber",
          label: "Cotización",
          render: (q) => quoteCell(q, true),
        },
        {
          key: "total",
          label: "Total",
          align: "right",
          numeric: true,
          width: 116,
          render: (q) => (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
              <Money value={Number(q.total)} />
              {pdfButton(q)}
            </div>
          ),
        },
      ];
    }

    return [
      {
        key: "quoteNumber",
        label: "Cotización",
        render: (q) => quoteCell(q, false),
      },
      {
        key: "total",
        label: "Total",
        align: "right",
        numeric: true,
        width: 120,
        render: (q) => <Money value={Number(q.total)} />,
      },
      {
        key: "status",
        label: "Estado",
        width: 120,
        render: (q) => <StatusDot label={formatStatus(q.status)} tone={statusTone(q.status)} />,
      },
      {
        key: "id",
        label: "",
        align: "right",
        width: 76,
        render: (q) => pdfButton(q),
      },
    ];
  })();

  const syncLabel = ctStatus?.lastSync?.finishedAt
    ? `Catálogo CT: ${ctStatus.total.toLocaleString("es-MX")} SKUs, al día ${new Date(
        ctStatus.lastSync.finishedAt,
      ).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`
    : ctStatus
      ? `Catálogo CT: ${ctStatus.total.toLocaleString("es-MX")} SKUs`
      : null;

  const hasFilters = Boolean(searchQ.trim() || filterStatus);
  const clearFilters = () => {
    const currentMonth = getCurrentMonthPeriod();
    setSearchQ("");
    setFilterStatus("");
    setPeriodFrom(currentMonth.from);
    setPeriodTo(currentMonth.to);
  };

  // Sin una sola cotización dada de alta, la tira son cinco ceros encima de un
  // «no hay nada»: le quita el sitio a lo único que ayuda ahí, que es decir de
  // dónde sale la primera. Un periodo que sí cerró en cero SÍ se enseña, porque
  // eso es información (contrato, regla 7).
  const hasAnyQuote = items.length > 0;

  return (
    <>
      <PageHeader
        eyebrow="CRM · Ventas"
        title={cfg.title}
        density="ops"
        meta={
          syncLabel ? (
            <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{syncLabel}</span>
          ) : undefined
        }
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading || refreshing}>
              {refreshing ? "Actualizando…" : "Actualizar"}
            </Button>
            {cfg.canCreate && hasAnyQuote && (
              <>
                <Link href="/crm/quotes/new">
                  <Button size="sm" variant="secondary">
                    Formulario completo
                  </Button>
                </Link>
                <Link href="/crm/quotes/builder">
                  <Button size="sm" variant="primary">
                    Cotizar en minutos
                  </Button>
                </Link>
              </>
            )}
          </>
        }
      />

      {loadError && (
        <InlineAlert
          message={
            hasAnyQuote
              ? `No se pudo actualizar la lista, sigues viendo la última carga. ${loadError}`
              : loadError
          }
          onDismiss={() => setLoadError(null)}
          action={
            <Button size="sm" variant="secondary" onClick={() => void load()}>
              Reintentar
            </Button>
          }
        />
      )}

      {pdfErr && <InlineAlert message={pdfErr} onDismiss={() => setPdfErr(null)} />}

      {!loading && hasAnyQuote && (
        <div style={{ marginBottom: 14 }}>
          <MetricStrip metrics={metrics} ariaLabel="Resumen del periodo" />
        </div>
      )}

      {!loading && hasAnyQuote && (
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
          onClear={clearFilters}
          resultCount={highlighted.length}
          rightActions={
            periodItems.length > 0 ? (
              <Button variant="ghost" size="sm" onClick={exportQuotesExcel}>
                Descargar Excel
              </Button>
            ) : undefined
          }
        />
      )}

      <div aria-busy={loading || refreshing}>
        {loading ? (
          <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
            {token ? "Cargando cotizaciones…" : "Esperando la sesión para pedir las cotizaciones…"}
          </p>
        ) : !hasAnyQuote ? (
          <EmptyState
            variant="page"
            title="Aún no hay cotizaciones"
            description={
              cfg.canCreate
                ? "La primera sale de aquí: busca el equipo en el catálogo CT y el sistema arma la propuesta con precio, stock y mano de obra. Si ya tienes el alcance cerrado, usa el formulario completo."
                : "Todavía nadie ha levantado una cotización en esta empresa."
            }
            action={
              cfg.canCreate ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                  <Link href="/crm/quotes/builder">
                    <Button size="sm" variant="primary">
                      Cotizar en minutos
                    </Button>
                  </Link>
                  <Link href="/crm/quotes/new">
                    <Button size="sm" variant="secondary">
                      Formulario completo
                    </Button>
                  </Link>
                </div>
              ) : undefined
            }
          />
        ) : highlighted.length === 0 ? (
          <EmptyState
            variant="compact"
            title="Ninguna coincide"
            description={
              hasFilters
                ? "Ni el texto ni el estado dan resultados en estas fechas."
                : "No se emitió ninguna cotización en el periodo elegido."
            }
            action={
              <Button size="sm" variant="secondary" onClick={clearFilters}>
                Volver al mes actual
              </Button>
            }
          />
        ) : (
          <DataTable
            columns={columns}
            rows={highlighted}
            rowKey={(q) => q.id}
            density="compact"
            ariaLabel="Cotizaciones"
          />
        )}
      </div>

      {hasAnyQuote && <SupplierStatsBar token={token} from={periodFrom} to={periodTo} />}
    </>
  );
}
