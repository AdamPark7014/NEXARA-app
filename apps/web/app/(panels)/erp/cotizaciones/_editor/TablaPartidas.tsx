"use client";

import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { smartQuoteSearch, type SmartOffer } from "@/lib/smart-quote-api";
import { GRUPOS_PARTIDA, GRUPO_LABEL, formatoMoneda, type GrupoPartida } from "@/lib/cotizaciones-api";
import {
  UNIDADES,
  importeDeLinea,
  mover,
  partidaNueva,
  precioConMargen,
  type PartidaEditor,
  type Totales,
} from "@/lib/cotizacion-documento";
import { columnasDeTabla, type ColumnasOpcionales } from "@/lib/cotizacion-personalizacion";
import { normalizarLista, traeVineta } from "@/lib/vinetas-texto";
import { TextoAuto } from "./campos";

/** Al pegar una ficha con viñetas en la misma línea, cada una baja a su renglón. */
function pegarLista(actual: string, e: ClipboardEvent<HTMLTextAreaElement>, aplicar: (valor: string) => void) {
  const pegado = e.clipboardData.getData("text/plain");
  if (!traeVineta(pegado)) return;
  e.preventDefault();
  const el = e.currentTarget;
  const ini = el.selectionStart ?? actual.length;
  const fin = el.selectionEnd ?? ini;
  const formateado = normalizarLista(pegado);
  const antes = actual.slice(0, ini);
  const despues = actual.slice(fin);
  const saltoAntes = antes.length > 0 && !antes.endsWith("\n") ? "\n" : "";
  const saltoDespues = despues.length > 0 && !despues.startsWith("\n") ? "\n" : "";
  aplicar(`${antes}${saltoAntes}${formateado}${saltoDespues}${despues}`);
}
import styles from "./editor.module.css";

const SIN_EXTRAS: ColumnasOpcionales = { marcaModelo: false, imagen: false, descuento: false, precioUnitario: true };
const hayExtras = (c: ColumnasOpcionales) => c.marcaModelo || c.descuento || c.imagen;

/** Miniatura de la imagen del producto; clic para pegar o cambiar la URL. */
function CeldaImagen({
  url,
  editable,
  etiqueta,
  onUrl,
}: {
  url?: string | null;
  editable: boolean;
  etiqueta: string;
  onUrl: (u: string | null) => void;
}) {
  const pedir = () => {
    const nueva = window.prompt("URL de la imagen del producto (vacío para quitarla)", url ?? "");
    if (nueva === null) return;
    onUrl(nueva.trim() || null);
  };
  return (
    <button
      type="button"
      className={styles.celdaImagen}
      onClick={editable ? pedir : undefined}
      disabled={!editable && !url}
      aria-label={etiqueta}
      title={url ?? "Agregar imagen"}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" loading="lazy" />
      ) : (
        <span aria-hidden>+</span>
      )}
    </button>
  );
}

type Columna = "desc" | "unidad" | "cant" | "precio";
const NUEVA = "nueva";

/** Unidades del catálogo más la que ya traiga la partida (para no perder una unidad rara). */
function opcionesUnidad(actual?: string | null) {
  const lista: string[] = [...UNIDADES];
  if (actual && !lista.some((u) => u.toLowerCase() === actual.toLowerCase())) lista.push(actual);
  return lista;
}

const aTexto = (n: number) => (Number.isFinite(n) ? String(n) : "");
const formatoCelda = (n: number, decimales: number) =>
  n.toLocaleString("es-MX", { minimumFractionDigits: decimales, maximumFractionDigits: Math.max(decimales, 2) });
const aNumero = (texto: string) => {
  const limpio = texto.replace(/[$,\s]/g, "");
  return limpio === "" ? Number.NaN : Number(limpio);
};

/**
 * Celda numérica de hoja de cálculo: texto a la derecha (sin flechitas de `type=number`), acepta
 * «1,250.50» y no pierde el punto mientras se escribe «12.».
 */
function CeldaNumero({
  valor,
  onValor,
  etiqueta,
  editable,
  refCelda,
  onKeyDown,
  placeholder,
  decimales = 0,
  tabIndex,
}: {
  /** Decimales fijos al mostrarla fuera de foco (precio: 2; cantidad: 0). */
  decimales?: number;
  valor: number;
  onValor: (n: number) => void;
  etiqueta: string;
  editable: boolean;
  refCelda?: (el: HTMLInputElement | null) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  /** -1 para sacarla del recorrido de Tab (detalle: costo/margen) sin dejar de ser clicleable. */
  tabIndex?: number;
}) {
  const [texto, setTexto] = useState(aTexto(valor));
  const [enfocada, setEnfocada] = useState(false);
  useEffect(() => {
    // Cambió desde fuera (paquete, deshacer): se muestra; mientras se escribe, se respeta el texto.
    const actual = aNumero(texto);
    if (!(Number.isNaN(actual) && Number.isNaN(valor)) && actual !== valor) setTexto(aTexto(valor));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);
  // Fuera de foco se lee como hoja de cálculo («10,594.51»); al entrar, el número tal cual.
  const visible = enfocada || !Number.isFinite(valor) ? texto : formatoCelda(valor, decimales);
  return (
    <input
      ref={refCelda}
      className={`${styles.celda} ${styles.celdaNum}`}
      inputMode="decimal"
      value={visible}
      placeholder={placeholder}
      disabled={!editable}
      aria-label={etiqueta}
      tabIndex={tabIndex}
      onFocus={() => setEnfocada(true)}
      onBlur={() => setEnfocada(false)}
      onChange={(e) => {
        const limpio = e.target.value.replace(/[^\d.,$\s-]/g, "");
        setTexto(limpio);
        onValor(aNumero(limpio));
      }}
      onKeyDown={onKeyDown}
    />
  );
}

/** Menú de la fila: grupo (decide los términos) y mover/quitar. */
function MenuFila({
  partida,
  indice,
  total,
  onGrupo,
  onMover,
  onQuitar,
}: {
  partida: PartidaEditor;
  indice: number;
  total: number;
  onGrupo: (g: GrupoPartida | null) => void;
  onMover: (delta: number) => void;
  onQuitar: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);
  const n = indice + 1;
  const elegir = (accion: () => void) => {
    accion();
    setAbierto(false);
  };
  return (
    <div
      className={styles.menuFila}
      ref={caja}
      onKeyDown={(e) => {
        if (e.key === "Escape") setAbierto(false);
      }}
    >
      <button
        type="button"
        className={styles.menuFilaBtn}
        title={`Grupo: ${partida.grupo ? GRUPO_LABEL[partida.grupo as GrupoPartida] ?? partida.grupo : "automático"} · subir, bajar, quitar`}
        aria-label={`Opciones de la partida ${n}`}
        aria-haspopup="menu"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
      >
        ⋯
      </button>
      {abierto ? (
        <div className={styles.menuFilaLista} role="menu" aria-label={`Partida ${n}`}>
          <p className={styles.menuFilaTitulo}>Grupo</p>
          {[null, ...GRUPOS_PARTIDA].map((g) => (
            <button
              key={g ?? "auto"}
              type="button"
              role="menuitemradio"
              aria-checked={(partida.grupo ?? null) === g}
              className={styles.menuFilaOpcion}
              onClick={() => elegir(() => onGrupo(g))}
            >
              {g ? GRUPO_LABEL[g] : "Automático"}
            </button>
          ))}
          <hr className={styles.menuFilaLinea} />
          <button type="button" role="menuitem" className={styles.menuFilaOpcion} disabled={indice === 0} onClick={() => elegir(() => onMover(-1))}>
            Subir
          </button>
          <button
            type="button"
            role="menuitem"
            className={styles.menuFilaOpcion}
            disabled={indice === total - 1}
            onClick={() => elegir(() => onMover(1))}
          >
            Bajar
          </button>
          <button type="button" role="menuitem" className={`${styles.menuFilaOpcion} ${styles.menuFilaPeligro}`} onClick={() => elegir(onQuitar)}>
            Quitar partida
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * 04 · Partidas como hoja de cálculo: una fila por partida (descripción, unidad, cantidad, precio,
 * total), edición en la celda y teclado de hoja de cálculo.
 *
 * Teclado: Enter agrega una fila debajo · Tab/Mayús+Tab recorren las celdas · ↑/↓ cambian de fila
 * en la misma columna · Retroceso en una descripción vacía quita la fila. La última fila busca en
 * el catálogo mientras se escribe.
 */
export default function TablaPartidas({
  partidas,
  setPartidas,
  editable,
  moneda,
  token,
  totales,
  columnas = SIN_EXTRAS,
  margenPorcentaje = null,
  margenMonto = 0,
}: {
  partidas: PartidaEditor[];
  setPartidas: (f: (p: PartidaEditor[]) => PartidaEditor[]) => void;
  editable: boolean;
  moneda: string;
  token: string | null;
  totales: Totales;
  /** Porcentaje ya aplicado al total. Null o 0: el total es subtotal + IVA. */
  margenPorcentaje?: number | null;
  margenMonto?: number;
  /** Columnas opcionales de «Personalizar» (marca/modelo, descuento, imagen). */
  columnas?: ColumnasOpcionales;
}) {
  const celdas = useRef(new Map<string, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>());
  const enfocar = useRef<{ key: string; col: Columna } | null>(null);

  useEffect(() => {
    if (!enfocar.current) return;
    const { key, col } = enfocar.current;
    enfocar.current = null;
    const el = celdas.current.get(`${key}:${col}`);
    el?.focus();
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.select();
  });

  const refDe = (key: string, col: Columna) => (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null) => {
    if (el) celdas.current.set(`${key}:${col}`, el);
    else celdas.current.delete(`${key}:${col}`);
  };

  const claves = [...partidas.map((p) => p.key), ...(editable ? [NUEVA] : [])];
  const enfocarCelda = (key: string, col: Columna) => {
    const el = celdas.current.get(`${key}:${col}`) ?? celdas.current.get(`${key}:desc`);
    el?.focus();
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.select();
  };

  const cambiar = (key: string, cambio: Partial<PartidaEditor>) =>
    setPartidas((lista) => lista.map((p) => (p.key === key ? { ...p, ...cambio } : p)));

  /** Costo interno. Con margen % ya puesto, el precio al cliente se recalcula de inmediato. */
  const ponerCosto = (p: PartidaEditor, costo: number) => {
    const unitCost = Number.isFinite(costo) && costo > 0 ? costo : null;
    const precio = precioConMargen(unitCost, p.marginPercent);
    cambiar(p.key, precio == null ? { unitCost } : { unitCost, unitPrice: precio });
  };

  /** Margen % de la partida. Con costo interno, recalcula el precio al cliente; sin costo, solo se guarda. */
  const ponerMargenPartida = (p: PartidaEditor, margen: number) => {
    const marginPercent = Number.isFinite(margen) ? margen : null;
    const precio = precioConMargen(p.unitCost, marginPercent);
    cambiar(p.key, precio == null ? { marginPercent } : { marginPercent, unitPrice: precio });
  };

  const ponerPrecio = (p: PartidaEditor, precio: number) => {
    const unitPrice = Number.isFinite(precio) ? Math.max(0, precio) : 0;
    cambiar(p.key, { unitPrice });
  };

  const insertarDespues = (key: string) => {
    const nueva = partidaNueva();
    enfocar.current = { key: nueva.key, col: "desc" };
    setPartidas((lista) => {
      const i = lista.findIndex((p) => p.key === key);
      return [...lista.slice(0, i + 1), nueva, ...lista.slice(i + 1)];
    });
  };

  /** Teclado común a todas las celdas de una fila existente. */
  const teclado = (key: string, col: Columna) => (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" && e.shiftKey) return;
    const fila = claves.indexOf(key);
    if (e.key === "Enter" && !e.altKey) {
      e.preventDefault();
      insertarDespues(key);
      return;
    }
    if (e.currentTarget instanceof HTMLTextAreaElement) return;
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !(e.currentTarget instanceof HTMLSelectElement) && !e.altKey) {
      const destino = claves[fila + (e.key === "ArrowDown" ? 1 : -1)];
      if (destino) {
        e.preventDefault();
        enfocarCelda(destino, col);
      }
      return;
    }
    if (e.key === "Backspace" && col === "desc" && e.currentTarget.value === "") {
      const partida = partidas.find((p) => p.key === key);
      if (partida && !partida.name && !partida.unitPrice) {
        e.preventDefault();
        const anterior = claves[fila - 1];
        if (anterior) enfocar.current = { key: anterior, col: "desc" };
        setPartidas((lista) => lista.filter((p) => p.key !== key));
      }
    }
  };

  const gruposConImporte = GRUPOS_PARTIDA.filter((g) => totales.porGrupo[g] > 0);

  const extras = hayExtras(columnas);

  return (
    <div
      className={`${styles.tabla} ${extras ? styles.tablaExtras : ""}`}
      role="table"
      aria-label="Partidas"
      style={{ ["--cols" as string]: columnasDeTabla(columnas) }}
    >
      <div className={styles.filaCabeza} role="row">
        <span role="columnheader" className={styles.celdaIndice}>
          #
        </span>
        <span role="columnheader">Descripción</span>
        <span role="columnheader">Unidad</span>
        <span role="columnheader" className={styles.derecha}>
          Cant.
        </span>
        <span role="columnheader" className={styles.derecha} title="Costo interno de la partida. No se imprime en el PDF final.">
          Costo
        </span>
        <span
          role="columnheader"
          className={styles.derecha}
          title="Margen % de esta partida. Con costo, el precio sale de ahí (costo × margen). No se imprime en el PDF final."
        >
          Margen %
        </span>
        <span
          role="columnheader"
          className={`${styles.derecha} ${columnas.precioUnitario ? "" : styles.cabeceraApagada}`}
          title={columnas.precioUnitario ? undefined : "A precio alzado: el PDF solo imprime el total del renglón"}
        >
          Precio
        </span>
        {extras ? (
          <span className={styles.celdaExtras} role="presentation">
            {columnas.marcaModelo ? (
              <>
                <span role="columnheader">Marca</span>
                <span role="columnheader">Modelo</span>
              </>
            ) : null}
            {columnas.descuento ? (
              <span role="columnheader" className={styles.derecha}>
                Desc. %
              </span>
            ) : null}
            {columnas.imagen ? <span role="columnheader">Img.</span> : null}
          </span>
        ) : null}
        <span role="columnheader" className={styles.derecha}>
          Total
        </span>
        <span role="columnheader" aria-label="Opciones" />
      </div>

      {partidas.map((p, i) => (
        <div className={styles.fila} role="row" key={p.key}>
          <span role="cell" className={styles.celdaIndice} data-area="idx">
            <input
              className={`${styles.celda} ${styles.celdaPartida}`}
              value={p.partida ?? ""}
              placeholder={String(i + 1)}
              disabled={!editable}
              aria-label={`Partida ${i + 1}`}
              title="Número de partida (1, 1.1…)"
              onChange={(e) => cambiar(p.key, { partida: e.target.value.slice(0, 16) })}
            />
          </span>
          <span role="cell" className={styles.celdaDesc} data-area="desc">
            <span className={styles.celdaDescCabeza}>
              <TextoAuto
                ref={refDe(p.key, "desc")}
                variante="celda"
                value={p.name}
                title={p.name}
                placeholder="Título de la partida"
                disabled={!editable}
                aria-label={`Descripción de la partida ${i + 1}`}
                onValor={(v) => cambiar(p.key, { name: v })}
                onPaste={(e) => pegarLista(p.name, e, (v) => cambiar(p.key, { name: v }))}
                onKeyDown={teclado(p.key, "desc")}
              />
              {p.paqueteClave ? (
                <span className={styles.pastilla} title="Viene de un paquete: se reescribe si vuelves a aplicarlo">
                  ×{p.paqueteCantidad ?? "?"}
                </span>
              ) : null}
            </span>
            {/* Detalle (marca, modelo, descripción del PDF): no interrumpe el Tab de la hoja de cálculo
                (descripción → unidad → cantidad → costo → margen → precio). */}
            <span className={styles.detallePartida}>
              <input
                className={styles.celda}
                value={p.brand ?? ""}
                placeholder="Marca"
                disabled={!editable}
                aria-label={`Marca de la partida ${i + 1}`}
                tabIndex={-1}
                onChange={(e) => cambiar(p.key, { brand: e.target.value || null })}
              />
              <input
                className={styles.celda}
                value={p.model ?? ""}
                placeholder="Modelo"
                disabled={!editable}
                aria-label={`Modelo de la partida ${i + 1}`}
                tabIndex={-1}
                onChange={(e) => cambiar(p.key, { model: e.target.value || null })}
              />
              <TextoAuto
                variante="celda"
                className={styles.detalleAmplio}
                value={p.description ?? ""}
                placeholder="Descripción para el PDF. El costo y el margen no se imprimen. Los saltos de línea y las viñetas se imprimen."
                disabled={!editable}
                aria-label={`Detalle de la partida ${i + 1}`}
                tabIndex={-1}
                onValor={(v) => cambiar(p.key, { description: v || null })}
                onPaste={(e) => pegarLista(p.description ?? "", e, (v) => cambiar(p.key, { description: v || null }))}
              />
            </span>
          </span>
          <span role="cell" data-area="unidad">
            <select
              ref={refDe(p.key, "unidad")}
              className={styles.celda}
              value={p.unit ?? "Pieza"}
              disabled={!editable}
              aria-label={`Unidad de la partida ${i + 1}`}
              onChange={(e) => cambiar(p.key, { unit: e.target.value })}
              onKeyDown={teclado(p.key, "unidad")}
            >
              {opcionesUnidad(p.unit).map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </span>
          <span role="cell" data-area="cant">
            <CeldaNumero
              refCelda={refDe(p.key, "cant")}
              valor={p.qty}
              editable={editable}
              etiqueta={`Cantidad de la partida ${i + 1}`}
              onValor={(n) => cambiar(p.key, { qty: n })}
              onKeyDown={teclado(p.key, "cant")}
            />
          </span>
          <span role="cell" data-area="costo">
            <CeldaNumero
              valor={p.unitCost == null ? Number.NaN : Number(p.unitCost)}
              editable={editable}
              etiqueta={`Costo interno de la partida ${i + 1}`}
              placeholder="Costo"
              decimales={2}
              onValor={(n) => ponerCosto(p, n)}
            />
          </span>
          <span role="cell" data-area="margen">
            <CeldaNumero
              valor={p.marginPercent == null ? Number.NaN : Number(p.marginPercent)}
              editable={editable}
              etiqueta={`Margen % de la partida ${i + 1}`}
              placeholder="Margen %"
              decimales={2}
              onValor={(n) => ponerMargenPartida(p, n)}
            />
          </span>
          <span role="cell" data-area="precio">
            <CeldaNumero
              refCelda={refDe(p.key, "precio")}
              valor={p.unitPrice}
              editable={editable}
              etiqueta={`Precio unitario de la partida ${i + 1}`}
              placeholder="0.00"
              decimales={2}
              onValor={(n) => ponerPrecio(p, n)}
              onKeyDown={teclado(p.key, "precio")}
            />
          </span>
          {extras ? (
            <span className={styles.celdaExtras} data-area="extras" role="presentation">
              {columnas.marcaModelo ? (
                <>
                  <span role="cell">
                    <input
                      className={styles.celda}
                      value={p.brand ?? ""}
                      placeholder="Marca"
                      disabled={!editable}
                      aria-label={`Marca de la partida ${i + 1}`}
                      onChange={(e) => cambiar(p.key, { brand: e.target.value || null })}
                    />
                  </span>
                  <span role="cell">
                    <input
                      className={styles.celda}
                      value={p.model ?? ""}
                      placeholder="Modelo"
                      disabled={!editable}
                      aria-label={`Modelo de la partida ${i + 1}`}
                      onChange={(e) => cambiar(p.key, { model: e.target.value || null })}
                    />
                  </span>
                </>
              ) : null}
              {columnas.descuento ? (
                <span role="cell">
                  <CeldaNumero
                    valor={Number(p.discount ?? 0)}
                    editable={editable}
                    etiqueta={`Descuento de la partida ${i + 1} (%)`}
                    placeholder="0"
                    onValor={(n) => cambiar(p.key, { discount: Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0 })}
                  />
                </span>
              ) : null}
              {columnas.imagen ? (
                <span role="cell">
                  <CeldaImagen
                    url={p.imagenUrl}
                    editable={editable}
                    etiqueta={`Imagen de la partida ${i + 1}`}
                    onUrl={(u) => cambiar(p.key, { imagenUrl: u })}
                  />
                </span>
              ) : null}
            </span>
          ) : null}
          <span role="cell" className={styles.celdaTotal} data-area="total">
            {p.name.trim() ? formatoMoneda(importeDeLinea(p), moneda) : ""}
          </span>
          <span role="cell" className={styles.celdaMenu} data-area="menu">
            {editable ? (
              <MenuFila
                partida={p}
                indice={i}
                total={partidas.length}
                onGrupo={(g) => cambiar(p.key, { grupo: g })}
                onMover={(delta) => setPartidas((l) => mover(l, i, i + delta))}
                onQuitar={() => setPartidas((l) => l.filter((x) => x.key !== p.key))}
              />
            ) : null}
          </span>
        </div>
      ))}

      {editable ? (
        <FilaNueva
          numero={partidas.length + 1}
          columnas={columnas}
          token={token}
          moneda={moneda}
          refDe={refDe}
          alSubir={() => {
            const ultima = partidas[partidas.length - 1];
            if (ultima) enfocarCelda(ultima.key, "desc");
          }}
          alAgregar={(p, opciones) => {
            // Con Enter se sigue capturando en la fila nueva; si se agrega sola (porque se salió de
            // la fila) el foco ya está donde la persona lo puso: no se le quita.
            if (opciones?.conFoco !== false) enfocar.current = { key: NUEVA, col: "desc" };
            setPartidas((l) => [...l, p]);
          }}
        />
      ) : null}

      <div className={styles.tablaTotales} aria-label="Totales">
        {gruposConImporte.length > 1
          ? gruposConImporte.map((g) => (
              <div className={`${styles.filaTotal} ${styles.filaTotalGrupo}`} key={g}>
                <span>{GRUPO_LABEL[g]}</span>
                <span>{formatoMoneda(totales.porGrupo[g], moneda)}</span>
              </div>
            ))
          : null}
        <div className={styles.filaTotal}>
          <span>Subtotal</span>
          <span>{formatoMoneda(totales.subtotal, moneda)}</span>
        </div>
        <div className={styles.filaTotal}>
          <span>IVA</span>
          <span>{formatoMoneda(totales.iva, moneda)}</span>
        </div>
        {margenPorcentaje != null && margenPorcentaje !== 0 ? (
          <div className={styles.filaTotal}>
            <span>Margen {margenPorcentaje}%</span>
            <span>{formatoMoneda(margenMonto, moneda)}</span>
          </div>
        ) : null}
        <div className={`${styles.filaTotal} ${styles.filaTotalFinal}`}>
          <span>Total</span>
          <span data-testid="total-cotizacion">{formatoMoneda(totales.total, moneda)}</span>
        </div>
      </div>
    </div>
  );
}

/** Última fila: se escribe (o se busca en el catálogo) y Enter la agrega. */
function FilaNueva({
  numero,
  columnas,
  token,
  moneda,
  refDe,
  alAgregar,
  alSubir,
}: {
  numero: number;
  columnas: ColumnasOpcionales;
  token: string | null;
  moneda: string;
  refDe: (key: string, col: Columna) => (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null) => void;
  alAgregar: (p: PartidaEditor, opciones?: { conFoco?: boolean }) => void;
  alSubir: () => void;
}) {
  const fila = useRef<HTMLDivElement>(null);
  const [nombre, setNombre] = useState("");
  const [unidad, setUnidad] = useState("Pieza");
  const [cantidad, setCantidad] = useState(1);
  const [precio, setPrecio] = useState(Number.NaN);
  const [ofertas, setOfertas] = useState<SmartOffer[]>([]);
  const [activa, setActiva] = useState(-1);
  const [sinCatalogo, setSinCatalogo] = useState(false);

  useEffect(() => {
    const q = nombre.trim();
    if (!token || q.length < 3 || sinCatalogo) {
      setOfertas([]);
      return;
    }
    const control = new AbortController();
    const t = setTimeout(() => {
      smartQuoteSearch(token, { q, take: 6 }, { signal: control.signal })
        .then((r) => {
          setOfertas(r.data ?? []);
          setActiva(-1);
        })
        .catch((e) => {
          if ((e as Error)?.name === "AbortError") return;
          // Sin catálogo conectado se captura como línea libre.
          setSinCatalogo(true);
          setOfertas([]);
        });
    }, 350);
    return () => {
      clearTimeout(t);
      control.abort();
    };
  }, [nombre, token, sinCatalogo]);

  const limpiar = () => {
    setNombre("");
    setCantidad(1);
    setPrecio(Number.NaN);
    setUnidad("Pieza");
    setOfertas([]);
    setActiva(-1);
  };

  const cantidadSana = Math.max(1, Math.round(Number.isFinite(cantidad) ? cantidad : 1));

  const agregarLibre = (opciones?: { conFoco?: boolean }) => {
    if (!nombre.trim()) return;
    alAgregar(
      partidaNueva({
        name: nombre.trim(),
        unit: unidad,
        qty: cantidadSana,
        unitPrice: Math.max(0, Number.isFinite(precio) ? precio : 0),
      }),
      opciones,
    );
    limpiar();
  };

  /**
   * Lo escrito aquí se ve como una partida más (hasta enseña su total), pero solo cuenta en el
   * subtotal y en el PDF cuando se agrega. Antes había que acordarse de dar Enter o «↵»: quien no
   * lo hacía creía tenerla y no salía. Ahora se agrega sola al salir de la fila.
   */
  const alSalirDeLaFila = () => {
    if (!nombre.trim()) return;
    // Se mira ya asentado el foco: si sigue dentro de la fila (otra celda, el botón ↵, el catálogo o
    // solo se cambió de ventana) todavía se está capturando.
    setTimeout(() => {
      if (fila.current?.contains(document.activeElement)) return;
      agregarLibre({ conFoco: false });
    }, 0);
  };

  const agregarOferta = (o: SmartOffer) => {
    alAgregar(
      partidaNueva({
        name: o.nombre || o.clave || nombre.trim() || "Concepto",
        description: o.descripcion ?? null,
        unit: "Pieza",
        qty: cantidadSana,
        unitCost: Number(o.costMxn) > 0 ? Number(o.costMxn) : null,
        unitPrice: Number(o.sellPriceSuggested || o.precio || o.costMxn || 0),
        grupo: "EQUIPOS",
        brand: o.marca ?? null,
        model: o.modelo ?? null,
        imagenUrl: o.imagen ?? null,
      }),
    );
    limpiar();
  };

  const alTeclear = (e: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (e.nativeEvent.isComposing) return;
    const enDescripcion = e.currentTarget instanceof HTMLInputElement && e.currentTarget.dataset["col"] === "desc";
    if (e.key === "ArrowDown" && ofertas.length && enDescripcion) {
      e.preventDefault();
      setActiva((a) => Math.min(ofertas.length - 1, a + 1));
    } else if (e.key === "ArrowUp" && ofertas.length && enDescripcion && activa >= 0) {
      e.preventDefault();
      setActiva((a) => Math.max(-1, a - 1));
    } else if (e.key === "ArrowUp" && !(e.currentTarget instanceof HTMLSelectElement)) {
      e.preventDefault();
      alSubir();
    } else if (e.key === "Escape") {
      setOfertas([]);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = activa >= 0 ? ofertas[activa] : null;
      if (o) agregarOferta(o);
      else agregarLibre();
    }
  };

  return (
    <div ref={fila} className={`${styles.fila} ${styles.filaNueva}`} role="row" onBlur={alSalirDeLaFila}>
      <span role="cell" className={styles.celdaIndice} aria-hidden data-area="idx">
        {numero}
      </span>
      <span role="cell" className={`${styles.celdaDesc} ${styles.combo}`} data-area="desc">
        <input
          ref={refDe(NUEVA, "desc")}
          data-col="desc"
          className={styles.celda}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={alTeclear}
          onBlur={() => setTimeout(() => setOfertas([]), 150)}
          placeholder="Nueva partida"
          aria-label="Descripción de la nueva partida"
          role="combobox"
          aria-expanded={ofertas.length > 0}
          aria-autocomplete="list"
        />
        {ofertas.length ? (
          <ul
            className={styles.sugerencias}
            role="listbox"
            aria-label="Catálogo"
            onMouseDown={(e) => e.preventDefault()}
          >
            {ofertas.map((o, i) => (
              <li
                key={o.id}
                role="option"
                aria-selected={i === activa}
                className={`${styles.opcion} ${i === activa ? styles.opcionActiva : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  agregarOferta(o);
                }}
                onMouseEnter={() => setActiva(i)}
              >
                <span>{o.nombre ?? o.clave}</span>
                <small>
                  {[o.marca, o.modelo, formatoMoneda(o.sellPriceSuggested || o.precio), o.stockTotal > 0 ? "en stock" : "sobre pedido"]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
              </li>
            ))}
          </ul>
        ) : null}
      </span>
      <span role="cell" data-area="unidad">
        <select
          ref={refDe(NUEVA, "unidad")}
          className={styles.celda}
          value={unidad}
          onChange={(e) => setUnidad(e.target.value)}
          onKeyDown={alTeclear}
          aria-label="Unidad de la nueva partida"
        >
          {opcionesUnidad(unidad).map((u) => (
            <option key={u}>{u}</option>
          ))}
        </select>
      </span>
      <span role="cell" data-area="cant">
        <CeldaNumero
          refCelda={refDe(NUEVA, "cant")}
          valor={cantidad}
          editable
          etiqueta="Cantidad de la nueva partida"
          onValor={setCantidad}
          onKeyDown={alTeclear}
        />
      </span>
      <span role="cell" data-area="precio">
        <CeldaNumero
          refCelda={refDe(NUEVA, "precio")}
          valor={precio}
          editable
          etiqueta="Precio unitario de la nueva partida"
          placeholder="0.00"
          decimales={2}
          onValor={setPrecio}
          onKeyDown={alTeclear}
        />
      </span>
      {hayExtras(columnas) ? (
        <span className={`${styles.celdaExtras} ${styles.celdaExtrasVacias}`} data-area="extras" role="presentation">
          {columnas.marcaModelo ? (
            <>
              <span role="cell" />
              <span role="cell" />
            </>
          ) : null}
          {columnas.descuento ? <span role="cell" /> : null}
          {columnas.imagen ? <span role="cell" /> : null}
        </span>
      ) : null}
      <span role="cell" className={styles.celdaTotal} data-area="total">
        {nombre.trim() ? formatoMoneda(cantidadSana * (Number.isFinite(precio) ? precio : 0), moneda) : ""}
      </span>
      <span role="cell" className={styles.celdaMenu} data-area="menu">
        <button
          type="button"
          className={`${styles.menuFilaBtn} ${nombre.trim() ? styles.menuFilaPendiente : ""}`}
          onClick={() => agregarLibre()}
          disabled={!nombre.trim()}
          aria-label="Agregar la partida"
          title="Agregar (Enter)"
        >
          ↵
        </button>
      </span>
    </div>
  );
}
