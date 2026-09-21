"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import Button from "@/components/ui/Button";
import MetricStrip, { type Metric } from "@/components/ui/MetricStrip";
import DataTable, { Money, type Column } from "@/components/ui/DataTable";
import StatusDot, { type StatusTone } from "@/components/ui/StatusDot";
import InlineAlert from "@/components/ui/InlineAlert";
import ListExportActions from "@/components/ui/ListExportActions";
import { buildApiUrl } from "@/lib/api-base";
import EmptyState from "@/components/ui/EmptyState";
import { DetailError, DetailSection } from "@/components/detail/DetailFrame";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToExcel } from "@/lib/export-excel";
import { useClientDetail } from "@/components/crm/ClientDetailShell";
import { useUser } from "@/components/UserContext";
import { formatApiError } from "@/lib/erp-api";
import { listSalesQuotes, type SalesQuote } from "@/lib/sales-api";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador", SENT: "Enviada", APPROVED: "Aprobada",
  REJECTED: "Rechazada", EXPIRED: "Vencida",
};

/**
 * Regla 3 del contrato: punto y palabra, no pastilla rellena. Neutro para los
 * pasos normales del flujo; color solo cuando el renglón pide algo o algo
 * salió mal.
 */
const STATUS_TONE: Record<string, StatusTone> = {
  DRAFT: "neutral", SENT: "neutral", APPROVED: "success",
  REJECTED: "danger", EXPIRED: "warning",
};

/**
 * El primario de esta pantalla navega, así que tiene que ser un enlace:
 * hacerlo con un manejador rompe ctrl+clic y «abrir en pestaña nueva».
 * `Button` de `components/ui` solo renderiza `<button>` y envolverlo en
 * `<Link>` deja un `<a><button>` —HTML inválido, dos controles anunciados
 * para una sola acción—. El componente compartido no se toca: se resuelve
 * aquí con los mismos tokens de un primario de 32px.
 */
const accionPrimaria: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  height: 32,
  padding: "0 12px",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  fontFamily: "inherit",
  lineHeight: 1,
  whiteSpace: "nowrap",
  textDecoration: "none",
  background: "color-mix(in srgb, var(--primary) 85%, var(--nx-ink))",
  color: "var(--ui-fg-on-brand)",
  border: "1px solid color-mix(in srgb, var(--primary) 62%, var(--nx-ink))",
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

  const resumen = useMemo(() => {
    const porEstado: Record<string, number> = {};
    let totalAprobado = 0;
    for (const q of quotes) {
      porEstado[q.status] = (porEstado[q.status] ?? 0) + 1;
      if (q.status === "APPROVED") totalAprobado += Number(q.total ?? 0);
    }
    return { porEstado, totalAprobado };
  }, [quotes]);

  const load = useCallback(async () => {
    if (!token || !client) return;
    setLoading(true);
    setQError(null);
    try {
      const data = await listSalesQuotes(token, { clientName: client.name });
      setQuotes(data);
    } catch (e) {
      // Se avisa del fallo, pero lo que ya estaba en la tabla se queda: un
      // refresco que falla no puede dejar la pantalla peor que antes.
      setQError(formatApiError(e, "No se pudieron cargar las cotizaciones"));
    } finally {
      setLoading(false);
    }
  }, [token, client]);

  useEffect(() => { void load(); }, [load]);

  if (clientError) return <DetailError message={clientError} onRetry={reloadClient} />;
  if (!client) return null;

  const pdfDocs = (client.documents ?? []).filter((d) => /cotiz|quote|propuesta/i.test(d.type));
  const nuevaHref = `/crm/quotes/builder?clientId=${client.id}&clientName=${encodeURIComponent(client.name)}`;

  /** Regla 7: el vacío es «no hay ni un registro», no «la suma dio cero». */
  const sinRegistros = quotes.length === 0;
  const primeraCarga = loading && sinRegistros;

  const aprobadas = resumen.porEstado.APPROVED ?? 0;
  const enviadas = resumen.porEstado.SENT ?? 0;
  const vencidas = resumen.porEstado.EXPIRED ?? 0;

  const metrics: Metric[] = [
    { label: "Cotizaciones", value: quotes.length, hint: "de este cliente" },
    {
      label: "Enviadas",
      value: enviadas,
      hint: "esperando respuesta",
      onClick: () => setFilterStatus(filterStatus === "SENT" ? "" : "SENT"),
    },
    {
      label: "Aprobadas",
      value: aprobadas,
      hint: aprobadas === 1 ? "1 de las enviadas" : `${aprobadas} de ${quotes.length}`,
      onClick: () => setFilterStatus(filterStatus === "APPROVED" ? "" : "APPROVED"),
    },
    { label: "Total aprobado", value: <Money value={resumen.totalAprobado} />, hint: "suma de las aprobadas" },
  ];
  if (vencidas > 0) {
    metrics.push({
      label: "Vencidas",
      value: vencidas,
      hint: "sin respuesta, ya sin vigencia",
      tone: "warning",
      onClick: () => setFilterStatus(filterStatus === "EXPIRED" ? "" : "EXPIRED"),
    });
  }

  const quoteCols: Column<SalesQuote>[] = [
    {
      key: "quoteNumber",
      label: "Folio",
      render: (q) => (
        <Link href={`/crm/quotes/${q.id}`} style={{ fontWeight: 600, fontSize: 13, color: "var(--primary)", textDecoration: "none" }}>
          {q.quoteNumber}
        </Link>
      ),
      width: 120,
    },
    { key: "projectName", label: "Proyecto", render: (q) => q.projectName ?? "—" },
    {
      key: "status",
      label: "Estado",
      render: (q) => <StatusDot tone={STATUS_TONE[q.status] ?? "neutral"} label={STATUS_LABEL[q.status] ?? q.status} />,
      width: 110,
    },
    { key: "issueDate", label: "Emisión", render: (q) => new Date(q.issueDate).toLocaleDateString("es-MX"), width: 110, numeric: true },
    { key: "total", label: "Total", render: (q) => <Money value={Number(q.total)} />, width: 120, align: "right", numeric: true },
  ];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Regla 7: sin registros no se pinta la tira. Cuatro celdas en cero
          encima de un «Sin cotizaciones» ocupan el sitio de lo que ayuda. */}
      {!sinRegistros && <MetricStrip metrics={metrics} ariaLabel="Resumen de cotizaciones del cliente" />}

      <DetailSection title="Cotizaciones">
        {qError && (
          <InlineAlert
            variant="danger"
            message={qError}
            style={{ marginBottom: 0 }}
            action={
              <Button size="sm" variant="secondary" onClick={() => void load()}>
                Reintentar
              </Button>
            }
          />
        )}

        {/* Regla 8: buscador, selector y acciones en UNA fila, sin caja ni
            fondo propios, y el primario a la derecha de esa misma fila. */}
        {!sinRegistros && (
          <FilterToolbar
            search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar por folio o proyecto…" }}
            selects={[{
              label: "Estado",
              value: filterStatus,
              onChange: setFilterStatus,
              // El conteo por estado va en la propia opción: dice lo mismo que
              // la gráfica de barras que ocupaba una caja entera encima.
              options: Object.entries(STATUS_LABEL).map(([v, l]) => ({
                value: v,
                label: resumen.porEstado[v] ? `${l} (${resumen.porEstado[v]})` : l,
              })),
              allowAll: true,
            }]}
            onClear={() => { setSearchQ(""); setFilterStatus(""); }}
            style={{ marginBottom: 0 }}
            resultCount={primeraCarga ? null : visibleQuotes.length}
            rightActions={
              // El contenedor de `rightActions` no salta de renglón: a 375px
              // tres acciones seguidas sacarían la fila de la pantalla. El
              // salto se resuelve aquí, sin tocar el componente compartido.
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, minWidth: 0 }}>
                <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
                  {loading ? "Actualizando…" : "Actualizar"}
                </Button>
                <ListExportActions
                  excelDisabled={visibleQuotes.length === 0}
                  onExcel={() => exportToExcel(visibleQuotes, [
                    { key: "quoteNumber", label: "Número" },
                    { key: "projectName", label: "Proyecto" },
                    { key: "status", label: "Estado", format: (v) => STATUS_LABEL[String(v)] ?? String(v) },
                    { key: "total", label: "Total" },
                    { key: "issueDate", label: "Fecha", format: (v) => v ? new Date(String(v)).toLocaleDateString("es-MX") : "" },
                  ], "cotizaciones-cliente")}
                />
                <Link href={nuevaHref} style={accionPrimaria}>Nueva cotización</Link>
              </div>
            }
          />
        )}

        {primeraCarga ? (
          <p role="status" aria-live="polite" style={{ margin: 0, padding: "24px 0", textAlign: "center", fontSize: 13, color: "var(--text-secondary)" }}>
            Cargando cotizaciones…
          </p>
        ) : sinRegistros && !qError ? (
          // El vacío explica de dónde sale la primera y trae el botón que la
          // crea. Aquí vive el único primario cuando no hay nada que filtrar.
          <EmptyState
            title="Sin cotizaciones"
            description={`Las cotizaciones de ${client.name} se arman en el generador: eliges las partidas, se calcula el total y queda ligada a este cliente.`}
            action={<Link href={nuevaHref} style={accionPrimaria}>Nueva cotización</Link>}
          />
        ) : !sinRegistros ? (
          <DataTable
            columns={quoteCols}
            rows={visibleQuotes}
            rowKey={(q) => q.id}
            density="compact"
            ariaLabel="Cotizaciones del cliente"
            emptyTitle="Nada con estos filtros"
            emptyDescription="Ajusta la búsqueda o el estado."
            emptyAction={
              <Button size="sm" variant="secondary" onClick={() => { setSearchQ(""); setFilterStatus(""); }}>
                Quitar filtros
              </Button>
            }
          />
        ) : null}
      </DetailSection>

      {pdfDocs.length > 0 && (
        <DetailSection title="PDFs adjuntos">
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
            {pdfDocs.map((d) => (
              <li key={d.id} style={{ padding: "10px 14px", border: "1px solid var(--border)", borderRadius: 10, display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, overflowWrap: "anywhere" }}>{d.fileName || d.type}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginTop: 2 }}>
                    {d.type} · v{d.version} · {new Date(d.createdAt).toLocaleDateString("es-MX")}
                  </div>
                </div>
                <a
                  href={buildApiUrl(d.fileUrl.replace(/^\//, ""))}
                  target="_blank"
                  rel="noreferrer"
                  // Un enlace que se toca con el dedo necesita alto real, no
                  // solo texto: 40px es el mínimo del contrato.
                  style={{ display: "inline-flex", alignItems: "center", minHeight: 40, padding: "0 8px", fontSize: 13, fontWeight: 600, color: "var(--primary)" }}
                >
                  Abrir PDF
                </a>
              </li>
            ))}
          </ul>
        </DetailSection>
      )}
    </div>
  );
}
