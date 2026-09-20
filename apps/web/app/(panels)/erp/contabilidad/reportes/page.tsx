"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import InlineAlert from "@/components/ui/InlineAlert";
import ListExportActions from "@/components/ui/ListExportActions";
import FilterToolbar from "@/components/FilterToolbar";
import { useUser } from "@/components/UserContext";
import { formatApiError } from "@/lib/erp-api";
import {
  DetalleModal,
  FilaTotales,
  Resumen,
  columnasDesdeApi,
  descargarCsv,
  hoyIso,
  inicioDeMesIso,
  pedirJson,
  queryString,
  type FilaReporte,
  type ReporteCatalogo,
  type ResultadoReporte,
} from "@/components/erp/reportes-contabilidad";

/**
 * Reportes de contabilidad.
 *
 * El catálogo, los filtros que acepta cada reporte y las columnas del
 * resultado vienen del API (`/accounting/workspace/reportes/...`). Esta página
 * no sabe qué reportes existen: los pide.
 */
export default function ReportesPage() {
  const { user } = useUser();
  const token = user?.token ?? "";

  const [catalogo, setCatalogo] = useState<ReporteCatalogo[]>([]);
  const [cargandoCatalogo, setCargandoCatalogo] = useState(true);
  const [reporteId, setReporteId] = useState<string>("");

  const [from, setFrom] = useState(inicioDeMesIso);
  const [to, setTo] = useState(hoyIso);
  const [asOf, setAsOf] = useState(hoyIso);
  const [seleccion, setSeleccion] = useState<Record<string, string>>({});
  const [comparar, setComparar] = useState(false);

  const [resultado, setResultado] = useState<ResultadoReporte | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const [detalle, setDetalle] = useState<{ titulo: string; path: string } | null>(null);

  const reporte = useMemo(() => catalogo.find((r) => r.id === reporteId) ?? null, [catalogo, reporteId]);

  const acepta = useCallback(
    (clave: string) => Boolean(reporte?.filtros.some((f) => f.clave === clave)),
    [reporte],
  );

  /** Filtros vigentes para este reporte — solo los que declara aceptar. */
  const filtrosActivos = useMemo(() => {
    if (!reporte) return {};
    const params: Record<string, string | boolean> = {};
    for (const f of reporte.filtros) {
      if (f.clave === "from") params.from = from;
      else if (f.clave === "to") params.to = to;
      else if (f.clave === "asOf") params.asOf = asOf;
      else if (seleccion[f.clave]) params[f.clave] = seleccion[f.clave];
    }
    if (reporte.comparable && comparar) params.comparar = true;
    return params;
  }, [reporte, from, to, asOf, seleccion, comparar]);

  // ── Catálogo ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    let vivo = true;
    setCargandoCatalogo(true);
    pedirJson<{ reportes: ReporteCatalogo[] }>("accounting/workspace/reportes/catalogo", token)
      .then((data) => {
        if (!vivo) return;
        setCatalogo(data.reportes ?? []);
        setReporteId((actual) => actual || data.reportes?.[0]?.id || "");
        setError(null);
      })
      .catch((e) => {
        if (vivo) setError(formatApiError(e));
      })
      .finally(() => {
        if (vivo) setCargandoCatalogo(false);
      });
    return () => {
      vivo = false;
    };
  }, [token]);

  // ── Ejecución del reporte ────────────────────────────────────────
  const ejecutar = useCallback(async () => {
    if (!token || !reporte) return;
    setCargando(true);
    setError(null);
    try {
      const data = await pedirJson<ResultadoReporte>(
        `accounting/workspace/reportes/${reporte.id}${queryString(filtrosActivos)}`,
        token,
      );
      setResultado(data);
    } catch (e) {
      setError(formatApiError(e));
      setResultado(null);
    } finally {
      setCargando(false);
    }
  }, [token, reporte, filtrosActivos]);

  useEffect(() => {
    void ejecutar();
  }, [ejecutar]);

  const exportar = async () => {
    if (!reporte || !token) return;
    setExportando(true);
    setError(null);
    try {
      await descargarCsv(
        `accounting/workspace/reportes/${reporte.id}/export${queryString({ ...filtrosActivos, formato: "csv" })}`,
        token,
        `${reporte.id}.csv`,
      );
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setExportando(false);
    }
  };

  const abrirDetalle = (fila: FilaReporte) => {
    if (!reporte?.drilldown || !resultado) return;
    const primera = resultado.columnas[0]?.clave;
    const etiqueta = primera ? String(fila[primera] ?? fila.clave) : fila.clave;
    setDetalle({
      titulo: `${reporte.nombre} · ${etiqueta}`,
      path: `accounting/workspace/reportes/${reporte.id}/detalle${queryString({
        ...filtrosActivos,
        comparar: false,
        clave: fila.clave,
      })}`,
    });
  };

  const columnas = useMemo(
    () => (resultado ? columnasDesdeApi(resultado.columnas) : []),
    [resultado],
  );

  const selectsExtra = (reporte?.filtros ?? [])
    .filter((f) => f.tipo === "seleccion")
    .map((f) => ({
      label: f.etiqueta,
      value: seleccion[f.clave] ?? "",
      onChange: (v: string) => setSeleccion((prev) => ({ ...prev, [f.clave]: v })),
      options: (f.opciones ?? []).map((o) => ({ value: o.valor, label: o.etiqueta })),
      allLabel: `Todos · ${f.etiqueta}`,
    }));

  const fechas = [
    ...(acepta("from") ? [{ label: "Desde", value: from, onChange: setFrom }] : []),
    ...(acepta("to") ? [{ label: "Hasta", value: to, onChange: setTo }] : []),
    ...(acepta("asOf") ? [{ label: "Al corte", value: asOf, onChange: setAsOf }] : []),
  ];

  /**
   * El catálogo marca qué filtros son obligatorios (`requerido`) y la pantalla
   * no lo usaba: se lanzaba el reporte sin ellos y el resultado vacío no decía
   * que faltaba elegir algo. Aquí solo se avisa; no se bloquea nada.
   */
  const faltantes = (reporte?.filtros ?? [])
    .filter((f) => f.requerido && f.tipo === "seleccion" && !seleccion[f.clave])
    .map((f) => f.etiqueta);

  /** El periodo que el API dice haber calculado, que no siempre es el pedido. */
  const periodoCalculado = (() => {
    const p = resultado?.periodo;
    if (!p) return null;
    if (p.asOf) return `Cifras al corte del ${p.asOf}.`;
    if (p.from && p.to) return `Cifras del ${p.from} al ${p.to}.`;
    if (p.from) return `Cifras desde el ${p.from}.`;
    if (p.to) return `Cifras hasta el ${p.to}.`;
    return null;
  })();

  return (
    <>
      <PageHeader
        eyebrow="Contabilidad"
        title="Reportes"
        subtitle="Elige un reporte, fija el periodo y revisa los números. Haz clic en una línea para ver de dónde salen."
        density="ops"
        actions={
          <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <ListExportActions
              onExcel={reporte?.exportable ? () => void exportar() : undefined}
              excelBusy={exportando}
              excelDisabled={!resultado || cargando}
            />
            <Button size="sm" variant="ghost" onClick={() => void ejecutar()} disabled={cargando || !reporte}>
              Actualizar
            </Button>
          </div>
        }
      />

      {error && (
        <InlineAlert
          message={error}
          onDismiss={() => setError(null)}
          action={
            reporte ? (
              <Button size="sm" variant="secondary" onClick={() => void ejecutar()}>
                Reintentar
              </Button>
            ) : undefined
          }
        />
      )}

      {cargandoCatalogo ? (
        <p style={{ fontSize: 13, color: "var(--text-tertiary)" }} aria-busy="true">
          {token
            ? "Cargando el catálogo de reportes…"
            : "Esperando la sesión para pedir el catálogo…"}
        </p>
      ) : catalogo.length === 0 ? (
        <EmptyState
          title="Sin reportes disponibles"
          description="Tu empresa todavía no tiene reportes publicados. Revisa los permisos de contabilidad."
        />
      ) : (
        <>
          <Section title="Reporte" dense>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {catalogo.map((r) => {
                const activo = r.id === reporteId;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setReporteId(r.id);
                      setSeleccion({});
                      setComparar(false);
                    }}
                    aria-pressed={activo}
                    title={r.descripcion}
                    style={{
                      height: 32,
                      padding: "0 12px",
                      borderRadius: 8,
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: activo ? 600 : 500,
                      textAlign: "left",
                      color: activo ? "var(--text-primary)" : "var(--text-secondary)",
                      background: activo
                        ? "color-mix(in srgb, var(--primary) 8%, var(--surface))"
                        : "transparent",
                      border: `1px solid ${
                        activo
                          ? "color-mix(in srgb, var(--primary) 40%, var(--border))"
                          : "var(--nx-panel-hairline, var(--border))"
                      }`,
                    }}
                  >
                    {r.nombre}
                  </button>
                );
              })}
            </div>
            {reporte && (
              <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--text-secondary)" }}>
                {reporte.descripcion}
              </p>
            )}
          </Section>

          <div style={{ margin: "12px 0" }}>
            <FilterToolbar
              dates={fechas}
              selects={selectsExtra}
              toggles={
                reporte?.comparable
                  ? [{ label: "Comparar con el periodo anterior", value: comparar, onChange: setComparar }]
                  : []
              }
              resultCount={resultado?.filas.length ?? null}
            />
          </div>

          {faltantes.length > 0 && (
            <InlineAlert
              variant="warning"
              message={`Este reporte pide ${
                faltantes.length === 1 ? "un filtro" : "filtros"
              } que todavía no eliges: ${faltantes.join(", ")}. Sin ${
                faltantes.length === 1 ? "él" : "ellos"
              } el resultado puede venir vacío o incompleto.`}
            />
          )}

          {(periodoCalculado || resultado?.comparativo) && (
            <p style={{ margin: "0 0 10px", fontSize: 12.5, color: "var(--text-secondary)" }}>
              {periodoCalculado}
              {resultado?.comparativo && (
                <>
                  {" "}
                  Comparando la columna «{resultado.comparativo.columnaComparada}» contra{" "}
                  {resultado.comparativo.periodo.from} → {resultado.comparativo.periodo.to}.
                </>
              )}
            </p>
          )}

          {cargando ? (
            <p style={{ fontSize: 13, color: "var(--text-tertiary)" }} aria-busy="true">
              Calculando el reporte…
            </p>
          ) : !resultado ? (
            error ? null : (
              <EmptyState title="Sin resultado" description="Ajusta el periodo y vuelve a intentar." />
            )
          ) : (
            <>
              <Resumen items={resultado.resumen} />
              {resultado.filas.length === 0 ? (
                <EmptyState
                  title="Sin movimientos"
                  description="No hay datos para este reporte en el periodo elegido."
                />
              ) : (
                <>
                  <DataTable
                    columns={columnas}
                    rows={resultado.filas}
                    rowKey={(f) => f.clave}
                    density="compact"
                    ariaLabel="Resultado del reporte"
                    onRowClick={resultado.drilldown ? abrirDetalle : undefined}
                  />
                  <FilaTotales columnas={resultado.columnas} totales={resultado.totales} />
                </>
              )}
              {resultado.nota && (
                <p style={{ marginTop: 10, fontSize: 12, color: "var(--text-tertiary)" }}>{resultado.nota}</p>
              )}
              {resultado.drilldown && resultado.filas.length > 0 && (
                <p style={{ marginTop: 6, fontSize: 12, color: "var(--text-tertiary)" }}>
                  Haz clic en una línea para ver las transacciones que la forman.
                </p>
              )}
            </>
          )}
        </>
      )}

      <DetalleModal
        abierto={Boolean(detalle)}
        titulo={detalle?.titulo ?? ""}
        path={detalle?.path ?? null}
        token={token}
        onClose={() => setDetalle(null)}
      />
    </>
  );
}
