"use client";

/**
 * Mesa contable · Estados financieros (maquetas aprobadas `EstadoResultados.dc.html` y
 * `BalanceGeneral.dc.html`, 29-10-2026).
 *
 * `?vista=resultados|balance`. Las cifras salen solo de pólizas registradas. La tercera
 * pestaña, «Balanza de comprobación», abre la balanza que ya existe en Informes.
 * Contrato: `GET /api/accounting/workspace/mesa/estados` y `/estados/excel`; agrupador SAT con
 * `PATCH /api/accounting/accounts/:id`; balanza XML con `/accounting/accounts/compliance/balanza-xml`.
 */

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useUser } from "@/components/UserContext";
import ContabilidadSidebar from "@/components/erp/ContabilidadSidebar";
import { Alert, EmptyState, SkeletonRows } from "@/components/base";
import { saveBlob } from "@/components/finance/download";
import {
  Aviso,
  Dialogo,
  Flechas,
  IcoAviso,
  IcoError,
  IcoPalomita,
  Kpi,
  Kpis,
  MesaEncabezado,
  Segmentos,
  cx,
  m,
} from "@/components/mesa-contable/piezas";
import { formatApiError } from "@/lib/erp-api";
import {
  alturasMargen,
  asignarAgrupador,
  avisarCambioMesa,
  balanceVacio,
  cabeceraPeriodo,
  cifra,
  descargarArchivo,
  descripcionMargen,
  dinero,
  dineroCorto,
  esAgrupadorValido,
  etiquetaMes,
  getBalanceGeneral,
  getEstadoResultados,
  indice,
  mesActual,
  moverMes,
  pasoPeriodo,
  plural,
  porcentaje,
  resultadosVacios,
  rutaBalanzaXml,
  rutaExcelEstados,
  tituloCierre,
  tonoVariacion,
  totalSeccion,
  variacion,
  type BalanceGeneral,
  type BloqueBalance,
  type EstadoResultados,
  type PeriodoEstados,
  type VistaEstados,
} from "@/lib/mesa-contable";

type CuentaPorAsignar = { cuentaId: number; nombre: string };

const PERIODOS: Array<{ id: PeriodoEstados; texto: string }> = [
  { id: "mes", texto: "Mes" },
  { id: "trimestre", texto: "Trimestre" },
  { id: "anio", texto: "Año" },
];

function pctIngresos(n: number | null) {
  return typeof n === "number" && Math.abs(n - 100) < 0.05 ? "100 %" : porcentaje(n);
}

function tintaVariacion(t: ReturnType<typeof tonoVariacion>) {
  return t === "positivo" ? "ok" : t === "negativo" ? "danger" : "muted";
}

export default function EstadosFinancierosPage() {
  const { user, isContextReady } = useUser();
  const token = user?.token ?? "";

  const [vista, setVista] = useState<VistaEstados>("resultados");
  const [periodo, setPeriodo] = useState<PeriodoEstados>("mes");
  const [fecha, setFecha] = useState(() => mesActual());
  const [res, setRes] = useState<EstadoResultados | null>(null);
  const [bal, setBal] = useState<BalanceGeneral | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tono: "success" | "danger"; texto: string } | null>(null);
  const [descargando, setDescargando] = useState<"excel" | "xml" | null>(null);
  const [listo, setListo] = useState(false);

  const [asignar, setAsignar] = useState<CuentaPorAsignar | null>(null);
  const [codigo, setCodigo] = useState("");
  const [codigoError, setCodigoError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const peticion = useRef(0);
  const idCodigo = useId();

  // `?vista=` se lee de la URL al montar (sin useSearchParams: rompe el prerender).
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("vista");
    if (v === "balance" || v === "resultados") setVista(v);
    setListo(true);
  }, []);

  const cambiarVista = (v: VistaEstados) => {
    setVista(v);
    setCargando(true);
    window.history.replaceState(null, "", `${window.location.pathname}?vista=${v}`);
  };

  const cargar = useCallback(async () => {
    if (!token || !listo) return;
    const turno = ++peticion.current;
    setError(null);
    try {
      if (vista === "balance") {
        const b = await getBalanceGeneral(token, fecha);
        if (turno !== peticion.current) return;
        setBal(b);
      } else {
        const r = await getEstadoResultados(token, periodo, fecha);
        if (turno !== peticion.current) return;
        setRes(r);
      }
    } catch (e) {
      if (turno !== peticion.current) return;
      setError(formatApiError(e, vista === "balance" ? "No se pudo armar el balance general." : "No se pudo armar el estado de resultados."));
    } finally {
      if (turno === peticion.current) setCargando(false);
    }
  }, [token, listo, vista, periodo, fecha]);

  useEffect(() => {
    if (!isContextReady || !listo) return;
    if (!token) {
      setCargando(false);
      return;
    }
    void cargar();
  }, [isContextReady, token, listo, cargar]);

  const mover = (dir: 1 | -1) => {
    setFecha((f) => moverMes(f, dir * (vista === "balance" ? 1 : pasoPeriodo(periodo))));
    setCargando(true);
  };

  const descargar = async (tipo: "excel" | "xml") => {
    if (!token) return;
    setDescargando(tipo);
    setAviso(null);
    try {
      if (tipo === "excel") {
        const p = vista === "balance" ? "mes" : periodo;
        saveBlob(await descargarArchivo(token, rutaExcelEstados(p, fecha)), `estados-financieros-${fecha}.xlsx`);
      } else {
        saveBlob(await descargarArchivo(token, rutaBalanzaXml(fecha)), `balanza-${fecha}.xml`);
      }
    } catch (e) {
      setAviso({
        tono: "danger",
        texto: `${tipo === "excel" ? "No se generó el Excel." : "No se generó la balanza XML."} ${formatApiError(e, "El servidor no devolvió el archivo.")}`,
      });
    } finally {
      setDescargando(null);
    }
  };

  const abrirAsignar = (c: CuentaPorAsignar) => {
    setAsignar(c);
    setCodigo("");
    setCodigoError(null);
  };

  const confirmarAsignar = async () => {
    if (!token || !asignar) return;
    const v = codigo.trim();
    if (!esAgrupadorValido(v)) {
      setCodigoError("Escribe el código del catálogo del SAT: tres dígitos y, si aplica, la subcuenta (601, 601.84).");
      return;
    }
    setGuardando(true);
    try {
      await asignarAgrupador(token, asignar.cuentaId, v);
      setAviso({ tono: "success", texto: `Se asignó el agrupador ${v} a ${asignar.nombre}.` });
      setAsignar(null);
      avisarCambioMesa();
      await cargar();
    } catch (e) {
      setCodigoError(formatApiError(e, "No se pudo guardar el código. Vuelve a intentarlo."));
    } finally {
      setGuardando(false);
    }
  };

  const esteMes = mesActual();
  const comparado = res ? cabeceraPeriodo(res.comparado.etiqueta).toLowerCase() : "";
  const mesAbierto = vista === "balance" ? bal?.mesAbierto : res?.mesAbierto;

  const junto =
    vista === "resultados" ? (
      <>
        <Segmentos
          etiqueta="Periodo"
          valor={periodo}
          onCambio={(p) => {
            setPeriodo(p);
            setCargando(true);
          }}
          items={PERIODOS}
        />
        <Flechas
          textoAnterior="Periodo anterior"
          textoSiguiente="Periodo siguiente"
          etiqueta={
            res ? (
              <>
                {res.periodo.etiqueta} <span>vs {comparado}</span>
              </>
            ) : (
              etiquetaMes(fecha)
            )
          }
          onAnterior={() => mover(-1)}
          onSiguiente={() => mover(1)}
          siguienteDeshabilitado={fecha >= esteMes}
        />
        {mesAbierto ? (
          <span className={m.pill} data-tone="warning">
            Mes abierto
          </span>
        ) : null}
      </>
    ) : (
      <>
        <Flechas
          etiqueta={bal?.etiqueta ?? `Al cierre de ${etiquetaMes(fecha).toLowerCase()}`}
          onAnterior={() => mover(-1)}
          onSiguiente={() => mover(1)}
          siguienteDeshabilitado={fecha >= esteMes}
        />
        {mesAbierto ? (
          <span className={m.pill} data-tone="warning">
            Mes abierto
          </span>
        ) : null}
      </>
    );

  const acciones =
    vista === "resultados" ? (
      <>
        <button type="button" className={m.btn} onClick={() => window.print()} title="Imprime o guarda como PDF">
          PDF
        </button>
        <button
          type="button"
          className={cx(m.btn, m.btnPrimary)}
          onClick={() => void descargar("excel")}
          disabled={descargando != null}
          aria-busy={descargando === "excel" || undefined}
        >
          {descargando === "excel" ? "Generando…" : "Exportar Excel"}
        </button>
      </>
    ) : (
      <>
        <button
          type="button"
          className={m.btn}
          onClick={() => void descargar("xml")}
          disabled={descargando != null}
          aria-busy={descargando === "xml" || undefined}
        >
          {descargando === "xml" ? "Generando…" : "Balanza XML para el SAT"}
        </button>
        <button
          type="button"
          className={cx(m.btn, m.btnPrimary)}
          onClick={() => void descargar("excel")}
          disabled={descargando != null}
          aria-busy={descargando === "excel" || undefined}
        >
          {descargando === "excel" ? "Generando…" : "Exportar Excel"}
        </button>
      </>
    );

  return (
    <div className={m.page}>
      <MesaEncabezado eyebrow="Finanzas · Mesa contable" titulo="Estados financieros" junto={junto} acciones={acciones} />
      <ContabilidadSidebar enPagina />

      <div className={m.stateTabs}>
        <div role="tablist" aria-label="Estado" className={m.stateTabList}>
          <button
            type="button"
            role="tab"
            id="tab-resultados"
            aria-selected={vista === "resultados"}
            aria-controls="panel-estados"
            className={m.stateTab}
            onClick={() => cambiarVista("resultados")}
          >
            Estado de resultados
          </button>
          <button
            type="button"
            role="tab"
            id="tab-balance"
            aria-selected={vista === "balance"}
            aria-controls="panel-estados"
            className={m.stateTab}
            onClick={() => cambiarVista("balance")}
          >
            Balance general
          </button>
        </div>
        <Link href="/erp/contabilidad/reportes" className={m.stateTab}>
          Balanza de comprobación
        </Link>
      </div>

      {aviso ? (
        <Alert tone={aviso.tono} role={aviso.tono === "danger" ? "alert" : "status"} onDismiss={() => setAviso(null)}>
          {aviso.texto}
        </Alert>
      ) : null}

      {error ? (
        <Alert
          tone="danger"
          role="alert"
          title="No se pudieron cargar las cifras."
          action={
            <button type="button" className={cx(m.btn, m.btnRow)} onClick={() => void cargar()}>
              Reintentar
            </button>
          }
        >
          {error}
        </Alert>
      ) : null}

      <div id="panel-estados" role="tabpanel" aria-labelledby={vista === "balance" ? "tab-balance" : "tab-resultados"} aria-busy={cargando || undefined} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {vista === "resultados" ? (
          <VistaResultados
            res={cargando ? null : res}
            cargando={cargando}
            periodo={periodo}
            comparado={comparado}
            onAsignar={abrirAsignar}
          />
        ) : (
          <VistaBalance bal={cargando ? null : bal} cargando={cargando} onAsignar={abrirAsignar} />
        )}
      </div>

      <Dialogo
        abierto={asignar != null}
        titulo="Asignar código agrupador"
        descripcion={
          asignar ? (
            <>
              {asignar.nombre}: el código del catálogo del SAT con el que esta cuenta sale en la balanza XML. Sin él, el SAT la rechaza.
            </>
          ) : null
        }
        onCerrar={() => (guardando ? undefined : setAsignar(null))}
        onEnviar={() => void confirmarAsignar()}
        acciones={
          <>
            <button type="button" className={m.btn} onClick={() => setAsignar(null)} disabled={guardando}>
              Cancelar
            </button>
            <button type="submit" className={cx(m.btn, m.btnPrimary)} disabled={guardando} aria-busy={guardando || undefined}>
              {guardando ? "Guardando…" : "Asignar"}
            </button>
          </>
        }
      >
        <label htmlFor={idCodigo} className={m.field}>
          Código agrupador SAT
          <input
            id={idCodigo}
            className={m.control}
            inputMode="decimal"
            autoComplete="off"
            placeholder="Ej.: 601.84"
            value={codigo}
            onChange={(e) => {
              setCodigo(e.target.value);
              if (codigoError) setCodigoError(null);
            }}
            aria-invalid={codigoError ? true : undefined}
            aria-describedby={codigoError ? `${idCodigo}-error` : undefined}
            aria-required="true"
          />
        </label>
        {codigoError ? (
          <span id={`${idCodigo}-error`} className={m.fieldError} role="alert">
            {codigoError}
          </span>
        ) : null}
      </Dialogo>
    </div>
  );
}

/* ── Estado de resultados ─────────────────────────────────────────────── */

function Agrupador({ agrupador, cuentaId, nombre, onAsignar }: { agrupador: string | null; cuentaId: number | null; nombre: string; onAsignar: (c: CuentaPorAsignar) => void }) {
  if (agrupador) return <span data-tinta="muted">{agrupador}</span>;
  if (cuentaId == null) return <span data-tinta="muted">—</span>;
  return (
    <button
      type="button"
      className={cx(m.btn, m.btnTiny, m.btnWarn)}
      style={{ minHeight: 28, padding: "0 9px" }}
      onClick={() => onAsignar({ cuentaId, nombre })}
      aria-label={`Asignar código agrupador a ${nombre}`}
    >
      Asignar
    </button>
  );
}

function VistaResultados({
  res,
  cargando,
  periodo,
  comparado,
  onAsignar,
}: {
  res: EstadoResultados | null;
  cargando: boolean;
  periodo: PeriodoEstados;
  comparado: string;
  onAsignar: (c: CuentaPorAsignar) => void;
}) {
  const vacio = res ? resultadosVacios(res) : false;
  const c = res?.cifras;
  const colActual = res ? cabeceraPeriodo(res.periodo.etiqueta) : "Periodo";
  const colAnterior = res ? cabeceraPeriodo(res.comparado.etiqueta) : "Anterior";
  const alturas = res ? alturasMargen(res.margenes) : [];

  return (
    <>
      {cargando || (res && !vacio) ? (
        <Kpis etiqueta="Cifras del periodo" columnas={4}>
          <Kpi
            cargando={cargando}
            etiqueta="Ingresos"
            valor={dineroCorto(c?.ingresos)}
            pista={c && c.ingresosVar != null ? `${variacion(c.ingresosVar)} vs ${comparado}` : null}
            tintaPista={c?.ingresosVar != null ? (c.ingresosVar > 0 ? "ok" : c.ingresosVar < 0 ? "danger" : undefined) : undefined}
            pistaFuerte
          />
          <Kpi
            cargando={cargando}
            etiqueta="Utilidad bruta"
            valor={dineroCorto(c?.utilidadBruta)}
            pista={c && c.margenBruto != null ? `${porcentaje(c.margenBruto)} de los ingresos` : null}
          />
          <Kpi
            cargando={cargando}
            etiqueta="Utilidad de operación"
            valor={dineroCorto(c?.utilidadOperacion)}
            pista={
              c
                ? [c.margenOperacion != null ? porcentaje(c.margenOperacion) : null, c.utilidadOperacionVar != null ? `${variacion(c.utilidadOperacionVar)} vs ${comparado}` : null]
                    .filter(Boolean)
                    .join(" · ")
                : null
            }
          />
          <Kpi
            oscura
            cargando={cargando}
            etiqueta="Utilidad neta"
            valor={dineroCorto(c?.utilidadNeta)}
            pista={c ? [c.margenNeto != null ? porcentaje(c.margenNeto) : null, res?.mesAbierto ? "ISR estimado" : null].filter(Boolean).join(" · ") : null}
          />
        </Kpis>
      ) : null}

      <div className={m.split}>
        <section aria-label="Estado de resultados" className={m.cardList} style={{ flex: "3 1 620px" }}>
          {cargando || !res ? (
            <SkeletonRows rows={10} label="Armando el estado de resultados" />
          ) : vacio ? (
            <EmptyState
              tone="neutral"
              titleAs="h2"
              title={`Todavía no hay pólizas en ${res.periodo.etiqueta.toLowerCase()}`}
              description="Las cifras salen solo de pólizas registradas. Registra las de «Pagos y gastos» y timbra lo de «Por facturar» para verlas aquí."
              action={
                <Link href="/erp/contabilidad/pagos-y-gastos" className={m.btn}>
                  Ir a Pagos y gastos
                </Link>
              }
            />
          ) : (
            <table className={cx(m.table, m.tableEstado)} style={{ minWidth: 720 }}>
              <caption className={m.srOnly}>
                Estado de resultados de {res.periodo.etiqueta} comparado con {res.comparado.etiqueta}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Cuenta</th>
                  <th scope="col">Agrupador SAT</th>
                  <th scope="col" className={m.r}>
                    {colActual}
                  </th>
                  <th scope="col" className={m.r}>
                    % ingresos
                  </th>
                  <th scope="col" className={m.r}>
                    {colAnterior}
                  </th>
                  <th scope="col" className={m.r}>
                    Variación
                  </th>
                </tr>
              </thead>
              <tbody>
                {res.secciones.map((s) => (
                  <SeccionResultados key={s.clave} s={s} onAsignar={onAsignar} />
                ))}
                <tr className={m.grandRow}>
                  <td className={m.grandText}>Utilidad neta</td>
                  <td />
                  <td className={cx(m.r, m.grandText)}>{cifra(res.utilidadNeta.actual)}</td>
                  <td className={m.r} data-fuerte="true">
                    {pctIngresos(res.utilidadNeta.pctIngresos)}
                  </td>
                  <td className={m.r} data-tinta="muted">
                    {cifra(res.utilidadNeta.anterior)}
                  </td>
                  <td className={m.r} data-tinta={tintaVariacion(tonoVariacion("", res.utilidadNeta.variacionPct, true))} data-fuerte="true">
                    {variacion(res.utilidadNeta.variacionPct)}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </section>

        <aside className={m.splitAside} style={{ flex: "1 1 280px" }}>
          {res && !vacio && res.margenes.length ? (
            <section aria-label="Margen neto por mes" className={cx(m.card, m.cardPad)}>
              <h2 className={m.cardTitle}>Margen neto por mes</h2>
              <div
                className={m.bars}
                role="img"
                aria-label={descripcionMargen(res.margenes)}
                style={{ "--barras": res.margenes.length } as CSSProperties}
              >
                {res.margenes.map((x, i) => (
                  <div key={`${x.mes}-${i}`} className={m.bar} data-actual={x.actual ? "true" : undefined} aria-hidden="true">
                    <span>{porcentaje(x.pct)}</span>
                    <i style={{ height: `${alturas[i]}%` }} />
                    <span>{x.mes}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {res ? (
            <section aria-label={tituloCierre(res.periodo.etiqueta, periodo)} className={cx(m.card, m.cardPad)} style={{ gap: 12 }}>
              <h2 className={m.cardTitle}>{tituloCierre(res.periodo.etiqueta, periodo)}</h2>
              <ul className={m.checks}>
                <li>
                  {res.cierre.sinPoliza > 0 ? <IcoAviso color="var(--ui-warning)" /> : <IcoPalomita size={18} color="var(--ui-brand)" />}
                  <span>
                    {res.cierre.sinPoliza > 0 ? (
                      <>
                        <Link href="/erp/contabilidad/pagos-y-gastos">{plural(res.cierre.sinPoliza, "movimiento")} sin póliza</Link> no{" "}
                        {res.cierre.sinPoliza === 1 ? "está" : "están"} en estas cifras
                      </>
                    ) : (
                      "Todos los movimientos tienen póliza"
                    )}
                  </span>
                </li>
                <li>
                  {res.cierre.sinAgrupador > 0 ? <IcoAviso color="var(--ui-warning)" /> : <IcoPalomita size={18} color="var(--ui-brand)" />}
                  <span>
                    {res.cierre.sinAgrupador > 0
                      ? `${plural(res.cierre.sinAgrupador, "cuenta")} sin código agrupador: el SAT las rechaza en el XML`
                      : "Todas las cuentas tienen código agrupador"}
                  </span>
                </li>
                <li>
                  {res.cierre.porConciliar > 0 ? <IcoAviso color="var(--ui-warning)" /> : <IcoPalomita size={18} color="var(--ui-brand)" />}
                  <span>
                    {res.cierre.porConciliar > 0
                      ? `${plural(res.cierre.porConciliar, "movimiento")} de banco por conciliar`
                      : "Banco conciliado"}
                  </span>
                </li>
                <li>
                  {res.cierre.polizasCuadradas ? <IcoPalomita size={18} color="var(--ui-brand)" /> : <IcoError color="var(--ui-danger)" />}
                  <span>{res.cierre.polizasCuadradas ? "Pólizas cuadradas: debe = haber" : "Hay pólizas que no cuadran: debe ≠ haber"}</span>
                </li>
              </ul>
              <Link href="/erp/contabilidad/cierres" className={m.btn} style={{ alignSelf: "flex-start" }}>
                Ir a cerrar el mes
              </Link>
            </section>
          ) : null}

          <p className={m.note}>
            Las cifras salen solo de pólizas registradas. El Excel trae una hoja por estado (resultados, balance y balanza), con el código agrupador y
            fórmulas en los subtotales.
          </p>
        </aside>
      </div>
    </>
  );
}

function SeccionResultados({ s, onAsignar }: { s: EstadoResultados["secciones"][number]; onAsignar: (c: CuentaPorAsignar) => void }) {
  return (
    <>
      <tr className={m.sectionRow}>
        <td colSpan={6}>{s.titulo}</td>
      </tr>
      {s.filas.map((f) => {
        const nombre = `${f.codigo} ${f.nombre}`.trim();
        return (
          <tr key={`${s.clave}-${f.cuentaId ?? f.codigo}`}>
            <td>{nombre}</td>
            <td>
              <Agrupador agrupador={f.agrupador} cuentaId={f.cuentaId} nombre={nombre} onAsignar={onAsignar} />
            </td>
            <td className={m.r}>{cifra(f.actual)}</td>
            <td className={m.r} data-tinta="muted">
              {pctIngresos(f.pctIngresos)}
            </td>
            <td className={m.r} data-tinta="muted">
              {cifra(f.anterior)}
            </td>
            <td className={m.r} data-tinta={tintaVariacion(tonoVariacion(s.clave, f.variacionPct))}>
              {variacion(f.variacionPct)}
            </td>
          </tr>
        );
      })}
      {s.total ? (
        <tr className={m.totalRow}>
          <td>{s.total.nombre}</td>
          <td />
          <td className={m.r}>{cifra(s.total.actual)}</td>
          <td className={m.r}>{pctIngresos(s.total.pctIngresos)}</td>
          <td className={m.r} data-tinta="muted" style={{ fontWeight: 400 }}>
            {cifra(s.total.anterior)}
          </td>
          <td className={m.r} data-tinta={tintaVariacion(tonoVariacion(s.clave, s.total.variacionPct, true))}>
            {variacion(s.total.variacionPct)}
          </td>
        </tr>
      ) : null}
    </>
  );
}

/* ── Balance general ──────────────────────────────────────────────────── */

function VistaBalance({ bal, cargando, onAsignar }: { bal: BalanceGeneral | null; cargando: boolean; onAsignar: (c: CuentaPorAsignar) => void }) {
  if (cargando || !bal) {
    return (
      <>
        <Kpis etiqueta="Indicadores" columnas={4}>
          {["Liquidez", "Prueba ácida", "Días de cobro", "Endeudamiento"].map((e) => (
            <Kpi key={e} cargando etiqueta={e} valor="" />
          ))}
        </Kpis>
        <section className={m.cardList}>
          <SkeletonRows rows={10} label="Armando el balance general" />
        </section>
      </>
    );
  }

  if (balanceVacio(bal)) {
    return (
      <section className={m.cardList}>
        <EmptyState
          tone="neutral"
          titleAs="h2"
          title="Todavía no hay saldos que mostrar"
          description="El balance sale de las pólizas registradas. En cuanto se registre la primera, aquí aparecen activo, pasivo y capital."
          action={
            <Link href="/erp/contabilidad/pagos-y-gastos" className={m.btn}>
              Ir a Pagos y gastos
            </Link>
          }
        />
      </section>
    );
  }

  const ind = bal.indicadores;
  const pasivoMasCapital = bal.pasivo.total + bal.capital.total;

  return (
    <>
      {bal.cuadra ? (
        <Aviso tono="success" titulo="Cuadra al centavo.">
          <span className={m.num}>
            Activo {dinero(bal.activo.total)} = Pasivo {dinero(bal.pasivo.total)} + Capital {dinero(bal.capital.total)}
          </span>
        </Aviso>
      ) : (
        <Aviso tono="danger" titulo={`No cuadra por ${dinero(Math.abs(bal.diferencia))}.`} role="alert">
          <span className={m.num}>
            Activo {dinero(bal.activo.total)} ≠ Pasivo y capital {dinero(pasivoMasCapital)}. Revisa las pólizas del mes en{" "}
            <Link href="/erp/contabilidad/cierres">Cerrar el mes</Link>.
          </span>
        </Aviso>
      )}

      <Kpis etiqueta="Indicadores" columnas={4}>
        <Kpi etiqueta="Liquidez" valor={indice(ind.liquidez)} pista="Activo circulante ÷ pasivo" />
        <Kpi etiqueta="Prueba ácida" valor={indice(ind.pruebaAcida)} pista="Sin contar el inventario" />
        <Kpi etiqueta="Días de cobro" valor={ind.diasCobro != null ? Math.round(ind.diasCobro) : "—"} pista="Clientes ÷ ventas del mes" />
        <Kpi etiqueta="Endeudamiento" valor={porcentaje(ind.endeudamiento)} pista="Pasivo ÷ activo" />
      </Kpis>

      <div className={m.balanceGrid}>
        <section aria-label="Activo" className={m.cardList}>
          <div className={m.balanceHead}>
            <h2 className={m.cardTitleDisplay}>Activo</h2>
            <span>{dinero(bal.activo.total)}</span>
          </div>
          <TablaBalance bloques={[{ bloque: bal.activo, total: null }]} caption={`Activo ${bal.etiqueta.toLowerCase()}`} onAsignar={onAsignar} />
        </section>

        <section aria-label="Pasivo y capital" className={m.cardList}>
          <div className={m.balanceHead}>
            <h2 className={m.cardTitleDisplay}>Pasivo y capital</h2>
            <span>{dinero(pasivoMasCapital)}</span>
          </div>
          <TablaBalance
            bloques={[
              { bloque: bal.pasivo, total: "Total pasivo" },
              { bloque: bal.capital, total: "Total capital" },
            ]}
            caption={`Pasivo y capital ${bal.etiqueta.toLowerCase()}`}
            onAsignar={onAsignar}
          />
        </section>
      </div>

      <p className={m.note}>
        Cada saldo abre sus movimientos y pólizas. El resultado del ejercicio es la suma del estado de resultados del año hasta este mes. El Excel trae este
        balance, el estado de resultados y la balanza en hojas separadas.
      </p>
    </>
  );
}

/**
 * Tabla de un lado del balance. `total` = rótulo del total del bloque (pasivo, capital); con
 * una sola sección el total de la sección ES el del bloque y se pinta una vez con ese rótulo.
 */
function TablaBalance({
  bloques,
  caption,
  onAsignar,
}: {
  bloques: Array<{ bloque: BloqueBalance; total: string | null }>;
  caption: string;
  onAsignar: (c: CuentaPorAsignar) => void;
}) {
  return (
    <table className={cx(m.table, m.tableBalance)} style={{ minWidth: 420 }}>
      <caption className={m.srOnly}>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Cuenta</th>
          <th scope="col">Agrupador</th>
          <th scope="col" className={m.r}>
            Saldo
          </th>
        </tr>
      </thead>
      <tbody>
        {bloques.map(({ bloque, total }, bi) => {
          const unaSeccion = bloque.secciones.length === 1;
          return (
            <BloqueFilas key={bi} bloque={bloque} total={total} unaSeccion={unaSeccion} onAsignar={onAsignar} />
          );
        })}
      </tbody>
    </table>
  );
}

function BloqueFilas({
  bloque,
  total,
  unaSeccion,
  onAsignar,
}: {
  bloque: BloqueBalance;
  total: string | null;
  unaSeccion: boolean;
  onAsignar: (c: CuentaPorAsignar) => void;
}) {
  return (
    <>
      {bloque.secciones.map((s, si) => (
        <SeccionBalanceFilas
          key={`${s.titulo}-${si}`}
          titulo={s.titulo}
          filas={s.filas}
          total={s.total}
          rotuloTotal={unaSeccion && total ? total : totalSeccion(s.titulo)}
          onAsignar={onAsignar}
        />
      ))}
      {total && !unaSeccion ? (
        <tr className={m.totalRow}>
          <td>{total}</td>
          <td />
          <td className={m.r}>{cifra(bloque.total)}</td>
        </tr>
      ) : null}
    </>
  );
}

function SeccionBalanceFilas({
  titulo,
  filas,
  total,
  rotuloTotal,
  onAsignar,
}: {
  titulo: string;
  filas: BloqueBalance["secciones"][number]["filas"];
  total: number;
  rotuloTotal: string;
  onAsignar: (c: CuentaPorAsignar) => void;
}) {
  return (
    <>
      <tr className={m.sectionRow}>
        <td colSpan={3}>{titulo}</td>
      </tr>
      {filas.map((f) => (
        <tr key={f.cuentaId}>
          <td>{f.nombre}</td>
          <td>
            <Agrupador agrupador={f.agrupador} cuentaId={f.cuentaId} nombre={f.nombre} onAsignar={onAsignar} />
          </td>
          <td className={m.r}>{cifra(f.saldo)}</td>
        </tr>
      ))}
      <tr className={m.totalRow}>
        <td>{rotuloTotal}</td>
        <td />
        <td className={m.r}>{cifra(total)}</td>
      </tr>
    </>
  );
}
