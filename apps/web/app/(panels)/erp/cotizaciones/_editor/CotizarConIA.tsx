"use client";

import { useMemo, useState } from "react";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { Alert, Button, Input, Textarea } from "@/components/base";
import DictadoBoton from "@/components/DictadoBoton";
import { formatApiError } from "@/lib/erp-api";
import { unirDictado } from "@/lib/use-dictado";
import {
  formatoFecha,
  formatoMoneda,
  interpretarCotizacion,
  type ClientePropuesta,
  type OpcionPropuesta,
  type PropuestaCotizacion,
  type Segmento,
} from "@/lib/cotizaciones-api";
import { leerAviso, type LecturaAviso } from "@/lib/aviso-costo-ct";
import {
  conMargen,
  deshacerCostoDeHoy,
  elegirOpcion,
  filasDePropuesta,
  importeDeFila,
  resumenDeFilas,
  subirPrecioDeHoy,
  usarCostoDeHoy,
  type DatosDePropuesta,
  type FilaPropuesta,
} from "@/lib/cotizar-ia";
import { porcentajeMargen, textoDePorcentaje } from "@/lib/cotizacion-documento";
import AvisoCosto from "./AvisoCosto";
import { TextoAuto } from "./campos";
import s from "./CotizarConIA.module.css";

const MAX_TEXTO = 6000;

const aNumero = (texto: string) => {
  const n = Number(texto.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const conComas = (n: number) => n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Número de la tarjeta: acepta «1,250.50» y, fuera de foco, se lee con comas. */
function CampoNumero({
  valor,
  onValor,
  etiqueta,
  decimales = 2,
  placeholder,
  resaltado = false,
}: {
  valor: number;
  onValor: (n: number) => void;
  etiqueta: string;
  decimales?: number;
  placeholder?: string;
  /** Lo movió un botón: se marca para que se vea. */
  resaltado?: boolean;
}) {
  const [texto, setTexto] = useState<string | null>(null);
  const visible = texto ?? (valor ? (decimales ? conComas(valor) : String(valor)) : "");
  return (
    <input
      className={`${s.numero} ${resaltado ? s.numeroMovido : ""}`}
      inputMode="decimal"
      value={visible}
      placeholder={placeholder}
      aria-label={etiqueta}
      onFocus={() => setTexto(valor ? String(valor) : "")}
      onBlur={() => setTexto(null)}
      onChange={(e) => {
        const limpio = e.target.value.replace(/[^\d.,$\s]/g, "");
        setTexto(limpio);
        onValor(aNumero(limpio));
      }}
    />
  );
}

/** De dónde salió lo que está en la fila, en palabras de quien cotiza. */
function origenDe(f: FilaPropuesta, moneda: string): { texto: string; tono: "lista" | "elige" | null; detalle: string } {
  const pieza = [f.brand, f.model].filter(Boolean).join(" ");
  const con = (extra: string) => [pieza, extra].filter(Boolean).join(" · ");
  if (f.fuente === "usada") {
    return { texto: "Ya cotizada", tono: "lista", detalle: con(f.ultimaVez ? `último precio ${formatoFecha(f.ultimaVez)}` : "") };
  }
  if (f.fuente === "catalogo") {
    return { texto: "Del mayorista", tono: "lista", detalle: con(`costo ${formatoMoneda(f.unitCost, moneda)}${f.stock ? " · en stock" : " · sobre pedido"}`) };
  }
  if (f.fuente === "paquete") return { texto: "Del paquete", tono: "elige", detalle: "Precio de referencia: revísalo" };
  if (f.fuente === "formato") return { texto: "", tono: null, detalle: con("Sin precio todavía") };
  if (f.unitPrice) return { texto: "De tu lista", tono: "lista", detalle: pieza };
  if (f.opcionElegida == null && f.alternativas.length) return { texto: "Elige una o escribe el precio", tono: "elige", detalle: "" };
  return { texto: "", tono: null, detalle: "Sin precio todavía" };
}

/** El botón de una opción: qué es y cuánto. */
function textoDeOpcion(o: OpcionPropuesta, moneda: string): { nombre: string; cifra: string; nota: string } {
  const corto = [o.brand, o.model].filter(Boolean).join(" ");
  const nombre = (corto && o.fuente === "catalogo" ? corto : o.name.split("\n")[0]!).slice(0, 44);
  if (o.fuente === "catalogo") return { nombre, cifra: formatoMoneda(o.unitCost, moneda), nota: "costo" };
  if (o.fuente === "paquete") return { nombre, cifra: formatoMoneda(o.unitPrice, moneda), nota: "referencia" };
  return { nombre, cifra: o.unitPrice ? formatoMoneda(o.unitPrice, moneda) : "", nota: o.unitPrice ? "" : "sin precio" };
}

/** «14 piezas», «1 servicio». */
const cuantas = (n: number, unidad: string) => `${n} ${unidad.toLowerCase()}${n === 1 || /s$/i.test(unidad) ? "" : "s"}`;

function notaDeCliente(c: ClientePropuesta): string {
  if (c.seguridad === "alta") return "Ya le has cotizado";
  if (c.seguridad === "generico") return "No lo dijiste: cámbialo cuando lo sepas";
  if (c.seguridad === "media") return "¿Es alguno de estos?";
  return "Cliente nuevo: se guarda como texto";
}

/**
 * «Cotizar con IA»: se escribe, se dicta o se pega lo que hay que cotizar y aparece armado para
 * revisarlo. No guarda nada: «Usar en la cotización» lo pasa al documento y de ahí se guarda solo.
 */
export default function CotizarConIA({
  token,
  excluir,
  hayPartidas,
  moneda,
  onUsar,
  onPartirDe,
}: {
  token: string | null;
  /** La cotización abierta: sus partidas no cuentan como «ya cotizadas». */
  excluir: number | null;
  /** Ya se capturó a mano: sin una propuesta abierta, la caja deja de estorbar. */
  hayPartidas: boolean;
  moneda: string;
  onUsar: (datos: DatosDePropuesta) => void;
  onPartirDe: (id: number, cliente: { salesClientId: number | null; nombre: string } | null) => Promise<void>;
}) {
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [propuesta, setPropuesta] = useState<PropuestaCotizacion | null>(null);
  const [cliente, setCliente] = useState<ClientePropuesta | null>(null);
  const [proyecto, setProyecto] = useState("");
  const [margen, setMargen] = useState("");
  const [filas, setFilas] = useState<FilaPropuesta[]>([]);
  const [extras, setExtras] = useState<FilaPropuesta[]>([]);
  const [copiando, setCopiando] = useState(false);

  const margenActual = porcentajeMargen(margen);

  const resumen = useMemo(() => resumenDeFilas([...filas, ...extras]), [filas, extras]);

  async function armar() {
    const limpio = texto.trim();
    if (!token || !limpio || pensando) return;
    setPensando(true);
    setError(null);
    try {
      const r = await interpretarCotizacion(token, limpio, { excluir, moneda });
      const m = r.margen ?? r.margenPorOmision;
      setPropuesta(r);
      setCliente(r.cliente);
      setProyecto(r.proyecto);
      setMargen(textoDePorcentaje(m));
      setFilas(filasDePropuesta(r.partidas, m));
      setExtras(filasDePropuesta(r.complementos, m, false));
    } catch (e) {
      setError(formatApiError(e, "No se pudo armar la cotización"));
    } finally {
      setPensando(false);
    }
  }

  function descartar() {
    setPropuesta(null);
    setCliente(null);
    setFilas([]);
    setExtras([]);
    setError(null);
  }

  const cambiarFila = (key: string, cambio: (f: FilaPropuesta) => FilaPropuesta) =>
    setFilas((lista) => lista.map((f) => (f.key === key ? cambio(f) : f)));

  function cambiarMargen(valor: string) {
    setMargen(valor);
    const m = porcentajeMargen(valor);
    setFilas((lista) => conMargen(lista, m));
    setExtras((lista) => conMargen(lista, m));
  }

  function usar() {
    if (!propuesta || !cliente) return;
    onUsar({
      cliente: { salesClientId: cliente.salesClientId, nombre: cliente.nombre },
      proyecto,
      segmento: propuesta.segmento as Segmento,
      conIva: propuesta.conIva,
      filas: [...filas, ...extras],
    });
  }

  async function partirDe(id: number) {
    setCopiando(true);
    setError(null);
    try {
      const dicho = cliente && cliente.seguridad !== "generico" ? { salesClientId: cliente.salesClientId, nombre: cliente.nombre } : null;
      await onPartirDe(id, dicho);
    } catch (e) {
      setError(formatApiError(e, "No se pudo abrir esa cotización"));
    } finally {
      setCopiando(false);
    }
  }

  if (hayPartidas && !propuesta) return null;

  const avisosVisibles = (propuesta?.avisos ?? []).filter((a) => !/no tienen? precio/.test(a));

  return (
    <div className={s.caja} data-testid="cotizar-con-ia">
      <section className={s.tarjeta} aria-labelledby="cotizar-ia-titulo">
        <div className={s.cabeza}>
          <AutoAwesomeOutlinedIcon className={s.icono} aria-hidden="true" />
          <h2 id="cotizar-ia-titulo" className={s.titulo}>
            Cotizar con IA
          </h2>
        </div>
        <div className={s.cuerpo}>
          <Textarea
            rows={3}
            spellCheck={false}
            value={texto}
            maxLength={MAX_TEXTO}
            placeholder="Ej.: 14 cámaras domo con NVR de 32 y canalización para la bodega de Materiales Pronto"
            aria-label="Qué hay que cotizar"
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void armar();
            }}
          />
          <div className={s.fila}>
            <DictadoBoton disabled={pensando} onTexto={(frase) => setTexto((actual) => unirDictado(actual, frase).slice(0, MAX_TEXTO))} />
            <span className={s.pista}>También puedes pegar una lista de Excel o del mayorista: eso no gasta IA.</span>
            <Button variant="primary" className={s.empuja} onClick={() => void armar()} disabled={!texto.trim()} loading={pensando} kbd="Ctrl+Enter">
              {pensando ? "Armando…" : "Armar cotización"}
            </Button>
          </div>
          {error ? (
            <Alert tone="danger" role="alert">
              {error}
            </Alert>
          ) : null}
        </div>
      </section>

      {propuesta && cliente ? (
        <section className={s.tarjeta} aria-labelledby="cotizar-ia-revisar">
          <div className={s.cabeza}>
            <h2 id="cotizar-ia-revisar" className={s.titulo}>
              Revísala antes de usarla
            </h2>
            <span className={s.pista}>Nada se guarda hasta que la uses.</span>
          </div>
          <div className={s.cuerpo}>
            {avisosVisibles.map((aviso) => (
              <Alert key={aviso} tone="warning" role="status">
                {aviso}
              </Alert>
            ))}

            {propuesta.parecida ? (
              <div className={s.parecida}>
                <span>
                  Se parece a {propuesta.parecida.folio}
                  {propuesta.parecida.cliente ? ` de ${propuesta.parecida.cliente}` : ""}: {propuesta.parecida.enComun} de {propuesta.parecida.deLineas} partidas.
                </span>
                <Button size="sm" variant="secondary" className={s.empuja} loading={copiando} onClick={() => void partirDe(propuesta.parecida!.id)}>
                  Partir de esa
                </Button>
              </div>
            ) : null}

            <div className={s.datos}>
              <div className={s.campo}>
                <label htmlFor="cotizar-ia-cliente" className={s.etiqueta}>
                  Cliente
                </label>
                <Input
                  id="cotizar-ia-cliente"
                  value={cliente.nombre}
                  onChange={(e) => setCliente({ ...cliente, nombre: e.target.value, salesClientId: null, seguridad: "nuevo", parecidos: [] })}
                />
                <span className={cliente.seguridad === "alta" ? s.bien : s.pista}>{notaDeCliente(cliente)}</span>
                {cliente.seguridad === "media" ? (
                  <span className={s.opciones}>
                    {cliente.parecidos.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className={s.opcion}
                        onClick={() => setCliente({ salesClientId: p.id, nombre: p.nombre, seguridad: "alta", parecidos: [] })}
                      >
                        {p.nombre}
                      </button>
                    ))}
                  </span>
                ) : null}
              </div>
              <div className={s.campo}>
                <label htmlFor="cotizar-ia-proyecto" className={s.etiqueta}>
                  Proyecto
                </label>
                <Input id="cotizar-ia-proyecto" value={proyecto} onChange={(e) => setProyecto(e.target.value)} />
              </div>
              <div className={s.campo}>
                <label htmlFor="cotizar-ia-margen" className={s.etiqueta}>
                  Margen %
                </label>
                <Input id="cotizar-ia-margen" inputMode="decimal" value={margen} onChange={(e) => cambiarMargen(e.target.value)} />
                <span className={s.pista}>Solo a lo del mayorista</span>
              </div>
            </div>

            {filas.length ? (
              <div className={s.lista} role="table" aria-label="Partidas propuestas">
                <div className={`${s.renglon} ${s.titulos}`} role="row">
                  <span className={s.derecha} role="columnheader">
                    Cant.
                  </span>
                  <span role="columnheader">Partida</span>
                  <span className={s.derecha} role="columnheader">
                    Precio
                  </span>
                  <span className={`${s.derecha} ${s.importe}`} role="columnheader">
                    Importe
                  </span>
                  <span role="columnheader" aria-label="Quitar" />
                </div>
                {filas.map((f) => {
                  const origen = origenDe(f, moneda);
                  const opciones = f.alternativas;
                  const lectura: LecturaAviso | null = f.avisoCt
                    ? leerAviso({ aviso: f.avisoCt, unitCost: f.unitCost, unitPrice: f.unitPrice, moneda, margenBase: margenActual, rotuloBase: ", el de la tarjeta" })
                    : null;
                  return (
                    <div className={s.renglon} role="row" key={f.key}>
                      <span role="cell">
                        <CampoNumero
                          valor={f.cantidad}
                          decimales={0}
                          etiqueta={`Cantidad de ${f.pedido}`}
                          onValor={(n) => cambiarFila(f.key, (x) => ({ ...x, cantidad: n }))}
                        />
                      </span>
                      <div role="cell" className={s.partida}>
                        <TextoAuto
                          variante="celda"
                          className={s.nombre}
                          value={f.name}
                          aria-label={`Nombre de ${f.pedido}`}
                          onValor={(v) => cambiarFila(f.key, (x) => ({ ...x, name: v }))}
                        />
                        {origen.texto || origen.detalle ? (
                          <div className={s.detalle}>
                            {origen.texto ? <span className={`${s.etiquetaChica} ${origen.tono === "elige" ? s.tonoElige : s.tonoLista}`}>{origen.texto}</span> : null}
                            {origen.detalle ? <span>{origen.detalle}</span> : null}
                          </div>
                        ) : null}
                        {lectura ? (
                          <AvisoCosto
                            lectura={lectura}
                            onUsar={() => cambiarFila(f.key, usarCostoDeHoy)}
                            onSubir={() => lectura.subir && cambiarFila(f.key, (x) => subirPrecioDeHoy(x, lectura.subir!))}
                            onDeshacer={() => cambiarFila(f.key, deshacerCostoDeHoy)}
                          />
                        ) : null}
                        {opciones.length && (f.seguridad !== "alta" || f.opcionElegida != null) ? (
                          <div className={s.opciones} role="group" aria-label={`Opciones para ${f.pedido}`}>
                            {opciones.map((o, i) => {
                              const t = textoDeOpcion(o, moneda);
                              return (
                                <button
                                  key={`${f.key}-${i}`}
                                  type="button"
                                  className={s.opcion}
                                  aria-pressed={f.opcionElegida === i}
                                  title={o.name}
                                  onClick={() => cambiarFila(f.key, (x) => elegirOpcion(x, i, margenActual))}
                                >
                                  {t.nombre}
                                  {t.cifra ? (
                                    <>
                                      {" · "}
                                      <strong>{t.cifra}</strong>
                                    </>
                                  ) : null}
                                  {t.nota ? ` ${t.nota}` : ""}
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                      <span role="cell">
                        <CampoNumero
                          valor={f.unitPrice}
                          placeholder="0.00"
                          etiqueta={`Precio de ${f.pedido}`}
                          resaltado={lectura?.tono === "verde"}
                          onValor={(n) => cambiarFila(f.key, (x) => ({ ...x, unitPrice: n, marginPercent: null, precioManual: true }))}
                        />
                      </span>
                      <span role="cell" className={`${s.derecha} ${s.importe}`}>
                        {f.unitPrice ? formatoMoneda(importeDeFila(f), moneda) : "—"}
                      </span>
                      <span role="cell">
                        <button
                          type="button"
                          className={s.quitar}
                          aria-label={`Quitar ${f.pedido}`}
                          title="Quitar"
                          onClick={() => setFilas((lista) => lista.filter((x) => x.key !== f.key))}
                        >
                          <CloseRoundedIcon aria-hidden="true" />
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {extras.length ? (
              <>
                <p className={s.seccion}>Suele ir con esto</p>
                <div className={s.extras}>
                  {extras.map((f) => (
                    <label className={s.extra} key={f.key}>
                      <input
                        type="checkbox"
                        checked={f.incluida}
                        onChange={(e) => setExtras((lista) => lista.map((x) => (x.key === f.key ? { ...x, incluida: e.target.checked } : x)))}
                      />
                      <span className={s.extraTexto}>
                        <span className={s.extraNombre}>{f.name.split("\n")[0]}</span>
                        <span className={s.detalle}>
                          {" · "}
                          {cuantas(f.cantidad, f.unidad)}
                          {f.unitPrice ? "" : ", sin precio todavía"}
                        </span>
                      </span>
                      <span className={s.derecha}>{f.unitPrice ? formatoMoneda(f.unitPrice, moneda) : "—"}</span>
                    </label>
                  ))}
                </div>
              </>
            ) : null}
          </div>
          <div className={s.pie}>
            <div>
              <div className={s.pista}>Subtotal {propuesta.conIva ? "sin IVA" : "(sin factura)"}</div>
              <div className={s.total} data-testid="cotizar-ia-total">
                {formatoMoneda(resumen.subtotal, moneda)}
              </div>
            </div>
            <span className={s.pista}>
              {resumen.sinPrecio === 0
                ? "Todas con precio"
                : resumen.sinPrecio === 1
                  ? "1 partida sin precio: puedes ponerlo aquí o después"
                  : `${resumen.sinPrecio} partidas sin precio: puedes ponerlos aquí o después`}
            </span>
            <Button variant="ghost" className={s.empuja} onClick={descartar}>
              Descartar
            </Button>
            <Button variant="primary" onClick={usar} disabled={!resumen.partidas || !cliente.nombre.trim()}>
              Usar en la cotización
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
