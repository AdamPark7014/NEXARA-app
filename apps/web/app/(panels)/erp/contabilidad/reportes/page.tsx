"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AssessmentOutlinedIcon from "@mui/icons-material/AssessmentOutlined";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import FilterAltOffOutlinedIcon from "@mui/icons-material/FilterAltOffOutlined";
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  CardHead,
  Checkbox,
  DataTable,
  DateInput,
  FilterChip,
  FilterChips,
  ListCard,
  ModuleToolbar,
  Select,
  SkeletonRows,
} from "@/components/base";
import { MesaPagina } from "@/components/mesa-contable/MesaPagina";
import { useUser } from "@/components/UserContext";
import { formatApiError } from "@/lib/erp-api";
import {
  DetalleModal,
  FilaTotales,
  Resumen,
  columnasDesdeApi,
  descargarCsv,
  fechaLegible,
  hoyIso,
  inicioDeMesIso,
  pedirJson,
  queryString,
  type FilaReporte,
  type ReporteCatalogo,
  type ResultadoReporte,
} from "@/components/erp/reportes-contabilidad";
import { VacioConPrimerPaso } from "../_arranque";
import s from "./reportes.module.css";

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

  /**
   * ¿El resultado viene vacío porque no hay nada, o porque quien mira eligió un
   * filtro que lo esconde? Solo cuentan los de selección: las fechas siempre
   * tienen valor y llamarlas «filtro» mandaría a quitar algo que no se puede.
   */
  const hayFiltroElegido = Object.values(seleccion).some((v) => Boolean(v));

  /** El periodo que el API dice haber calculado, que no siempre es el pedido. */
  const periodoCalculado = (() => {
    const p = resultado?.periodo;
    if (!p) return null;
    if (p.asOf) return `Cifras al corte del ${fechaLegible(p.asOf)}.`;
    if (p.from && p.to) return `Cifras del ${fechaLegible(p.from)} al ${fechaLegible(p.to)}.`;
    if (p.from) return `Cifras desde el ${fechaLegible(p.from)}.`;
    if (p.to) return `Cifras hasta el ${fechaLegible(p.to)}.`;
    return null;
  })();

  const nFilas = resultado?.filas.length ?? 0;
  const hayResultado = !cargando && resultado != null;
  const hayFilas = hayResultado && nFilas > 0;

  /** Qué ocupa el cuerpo de la tarjeta de lista: espera, vacío o la tabla. */
  const cuerpo = cargando ? (
    <div className={s.espera} aria-busy="true">
      <p>Calculando el reporte…</p>
      <SkeletonRows rows={4} label="Calculando el reporte" />
    </div>
  ) : resultado && nFilas > 0 ? (
    <DataTable
      flush
      columns={columnas}
      rows={resultado.filas}
      rowKey={(f) => f.clave}
      density="compact"
      ariaLabel="Resultado del reporte"
      onRowClick={resultado.drilldown ? abrirDetalle : undefined}
    />
  ) : null;

  /** Vacío de la tarjeta: sin resultado todavía, o resultado sin renglones. */
  const vacio = cargando
    ? undefined
    : !resultado
      ? error
        ? undefined
        : {
            icon: <AssessmentOutlinedIcon />,
            title: "Todavía no hay resultado",
            description: "El reporte no se ha calculado. Fija el periodo arriba y pulsa Actualizar.",
            tone: "neutral" as const,
          }
      : nFilas === 0
        ? hayFiltroElegido
          ? {
              icon: <FilterAltOffOutlinedIcon />,
              title: "Nada con estos filtros",
              description: "Ningún renglón cumple lo que elegiste. Quita el filtro o amplía el periodo.",
              action: (
                <Button size="sm" variant="secondary" onClick={() => setSeleccion({})}>
                  Quitar los filtros
                </Button>
              ),
              tone: "neutral" as const,
            }
          : (
              <VacioConPrimerPaso
                variant="default"
                title="Sin datos en este periodo"
                description={`«${reporte?.nombre ?? "Este reporte"}» no captura nada: se arma con lo que ya está registrado —pólizas, facturas, pagos y gastos— y en este periodo no hay nada de eso. Amplía las fechas, o mira el libro para ver qué sí existe.`}
                extra={
                  <ButtonLink variant="tertiary" size="sm" href="/erp/contabilidad/movimientos">
                    Ver el libro de movimientos →
                  </ButtonLink>
                }
              />
            )
        : undefined;

  return (
    <MesaPagina
      titulo="Reportes"
      descripcion="Elige un reporte, fija el periodo y revisa los números. Abre una línea para ver de dónde salen."
      terciarias={
        <Button variant="ghost" onClick={() => void ejecutar()} disabled={cargando || !reporte}>
          Actualizar
        </Button>
      }
      secundarias={
        reporte?.exportable ? (
          <Button
            iconStart={<FileDownloadOutlinedIcon />}
            onClick={() => void exportar()}
            disabled={!resultado || cargando || exportando}
          >
            {exportando ? "Generando…" : "Exportar Excel"}
          </Button>
        ) : null
      }
    >
      {error && (
        <Alert
          tone="danger"
          role="alert"
          ariaLive="assertive"
          srLabel="Error"
          onDismiss={() => setError(null)}
          action={
            reporte ? (
              <Button size="sm" variant="secondary" onClick={() => void ejecutar()}>
                Reintentar
              </Button>
            ) : undefined
          }
        >
          {`No se pudo calcular «${reporte?.nombre ?? "el reporte"}». ${error} Reintenta o acota el periodo; si sigue igual, avisa a soporte.`}
        </Alert>
      )}

      {cargandoCatalogo ? (
        <ListCard>
          <div className={s.espera} aria-busy="true">
            <p>
              {token
                ? "Cargando el catálogo de reportes…"
                : "Esperando la sesión para pedir el catálogo…"}
            </p>
            <SkeletonRows rows={2} label="Cargando el catálogo de reportes" />
          </div>
        </ListCard>
      ) : catalogo.length === 0 ? (
        <ListCard
          empty
          emptyState={{
            icon: <AssessmentOutlinedIcon />,
            title: "Sin reportes disponibles",
            description: "Tu empresa todavía no tiene reportes publicados. Revisa los permisos de contabilidad.",
            tone: "neutral",
          }}
        />
      ) : (
        <>
          <Card className={s.tarjeta}>
            <CardHead title="Reporte" subtitle={reporte?.descripcion} />
            <ModuleToolbar
              className={s.barra}
              chips={
                <FilterChips ariaLabel="Reporte">
                  {catalogo.map((r) => (
                    <FilterChip
                      key={r.id}
                      active={r.id === reporteId}
                      title={r.descripcion}
                      onClick={() => {
                        setReporteId(r.id);
                        setSeleccion({});
                        setComparar(false);
                      }}
                    >
                      {r.nombre}
                    </FilterChip>
                  ))}
                </FilterChips>
              }
            >
              <div className={s.filtros}>
                {fechas.map((f) => (
                  <label key={f.label} className={s.fecha}>
                    <span>{f.label}</span>
                    <DateInput
                      aria-label={f.label}
                      className={s.filtroFecha}
                      controlSize="sm"
                      value={f.value}
                      onChange={(e) => f.onChange(e.target.value)}
                    />
                  </label>
                ))}
                {selectsExtra.map((sel, i) => (
                  <Select
                    key={`${sel.label}-${i}`}
                    aria-label={sel.label}
                    title={sel.label}
                    wrapperClassName={s.filtroSelect}
                    controlSize="sm"
                    value={sel.value}
                    onChange={(e) => sel.onChange(e.target.value)}
                  >
                    <option value="">{sel.allLabel}</option>
                    {sel.options.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </Select>
                ))}
                {reporte?.comparable ? (
                  <Checkbox
                    label="Comparar con el periodo anterior"
                    checked={comparar}
                    onChange={(e) => setComparar(e.target.checked)}
                  />
                ) : null}
                {resultado ? (
                  <span className={s.conteo} role="status">
                    {nFilas} resultado{nFilas === 1 ? "" : "s"}
                  </span>
                ) : null}
              </div>
            </ModuleToolbar>
          </Card>

          {faltantes.length > 0 && (
            <Alert tone="warning" role="alert" ariaLive="assertive" srLabel="Aviso">
              {`Este reporte pide ${
                faltantes.length === 1 ? "un filtro" : "filtros"
              } que todavía no eliges: ${faltantes.join(", ")}. Sin ${
                faltantes.length === 1 ? "él" : "ellos"
              } el resultado puede venir vacío o incompleto.`}
            </Alert>
          )}

          {(periodoCalculado || resultado?.comparativo) && (
            <p className={s.lectura}>
              {periodoCalculado}
              {resultado?.comparativo && (
                <>
                  {" "}
                  Comparando la columna «{resultado.comparativo.columnaComparada}» contra el
                  periodo del {fechaLegible(resultado.comparativo.periodo.from)} al{" "}
                  {fechaLegible(resultado.comparativo.periodo.to)}.
                </>
              )}
            </p>
          )}

          {/* La tira de cifras solo cuando hay renglones que la sostengan:
              un reporte vacío devuelve el resumen en ceros, y esa fila de
              ceros tapa justo la frase que explica por qué está vacío. */}
          {hayFilas && resultado ? <Resumen items={resultado.resumen} /> : null}

          <ListCard
            empty={vacio !== undefined}
            emptyState={vacio}
            footer={
              hayResultado && resultado ? (
                <>
                  {nFilas > 0 && <FilaTotales columnas={resultado.columnas} totales={resultado.totales} />}
                  {resultado.nota && <p className={s.nota}>{resultado.nota}</p>}
                  {resultado.drilldown && nFilas > 0 && (
                    <p className={s.nota}>Abre una línea para ver los movimientos que la forman.</p>
                  )}
                </>
              ) : undefined
            }
          >
            {cuerpo}
          </ListCard>
        </>
      )}

      <DetalleModal
        abierto={Boolean(detalle)}
        titulo={detalle?.titulo ?? ""}
        path={detalle?.path ?? null}
        token={token}
        onClose={() => setDetalle(null)}
      />
    </MesaPagina>
  );
}
