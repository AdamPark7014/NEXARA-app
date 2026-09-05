"use client";

/**
 * Bitácora INTEGRA.
 *
 * Es el único sitio donde queda constancia de quién abrió una puerta a
 * distancia o quién cambió un horario, así que la pantalla está pensada para
 * una sola tarea: reconstruir qué pasó un martes por la tarde. De ahí el rango
 * por fecha y hora, el orden cronológico opcional, el detalle entero (no
 * recortado) y el CSV para adjuntar a un informe.
 *
 * Lo que el backend NO da está documentado en `_bitacora.ts` y dicho en
 * pantalla: `GET /integra/audit` solo admite `limit` (tope 200), no filtra ni
 * pagina, y no devuelve IP ni user-agent aunque `audit_logs` los guarde.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import FilterAltOffOutlinedIcon from "@mui/icons-material/FilterAltOffOutlined";
import FirstPageIcon from "@mui/icons-material/FirstPage";
import LastPageIcon from "@mui/icons-material/LastPage";
import ManageSearchOutlinedIcon from "@mui/icons-material/ManageSearchOutlined";
import NavigateBeforeIcon from "@mui/icons-material/NavigateBefore";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import RefreshIcon from "@mui/icons-material/Refresh";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";

import {
  IgBadge,
  IgBtn,
  IgEmptyState,
  IgError,
  IgField,
  IgFilters,
  IgNotice,
  IgPage,
  IgPanel,
  IgSkeleton,
  IgToolbar,
} from "../_Console";
import { diagnosticar, pedirIntegra, type Diagnostico } from "../_fallosApi";
import { inputStyle, selectStyle } from "../_lib";
import { useUrlFilters } from "../_useUrlFilters";
import styles from "./_bitacora.module.css";
import {
  ETIQUETA_CATEGORIA,
  FILTROS_INICIALES,
  PRESETS_RANGO,
  TAMANOS_PAGINA,
  TOPE_SERVIDOR,
  aCsv,
  accionesPresentes,
  avisoDeVentana,
  describirActor,
  describirCambios,
  esAccionCritica,
  etiquetaAccion,
  filtrarEntradas,
  formatearFecha,
  haceCuanto,
  hayFiltroActivo,
  nombreArchivoCsv,
  paginar,
  rangoDePreset,
  resumenDeCambios,
  type CategoriaAccion,
  type EntradaBitacora,
  type FiltrosBitacora,
  type RespuestaBitacora,
  type TamanoPagina,
} from "./_bitacora";

const TAM_POR_DEFECTO = "50";

/** Todo lo que viaja en la URL, para poder compartir una vista. */
const DEFECTOS_URL: Record<string, string> = {
  ...FILTROS_INICIALES,
  pag: "1",
  tam: TAM_POR_DEFECTO,
};

const CATEGORIAS = Object.keys(ETIQUETA_CATEGORIA) as CategoriaAccion[];

function esTamano(n: number): n is TamanoPagina {
  return (TAMANOS_PAGINA as readonly number[]).includes(n);
}

function Bitacora() {
  const [crudos, setCrudos] = useUrlFilters<Record<string, string>>({ ...DEFECTOS_URL });

  // La URL puede traer cualquier cosa: se sanea antes de que llegue a la lógica.
  const filtros = useMemo<FiltrosBitacora>(
    () => ({
      desde: crudos.desde ?? "",
      hasta: crudos.hasta ?? "",
      accion: crudos.accion ?? "",
      categoria: CATEGORIAS.some((c) => c === crudos.categoria) ? crudos.categoria : "",
      actor: crudos.actor ?? "",
      q: crudos.q ?? "",
      orden: crudos.orden === "asc" ? "asc" : "desc",
    }),
    [crudos],
  );

  const tamano: TamanoPagina = useMemo(() => {
    const n = Number(crudos.tam);
    return esTamano(n) ? n : 50;
  }, [crudos.tam]);

  const paginaPedida = useMemo(() => {
    const n = Number(crudos.pag);
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
  }, [crudos.pag]);

  const [items, setItems] = useState<EntradaBitacora[]>([]);
  const [fallo, setFallo] = useState<Diagnostico | null>(null);
  const [primeraCarga, setPrimeraCarga] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [abiertas, setAbiertas] = useState<ReadonlySet<number>>(new Set());
  /**
   * Instante de referencia de los «hace N h». Se congela en cada carga en vez
   * de leer el reloj en cada render: si no, dos filas de la misma tabla podrían
   * calcularse contra relojes distintos.
   */
  const [ahora, setAhora] = useState<Date>(() => new Date());

  const cargar = useCallback(async () => {
    setOcupado(true);
    setFallo(null);
    try {
      const data = await pedirIntegra<RespuestaBitacora>(
        `integra/audit?limit=${TOPE_SERVIDOR}`,
      );
      setItems(Array.isArray(data.items) ? data.items : []);
      setAhora(new Date());
    } catch (e) {
      setFallo(diagnosticar(e, "cargar la bitácora"));
    } finally {
      setOcupado(false);
      setPrimeraCarga(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const filtradas = useMemo(() => filtrarEntradas(items, filtros), [items, filtros]);
  const pagina = useMemo(
    () => paginar(filtradas, paginaPedida, tamano),
    [filtradas, paginaPedida, tamano],
  );

  // Si al filtrar la página pedida deja de existir, la URL tiene que reflejar
  // dónde está de verdad el usuario: si no, el enlace que comparta miente.
  useEffect(() => {
    if (pagina.pagina !== paginaPedida) setCrudos({ pag: String(pagina.pagina) });
  }, [pagina.pagina, paginaPedida, setCrudos]);

  const aviso = avisoDeVentana(items.length);
  const acciones = useMemo(() => accionesPresentes(items), [items]);
  const criticas = useMemo(() => filtradas.filter((e) => esAccionCritica(e.action)).length, [filtradas]);
  const conFiltro = hayFiltroActivo(filtros);

  const alternar = useCallback((id: number) => {
    setAbiertas((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  }, []);

  const irA = useCallback(
    (n: number) => {
      setCrudos({ pag: String(Math.min(Math.max(n, 1), pagina.paginas)) });
      setAbiertas(new Set());
    },
    [pagina.paginas, setCrudos],
  );

  const limpiar = useCallback(() => {
    setCrudos({ ...DEFECTOS_URL });
  }, [setCrudos]);

  const exportar = useCallback(() => {
    const blob = new Blob([aCsv(filtradas)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombreArchivoCsv();
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [filtradas]);

  return (
    <IgPage>
      <IgToolbar
        title="Bitácora"
        meta={
          primeraCarga ? (
            "Cargando…"
          ) : (
            <span className={styles.resumen}>
              <span>
                <span className={styles.resumenDato}>{filtradas.length}</span> de{" "}
                <span className={styles.resumenDato}>{items.length}</span> entradas
                {conFiltro ? " tras filtrar" : ""}
              </span>
              {criticas > 0 && (
                <span>
                  · <span className={styles.resumenCritico}>{criticas}</span> sobre accesos
                </span>
              )}
            </span>
          )
        }
        actions={
          <>
            <IgBtn
              onClick={exportar}
              disabled={filtradas.length === 0}
              aria-label={`Exportar a CSV las ${filtradas.length} entradas filtradas`}
              title="Exportar a CSV lo que hay en pantalla tras filtrar"
            >
              <FileDownloadOutlinedIcon fontSize="small" aria-hidden />
              &nbsp;CSV
            </IgBtn>
            <IgBtn
              onClick={() => void cargar()}
              disabled={ocupado}
              aria-label="Volver a cargar la bitácora"
            >
              <RefreshIcon fontSize="small" aria-hidden />
              &nbsp;{ocupado ? "Cargando…" : "Actualizar"}
            </IgBtn>
          </>
        }
      />

      {fallo && (
        <IgError
          title={fallo.titulo}
          tone={fallo.tono}
          onRetry={fallo.reintentable ? () => void cargar() : undefined}
          retrying={ocupado}
        >
          {fallo.cuerpo}
        </IgError>
      )}

      {!primeraCarga && !fallo && aviso && <IgNotice tone="warn">{aviso}</IgNotice>}
      {!primeraCarga && !fallo && !aviso && items.length > 0 && (
        <IgNotice>
          El servidor entregó las {items.length} entradas que tiene. El filtrado y la
          paginación de abajo ocurren en el navegador:{" "}
          <code>GET /integra/audit</code> solo admite <code>limit</code>.
        </IgNotice>
      )}

      <IgPanel title="Mutaciones registradas" count={pagina.total} flush>
        <IgFilters>
          <IgField label="Rango rápido">
            <div className={styles.chips}>
              {/*
                Fijan fechas absolutas, no un rango vivo: un enlace compartido de
                una bitácora tiene que seguir apuntando a la misma ventana de
                tiempo mañana. Por eso no llevan estado «pulsado»: la verdad de
                lo que hay filtrado son los dos campos de fecha de al lado.
              */}
              {PRESETS_RANGO.map((p) => (
                <button
                  key={p.clave}
                  type="button"
                  className={styles.chip}
                  aria-label={
                    p.clave === "todo"
                      ? "Quitar el límite de fechas"
                      : `Ver las últimas ${p.etiqueta}`
                  }
                  onClick={() => {
                    const r = rangoDePreset(p.clave);
                    setCrudos({ desde: r.desde, hasta: r.hasta, pag: "1" });
                  }}
                >
                  {p.etiqueta}
                </button>
              ))}
            </div>
          </IgField>

          <IgField label="Desde">
            <input
              type="datetime-local"
              value={filtros.desde}
              onChange={(e) => setCrudos({ desde: e.target.value, pag: "1" })}
              style={inputStyle}
            />
          </IgField>

          <IgField label="Hasta">
            <input
              type="datetime-local"
              value={filtros.hasta}
              onChange={(e) => setCrudos({ hasta: e.target.value, pag: "1" })}
              style={inputStyle}
            />
          </IgField>

          <IgField label="Área">
            <select
              value={filtros.categoria}
              onChange={(e) => setCrudos({ categoria: e.target.value, pag: "1" })}
              style={selectStyle}
            >
              <option value="">Todas</option>
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {ETIQUETA_CATEGORIA[c]}
                </option>
              ))}
            </select>
          </IgField>

          <IgField label="Acción">
            <select
              value={filtros.accion}
              onChange={(e) => setCrudos({ accion: e.target.value, pag: "1" })}
              style={selectStyle}
            >
              {/* Solo las acciones que están de verdad en la ventana cargada. */}
              <option value="">Todas</option>
              {acciones.map((a) => (
                <option key={a.valor} value={a.valor}>
                  {a.etiqueta} ({a.cuantas})
                </option>
              ))}
            </select>
          </IgField>

          <IgField label="Actor">
            <input
              type="search"
              value={filtros.actor}
              placeholder="Nombre o correo"
              onChange={(e) => setCrudos({ actor: e.target.value, pag: "1" })}
              style={inputStyle}
            />
          </IgField>

          <IgField label="Buscar">
            <input
              type="search"
              value={filtros.q}
              placeholder="Puerta, motivo, placa…"
              onChange={(e) => setCrudos({ q: e.target.value, pag: "1" })}
              style={inputStyle}
            />
          </IgField>

          <IgField label="Orden">
            <select
              value={filtros.orden}
              onChange={(e) => setCrudos({ orden: e.target.value, pag: "1" })}
              style={selectStyle}
            >
              <option value="desc">Lo más reciente primero</option>
              <option value="asc">Cronológico (para reconstruir)</option>
            </select>
          </IgField>

          <IgField label="Por página">
            <select
              value={String(tamano)}
              onChange={(e) => setCrudos({ tam: e.target.value, pag: "1" })}
              style={selectStyle}
            >
              {TAMANOS_PAGINA.map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </select>
          </IgField>

          <IgBtn onClick={limpiar} disabled={!conFiltro} aria-label="Quitar todos los filtros">
            <FilterAltOffOutlinedIcon fontSize="small" aria-hidden />
            &nbsp;Limpiar
          </IgBtn>
        </IgFilters>

        {primeraCarga ? (
          <IgSkeleton variant="row" rows={8} columns={6} label="Cargando la bitácora…" />
        ) : items.length === 0 && !fallo ? (
          <IgEmptyState
            icon={<ManageSearchOutlinedIcon fontSize="medium" />}
            title="La bitácora todavía no tiene nada"
            description={
              <>
                Aquí se anota cada cambio hecho desde INTEGRA: abrir una puerta a
                distancia, tocar un horario, dar de alta a una persona o un vehículo.
                Está vacía porque nadie ha hecho ninguna de esas cosas en esta empresa
                —o porque las hizo antes de que existiera el registro—. Los eventos de
                paso de los terminales no van aquí: eso es Eventos ACS.
              </>
            }
            action={
              <IgBtn onClick={() => void cargar()} disabled={ocupado}>
                <RefreshIcon fontSize="small" aria-hidden />
                &nbsp;Volver a mirar
              </IgBtn>
            }
          />
        ) : pagina.total === 0 ? (
          <IgEmptyState
            icon={<FilterAltOffOutlinedIcon fontSize="medium" />}
            title="Ninguna de las entradas cargadas cae en este filtro"
            description={
              <>
                Hay {items.length} entradas en memoria, pero ninguna cumple lo que has
                pedido. Prueba a ampliar el rango de fechas o a quitar el filtro de
                acción. Recuerda que el servidor solo entrega las {TOPE_SERVIDOR} más
                recientes: si buscas algo antiguo, puede que ni siquiera haya llegado.
              </>
            }
            action={
              <IgBtn onClick={limpiar}>
                <FilterAltOffOutlinedIcon fontSize="small" aria-hidden />
                &nbsp;Quitar filtros
              </IgBtn>
            }
          />
        ) : (
          <>
            <div className={styles.tablaEnvoltorio}>
              <table className={styles.tabla}>
                <caption className={styles.soloLectores}>
                  Mutaciones registradas en INTEGRA. Cada fila se puede desplegar para
                  ver el detalle completo.
                </caption>
                <thead>
                  <tr>
                    <th scope="col" style={{ width: 44 }}>
                      <span className={styles.soloLectores}>Detalle</span>
                    </th>
                    <th scope="col" style={{ width: 170 }}>
                      Cuándo
                    </th>
                    <th scope="col" style={{ width: 230 }}>
                      Acción
                    </th>
                    <th scope="col" style={{ width: 190 }}>
                      Quién
                    </th>
                    <th scope="col" style={{ width: 70 }}>
                      Sitio
                    </th>
                    <th scope="col">Qué cambió</th>
                  </tr>
                </thead>
                <tbody>
                  {pagina.visibles.map((e) => {
                    const abierta = abiertas.has(e.id);
                    const detalleId = `detalle-bitacora-${e.id}`;
                    const critica = esAccionCritica(e.action);
                    // Solo se desmenuza lo que se va a ver: con 100 filas por
                    // página, serializar todos los `changes` en cada render es
                    // trabajo tirado.
                    const detalle = abierta ? describirCambios(e.changes) : null;
                    const relativo = haceCuanto(e.createdAt, ahora);
                    const actor = describirActor(e);
                    const sinUsuario = !e.userName && !e.userEmail;

                    return [
                      <tr
                        key={`fila-${e.id}`}
                        className={styles.filaResumen}
                        data-abierta={abierta ? "1" : undefined}
                        data-critica={critica ? "1" : undefined}
                      >
                        <td>
                          <button
                            type="button"
                            className={styles.desplegar}
                            aria-expanded={abierta}
                            aria-controls={detalleId}
                            onClick={() => alternar(e.id)}
                          >
                            <span className={styles.desplegarIcono} aria-hidden>
                              <ChevronRightIcon fontSize="small" />
                            </span>
                            <span className={styles.soloLectores}>
                              {abierta ? "Ocultar" : "Ver"} el detalle de{" "}
                              {etiquetaAccion(e.action)} del {formatearFecha(e.createdAt)}
                            </span>
                          </button>
                        </td>
                        <td className={styles.celdaCuando}>
                          {formatearFecha(e.createdAt)}
                          {relativo && <span className={styles.celdaRelativa}>{relativo}</span>}
                        </td>
                        <td>
                          <span className={styles.accionNombre}>{etiquetaAccion(e.action)}</span>
                          {critica && (
                            <>
                              {" "}
                              <IgBadge tone="warn">
                                <WarningAmberOutlinedIcon
                                  fontSize="inherit"
                                  aria-hidden
                                  style={{ verticalAlign: "-1px" }}
                                />{" "}
                                Acceso
                              </IgBadge>
                            </>
                          )}
                          <span className={styles.accionCodigo}>{e.action}</span>
                        </td>
                        <td>
                          <span
                            className={sinUsuario ? styles.actorSistema : styles.actorNombre}
                          >
                            {actor}
                          </span>
                        </td>
                        <td className={styles.celdaMono}>{e.entityId ?? "—"}</td>
                        <td>{resumenDeCambios(e.changes) || "—"}</td>
                      </tr>,
                      <tr
                        key={`detalle-${e.id}`}
                        id={detalleId}
                        className={styles.filaDetalle}
                        hidden={!abierta}
                      >
                        <td colSpan={6}>
                          {detalle == null ? null : detalle.campos.length > 0 ? (
                            <dl className={styles.detalleRejilla}>
                              {detalle.campos.map((c) => (
                                <div
                                  key={c.clave}
                                  className={styles.detalleCampo}
                                  data-destacado={c.destacado ? "1" : undefined}
                                >
                                  <dt className={styles.detalleClave}>{c.etiqueta}</dt>
                                  <dd className={styles.detalleValor}>{c.valor}</dd>
                                </div>
                              ))}
                            </dl>
                          ) : (
                            <p className={styles.detalleVacio}>
                              {detalle.json == null
                                ? "Esta entrada se guardó sin detalle: el backend no adjuntó nada a «changes»."
                                : "El detalle llegó vacío ({}). La acción quedó registrada, pero sin campos."}
                            </p>
                          )}
                          {detalle != null && detalle.json != null && (
                            <>
                              <p className={styles.jsonTitulo}>Registro íntegro</p>
                              <pre className={styles.jsonBloque}>{detalle.json}</pre>
                            </>
                          )}
                        </td>
                      </tr>,
                    ];
                  })}
                </tbody>
              </table>
            </div>

            <nav className={styles.paginacion} aria-label="Paginación de la bitácora">
              <span className={styles.paginacionInfo} aria-live="polite">
                {pagina.primero}–{pagina.ultimo} de {pagina.total}
                {conFiltro ? ` (filtradas de ${items.length})` : ""}
              </span>
              <span className={styles.paginacionMandos}>
                <button
                  type="button"
                  className={styles.paginaBtn}
                  onClick={() => irA(1)}
                  disabled={pagina.pagina <= 1}
                  aria-label="Primera página"
                >
                  <FirstPageIcon fontSize="small" aria-hidden />
                </button>
                <button
                  type="button"
                  className={styles.paginaBtn}
                  onClick={() => irA(pagina.pagina - 1)}
                  disabled={pagina.pagina <= 1}
                  aria-label="Página anterior"
                >
                  <NavigateBeforeIcon fontSize="small" aria-hidden />
                </button>
                <span className={styles.paginaActual}>
                  Página {pagina.pagina} de {pagina.paginas}
                </span>
                <button
                  type="button"
                  className={styles.paginaBtn}
                  onClick={() => irA(pagina.pagina + 1)}
                  disabled={pagina.pagina >= pagina.paginas}
                  aria-label="Página siguiente"
                >
                  <NavigateNextIcon fontSize="small" aria-hidden />
                </button>
                <button
                  type="button"
                  className={styles.paginaBtn}
                  onClick={() => irA(pagina.paginas)}
                  disabled={pagina.pagina >= pagina.paginas}
                  aria-label="Última página"
                >
                  <LastPageIcon fontSize="small" aria-hidden />
                </button>
              </span>
            </nav>
          </>
        )}
      </IgPanel>
    </IgPage>
  );
}

export default function IntegraAuditPage() {
  // `useUrlFilters` usa `useSearchParams`: sin frontera de Suspense, Next 14
  // arrastra toda la ruta a render de cliente.
  return (
    <Suspense
      fallback={
        <IgPage>
          <IgToolbar title="Bitácora" meta="Cargando…" />
          <IgPanel title="Mutaciones registradas" flush>
            <IgSkeleton variant="row" rows={8} columns={6} label="Cargando la bitácora…" />
          </IgPanel>
        </IgPage>
      }
    >
      <Bitacora />
    </Suspense>
  );
}
