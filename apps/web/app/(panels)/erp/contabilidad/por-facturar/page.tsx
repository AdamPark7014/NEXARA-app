"use client";

/**
 * Mesa contable · Por facturar (maqueta aprobada `Main.dc.html`, 29-10-2026).
 *
 * La bandeja de la contadora: todo lo que ya se puede facturar (servicios terminados,
 * cotizaciones aprobadas, anticipos, pedidos y complementos de pago), ordenado de lo más
 * antiguo a lo más reciente. Cada renglón trae lo que falta antes de timbrar y el botón que
 * lo resuelve. Contrato: `GET/POST /api/accounting/workspace/mesa/por-facturar`.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/UserContext";
import ContabilidadSidebar from "@/components/erp/ContabilidadSidebar";
import { Alert, EmptyState, SkeletonRows } from "@/components/base";
import {
  Aviso,
  Dialogo,
  Etiqueta,
  IcoLupa,
  IcoPalomita,
  Kpi,
  Kpis,
  MenuFila,
  MesaEncabezado,
  Segmentos,
  cx,
  m,
} from "@/components/mesa-contable/piezas";
import { formatApiError } from "@/lib/erp-api";
import {
  ORDEN_ORIGEN_PF,
  ORIGEN_PF,
  avisarCambioMesa,
  avisoTimbrado,
  botonPorFacturar,
  descartarPendiente,
  dinero,
  dineroCorto,
  diasTexto,
  fechaCorta,
  filtrarPorFacturar,
  getPorFacturar,
  haceDias,
  plural,
  prepararFactura,
  preparableEnLote,
  rutaBorrador,
  semaforoDeHabiles,
  timbrarComplemento,
  tintaSemaforo,
  type FiltroOrigenPF,
  type PorFacturarItem,
  type PorFacturarRespuesta,
} from "@/lib/mesa-contable";

type AvisoAccion = { tono: "success" | "warning" | "danger"; texto: string };

const MOTIVO_MIN = 5;

export default function PorFacturarPage() {
  const router = useRouter();
  const { user, isContextReady } = useUser();
  const token = user?.token ?? "";

  const [data, setData] = useState<PorFacturarRespuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [origen, setOrigen] = useState<FiltroOrigenPF>("TODO");
  const [busqueda, setBusqueda] = useState("");
  const [seleccion, setSeleccion] = useState<Set<string>>(() => new Set());
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [lote, setLote] = useState(false);
  const [aviso, setAviso] = useState<AvisoAccion | null>(null);

  const [descartar, setDescartar] = useState<PorFacturarItem | null>(null);
  const [motivo, setMotivo] = useState("");
  const [motivoError, setMotivoError] = useState<string | null>(null);
  const [descartando, setDescartando] = useState(false);

  const idBusqueda = useId();
  const idMotivo = useId();
  const peticion = useRef(0);
  const todos = useRef<HTMLInputElement>(null);

  // Lo que deja otra pantalla en la URL: «?timbrada=A-232» al volver del CFDI y
  // «?origen=COMPLEMENTO» desde Pagos y gastos. Se lee una vez y se limpia.
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    const timbrada = qs.get("timbrada");
    const o = qs.get("origen") as FiltroOrigenPF | null;
    if (o && ORDEN_ORIGEN_PF.includes(o)) setOrigen(o);
    if (timbrada) setAviso({ tono: "success", texto: `Se timbró ${timbrada} y se mandó al cliente. Ya no aparece en la bandeja.` });
    if (timbrada || o) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const cargar = useCallback(async () => {
    if (!token) return;
    const turno = ++peticion.current;
    setError(null);
    try {
      const res = await getPorFacturar(token, "TODO");
      if (turno !== peticion.current) return;
      setData(res);
      // Lo seleccionado que ya salió de la bandeja deja de contar.
      setSeleccion((prev) => new Set(Array.from(prev).filter((k) => res.items.some((i) => i.clave === k))));
    } catch (e) {
      if (turno !== peticion.current) return;
      setError(formatApiError(e, "No se pudo cargar lo que está por facturar."));
    } finally {
      if (turno === peticion.current) setCargando(false);
    }
  }, [token]);

  useEffect(() => {
    if (!isContextReady) return;
    if (!token) {
      setCargando(false);
      return;
    }
    void cargar();
  }, [isContextReady, token, cargar]);

  const items = useMemo(() => data?.items ?? [], [data]);
  const visibles = useMemo(() => filtrarPorFacturar(items, origen, busqueda), [items, origen, busqueda]);
  const seleccionados = useMemo(() => items.filter((i) => seleccion.has(i.clave)), [items, seleccion]);
  const todosMarcados = visibles.length > 0 && visibles.every((i) => seleccion.has(i.clave));
  const algunosMarcados = visibles.some((i) => seleccion.has(i.clave));

  useEffect(() => {
    if (todos.current) todos.current.indeterminate = algunosMarcados && !todosMarcados;
  }, [algunosMarcados, todosMarcados]);

  const alternar = (clave: string) =>
    setSeleccion((prev) => {
      const s = new Set(prev);
      if (s.has(clave)) s.delete(clave);
      else s.add(clave);
      return s;
    });

  const alternarTodos = () =>
    setSeleccion((prev) => {
      const s = new Set(prev);
      if (todosMarcados) visibles.forEach((i) => s.delete(i.clave));
      else visibles.forEach((i) => s.add(i.clave));
      return s;
    });

  const preparar = useCallback(
    async (item: PorFacturarItem) => {
      if (!token) return;
      setTrabajando(item.clave);
      setAviso(null);
      try {
        const { invoiceId } = await prepararFactura(token, item.origen, item.origenId);
        avisarCambioMesa();
        router.push(rutaBorrador(invoiceId));
      } catch (e) {
        setAviso({ tono: "danger", texto: `No se pudo preparar ${item.folio}. ${formatApiError(e, "El servidor no respondió.")}` });
        setTrabajando(null);
      }
    },
    [token, router],
  );

  const complemento = useCallback(
    async (item: PorFacturarItem) => {
      if (!token) return;
      setTrabajando(item.clave);
      setAviso(null);
      try {
        await timbrarComplemento(token, item.origenId);
        setAviso({ tono: "success", texto: `Se emitió el complemento de pago de ${item.folio} (${item.cliente.nombre}).` });
        avisarCambioMesa();
        await cargar();
      } catch (e) {
        setAviso({ tono: "danger", texto: `No se pudo emitir el complemento de ${item.folio}. ${formatApiError(e, "El servidor no respondió.")}` });
      } finally {
        setTrabajando(null);
      }
    },
    [token, cargar],
  );

  const prepararLote = useCallback(async () => {
    if (!token || seleccionados.length === 0) return;
    setLote(true);
    setAviso(null);
    const ids: number[] = [];
    const fallas: string[] = [];
    const saltados = seleccionados.filter((i) => !preparableEnLote(i));
    // En serie y en el orden de la bandeja (lo más antiguo primero).
    for (const item of seleccionados.filter(preparableEnLote)) {
      try {
        if (item.accion === "ABRIR_BORRADOR" && item.facturaBorradorId != null) ids.push(item.facturaBorradorId);
        else ids.push((await prepararFactura(token, item.origen, item.origenId)).invoiceId);
      } catch (e) {
        fallas.push(`${item.folio}: ${formatApiError(e, "no respondió el servidor")}`);
      }
    }
    avisarCambioMesa();
    if (ids.length > 0 && fallas.length === 0) {
      router.push(rutaBorrador(ids[0]));
      return;
    }
    const partes: string[] = [];
    if (ids.length) partes.push(`Quedaron listos ${plural(ids.length, "borrador", "borradores")}; ábrelos con «Abrir borrador».`);
    if (fallas.length) partes.push(`No se pudo preparar ${fallas.join(" · ")}.`);
    if (saltados.length)
      partes.push(
        `${saltados.map((i) => i.folio).join(", ")} no se prepara${saltados.length === 1 ? "" : "n"} en lote: usa su propio botón.`,
      );
    setAviso({ tono: fallas.length ? "danger" : "warning", texto: partes.join(" ") });
    setLote(false);
    await cargar();
  }, [token, seleccionados, router, cargar]);

  const abrirDescartar = (item: PorFacturarItem) => {
    setDescartar(item);
    setMotivo("");
    setMotivoError(null);
  };

  const confirmarDescartar = useCallback(async () => {
    if (!token || !descartar) return;
    const texto = motivo.trim();
    if (texto.length < MOTIVO_MIN) {
      setMotivoError(`Escribe el motivo (al menos ${MOTIVO_MIN} letras): queda en el historial de ${descartar.folio}.`);
      return;
    }
    setDescartando(true);
    try {
      await descartarPendiente(token, descartar.origen, descartar.origenId, texto);
      setAviso({ tono: "success", texto: `${descartar.folio} salió de la bandeja: no se factura. Motivo: ${texto}` });
      setDescartar(null);
      avisarCambioMesa();
      await cargar();
    } catch (e) {
      setMotivoError(formatApiError(e, "No se pudo guardar. Vuelve a intentarlo."));
    } finally {
      setDescartando(false);
    }
  }, [token, descartar, motivo, cargar]);

  const r = data?.resumen;
  const avisoT = avisoTimbrado(data?.timbrado);
  const antiguo = semaforoDeHabiles(r?.masAntiguoHabiles);
  const total = data?.conteos?.TODO ?? items.length;

  const accionesHead = (
    <>
      <Link href="/erp/invoicing" className={m.btn}>
        Factura libre
      </Link>
      <button
        type="button"
        className={cx(m.btn, m.btnPrimary)}
        disabled={seleccionados.length === 0 || lote}
        aria-busy={lote || undefined}
        onClick={() => void prepararLote()}
      >
        {lote ? "Preparando…" : seleccionados.length > 0 ? `Preparar ${plural(seleccionados.length, "seleccionado")}` : "Preparar seleccionados"}
      </button>
    </>
  );

  return (
    <div className={m.page}>
      <MesaEncabezado eyebrow="Finanzas · Mesa contable" titulo="Por facturar" acciones={accionesHead} />
      <ContabilidadSidebar enPagina />

      {avisoT ? (
        <Aviso tono={avisoT.tono} titulo={avisoT.titulo}>
          {avisoT.texto || null}
        </Aviso>
      ) : null}

      {aviso ? (
        <Alert tone={aviso.tono} role={aviso.tono === "danger" ? "alert" : "status"} onDismiss={() => setAviso(null)}>
          {aviso.texto}
        </Alert>
      ) : null}

      {error ? (
        <Alert
          tone="danger"
          role="alert"
          title="No se pudo cargar la bandeja."
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
        <Kpis etiqueta="Resumen">
          <Kpi
            cargando={cargando}
            etiqueta="Por facturar"
            valor={dineroCorto(r?.importe)}
            pista={r ? `${plural(r.conceptos, "concepto")} · ${plural(r.clientes, "cliente")}` : null}
          />
          <Kpi
            cargando={cargando}
            etiqueta="Lo más antiguo"
            valor={r?.masAntiguoDias != null ? diasTexto(r.masAntiguoDias) : "—"}
            tintaValor={r?.masAntiguoDias != null && antiguo !== "ok" ? tintaSemaforo(antiguo) : undefined}
            pista="Meta: facturar en 2 días hábiles"
          />
          <Kpi
            cargando={cargando}
            etiqueta="Anticipos por emitir"
            valor={r?.anticipos.conteo ?? 0}
            pista={r ? (r.anticipos.conteo > 0 ? `${dineroCorto(r.anticipos.importe)} de cotizaciones aprobadas` : "Ninguno pendiente") : null}
          />
          <Kpi
            cargando={cargando}
            etiqueta="Cobros sin complemento"
            valor={r?.complementos.conteo ?? 0}
            pista={r ? (r.complementos.conteo > 0 ? "Vence el día 5 del mes siguiente" : "Al día") : null}
            tintaPista={r && r.complementos.conteo > 0 ? "warning" : undefined}
            pistaFuerte={Boolean(r && r.complementos.conteo > 0)}
          />
          <Kpi
            oscura
            cargando={cargando}
            etiqueta={`Facturado en ${r?.facturadoMes.mes || "el mes"}`}
            valor={dineroCorto(r?.facturadoMes.importe)}
            pista={
              r
                ? [
                    plural(r.facturadoMes.conteo, "CFDI", "CFDI"),
                    r.facturadoMes.cancelacionesPendientes > 0
                      ? plural(r.facturadoMes.cancelacionesPendientes, "cancelación en trámite", "cancelaciones en trámite")
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : null
            }
          />
        </Kpis>
      ) : null}

      <section aria-label="Pendientes de facturar" className={m.cardList} aria-busy={cargando || undefined}>
        <div className={m.toolbar}>
          <Segmentos
            etiqueta="Origen"
            valor={origen}
            onCambio={setOrigen}
            items={ORDEN_ORIGEN_PF.map((id) => ({
              id,
              texto: `${id === "TODO" ? "Todo" : ORIGEN_PF[id].plural} · ${data?.conteos?.[id] ?? 0}`,
            }))}
          />
          <label htmlFor={idBusqueda} className={m.search}>
            <IcoLupa />
            <span className={m.srOnly}>Buscar cliente o folio</span>
            <input
              id={idBusqueda}
              type="search"
              placeholder="Buscar cliente o folio"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </label>
        </div>

        {cargando ? (
          <SkeletonRows rows={6} label="Cargando lo que está por facturar" />
        ) : items.length === 0 && !error ? (
          <EmptyState
            tone="success"
            titleAs="h2"
            icon={<IcoPalomita size={22} />}
            title="Nada pendiente por facturar"
            description="Cuando se termine un servicio, se apruebe una cotización o llegue un cobro de una factura a crédito, aparecerá aquí para timbrarlo."
            action={
              <Link href="/erp/invoicing" className={m.btn}>
                Factura libre
              </Link>
            }
          />
        ) : visibles.length === 0 && items.length > 0 ? (
          <EmptyState
            tone="neutral"
            size="compact"
            title={busqueda.trim() ? `Nada coincide con «${busqueda.trim()}»` : `No hay ${ORIGEN_PF[origen as keyof typeof ORIGEN_PF]?.plural.toLowerCase() ?? "pendientes"} por facturar`}
            description="Prueba con otro cliente, otro folio u otro origen."
            action={
              <button
                type="button"
                className={m.btn}
                onClick={() => {
                  setBusqueda("");
                  setOrigen("TODO");
                }}
              >
                Ver todo
              </button>
            }
          />
        ) : items.length > 0 ? (
          <table className={m.table} style={{ minWidth: 1100 }}>
            <caption className={m.srOnly}>Pendientes de facturar, de lo más antiguo a lo más reciente</caption>
            <thead>
              <tr>
                <th scope="col" style={{ width: 28 }}>
                  <input
                    ref={todos}
                    type="checkbox"
                    className={m.check}
                    aria-label="Seleccionar todo"
                    checked={todosMarcados}
                    onChange={alternarTodos}
                  />
                </th>
                <th scope="col">Cliente</th>
                <th scope="col">Qué se factura</th>
                <th scope="col">Origen</th>
                <th scope="col">Listo desde</th>
                <th scope="col" className={m.r}>
                  Importe con IVA
                </th>
                <th scope="col">Antes de timbrar</th>
                <th scope="col" className={m.r}>
                  <span className={m.srOnly}>Acción</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((item) => (
                <Renglon
                  key={item.clave}
                  item={item}
                  marcado={seleccion.has(item.clave)}
                  ocupado={trabajando === item.clave}
                  bloqueado={lote || trabajando != null}
                  onMarcar={() => alternar(item.clave)}
                  onPreparar={() => void preparar(item)}
                  onComplemento={() => void complemento(item)}
                  onDescartar={() => abrirDescartar(item)}
                />
              ))}
            </tbody>
          </table>
        ) : null}

        {!cargando && items.length > 0 ? (
          <div className={m.listFoot}>
            <span>
              {visibles.length} de {total} · ordenado de lo más antiguo a lo más reciente
            </span>
            <span>Lo que se timbra aquí queda ligado a su servicio, cotización o pedido, y la póliza de ingreso se registra sola.</span>
          </div>
        ) : null}
      </section>

      <Dialogo
        abierto={descartar != null}
        titulo="No se factura"
        descripcion={
          descartar ? (
            <>
              {descartar.folio} · {descartar.concepto} ({descartar.cliente.nombre}) sale de la bandeja. Di por qué: queda en su historial.
            </>
          ) : null
        }
        onCerrar={() => (descartando ? undefined : setDescartar(null))}
        onEnviar={() => void confirmarDescartar()}
        acciones={
          <>
            <button type="button" className={m.btn} onClick={() => setDescartar(null)} disabled={descartando}>
              Cancelar
            </button>
            <button type="submit" className={cx(m.btn, m.btnDanger)} disabled={descartando} aria-busy={descartando || undefined}>
              {descartando ? "Guardando…" : "No se factura"}
            </button>
          </>
        }
      >
        <label htmlFor={idMotivo} className={m.field}>
          Motivo
          <textarea
            id={idMotivo}
            className={m.control}
            value={motivo}
            onChange={(e) => {
              setMotivo(e.target.value);
              if (motivoError) setMotivoError(null);
            }}
            placeholder="Ej.: garantía, cortesía acordada con el cliente, se factura junto con otro servicio"
            aria-invalid={motivoError ? true : undefined}
            aria-describedby={motivoError ? `${idMotivo}-error` : undefined}
            aria-required="true"
          />
        </label>
        {motivoError ? (
          <span id={`${idMotivo}-error`} className={m.fieldError} role="alert">
            {motivoError}
          </span>
        ) : null}
      </Dialogo>
    </div>
  );
}

function Folio({ item }: { item: PorFacturarItem }) {
  return item.folioHref ? <Link href={item.folioHref}>{item.folio}</Link> : <span>{item.folio}</span>;
}

function Renglon({
  item,
  marcado,
  ocupado,
  bloqueado,
  onMarcar,
  onPreparar,
  onComplemento,
  onDescartar,
}: {
  item: PorFacturarItem;
  marcado: boolean;
  ocupado: boolean;
  bloqueado: boolean;
  onMarcar: () => void;
  onPreparar: () => void;
  onComplemento: () => void;
  onDescartar: () => void;
}) {
  const origen = ORIGEN_PF[item.origen];
  const boton = botonPorFacturar(item);
  const tinta = tintaSemaforo(item.semaforo);
  const nombre = `${item.cliente.nombre} ${item.folio}`;

  return (
    <tr>
      <td>
        <input type="checkbox" className={m.check} checked={marcado} onChange={onMarcar} aria-label={`Seleccionar ${nombre}`} />
      </td>
      <td>
        <strong>{item.cliente.nombre}</strong>
        <br />
        <span className={m.sub}>{item.cliente.rfc ?? "Sin RFC"}</span>
      </td>
      <td>
        {item.origen === "COMPLEMENTO" ? (
          <>
            {item.concepto} <Folio item={item} />
          </>
        ) : (
          <>
            <Folio item={item} /> · {item.concepto}
          </>
        )}
        {item.detalle ? (
          <>
            <br />
            <span className={m.sub}>{item.detalle}</span>
          </>
        ) : null}
      </td>
      <td>
        <Etiqueta categoria={origen?.categoria ?? "gris"}>{origen?.etiqueta ?? item.origen}</Etiqueta>
      </td>
      <td className={m.nowrap}>
        {fechaCorta(item.listoDesde)}
        <br />
        <span className={m.sub} data-tinta={tinta} data-fuerte={tinta !== "muted" ? "true" : undefined}>
          {haceDias(item.diasEsperando)}
        </span>
      </td>
      <td className={cx(m.r, m.nowrap)}>
        {item.importe == null ? (
          <span data-tinta="muted">sin precio</span>
        ) : (
          <strong>{dinero(item.importe)}</strong>
        )}
        {item.menos ? (
          <>
            <br />
            <span className={m.sub}>
              {item.menos.etiqueta} {dineroCorto(item.menos.importe)}
            </span>
          </>
        ) : null}
      </td>
      <td>
        {item.pendientes.length > 0 || item.nota ? (
          <span className={m.stack}>
            {item.pendientes.map((p) => (
              <span key={p.clave} data-tinta="warning">
                {p.texto}
              </span>
            ))}
            {item.nota ? <span data-tinta="info">{item.nota}</span> : null}
          </span>
        ) : (
          <span className={m.status} data-tinta="ok">
            <IcoPalomita />
            Listo
          </span>
        )}
      </td>
      <td className={m.r}>
        <span className={m.rowActions}>
          {boton.tipo === "abrir" ? (
            <Link href={boton.href} className={cx(m.btn, m.btnRow, m.btnPrimary)}>
              {boton.texto}
            </Link>
          ) : boton.tipo === "enlace" ? (
            boton.href ? (
              <Link href={boton.href} className={cx(m.btn, m.btnRow)}>
                {boton.texto}
              </Link>
            ) : (
              <button type="button" className={cx(m.btn, m.btnRow)} disabled title="Este pendiente no trae a dónde ir">
                {boton.texto}
              </button>
            )
          ) : (
            <button
              type="button"
              className={cx(m.btn, m.btnRow, m.btnPrimary)}
              onClick={boton.tipo === "complemento" ? onComplemento : onPreparar}
              disabled={bloqueado}
              aria-busy={ocupado || undefined}
            >
              {ocupado ? (boton.tipo === "complemento" ? "Emitiendo…" : "Preparando…") : boton.texto}
            </button>
          )}
          <MenuFila etiqueta={`Más acciones para ${nombre}`} opciones={[{ texto: "No se factura", onElegir: onDescartar }]} />
        </span>
      </td>
    </tr>
  );
}
