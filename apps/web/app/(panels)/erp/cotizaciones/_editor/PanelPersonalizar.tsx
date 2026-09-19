"use client";

import { useId, useState, type ReactNode } from "react";
import type { DocumentoCotizacion } from "@/lib/cotizacion-documento";
import { sumarDias } from "@/lib/cotizacion-documento";
import {
  COLUMNAS_OPCIONALES,
  SECCIONES_OPCIONALES,
  diasDeVigencia,
  resumenOpciones,
  type CondicionesSugeridas,
  type OpcionesCotizacion,
} from "@/lib/cotizacion-personalizacion";
import { Segmentado, TextoAuto } from "./campos";
import styles from "./editor.module.css";

type Cambiar = (cambio: (doc: DocumentoCotizacion) => DocumentoCotizacion) => void;

/** Interruptor tranquilo (casilla con estilo de switch), con su ayuda en una línea. */
function Interruptor({
  activo,
  onCambio,
  etiqueta,
  ayuda,
  bloqueado,
  deshabilitado,
}: {
  activo: boolean;
  onCambio?: (v: boolean) => void;
  etiqueta: string;
  ayuda?: string;
  bloqueado?: boolean;
  deshabilitado?: boolean;
}) {
  const id = useId();
  return (
    <label className={`${styles.interruptor} ${bloqueado ? styles.interruptorBloqueado : ""}`} htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className={styles.interruptorCaja}
        checked={activo}
        disabled={bloqueado || deshabilitado}
        onChange={(e) => onCambio?.(e.target.checked)}
      />
      <span className={styles.interruptorTextos}>
        <span className={styles.interruptorEtiqueta}>{etiqueta}</span>
        {ayuda ? <span className={styles.pista}>{ayuda}</span> : null}
      </span>
    </label>
  );
}

function Grupo({ titulo, children, accion }: { titulo: string; children: ReactNode; accion?: ReactNode }) {
  return (
    <fieldset className={styles.grupoOpciones}>
      <legend className={styles.grupoOpcionesTitulo}>
        <span>{titulo}</span>
        {accion}
      </legend>
      {children}
    </fieldset>
  );
}

/**
 * «Personalizar»: qué lleva el PDF de esta cotización. Cerrado muestra una línea con lo que cambia
 * respecto a lo de siempre; abierto, las opciones en grupos con el mismo estilo del editor.
 */
export default function PanelPersonalizar({
  doc,
  cambiar,
  editable,
  sugeridas,
  autor,
  personas,
  puedeGuardarPlantilla,
  onGuardarPlantilla,
}: {
  doc: DocumentoCotizacion;
  cambiar: Cambiar;
  editable: boolean;
  /** Condiciones comerciales del segmento («Usar las del segmento»). */
  sugeridas: CondicionesSugeridas | null;
  /** Quien la elaboró (firma «Elaboró» por omisión). */
  autor: { nombre: string; cargo?: string | null } | null;
  /** Para «Autorizó»: quienes intervinieron y quien edita. */
  personas: Array<{ nombre: string; cargo?: string | null; userId?: number | null }>;
  puedeGuardarPlantilla: boolean;
  onGuardarPlantilla: (nombre: string, conPartidas: boolean) => Promise<void>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [nombrePlantilla, setNombrePlantilla] = useState("");
  const [conPartidas, setConPartidas] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const listaPersonas = useId();
  const o = doc.opciones;

  const setOpciones = (f: (o: OpcionesCotizacion) => OpcionesCotizacion) => cambiar((d) => ({ ...d, opciones: f(d.opciones) }));
  const vigencia = diasDeVigencia(doc.issueDate, doc.validUntil);

  return (
    <section id="personalizar" data-seccion="portada" className={styles.hoja} aria-labelledby="personalizar-titulo">
      <div className={styles.hojaCabeza}>
        <div className={styles.hojaTitulos}>
          <div className={styles.hojaLinea}>
            <h2 id="personalizar-titulo" className={styles.tituloSeccion}>
              Personalizar
            </h2>
          </div>
          <p className={styles.ayudaSeccion}>{resumenOpciones(o, doc.moneda)}</p>
        </div>
        <div className={styles.hojaAcciones}>
          <button
            type="button"
            className={styles.secondaryBtn}
            aria-expanded={abierto}
            aria-controls="personalizar-cuerpo"
            onClick={() => setAbierto((v) => !v)}
          >
            {abierto ? "Cerrar" : "Ajustar"}
          </button>
        </div>
      </div>

      {abierto ? (
        <div id="personalizar-cuerpo" className={styles.opcionesCuerpo}>
          <Grupo titulo="Secciones incluidas">
            <div className={styles.rejillaInterruptores}>
              <Interruptor activo bloqueado etiqueta="Portada" ayuda="Siempre va" />
              {SECCIONES_OPCIONALES.map((s) => (
                <Interruptor
                  key={s.clave}
                  activo={o.secciones[s.clave]}
                  etiqueta={s.etiqueta}
                  ayuda={s.ayuda}
                  deshabilitado={!editable}
                  onCambio={(v) => setOpciones((x) => ({ ...x, secciones: { ...x.secciones, [s.clave]: v } }))}
                />
              ))}
              <Interruptor activo bloqueado etiqueta="04 Cotización" ayuda="Siempre va" />
            </div>
          </Grupo>

          <Grupo titulo="Columnas de la tabla">
            <div className={styles.rejillaInterruptores}>
              {COLUMNAS_OPCIONALES.map((c) => (
                <Interruptor
                  key={c.clave}
                  activo={o.columnas[c.clave]}
                  etiqueta={c.etiqueta}
                  ayuda={c.ayuda}
                  deshabilitado={!editable}
                  onCambio={(v) => setOpciones((x) => ({ ...x, columnas: { ...x.columnas, [c.clave]: v } }))}
                />
              ))}
            </div>
          </Grupo>

          <Grupo titulo="Carta de presentación">
            <Interruptor
              activo={Boolean(o.carta)}
              etiqueta="Incluir carta"
              ayuda="Primera hoja después de la portada"
              deshabilitado={!editable}
              onCambio={(v) => setOpciones((x) => ({ ...x, carta: v ? x.carta ?? { dirigidaA: "", mensaje: "" } : null }))}
            />
            {o.carta ? (
              <div className={styles.campos}>
                <div className={styles.campos2}>
                  <div className={styles.campo}>
                    <label className={styles.etiqueta} htmlFor="carta-dirigida">
                      Dirigida a
                    </label>
                    <input
                      id="carta-dirigida"
                      className={styles.input}
                      value={o.carta.dirigidaA}
                      disabled={!editable}
                      placeholder="Ing. Laura Pérez"
                      onChange={(e) => setOpciones((x) => ({ ...x, carta: { ...(x.carta ?? { mensaje: "" }), dirigidaA: e.target.value } }))}
                    />
                  </div>
                  <div className={styles.campo}>
                    <label className={styles.etiqueta} htmlFor="carta-cargo">
                      Cargo
                    </label>
                    <input
                      id="carta-cargo"
                      className={styles.input}
                      value={o.carta.cargo ?? ""}
                      disabled={!editable}
                      placeholder="Gerente de compras"
                      onChange={(e) =>
                        setOpciones((x) => ({ ...x, carta: { ...(x.carta ?? { dirigidaA: "", mensaje: "" }), cargo: e.target.value } }))
                      }
                    />
                  </div>
                </div>
                <div className={styles.campo}>
                  <label className={styles.etiqueta} htmlFor="carta-mensaje">
                    Mensaje
                  </label>
                  <TextoAuto
                    id="carta-mensaje"
                    value={o.carta.mensaje}
                    disabled={!editable}
                    placeholder="Por medio de la presente, le hacemos llegar nuestra propuesta para…"
                    onValor={(v) => setOpciones((x) => ({ ...x, carta: { ...(x.carta ?? { dirigidaA: "" }), mensaje: v } }))}
                  />
                </div>
              </div>
            ) : null}
          </Grupo>

          <Grupo
            titulo="Condiciones comerciales"
            accion={
              editable && sugeridas ? (
                <button
                  type="button"
                  className={styles.linkBtn}
                  onClick={() =>
                    cambiar((d) => ({
                      ...d,
                      depositPercent: sugeridas.anticipoPct,
                      validUntil: sumarDias(d.issueDate, sugeridas.vigenciaDias),
                      opciones: {
                        ...d.opciones,
                        condiciones: {
                          formaPago: sugeridas.formaPago,
                          tiempoEntrega: sugeridas.tiempoEntrega,
                          garantia: sugeridas.garantia,
                        },
                      },
                    }))
                  }
                >
                  Usar las del segmento
                </button>
              ) : null
            }
          >
            <p className={styles.pista}>Salen en los términos del PDF. Vacío = ese renglón no se imprime.</p>
            <div className={styles.campos3}>
              <div className={styles.campo}>
                <label className={styles.etiqueta} htmlFor="cond-pago">
                  Forma de pago
                </label>
                <input
                  id="cond-pago"
                  className={styles.input}
                  value={o.condiciones.formaPago}
                  disabled={!editable}
                  placeholder={sugeridas?.formaPago ?? "Transferencia electrónica"}
                  onChange={(e) => setOpciones((x) => ({ ...x, condiciones: { ...x.condiciones, formaPago: e.target.value } }))}
                />
              </div>
              <div className={styles.campo}>
                <label className={styles.etiqueta} htmlFor="cond-anticipo">
                  Anticipo %
                </label>
                <input
                  id="cond-anticipo"
                  className={`${styles.input} ${styles.inputNumero}`}
                  type="number"
                  min={0}
                  max={100}
                  value={doc.depositPercent}
                  disabled={!editable}
                  onChange={(e) => cambiar((d) => ({ ...d, depositPercent: Number(e.target.value) }))}
                />
              </div>
              <div className={styles.campo}>
                <label className={styles.etiqueta} htmlFor="cond-vigencia">
                  Vigencia (días)
                </label>
                <input
                  id="cond-vigencia"
                  className={`${styles.input} ${styles.inputNumero}`}
                  type="number"
                  min={1}
                  max={365}
                  value={vigencia ?? ""}
                  disabled={!editable}
                  placeholder={String(sugeridas?.vigenciaDias ?? 15)}
                  onChange={(e) => {
                    const dias = Math.round(Number(e.target.value));
                    if (dias > 0 && dias <= 365) cambiar((d) => ({ ...d, validUntil: sumarDias(d.issueDate, dias) }));
                  }}
                />
              </div>
              <div className={styles.campo}>
                <label className={styles.etiqueta} htmlFor="cond-entrega">
                  Tiempo de entrega
                </label>
                <input
                  id="cond-entrega"
                  className={styles.input}
                  value={o.condiciones.tiempoEntrega}
                  disabled={!editable}
                  placeholder={sugeridas?.tiempoEntrega ?? "5 días hábiles"}
                  onChange={(e) => setOpciones((x) => ({ ...x, condiciones: { ...x.condiciones, tiempoEntrega: e.target.value } }))}
                />
              </div>
              <div className={`${styles.campo} ${styles.campoAncho}`}>
                <label className={styles.etiqueta} htmlFor="cond-garantia">
                  Garantía
                </label>
                <input
                  id="cond-garantia"
                  className={styles.input}
                  value={o.condiciones.garantia}
                  disabled={!editable}
                  placeholder={sugeridas?.garantia ?? "Garantía del fabricante"}
                  onChange={(e) => setOpciones((x) => ({ ...x, condiciones: { ...x.condiciones, garantia: e.target.value } }))}
                />
              </div>
            </div>
          </Grupo>

          <Grupo titulo="Moneda">
            <Segmentado
              etiqueta="Moneda"
              opciones={[
                { valor: "MXN", etiqueta: "MXN · pesos" },
                { valor: "USD", etiqueta: "USD · dólares" },
              ]}
              valor={doc.moneda}
              deshabilitado={!editable}
              onValor={(m) => cambiar((d) => ({ ...d, moneda: m }))}
            />
            {doc.moneda === "USD" ? (
              <div className={styles.campo}>
                <label className={styles.etiqueta} htmlFor="tipo-cambio">
                  Nota de tipo de cambio
                </label>
                <input
                  id="tipo-cambio"
                  className={styles.input}
                  value={o.tipoCambioNota}
                  disabled={!editable}
                  placeholder="Pagadero en moneda nacional al tipo de cambio publicado en el DOF el día de pago."
                  onChange={(e) => setOpciones((x) => ({ ...x, tipoCambioNota: e.target.value }))}
                />
              </div>
            ) : null}
          </Grupo>

          <Grupo titulo="Firmas">
            <datalist id={listaPersonas}>
              {personas.map((p) => (
                <option key={`${p.userId ?? p.nombre}`} value={p.nombre}>
                  {p.cargo ?? ""}
                </option>
              ))}
            </datalist>
            <div className={styles.campos2}>
              <div className={styles.campo}>
                <label className={styles.etiqueta} htmlFor="firma-elaboro">
                  Elaboró
                </label>
                <input
                  id="firma-elaboro"
                  className={styles.input}
                  list={listaPersonas}
                  value={o.elaboro?.nombre ?? ""}
                  disabled={!editable}
                  placeholder={autor?.nombre || "Quien la elaboró"}
                  onChange={(e) =>
                    setOpciones((x) => ({ ...x, elaboro: e.target.value ? { ...(x.elaboro ?? {}), nombre: e.target.value } : null }))
                  }
                />
              </div>
              <div className={styles.campo}>
                <label className={styles.etiqueta} htmlFor="firma-elaboro-cargo">
                  Cargo
                </label>
                <input
                  id="firma-elaboro-cargo"
                  className={styles.input}
                  value={o.elaboro?.cargo ?? ""}
                  disabled={!editable || !o.elaboro}
                  placeholder={autor?.cargo || "Puesto"}
                  onChange={(e) => setOpciones((x) => ({ ...x, elaboro: x.elaboro ? { ...x.elaboro, cargo: e.target.value } : null }))}
                />
              </div>
            </div>
            <Interruptor
              activo={Boolean(o.autorizo)}
              etiqueta="Agregar «Autorizó»"
              ayuda="Una segunda firma, p. ej. dirección"
              deshabilitado={!editable}
              onCambio={(v) => setOpciones((x) => ({ ...x, autorizo: v ? x.autorizo ?? { nombre: "" } : null }))}
            />
            {o.autorizo ? (
              <div className={styles.campos2}>
                <div className={styles.campo}>
                  <label className={styles.etiqueta} htmlFor="firma-autorizo">
                    Autorizó
                  </label>
                  <input
                    id="firma-autorizo"
                    className={styles.input}
                    list={listaPersonas}
                    value={o.autorizo.nombre}
                    disabled={!editable}
                    placeholder="Nombre de quien autoriza"
                    onChange={(e) => {
                      const nombre = e.target.value;
                      const persona = personas.find((p) => p.nombre === nombre);
                      setOpciones((x) => ({
                        ...x,
                        autorizo: {
                          ...(x.autorizo ?? {}),
                          nombre,
                          ...(persona ? { cargo: persona.cargo ?? x.autorizo?.cargo, userId: persona.userId ?? null } : {}),
                        },
                      }));
                    }}
                  />
                </div>
                <div className={styles.campo}>
                  <label className={styles.etiqueta} htmlFor="firma-autorizo-cargo">
                    Cargo
                  </label>
                  <input
                    id="firma-autorizo-cargo"
                    className={styles.input}
                    value={o.autorizo.cargo ?? ""}
                    disabled={!editable}
                    placeholder="Dirección general"
                    onChange={(e) => setOpciones((x) => ({ ...x, autorizo: x.autorizo ? { ...x.autorizo, cargo: e.target.value } : null }))}
                  />
                </div>
              </div>
            ) : null}
          </Grupo>

          <Grupo titulo="Plantilla">
            <p className={styles.pista}>
              Guarda los textos, secciones, columnas y términos de esta cotización para empezar otras desde aquí. Nada del
              cliente ni del folio.
            </p>
            <div className={styles.filaPlantilla}>
              <input
                className={styles.input}
                aria-label="Nombre de la plantilla"
                placeholder="Nombre de la plantilla, p. ej. CCTV obra 16 cámaras"
                value={nombrePlantilla}
                onChange={(e) => setNombrePlantilla(e.target.value)}
              />
              <label className={styles.casilla}>
                <input type="checkbox" checked={conPartidas} onChange={(e) => setConPartidas(e.target.checked)} />
                Con partidas
              </label>
              <button
                type="button"
                className={styles.secondaryBtn}
                disabled={!puedeGuardarPlantilla || nombrePlantilla.trim().length < 2 || guardando}
                onClick={async () => {
                  setGuardando(true);
                  try {
                    await onGuardarPlantilla(nombrePlantilla.trim(), conPartidas);
                    setNombrePlantilla("");
                  } finally {
                    setGuardando(false);
                  }
                }}
              >
                {guardando ? "Guardando…" : "Guardar como plantilla"}
              </button>
            </div>
            {!puedeGuardarPlantilla ? <p className={styles.pista}>Se habilita en cuanto el borrador se guarda.</p> : null}
          </Grupo>
        </div>
      ) : null}
    </section>
  );
}
