"use client";

import { useMemo, useState } from "react";
import {
  TITULO_TERMINO,
  type ClaveTermino,
  type CotizacionDetalle,
  type PaqueteCotizacion,
} from "@/lib/cotizaciones-api";
import { sumarDias, totalesDePartidas, type DocumentoCotizacion, type PartidaEditor } from "@/lib/cotizacion-documento";
import { Ayuda, Hoja, Segmentado, TextoAuto } from "./campos";
import TablaPartidas from "./TablaPartidas";
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

/**
 * 04 Cotización: datos del encabezado (cliente, teléfono, emisión, folio, validez), partidas como
 * hoja de cálculo, totales alineados con la columna Total y términos y condiciones editables.
 */
export default function SeccionCotizacion({
  doc,
  cambiar,
  editable,
  detalle,
  token,
  paquetes,
  onAplicarPaquete,
  onIncluirTerminos,
}: {
  /** Los términos están apagados en «Personalizar»: se ofrece volver a incluirlos. */
  onIncluirTerminos?: () => void;
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
  const vigencia = diasEntre(doc.issueDate, doc.validUntil);
  const moneda = doc.moneda;
  const terminosIncluidos = doc.opciones.secciones.terminos;

  const setPartidas = (f: (p: PartidaEditor[]) => PartidaEditor[]) => cambiar((d) => ({ ...d, partidas: f(d.partidas) }));

  const base = (clave: ClaveTermino) => detalle?.terminosBase?.partes?.find((p) => p.clave === clave)?.texto ?? "";
  const esLicitacion = (detalle?.terminos.modalidad ?? "") === "LICITACION" || doc.segmento === "LICITACION";
  // Títulos y orden como los imprime el PDF (en licitación se llaman como en las bases).
  // Vigencia, tiempo de entrega y garantía no se reescriben aquí: salen de las fechas y de «Personalizar».
  const partesBase = (detalle?.terminosBase?.partes ?? []).filter(
    (p) => p.clave !== "vigencia" && p.clave !== "entrega" && p.clave !== "garantia",
  );
  const tituloDe = (clave: ClaveTermino) => partesBase.find((p) => p.clave === clave)?.titulo ?? TITULO_TERMINO[clave];
  const orden: ClaveTermino[] = [
    ...partesBase.map((p) => p.clave as ClaveTermino),
    ...TERMINOS_EDITABLES.filter((c) => !partesBase.some((p) => p.clave === c)),
  ];
  const validezRapida = [15, 30, 45].map((dias) => ({ valor: sumarDias(doc.issueDate, dias), etiqueta: `${dias} días` }));

  return (
    <Hoja
      id="cotizacion"
      numero="04"
      titulo="Cotización"
      ayuda="La hoja de cotización del PDF: datos del cliente, tabla de partidas con subtotal, IVA y total, términos y firma. El folio y la moneda salen de la portada y de Personalizar."
      acciones={
        editable ? (
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => setVerPaquetes((v) => !v)}
            aria-expanded={verPaquetes}
            disabled={!paquetes.length}
          >
            Paquetes
          </button>
        ) : null
      }
    >
      <div className={styles.campos3}>
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
            Correo
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
          <span className={`${styles.input} ${styles.inputFijo} ${styles.mono}`} title={detalle?.folio}>
            {detalle?.folio ?? "Se emite al guardar"}
          </span>
        </div>
        <div className={styles.campo}>
          <label className={styles.etiqueta} htmlFor="cot-validez">
            Validez
          </label>
          <div className={styles.campoConAtajos}>
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
              <Segmentado
                etiqueta="Validez rápida"
                opciones={validezRapida}
                valor={doc.validUntil}
                onValor={(v) => cambiar((d) => ({ ...d, validUntil: v }))}
                chico
              />
            ) : null}
          </div>
        </div>
      </div>

      {verPaquetes && editable ? (
        <div className={styles.panelPlantillas}>
          <div className={styles.panelPlantillasCabeza}>
            <span className={styles.etiquetaConAyuda}>
              <span className={styles.etiqueta}>Paquetes</span>
              <Ayuda titulo="los paquetes">
                Un paquete agrega todas sus partidas y su subsección de alcance, con la cantidad que pongas; si lo
                vuelves a aplicar, se recalcula.
              </Ayuda>
            </span>
            <button type="button" className={styles.ghostBtn} onClick={() => setVerPaquetes(false)}>
              Cerrar
            </button>
          </div>
          <div className={styles.paquetes}>
            {paquetes.map((paq) => (
              <div key={paq.clave} className={styles.paquete}>
                <strong>{paq.titulo}</strong>
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
                    className={styles.secondaryBtn}
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
          {!detalle ? <p className={styles.pista}>Se habilitan al guardarse el borrador.</p> : null}
        </div>
      ) : null}

      <div className={styles.bloque}>
        <div className={styles.bloqueCabeza}>
          <span className={styles.etiquetaConAyuda}>
            <span className={styles.etiqueta}>Partidas</span>
            {editable ? (
              <Ayuda titulo="la tabla de partidas">
                Enter agrega una fila · Tab cambia de celda · ↑↓ cambian de fila · Retroceso en una descripción vacía
                quita la fila. La última fila busca en el catálogo mientras escribes; el menú ⋯ de cada renglón tiene
                el grupo (equipos, materiales o mano de obra), subir, bajar y quitar.
              </Ayuda>
            ) : null}
          </span>
          {editable && !doc.partidas.length ? (
            <span className={styles.pista}>Escribe la primera partida y presiona Enter</span>
          ) : null}
        </div>
        <TablaPartidas
          partidas={doc.partidas}
          setPartidas={setPartidas}
          editable={editable}
          moneda={moneda}
          token={token}
          totales={totales}
          columnas={doc.opciones.columnas}
        />
      </div>

      <div className={styles.bloque}>
        <div className={styles.bloqueCabeza}>
          <span className={styles.etiquetaConAyuda}>
            <span className={styles.etiqueta}>Términos y condiciones</span>
            <Ayuda titulo="los términos">
              {detalle
                ? `${MODALIDAD[detalle.terminos.modalidad] ?? ""} Cada término viene del segmento y de lo que cobras; si lo reescribes, se queda como lo escribiste («Restablecer» lo devuelve). El anticipo, la vigencia, el tiempo de entrega y la garantía se cambian en Personalizar.`
                : "Se arman al guardar, según el segmento y lo que cobres."}
            </Ayuda>
          </span>
          {!terminosIncluidos ? <span className={styles.pista}>No van en el PDF (Personalizar)</span> : null}
          {!terminosIncluidos && editable && onIncluirTerminos ? (
            <button type="button" className={styles.secondaryBtn} onClick={onIncluirTerminos}>
              Incluir
            </button>
          ) : null}
        </div>

        {detalle && terminosIncluidos ? (
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
                    placeholder={clave === "otras" ? "Otra condición" : ""}
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
            {doc.opciones.condiciones.tiempoEntrega.trim() ? (
              <li className={styles.termino}>
                <span className={styles.terminoTitulo}>Tiempo de entrega</span>
                <p className={styles.pista}>{doc.opciones.condiciones.tiempoEntrega}</p>
              </li>
            ) : null}
            {doc.opciones.condiciones.garantia.trim() ? (
              <li className={styles.termino}>
                <span className={styles.terminoTitulo}>Garantía</span>
                <p className={styles.pista}>{doc.opciones.condiciones.garantia}</p>
              </li>
            ) : null}
            <li className={styles.termino}>
              <span className={styles.terminoTitulo}>Vigencia</span>
              <p className={styles.pista}>
                {vigencia
                  ? `${vigencia} días naturales a partir de la fecha de emisión de esta propuesta.`
                  : "Pon la fecha de validez arriba y se escribe sola."}
              </p>
            </li>
          </ul>
        ) : null}
      </div>
    </Hoja>
  );
}
