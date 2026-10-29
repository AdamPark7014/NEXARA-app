"use client";

/**
 * Mesa contable · Pagos y gastos (maqueta aprobada `PagosGastos.dc.html`, 29-10-2026).
 *
 * Cada fila nace sola cuando se paga un viático, un gasto, una compra o la nómina, o llega un
 * cobro. La contadora ve de un vistazo qué falta en cada una (CFDI, banco, póliza) y lo
 * resuelve en el panel derecho: ligar el XML (arrastrado o por UUID), ligar el movimiento del
 * banco y registrar la póliza. Contrato: `/api/accounting/workspace/mesa/pagos-gastos/**`.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type DragEvent, type RefObject } from "react";
import Link from "next/link";
import { useUser } from "@/components/UserContext";
import ContabilidadSidebar from "@/components/erp/ContabilidadSidebar";
import { Alert, EmptyState, SkeletonRows } from "@/components/base";
import {
  Etiqueta,
  Flechas,
  IcoAviso,
  IcoCerrar,
  IcoPalomita,
  Kpi,
  Kpis,
  MesaEncabezado,
  Segmentos,
  TablaPoliza,
  cx,
  m,
} from "@/components/mesa-contable/piezas";
import { exportToExcel } from "@/lib/export-excel";
import { formatApiError } from "@/lib/erp-api";
import {
  ORDEN_TIPO_PG,
  RUTA_BANDEJA,
  TIPO_PG,
  avisarCambioMesa,
  dinero,
  dineroConSigno,
  dineroCorto,
  esArchivoXml,
  esUuid,
  etiquetaMes,
  fechaCorta,
  getDetallePagoGasto,
  getPagosGastos,
  ligarBanco,
  ligarCfdi,
  mesActual,
  moverMes,
  pintaCelda,
  plural,
  primerNombre,
  puntaje,
  quitarVinculo,
  registrarPoliza,
  textoSugerencia,
  type DetallePagoGasto,
  type EstadoCelda,
  type FiltroTipoPG,
  type PagoGastoItem,
  type PagosGastosRespuesta,
  type SugerenciaBanco,
} from "@/lib/mesa-contable";

type Seleccion = Pick<PagoGastoItem, "clave" | "origen" | "origenId">;
type AvisoPanel = { tono: "success" | "danger" | "warning"; texto: string };

export default function PagosYGastosPage() {
  const { user, isContextReady } = useUser();
  const token = user?.token ?? "";

  const [mes, setMes] = useState(() => mesActual());
  const [tipo, setTipo] = useState<FiltroTipoPG>("TODO");
  const [soloPendientes, setSoloPendientes] = useState(true);
  const [data, setData] = useState<PagosGastosRespuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [avisoLista, setAvisoLista] = useState<AvisoPanel | null>(null);

  const [sel, setSel] = useState<Seleccion | null>(null);
  const [cerrado, setCerrado] = useState(false);
  const [detalle, setDetalle] = useState<DetallePagoGasto | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [errorDetalle, setErrorDetalle] = useState<string | null>(null);
  const [accion, setAccion] = useState<string | null>(null);
  const [avisoPanel, setAvisoPanel] = useState<AvisoPanel | null>(null);
  const [uuid, setUuid] = useState("");
  const [uuidError, setUuidError] = useState<string | null>(null);
  const [encima, setEncima] = useState(false);

  const peticion = useRef(0);
  const peticionDetalle = useRef(0);
  const archivo = useRef<HTMLInputElement>(null);
  const inputUuid = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLElement>(null);
  const idUuid = useId();
  const idPanel = useId();

  const cargar = useCallback(async () => {
    if (!token) return;
    const turno = ++peticion.current;
    setError(null);
    try {
      const res = await getPagosGastos(token, { mes, tipo, soloPendientes });
      if (turno !== peticion.current) return;
      setData(res);
    } catch (e) {
      if (turno !== peticion.current) return;
      setError(formatApiError(e, "No se pudieron cargar los pagos y gastos del mes."));
    } finally {
      if (turno === peticion.current) setCargando(false);
    }
  }, [token, mes, tipo, soloPendientes]);

  useEffect(() => {
    if (!isContextReady) return;
    if (!token) {
      setCargando(false);
      return;
    }
    void cargar();
  }, [isContextReady, token, cargar]);

  const items = useMemo(() => data?.items ?? [], [data]);

  // Como en la maqueta, el primer movimiento se abre solo; si la persona cerró el panel, no.
  useEffect(() => {
    if (!data) return;
    if (sel && items.some((i) => i.clave === sel.clave)) return;
    if (cerrado || items.length === 0) {
      setSel(null);
      return;
    }
    const p = items[0];
    setSel({ clave: p.clave, origen: p.origen, origenId: p.origenId });
  }, [data, items, sel, cerrado]);

  const cargarDetalle = useCallback(async () => {
    if (!token || !sel) return;
    const turno = ++peticionDetalle.current;
    setCargandoDetalle(true);
    setErrorDetalle(null);
    try {
      const d = await getDetallePagoGasto(token, sel.origen, sel.origenId);
      if (turno !== peticionDetalle.current) return;
      setDetalle(d);
    } catch (e) {
      if (turno !== peticionDetalle.current) return;
      setDetalle(null);
      setErrorDetalle(formatApiError(e, "No se pudo abrir el detalle del movimiento."));
    } finally {
      if (turno === peticionDetalle.current) setCargandoDetalle(false);
    }
  }, [token, sel]);

  useEffect(() => {
    setAvisoPanel(null);
    setUuid("");
    setUuidError(null);
    if (!sel) {
      setDetalle(null);
      return;
    }
    void cargarDetalle();
  }, [sel, cargarDetalle]);

  const elegir = (it: PagoGastoItem, enfocar?: "xml") => {
    setCerrado(false);
    setSel({ clave: it.clave, origen: it.origen, origenId: it.origenId });
    // En pantallas angostas el panel va debajo: se lleva la vista hasta él.
    window.setTimeout(() => {
      if (window.innerWidth < 1000) panel.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (enfocar === "xml") inputUuid.current?.focus();
    }, 60);
  };

  /** Ejecuta una acción del panel; con éxito pinta el detalle nuevo y refresca la lista y los chips. */
  const correr = useCallback(
    async (clave: string, fn: () => Promise<DetallePagoGasto | null>, exito: string) => {
      setAccion(clave);
      setAvisoPanel(null);
      try {
        const d = await fn();
        if (d) setDetalle(d);
        else await cargarDetalle();
        setAvisoPanel({ tono: "success", texto: exito });
        avisarCambioMesa();
        void cargar();
        return true;
      } catch (e) {
        setAvisoPanel({ tono: "danger", texto: formatApiError(e, "El servidor no respondió. Vuelve a intentarlo.") });
        return false;
      } finally {
        setAccion(null);
      }
    },
    [cargar, cargarDetalle],
  );

  const subirXml = useCallback(
    async (lista: File[]) => {
      if (!token || !sel) return;
      const xmls = lista.filter(esArchivoXml);
      if (xmls.length === 0) {
        setAvisoPanel({ tono: "warning", texto: "Solo se ligan archivos .xml del CFDI (el PDF no sirve para deducir)." });
        return;
      }
      setAccion("xml");
      setAvisoPanel(null);
      const fallas: string[] = [];
      let ultimo: DetallePagoGasto | null = null;
      for (const f of xmls) {
        try {
          ultimo = await ligarCfdi(token, sel.origen, sel.origenId, { xml: await f.text() });
        } catch (e) {
          fallas.push(`${f.name}: ${formatApiError(e, "no se pudo leer")}`);
        }
      }
      if (ultimo) setDetalle(ultimo);
      const ok = xmls.length - fallas.length;
      setAvisoPanel(
        fallas.length
          ? { tono: ok ? "warning" : "danger", texto: `${ok ? `Se ligaron ${plural(ok, "XML", "XML")}. ` : ""}No se ligó ${fallas.join(" · ")}.` }
          : { tono: "success", texto: `Se ${ok === 1 ? "ligó 1 XML" : `ligaron ${ok} XML`} a este movimiento.` },
      );
      setAccion(null);
      if (ok) {
        avisarCambioMesa();
        void cargar();
      }
    },
    [token, sel, cargar],
  );

  const ligarUuid = async () => {
    if (!token || !sel) return;
    const v = uuid.trim();
    if (!esUuid(v)) {
      setUuidError("El UUID tiene 36 caracteres: 8-4-4-4-12 letras y números, como viene en el XML o el PDF del CFDI.");
      return;
    }
    const ok = await correr("uuid", () => ligarCfdi(token, sel.origen, sel.origenId, { uuid: v }), "CFDI ligado por su UUID.");
    if (ok) setUuid("");
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setEncima(false);
    void subirXml(Array.from(e.dataTransfer.files ?? []));
  };

  const abrirSubida = () => {
    if (!sel) {
      setAvisoLista({ tono: "warning", texto: "Elige primero el movimiento al que pertenecen los XML y vuelve a subirlos." });
      return;
    }
    archivo.current?.click();
  };

  const exportar = () => {
    const filas = items.map((i) => ({
      fecha: i.fecha,
      tipo: i.tipoEtiqueta,
      movimiento: i.titulo,
      detalle: i.subtitulo ?? "",
      folio: i.folio?.texto ?? "",
      importe: i.importe,
      cfdi: i.cfdi.texto,
      banco: i.banco.texto,
      poliza: i.poliza.texto,
      pendiente: i.pendiente,
    }));
    exportToExcel(
      filas,
      [
        { key: "fecha", label: "Fecha", tipo: "fecha" },
        { key: "tipo", label: "Tipo" },
        { key: "movimiento", label: "Movimiento" },
        { key: "detalle", label: "Detalle" },
        { key: "folio", label: "Folio" },
        { key: "importe", label: "Importe", tipo: "dinero", total: "suma" },
        { key: "cfdi", label: "CFDI" },
        { key: "banco", label: "Banco" },
        { key: "poliza", label: "Póliza" },
        { key: "pendiente", label: "Con pendientes", tipo: "booleano" },
      ],
      `pagos-y-gastos-${mes}`,
      {
        title: "Pagos y gastos",
        subtitle: data?.periodo.etiqueta ?? etiquetaMes(mes),
        hoja: "Pagos y gastos",
        filtros: [
          { etiqueta: "Tipo", valor: tipo === "TODO" ? "Todo" : TIPO_PG[tipo].pestana },
          { etiqueta: "Solo con pendientes", valor: soloPendientes ? "Sí" : "No" },
        ],
        generadoPor: user?.nombre ?? null,
      },
    );
  };

  const r = data?.resumen;
  const etiqueta = data?.periodo.etiqueta ?? etiquetaMes(mes);
  const esteMes = mesActual();

  const acciones = (
    <>
      <button type="button" className={m.btn} onClick={abrirSubida}>
        Subir XML recibidos
      </button>
      <Link href="/erp/banking" className={m.btn}>
        Importar estado de cuenta
      </Link>
      <button type="button" className={m.btn} onClick={exportar} disabled={!data || items.length === 0}>
        Exportar Excel
      </button>
      <input
        ref={archivo}
        type="file"
        accept=".xml,text/xml,application/xml"
        multiple
        hidden
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          const lista = Array.from(e.target.files ?? []);
          e.target.value = "";
          void subirXml(lista);
        }}
      />
    </>
  );

  const cambiarMes = (n: number) => {
    setMes((x) => moverMes(x, n));
    setCargando(true);
  };

  return (
    <div className={m.page}>
      <MesaEncabezado
        eyebrow="Finanzas · Mesa contable"
        titulo="Pagos y gastos"
        junto={
          <Flechas
            etiqueta={etiqueta}
            onAnterior={() => cambiarMes(-1)}
            onSiguiente={() => cambiarMes(1)}
            siguienteDeshabilitado={mes >= esteMes}
          />
        }
        acciones={acciones}
      />
      <ContabilidadSidebar enPagina />

      {avisoLista ? (
        <Alert tone={avisoLista.tono} role="status" onDismiss={() => setAvisoLista(null)}>
          {avisoLista.texto}
        </Alert>
      ) : null}

      {error ? (
        <Alert
          tone="danger"
          role="alert"
          title="No se pudo cargar el mes."
          action={
            <button type="button" className={cx(m.btn, m.btnRow)} onClick={() => void cargar()}>
              Reintentar
            </button>
          }
        >
          {error}
        </Alert>
      ) : null}

      {cargando || r ? (
        <Kpis etiqueta="Resumen del mes">
          <Kpi cargando={cargando} etiqueta="Entró" valor={dineroCorto(r?.entro.importe)} pista={r ? plural(r.entro.conteo, "cobro") : null} />
          <Kpi
            cargando={cargando}
            etiqueta="Salió"
            valor={dineroCorto(Math.abs(r?.salio.importe ?? 0))}
            pista={r ? (r.salio.conteo === 1 ? "1 pago o gasto" : `${r.salio.conteo} pagos y gastos`) : null}
          />
          <Kpi
            cargando={cargando}
            etiqueta="Sin CFDI"
            valor={r?.sinCfdi.conteo ?? 0}
            tintaValor={r && r.sinCfdi.conteo > 0 ? "warning" : undefined}
            pista={r ? (r.sinCfdi.conteo > 0 ? `${dineroCorto(Math.abs(r.sinCfdi.importe))} que no se pueden deducir aún` : "Todo con su XML") : null}
          />
          <Kpi
            cargando={cargando}
            etiqueta="Por conciliar"
            valor={r?.porConciliar.conteo ?? 0}
            pista={
              r
                ? r.porConciliar.conteo > 0
                  ? `${r.porConciliar.conSugerencia} con sugerencia del banco`
                  : "Banco al día"
                : null
            }
          />
          <Kpi
            cargando={cargando}
            etiqueta="Sin póliza"
            valor={r?.sinPoliza.conteo ?? 0}
            pista={r ? (r.sinPoliza.conteo > 0 ? "No entran a los estados financieros" : "Todo registrado") : null}
          />
        </Kpis>
      ) : null}

      <div className={m.split}>
        <section aria-label="Movimientos" className={cx(m.cardList, m.splitMain)} aria-busy={cargando || undefined}>
          <div className={m.toolbar} style={{ gap: 10 }}>
            <Segmentos
              etiqueta="Tipo"
              valor={tipo}
              onCambio={(t) => {
                setTipo(t);
                setCargando(true);
              }}
              items={ORDEN_TIPO_PG.map((id) => ({ id, texto: id === "TODO" ? "Todo" : TIPO_PG[id].pestana }))}
            />
            <button
              type="button"
              className={m.toggle}
              aria-pressed={soloPendientes}
              onClick={() => {
                setSoloPendientes((v) => !v);
                setCargando(true);
              }}
            >
              Solo con pendientes · {data?.pendientes ?? 0}
            </button>
          </div>

          {cargando ? (
            <SkeletonRows rows={7} label="Cargando los movimientos del mes" />
          ) : items.length === 0 && !error ? (
            soloPendientes && (data?.conteos?.TODO ?? 0) > 0 ? (
              <EmptyState
                tone="success"
                titleAs="h2"
                icon={<IcoPalomita size={22} />}
                title="Nada pendiente este mes"
                description="Cada movimiento ya tiene su CFDI, su banco y su póliza."
                action={
                  <button type="button" className={m.btn} onClick={() => setSoloPendientes(false)}>
                    Ver todos los movimientos
                  </button>
                }
              />
            ) : (
              <EmptyState
                tone="neutral"
                titleAs="h2"
                title={`Sin movimientos en ${etiqueta.toLowerCase()}`}
                description="Las filas aparecen solas cuando se paga un viático, un gasto, una compra o la nómina, o llega un cobro."
              />
            )
          ) : items.length > 0 ? (
            <table className={cx(m.table, m.tableCompact)} style={{ minWidth: 780 }}>
              <caption className={m.srOnly}>Movimientos de {etiqueta}</caption>
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Movimiento</th>
                  <th scope="col" className={m.r}>
                    Importe
                  </th>
                  <th scope="col">CFDI</th>
                  <th scope="col">Banco</th>
                  <th scope="col">Póliza</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const activo = sel?.clave === it.clave;
                  return (
                    <tr
                      key={it.clave}
                      className={cx(m.rowClickable, activo && m.rowSelected)}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest("a, button")) return;
                        elegir(it);
                      }}
                    >
                      <td className={m.nowrap}>{fechaCorta(it.fecha)}</td>
                      <td>
                        <Etiqueta chica categoria={TIPO_PG[it.tipo]?.categoria ?? "gris"}>
                          {it.tipoEtiqueta}
                        </Etiqueta>
                        <br />
                        <button
                          type="button"
                          className={m.rowTitle}
                          aria-pressed={activo}
                          aria-controls={idPanel}
                          onClick={() => elegir(it)}
                        >
                          {it.titulo}
                        </button>{" "}
                        {it.folio ? (
                          it.folio.href ? (
                            <Link href={it.folio.href} style={{ fontSize: 12 }}>
                              {it.folio.texto}
                            </Link>
                          ) : (
                            <span className={m.sub}>{it.folio.texto}</span>
                          )
                        ) : null}
                        {it.subtitulo ? <span className={m.sub}> {it.subtitulo}</span> : null}
                      </td>
                      <td className={cx(m.r, m.nowrap)} data-tinta={it.importe > 0 ? "ok" : undefined} data-fuerte={it.importe > 0 ? "true" : undefined}>
                        {dineroConSigno(it.importe)}
                      </td>
                      <td>
                        <Celda celda={it.cfdi} columna="cfdi" onElegir={(foco) => elegir(it, foco)} />
                      </td>
                      <td>
                        <Celda celda={it.banco} sugerencia={it.banco.sugerencia} columna="banco" onElegir={() => elegir(it)} />
                      </td>
                      <td>
                        <Celda celda={it.poliza} columna="poliza" onElegir={() => elegir(it)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : null}

          {!cargando && items.length > 0 ? (
            <div className={m.listFoot} style={{ gap: 16 }}>
              <span>Cada fila nace sola cuando se paga un viático, un gasto, una compra, la nómina o llega un cobro.</span>
              <span>
                {soloPendientes
                  ? `${items.length} de ${data?.pendientes ?? items.length} pendientes`
                  : `${plural(items.length, "movimiento")} · ${data?.pendientes ?? 0} con pendientes`}
              </span>
            </div>
          ) : null}
        </section>

        {sel ? (
          <aside
            ref={panel}
            id={idPanel}
            aria-label="Detalle del movimiento"
            className={cx(m.panel, m.splitAside)}
            aria-busy={cargandoDetalle || accion != null || undefined}
          >
            {cargandoDetalle && !detalle ? (
              <SkeletonRows rows={6} label="Cargando el detalle" />
            ) : errorDetalle ? (
              <Alert
                tone="danger"
                role="alert"
                action={
                  <button type="button" className={cx(m.btn, m.btnRow)} onClick={() => void cargarDetalle()}>
                    Reintentar
                  </button>
                }
              >
                {errorDetalle}
              </Alert>
            ) : detalle ? (
              <Detalle
                d={detalle}
                accion={accion}
                aviso={avisoPanel}
                onCerrarAviso={() => setAvisoPanel(null)}
                onCerrar={() => {
                  setCerrado(true);
                  setSel(null);
                }}
                uuid={uuid}
                uuidError={uuidError}
                idUuid={idUuid}
                inputUuid={inputUuid}
                encima={encima}
                onUuid={(v) => {
                  setUuid(v);
                  if (uuidError) setUuidError(null);
                }}
                onLigarUuid={() => void ligarUuid()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setEncima(true);
                }}
                onDragLeave={() => setEncima(false)}
                onDrop={onDrop}
                onDesligarBanco={(vinculoId) =>
                  void correr("desligar", async () => {
                    await quitarVinculo(token, vinculoId);
                    return null;
                  }, "Se desligó el movimiento del banco.")
                }
                onLigarBanco={(s) =>
                  sel
                    ? void correr(
                        `banco-${s.bankTransactionId}`,
                        () => ligarBanco(token, sel.origen, sel.origenId, s.bankTransactionId),
                        `Ligado al movimiento del banco del ${fechaCorta(s.fecha)}.`,
                      )
                    : undefined
                }
                onRegistrar={() =>
                  sel ? void correr("poliza", () => registrarPoliza(token, sel.origen, sel.origenId), "Póliza registrada: el movimiento ya entra a los estados financieros.") : undefined
                }
              />
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
  );
}

/* ── Celdas de estado ─────────────────────────────────────────────────── */

function Celda({
  celda,
  columna,
  sugerencia,
  onElegir,
}: {
  celda: EstadoCelda;
  columna: "cfdi" | "banco" | "poliza";
  sugerencia?: SugerenciaBanco | null;
  onElegir: (foco?: "xml") => void;
}) {
  const pinta = pintaCelda(celda.estado);
  const texto = celda.texto || "—";

  if (pinta === "sugerencia") {
    return (
      <button type="button" className={cx(m.btn, m.btnTiny, m.btnInfo)} onClick={() => onElegir()}>
        {textoSugerencia({ texto: celda.texto, sugerencia })}
      </button>
    );
  }

  if (pinta === "aviso") {
    if (celda.accion === "EMITIR_COMPLEMENTO") {
      return (
        <Link href={`${RUTA_BANDEJA}?origen=COMPLEMENTO`} style={{ fontSize: 13 }} data-tinta="warning">
          {texto}
        </Link>
      );
    }
    if (celda.accion === "LIGAR_XML" || celda.accion === "PEDIR_FACTURA") {
      return (
        <button type="button" className={cx(m.btn, m.btnTiny, m.btnWarn)} onClick={() => onElegir(celda.accion === "LIGAR_XML" ? "xml" : undefined)}>
          {texto}
        </button>
      );
    }
    return (
      <span style={{ fontSize: 13 }} data-tinta="warning">
        {texto}
      </span>
    );
  }

  if (pinta === "ok" && columna !== "poliza") {
    return (
      <span className={m.status} data-tinta="ok" style={{ gap: 5 }}>
        <IcoPalomita />
        {texto}
      </span>
    );
  }

  // La póliza registrada se lee como folio (P-0418), sin palomita, como en la maqueta.
  if (columna === "poliza" && (pinta === "ok" || celda.estado === "espera")) {
    return (
      <span style={{ fontSize: 13, color: "var(--mc-ink-2)" }}>{texto}</span>
    );
  }

  return (
    <span style={{ fontSize: 13 }} data-tinta="muted">
      {texto}
    </span>
  );
}

/* ── Panel de detalle ─────────────────────────────────────────────────── */

function Detalle({
  d,
  accion,
  aviso,
  onCerrarAviso,
  onCerrar,
  uuid,
  uuidError,
  idUuid,
  inputUuid,
  encima,
  onUuid,
  onLigarUuid,
  onDragOver,
  onDragLeave,
  onDrop,
  onDesligarBanco,
  onLigarBanco,
  onRegistrar,
}: {
  d: DetallePagoGasto;
  accion: string | null;
  aviso: AvisoPanel | null;
  onCerrarAviso: () => void;
  onCerrar: () => void;
  uuid: string;
  uuidError: string | null;
  idUuid: string;
  inputUuid: RefObject<HTMLInputElement>;
  encima: boolean;
  onUuid: (v: string) => void;
  onLigarUuid: () => void;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent) => void;
  onDesligarBanco: (vinculoId: number) => void;
  onLigarBanco: (s: SugerenciaBanco) => void;
  onRegistrar: () => void;
}) {
  const ocupado = accion != null;
  const nombre = primerNombre(d.responsable?.nombre);

  return (
    <>
      <div className={m.panelHead}>
        <div className={m.headText}>
          <span className={m.meta}>{d.encabezado}</span>
          <h2>{d.item.titulo}</h2>
        </div>
        <button type="button" className={cx(m.btn, m.btnIcon)} style={{ marginLeft: "auto" }} aria-label="Cerrar detalle" onClick={onCerrar}>
          <IcoCerrar />
        </button>
      </div>

      {aviso ? (
        <Alert tone={aviso.tono} role={aviso.tono === "danger" ? "alert" : "status"} onDismiss={onCerrarAviso} dense>
          {aviso.texto}
        </Alert>
      ) : null}

      {d.montos.length ? (
        <div className={m.montos} style={{ "--montos": Math.min(d.montos.length, 3) } as CSSProperties}>
          {d.montos.map((x) => (
            <div key={x.etiqueta}>
              <span className={m.sub}>{x.etiqueta}</span>
              <br />
              <strong>{dinero(x.importe)}</strong>
            </div>
          ))}
        </div>
      ) : null}

      <div className={m.block}>
        <h3>Comprobantes</h3>
        {d.comprobantes.map((c) => (
          <div key={c.vinculoId} className={m.voucher}>
            <IcoPalomita size={16} color="var(--ui-brand)" />
            <span>
              {c.texto}
              {c.uuidCorto ? ` · XML …${c.uuidCorto}` : ""}
            </span>
            <span data-tinta="muted">IVA {dinero(c.iva)}</span>
            <strong className={m.num}>{dinero(c.total)}</strong>
          </div>
        ))}
        {d.sinFactura ? (
          <div className={m.voucher}>
            <IcoAviso size={16} color="var(--ui-warning)" />
            <span>{d.sinFactura.texto}</span>
            <strong className={m.num}>{dinero(d.sinFactura.importe)}</strong>
          </div>
        ) : null}
        {d.comprobantes.length === 0 && !d.sinFactura && !d.aceptaXml ? <p className={m.panelEmpty}>Este movimiento no lleva CFDI.</p> : null}
        {d.aceptaXml ? (
          <div
            className={m.drop}
            data-over={encima ? "true" : undefined}
            onDragOver={onDragOver}
            onDragEnter={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            <label htmlFor={idUuid}>Arrastra aquí el XML o escribe el UUID</label>
            <div className={m.dropRow}>
              <input
                ref={inputUuid}
                id={idUuid}
                className={cx(m.control, m.controlSm)}
                placeholder="UUID del CFDI recibido"
                value={uuid}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => onUuid(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onLigarUuid();
                  }
                }}
                aria-invalid={uuidError ? true : undefined}
                aria-describedby={uuidError ? `${idUuid}-error` : undefined}
                disabled={ocupado}
              />
              {uuid.trim() ? (
                <button type="button" className={cx(m.btn, m.btnRow)} onClick={onLigarUuid} disabled={ocupado} aria-busy={accion === "uuid" || undefined}>
                  {accion === "uuid" ? "Ligando…" : "Ligar"}
                </button>
              ) : null}
            </div>
            {uuidError ? (
              <span id={`${idUuid}-error`} className={m.fieldError} role="alert">
                {uuidError}
              </span>
            ) : null}
            {accion === "xml" ? <span role="status">Leyendo los XML…</span> : null}
          </div>
        ) : null}
      </div>

      <div className={m.block}>
        <h3>Banco</h3>
        {d.banco.vinculado ? (
          <div className={m.bankRow}>
            <IcoPalomita size={16} color="var(--ui-brand)" />
            <span>{d.banco.vinculado.texto}</span>
            <strong className={m.num}>{dinero(d.banco.vinculado.importe)}</strong>
            {d.banco.vinculado.vinculoId != null ? (
              <button
                type="button"
                className={m.linkBtn}
                style={{ fontSize: 12 }}
                onClick={() => onDesligarBanco(d.banco.vinculado!.vinculoId as number)}
                disabled={ocupado}
              >
                Desligar
              </button>
            ) : null}
          </div>
        ) : d.banco.sugerencias.length ? (
          d.banco.sugerencias.map((s) => (
            <div key={s.bankTransactionId} className={cx(m.bankRow, m.bankSug)}>
              <span>
                {fechaCorta(s.fecha)} · {s.descripcion}
                <br />
                <span className={m.sub}>{s.cuenta}</span>
              </span>
              <strong className={m.num}>{dinero(s.importe)}</strong>
              <button
                type="button"
                className={cx(m.btn, m.btnTiny, m.btnInfo)}
                onClick={() => onLigarBanco(s)}
                disabled={ocupado}
                aria-busy={accion === `banco-${s.bankTransactionId}` || undefined}
              >
                Ligar · {puntaje(s.score)} %
              </button>
            </div>
          ))
        ) : (
          <p className={m.panelEmpty}>
            Todavía no aparece en el banco. <Link href="/erp/banking">Importa el estado de cuenta</Link> para encontrarlo.
          </p>
        )}
      </div>

      <div className={m.block}>
        <h3>{d.polizaRegistrada ? "Póliza registrada" : "Póliza propuesta"}</h3>
        {d.polizaRegistrada ? (
          <span className={m.status} data-tinta="ok">
            <IcoPalomita />
            {d.polizaRegistrada.numero}
          </span>
        ) : null}
        {d.polizaPropuesta.length ? (
          <TablaPoliza lineas={d.polizaPropuesta} caption={`Póliza de ${d.encabezado}`} />
        ) : (
          <p className={m.panelEmpty}>La póliza se propone en cuanto el movimiento tiene su comprobante.</p>
        )}
      </div>

      <div className={m.buttons}>
        <button
          type="button"
          className={cx(m.btn, m.btnPrimary)}
          onClick={onRegistrar}
          disabled={!d.puedeRegistrarPoliza || d.polizaRegistrada != null || ocupado}
          aria-busy={accion === "poliza" || undefined}
        >
          {accion === "poliza" ? "Registrando…" : "Registrar póliza"}
        </button>
        {d.responsable ? (
          <Link href="/erp/chat" className={m.btn}>
            Pedir aclaración a {nombre || d.responsable.nombre}
          </Link>
        ) : null}
      </div>
    </>
  );
}
