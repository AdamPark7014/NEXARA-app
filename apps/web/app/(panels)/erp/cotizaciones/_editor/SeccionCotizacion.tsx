"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { smartQuoteSearch, type SmartOffer } from "@/lib/smart-quote-api";
import {
  GRUPOS_PARTIDA,
  GRUPO_LABEL,
  TITULO_TERMINO,
  formatoMoneda,
  type ClaveTermino,
  type CotizacionDetalle,
  type GrupoPartida,
  type PaqueteCotizacion,
} from "@/lib/cotizaciones-api";
import {
  UNIDADES,
  importeDeLinea,
  mover,
  partidaNueva,
  sumarDias,
  totalesDePartidas,
  type DocumentoCotizacion,
  type PartidaEditor,
} from "@/lib/cotizacion-documento";
import { Hoja, TextoAuto } from "./campos";
import styles from "./editor.module.css";

type Cambiar = (cambio: (doc: DocumentoCotizacion) => DocumentoCotizacion) => void;

const TERMINOS_EDITABLES: ClaveTermino[] = ["pago", "alcance", "noIncluye", "disponibilidad", "otras"];

const MODALIDAD: Record<string, string> = {
  SUMINISTRO: "Solo suministro: no hay partidas de mano de obra.",
  SUMINISTRO_INSTALACION: "Suministro e instalación: hay mano de obra cobrada (o el segmento la incluye).",
  LICITACION: "Licitación: mandan las bases.",
};

function diasEntre(desde: string, hasta: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) return null;
  const dias = Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);
  return dias > 0 ? dias : null;
}

/** Unidades del catálogo más la que ya traiga la partida (para no perder una unidad rara). */
function opcionesUnidad(actual?: string | null) {
  const lista: string[] = [...UNIDADES];
  if (actual && !lista.some((u) => u.toLowerCase() === actual.toLowerCase())) lista.push(actual);
  return lista;
}

/** Captura rápida: descripción con catálogo, unidad, cantidad, precio · Enter agrega. */
function FilaNueva({
  token,
  alAgregar,
}: {
  token: string | null;
  alAgregar: (p: PartidaEditor) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [unidad, setUnidad] = useState("Pieza");
  const [cantidad, setCantidad] = useState("1");
  const [precio, setPrecio] = useState("");
  const [ofertas, setOfertas] = useState<SmartOffer[]>([]);
  const [activa, setActiva] = useState(-1);
  const [sinCatalogo, setSinCatalogo] = useState(false);
  const descripcion = useRef<HTMLInputElement>(null);

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
          // Sin catálogo conectado se captura como línea libre, que es lo que se hace hoy.
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
    setCantidad("1");
    setPrecio("");
    setUnidad("Pieza");
    setOfertas([]);
    setActiva(-1);
    descripcion.current?.focus();
  };

  const agregarLibre = () => {
    if (!nombre.trim()) return;
    alAgregar(
      partidaNueva({
        name: nombre.trim(),
        unit: unidad,
        qty: Math.max(1, Math.round(Number(cantidad) || 1)),
        unitPrice: Math.max(0, Number(precio) || 0),
      }),
    );
    limpiar();
  };

  const agregarOferta = (o: SmartOffer) => {
    alAgregar(
      partidaNueva({
        name: o.nombre || o.clave || nombre.trim() || "Concepto",
        description: o.descripcion ?? null,
        unit: "Pieza",
        qty: Math.max(1, Math.round(Number(cantidad) || 1)),
        unitPrice: Number(o.sellPriceSuggested || o.precio || 0),
        grupo: "EQUIPOS",
      }),
    );
    limpiar();
  };

  const alTeclear = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "ArrowDown" && ofertas.length) {
      e.preventDefault();
      setActiva((a) => Math.min(ofertas.length - 1, a + 1));
    } else if (e.key === "ArrowUp" && ofertas.length) {
      e.preventDefault();
      setActiva((a) => Math.max(-1, a - 1));
    } else if (e.key === "Escape") {
      setOfertas([]);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = activa >= 0 ? ofertas[activa] : null;
      if (o) agregarOferta(o);
      else agregarLibre();
    }
  };

  const importe = importeDeLinea({ qty: Number(cantidad) || 0, unitPrice: Number(precio) || 0 });

  return (
    <div className={styles.filaNueva}>
      <span className={styles.celdaNumero} aria-hidden>
        +
      </span>
      <div className={`${styles.celdaDescripcion} ${styles.combo}`}>
        <input
          ref={descripcion}
          className={styles.celdaInput}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={alTeclear}
          onBlur={() => setTimeout(() => setOfertas([]), 150)}
          placeholder={sinCatalogo ? "Nueva partida: descripción" : "Nueva partida: escribe o busca en el catálogo"}
          aria-label="Descripción de la nueva partida"
          role="combobox"
          aria-expanded={ofertas.length > 0}
          aria-autocomplete="list"
        />
        {ofertas.length ? (
          <ul className={styles.sugerencias} role="listbox" aria-label="Catálogo">
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
      </div>
      <select className={styles.celdaInput} value={unidad} onChange={(e) => setUnidad(e.target.value)} onKeyDown={alTeclear} aria-label="Unidad de la nueva partida">
        {opcionesUnidad(unidad).map((u) => (
          <option key={u}>{u}</option>
        ))}
      </select>
      <input
        className={styles.celdaInput}
        type="number"
        min={1}
        inputMode="numeric"
        value={cantidad}
        onChange={(e) => setCantidad(e.target.value)}
        onKeyDown={alTeclear}
        aria-label="Cantidad de la nueva partida"
      />
      <input
        className={styles.celdaInput}
        type="number"
        min={0}
        step="0.01"
        inputMode="decimal"
        value={precio}
        placeholder="0.00"
        onChange={(e) => setPrecio(e.target.value)}
        onKeyDown={alTeclear}
        aria-label="Precio unitario de la nueva partida"
      />
      <span className={styles.celdaFinal}>
        <span className={styles.celdaTotal}>{nombre.trim() ? formatoMoneda(importe) : ""}</span>
        <button type="button" className={styles.secondaryBtn} onClick={agregarLibre} disabled={!nombre.trim()} style={{ padding: "0.36rem 0.6rem" }}>
          Agregar ↵
        </button>
      </span>
    </div>
  );
}

/**
 * 04 Cotización: datos del encabezado (cliente, teléfono, emisión, folio, validez), partidas con
 * captura rápida, totales con IVA y términos y condiciones editables.
 */
export default function SeccionCotizacion({
  doc,
  cambiar,
  editable,
  detalle,
  token,
  paquetes,
  onAplicarPaquete,
}: {
  doc: DocumentoCotizacion;
  cambiar: Cambiar;
  editable: boolean;
  detalle: CotizacionDetalle | null;
  token: string | null;
  paquetes: PaqueteCotizacion[];
  onAplicarPaquete: (clave: string, cantidad: number) => Promise<void>;
}) {
  const [verPaquetes, setVerPaquetes] = useState(false);
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const [aplicando, setAplicando] = useState<string | null>(null);

  const totales = useMemo(() => totalesDePartidas(doc.partidas), [doc.partidas]);
  const gruposConImporte = GRUPOS_PARTIDA.filter((g) => totales.porGrupo[g] > 0);
  const vigencia = diasEntre(doc.issueDate, doc.validUntil);
  const moneda = detalle?.currency || "MXN";

  const setPartidas = (f: (p: PartidaEditor[]) => PartidaEditor[]) => cambiar((d) => ({ ...d, partidas: f(d.partidas) }));
  const cambiarPartida = (key: string, cambio: Partial<PartidaEditor>) =>
    setPartidas((lista) => lista.map((p) => (p.key === key ? { ...p, ...cambio } : p)));

  const base = (clave: ClaveTermino) => detalle?.terminosBase?.partes?.find((p) => p.clave === clave)?.texto ?? "";
  const esLicitacion = (detalle?.terminos.modalidad ?? "") === "LICITACION" || doc.segmento === "LICITACION";
  // Títulos y orden como los imprime el PDF (en licitación se llaman como en las bases).
  const partesBase = (detalle?.terminosBase?.partes ?? []).filter((p) => p.clave !== "vigencia");
  const tituloDe = (clave: ClaveTermino) => partesBase.find((p) => p.clave === clave)?.titulo ?? TITULO_TERMINO[clave];
  const orden: ClaveTermino[] = [
    ...partesBase.map((p) => p.clave as ClaveTermino),
    ...TERMINOS_EDITABLES.filter((c) => !partesBase.some((p) => p.clave === c)),
  ];

  return (
    <Hoja
      id="cotizacion"
      numero="04."
      titulo="Cotización"
      ayuda="El encabezado y la tabla de la propuesta: descripción, unidad, cantidad, precio y total, con subtotal, IVA y total."
    >
      <div className={styles.datosCot}>
        <div className={styles.datosCol}>
          <div className={styles.campo}>
            <label className={styles.etiqueta} htmlFor="cot-cliente-04">
              Cliente
            </label>
            <input
              id="cot-cliente-04"
              className={styles.input}
              value={doc.clientName}
              disabled={!editable}
              placeholder="Nombre del cliente"
              onChange={(e) => cambiar((d) => ({ ...d, clientName: e.target.value, salesClientId: null }))}
            />
          </div>
          <div className={styles.campo}>
            <label className={styles.etiqueta} htmlFor="cot-telefono">
              Teléfono
            </label>
            <input
              id="cot-telefono"
              className={styles.input}
              type="tel"
              value={doc.clientPhone}
              disabled={!editable}
              placeholder="222 000 0000"
              onChange={(e) => cambiar((d) => ({ ...d, clientPhone: e.target.value }))}
            />
          </div>
          <div className={styles.campo}>
            <label className={styles.etiqueta} htmlFor="cot-correo">
              Correo (para enviarla)
            </label>
            <input
              id="cot-correo"
              className={styles.input}
              type="email"
              value={doc.clientEmail}
              disabled={!editable}
              placeholder="compras@cliente.com"
              onChange={(e) => cambiar((d) => ({ ...d, clientEmail: e.target.value }))}
            />
          </div>
        </div>
        <div className={styles.datosCol}>
          <div className={styles.campo}>
            <label className={styles.etiqueta} htmlFor="cot-emision">
              Fecha de emisión
            </label>
            <input
              id="cot-emision"
              type="date"
              className={styles.input}
              value={doc.issueDate}
              disabled={!editable}
              onChange={(e) => cambiar((d) => ({ ...d, issueDate: e.target.value }))}
            />
          </div>
          <div className={styles.campo}>
            <span className={styles.etiqueta}>Cotización N°</span>
            <span className={styles.folioCampo}>{detalle?.folio ?? "Se emite al guardar, con tu nomenclatura"}</span>
          </div>
          <div className={styles.campo}>
            <label className={styles.etiqueta} htmlFor="cot-validez">
              Validez
            </label>
            <input
              id="cot-validez"
              type="date"
              className={styles.input}
              value={doc.validUntil}
              min={doc.issueDate}
              disabled={!editable}
              onChange={(e) => cambiar((d) => ({ ...d, validUntil: e.target.value }))}
            />
            {editable ? (
              <div className={styles.atajos} role="group" aria-label="Validez rápida">
                {[15, 30, 45].map((dias) => {
                  const fecha = sumarDias(doc.issueDate, dias);
                  return (
                    <button
                      key={dias}
                      type="button"
                      className={`${styles.chip} ${doc.validUntil === fecha ? styles.chipOn : ""}`}
                      onClick={() => cambiar((d) => ({ ...d, validUntil: sumarDias(d.issueDate, dias) }))}
                    >
                      {dias} días
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className={styles.tabla} role="group" aria-label="Partidas">
        <div className={styles.filaCabeza} aria-hidden>
          <span className={styles.celdaDerecha}>#</span>
          <span>Descripción</span>
          <span>Unidad</span>
          <span className={styles.celdaDerecha}>Cantidad</span>
          <span className={styles.celdaDerecha}>Precio</span>
          <span className={styles.celdaDerecha}>Total</span>
        </div>

        {doc.partidas.map((p, i) => (
          <div className={styles.fila} key={p.key}>
            <span className={styles.celdaNumero}>{i + 1}</span>
            <div className={styles.celdaDescripcion}>
              <TextoAuto
                variante="celda"
                value={p.name}
                disabled={!editable}
                aria-label={`Descripción de la partida ${i + 1}`}
                onValor={(v) => cambiarPartida(p.key, { name: v.replace(/\n/g, " ") })}
              />
              <span className={styles.celdaMeta}>
                <select
                  className={styles.selectMini}
                  value={(p.grupo as string) ?? ""}
                  disabled={!editable}
                  aria-label={`Grupo de la partida ${i + 1}`}
                  title="Equipos, materiales o mano de obra: decide los términos (suministro o suministro e instalación)"
                  onChange={(e) => cambiarPartida(p.key, { grupo: (e.target.value || null) as GrupoPartida | null })}
                >
                  <option value="">Grupo automático</option>
                  {GRUPOS_PARTIDA.map((g) => (
                    <option key={g} value={g}>
                      {GRUPO_LABEL[g]}
                    </option>
                  ))}
                </select>
                {p.paqueteClave ? <span>· paquete ×{p.paqueteCantidad ?? "?"}</span> : null}
                {editable ? (
                  <span className={styles.controles}>
                    <button
                      type="button"
                      className={styles.iconBtn}
                      aria-label={`Subir partida ${i + 1}`}
                      title="Subir"
                      disabled={i === 0}
                      onClick={() => setPartidas((l) => mover(l, i, i - 1))}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className={styles.iconBtn}
                      aria-label={`Bajar partida ${i + 1}`}
                      title="Bajar"
                      disabled={i === doc.partidas.length - 1}
                      onClick={() => setPartidas((l) => mover(l, i, i + 1))}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className={`${styles.iconBtn} ${styles.iconBtnPeligro}`}
                      aria-label={`Quitar partida ${i + 1}`}
                      title="Quitar"
                      onClick={() => setPartidas((l) => l.filter((x) => x.key !== p.key))}
                    >
                      ×
                    </button>
                  </span>
                ) : null}
              </span>
            </div>
            <select
              className={styles.celdaInput}
              value={p.unit ?? "Pieza"}
              disabled={!editable}
              aria-label={`Unidad de la partida ${i + 1}`}
              onChange={(e) => cambiarPartida(p.key, { unit: e.target.value })}
            >
              {opcionesUnidad(p.unit).map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
            <input
              className={styles.celdaInput}
              type="number"
              min={1}
              inputMode="numeric"
              value={Number.isFinite(p.qty) ? p.qty : ""}
              disabled={!editable}
              aria-label={`Cantidad de la partida ${i + 1}`}
              onChange={(e) => cambiarPartida(p.key, { qty: e.target.value === "" ? Number.NaN : Number(e.target.value) })}
            />
            <input
              className={styles.celdaInput}
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={Number.isFinite(p.unitPrice) ? p.unitPrice : ""}
              disabled={!editable}
              aria-label={`Precio unitario de la partida ${i + 1}`}
              onChange={(e) => cambiarPartida(p.key, { unitPrice: e.target.value === "" ? Number.NaN : Number(e.target.value) })}
            />
            <span className={styles.celdaFinal}>
              <span className={styles.celdaTotal}>{formatoMoneda(importeDeLinea(p), moneda)}</span>
            </span>
          </div>
        ))}

        {editable ? <FilaNueva token={token} alAgregar={(p) => setPartidas((l) => [...l, p])} /> : null}
      </div>

      {!doc.partidas.length ? (
        <p className={styles.pista} style={{ marginTop: 8 }}>
          Escribe la primera partida arriba y presiona Enter. Si el catálogo responde, verás equipos con su precio sugerido;
          si no, se captura como línea libre. También puedes agregar un paquete completo (cámara + balún + caja + instalación).
        </p>
      ) : null}

      {editable ? (
        <div className={styles.herramientas}>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => setVerPaquetes((v) => !v)}
            aria-expanded={verPaquetes}
            disabled={!paquetes.length}
          >
            ▦ Paquetes
          </button>
          <span className={styles.pista}>Enter agrega · ↑↓ elige del catálogo · el total se calcula solo</span>
        </div>
      ) : null}

      {verPaquetes && editable ? (
        <div className={styles.panelPlantillas}>
          <div className={styles.panelPlantillasCabeza}>
            <span>Un paquete agrega todas sus partidas y su subsección de alcance, con la cantidad que pongas.</span>
            <button type="button" className={styles.ghostBtn} onClick={() => setVerPaquetes(false)}>
              Cerrar
            </button>
          </div>
          <div className={styles.paquetes}>
            {paquetes.map((paq) => (
              <div key={paq.clave} className={styles.paquete}>
                <strong style={{ fontSize: "0.84rem" }}>{paq.titulo}</strong>
                <p>{paq.descripcion}</p>
                <div className={styles.paqueteFila}>
                  <input
                    className={styles.input}
                    type="number"
                    min={1}
                    aria-label={`Cantidad de «${paq.titulo}»`}
                    value={cantidades[paq.clave] ?? "1"}
                    onChange={(e) => setCantidades((c) => ({ ...c, [paq.clave]: e.target.value }))}
                  />
                  <button
                    type="button"
                    className={styles.primaryBtn}
                    disabled={Boolean(aplicando) || !detalle}
                    onClick={async () => {
                      const n = Math.max(1, Math.round(Number(cantidades[paq.clave] ?? "1") || 1));
                      setAplicando(paq.clave);
                      try {
                        await onAplicarPaquete(paq.clave, n);
                      } finally {
                        setAplicando(null);
                      }
                    }}
                  >
                    {aplicando === paq.clave ? "Agregando…" : "Agregar"}
                  </button>
                </div>
              </div>
            ))}
          </div>
          {!detalle ? <p className={styles.pista}>Los paquetes se habilitan en cuanto el borrador se guarda.</p> : null}
        </div>
      ) : null}

      <div className={styles.totales}>
        <div className={styles.totalesCaja} aria-label="Totales">
          {gruposConImporte.length > 1
            ? gruposConImporte.map((g) => (
                <div className={styles.totalGrupo} key={g}>
                  <span>{GRUPO_LABEL[g]}</span>
                  <span>{formatoMoneda(totales.porGrupo[g], moneda)}</span>
                </div>
              ))
            : null}
          <div className={styles.totalFila}>
            <span>Subtotal</span>
            <span>{formatoMoneda(totales.subtotal, moneda)}</span>
          </div>
          <div className={styles.totalFila}>
            <span>IVA</span>
            <span>{formatoMoneda(totales.iva, moneda)}</span>
          </div>
          <div className={styles.totalGrande}>
            <span>Total</span>
            <span data-testid="total-cotizacion">{formatoMoneda(totales.total, moneda)}</span>
          </div>
        </div>
      </div>

      <hr className={styles.separador} />

      <div className={styles.hojaCabeza} style={{ marginBottom: 4 }}>
        <div className={styles.hojaTitulos}>
          <h3 className={styles.tituloSeccion} style={{ fontSize: "0.9rem" }}>
            Términos y condiciones
          </h3>
          <p className={styles.ayudaSeccion}>
            {detalle
              ? `${MODALIDAD[detalle.terminos.modalidad] ?? ""} Cada término viene del segmento; si lo reescribes, se queda como lo escribiste.`
              : "Se arman al guardar, según el segmento y lo que cobres. Después puedes reescribir cualquiera."}
          </p>
        </div>
      </div>

      {detalle ? (
        <ul className={styles.terminos}>
          {orden.map((clave) => {
            const textoBase = base(clave);
            const propio = doc.terminos[clave];
            const editado = propio != null && propio.trim() !== textoBase.trim();
            const valor = propio ?? textoBase;
            if (!editable && !valor.trim()) return null;
            return (
              <li key={clave} className={styles.termino}>
                <div className={styles.terminoCabeza}>
                  <span className={styles.terminoTitulo}>{tituloDe(clave)}</span>
                  {editado ? <span className={styles.editado}>Editado</span> : null}
                  {clave === "pago" && !esLicitacion ? (
                    <label className={styles.anticipo}>
                      Anticipo
                      <input
                        className={styles.input}
                        type="number"
                        min={0}
                        max={100}
                        value={doc.depositPercent}
                        disabled={!editable}
                        onChange={(e) => cambiar((d) => ({ ...d, depositPercent: Number(e.target.value) }))}
                      />
                      %
                    </label>
                  ) : null}
                  {editado && editable ? (
                    <button
                      type="button"
                      className={styles.linkBtn}
                      style={{ fontSize: "0.74rem" }}
                      onClick={() =>
                        cambiar((d) => {
                          const terminos = { ...d.terminos };
                          delete terminos[clave];
                          return { ...d, terminos };
                        })
                      }
                    >
                      Restablecer
                    </button>
                  ) : null}
                </div>
                <TextoAuto
                  value={valor}
                  disabled={!editable}
                  aria-label={tituloDe(clave)}
                  placeholder={clave === "otras" ? "Otra condición (opcional): garantías, tiempos de entrega, moneda…" : ""}
                  onValor={(v) =>
                    cambiar((d) => {
                      const terminos = { ...d.terminos };
                      if (v.trim() === textoBase.trim()) delete terminos[clave];
                      else terminos[clave] = v;
                      return { ...d, terminos };
                    })
                  }
                />
              </li>
            );
          })}
          <li className={styles.termino}>
            <span className={styles.terminoTitulo}>Vigencia</span>
            <p className={styles.frase} style={{ margin: "4px 0 0" }}>
              {vigencia ? `${vigencia} días naturales a partir de la fecha de emisión de esta propuesta.` : "Pon la fecha de validez arriba y se escribe sola."}
            </p>
          </li>
        </ul>
      ) : null}
    </Hoja>
  );
}
