"use client";

import { useState, type ReactNode } from "react";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import { Button, Checkbox, Input, LinkButton, Switch } from "@/components/base";
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
import { Ayuda, Segmentado, TextoAuto } from "./campos";
import styles from "./editor.module.css";

type Cambiar = (cambio: (doc: DocumentoCotizacion) => DocumentoCotizacion) => void;

/** Interruptor del sistema (`Switch`), con su ayuda en una línea debajo. */
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
  return (
    <Switch
      className={`${styles.interruptor} ${bloqueado ? styles.interruptorBloqueado : ""}`}
      label={etiqueta}
      description={ayuda}
      checked={activo}
      disabled={bloqueado || deshabilitado}
      onChange={(e) => onCambio?.(e.target.checked)}
    />
  );
}

function Grupo({ titulo, children, accion, ayuda }: { titulo: string; children: ReactNode; accion?: ReactNode; ayuda?: ReactNode }) {
  return (
    <fieldset className={styles.grupoOpciones}>
      <legend className={styles.grupoOpcionesTitulo}>
        <span className={styles.etiquetaConAyuda}>
          <span>{titulo}</span>
          {ayuda ? <Ayuda titulo={titulo.toLowerCase()}>{ayuda}</Ayuda> : null}
        </span>
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
  puedeGuardarPlantilla,
  onGuardarPlantilla,
}: {
  doc: DocumentoCotizacion;
  cambiar: Cambiar;
  editable: boolean;
  /** Condiciones comerciales del segmento («Usar las del segmento»). */
  sugeridas: CondicionesSugeridas | null;
  puedeGuardarPlantilla: boolean;
  onGuardarPlantilla: (nombre: string, conPartidas: boolean) => Promise<void>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [nombrePlantilla, setNombrePlantilla] = useState("");
  const [conPartidas, setConPartidas] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const o = doc.opciones;

  const setOpciones = (f: (o: OpcionesCotizacion) => OpcionesCotizacion) => cambiar((d) => ({ ...d, opciones: f(d.opciones) }));
  const vigencia = diasDeVigencia(doc.issueDate, doc.validUntil);

  return (
    <section id="personalizar" data-seccion="portada" className={styles.hoja} aria-labelledby="personalizar-titulo">
      <div className={`${styles.hojaCabeza} ${abierto ? "" : styles.hojaCabezaSola}`}>
        <span className={styles.numero} aria-hidden>
          <TuneRoundedIcon />
        </span>
        <div className={styles.hojaTitulos}>
          <div className={styles.hojaLinea}>
            <h2 id="personalizar-titulo" className={styles.tituloSeccion}>
              Personalizar
            </h2>
          </div>
          <p className={styles.ayudaSeccion}>
            {abierto ? "Qué secciones y condiciones lleva el PDF." : resumenOpciones(o, doc.moneda)}
          </p>
        </div>
        <div className={styles.hojaAcciones}>
          <Button
            size="sm"
            variant={abierto ? "ghost" : "secondary"}
            aria-expanded={abierto}
            aria-controls="personalizar-cuerpo"
            onClick={() => setAbierto((v) => !v)}
          >
            {abierto ? "Cerrar" : "Ajustar"}
          </Button>
        </div>
      </div>

      {abierto ? (
        <div id="personalizar-cuerpo" className={`${styles.hojaCuerpo} ${styles.opcionesCuerpo}`}>
          <Grupo titulo="Secciones incluidas" ayuda="Lo que se apaga no se imprime y en el editor queda su cabecera con «Incluir»; la portada y la cotización van siempre.">
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
              <Interruptor activo bloqueado etiqueta="04 Propuesta económica" ayuda="Siempre va, con su firma" />
            </div>
          </Grupo>

          <Grupo titulo="Columnas del editor" ayuda="Agregan a la tabla de partidas la captura de marca, modelo y descuento. En el PDF, marca y modelo salen siempre que estén capturados.">
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

          <Grupo
            titulo="Condiciones comerciales"
            ayuda="Alimentan el PDF: la forma de pago completa el renglón del anticipo, el tiempo de entrega va en las condiciones comerciales y la garantía en la póliza. Lo que dejes vacío usa el texto de siempre."
            accion={
              editable && sugeridas ? (
                <LinkButton
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
                          vigencia: d.opciones.condiciones.vigencia,
                        },
                      },
                    }))
                  }
                >
                  Usar las del segmento
                </LinkButton>
              ) : null
            }
          >
            <div className={styles.campos3}>
              <div className={styles.campo}>
                <label className={styles.etiqueta} htmlFor="cond-pago">
                  Forma de pago
                </label>
                <Input
                  id="cond-pago"
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
                <Input
                  id="cond-anticipo"
                  className={styles.inputNumero}
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
                <Input
                  id="cond-vigencia"
                  className={styles.inputNumero}
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
                <Input
                  id="cond-entrega"
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
                <Input
                  id="cond-garantia"
                  value={o.condiciones.garantia}
                  disabled={!editable}
                  placeholder={sugeridas?.garantia ?? "Garantía del fabricante"}
                  onChange={(e) => setOpciones((x) => ({ ...x, condiciones: { ...x.condiciones, garantia: e.target.value } }))}
                />
              </div>
            </div>
          </Grupo>

          <Grupo titulo="Moneda" ayuda="Cambia la moneda de toda la cotización, y en dólares conviene anotar el tipo de cambio que aplica al pagar.">
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
                <Input
                  id="tipo-cambio"
                  value={o.tipoCambioNota}
                  disabled={!editable}
                  placeholder="Tipo de cambio DOF del día de pago"
                  onChange={(e) => setOpciones((x) => ({ ...x, tipoCambioNota: e.target.value }))}
                />
              </div>
            ) : null}
          </Grupo>

          <Grupo titulo="Plantilla" ayuda="Guarda textos, secciones, columnas y términos para empezar otras, sin cliente ni folio, y con «Con partidas» también los precios.">
            <div className={styles.filaPlantilla}>
              <Input
                wrapperClassName={styles.filaPlantillaNombre}
                className={styles.filaPlantillaNombre}
                aria-label="Nombre de la plantilla"
                placeholder="Nombre de la plantilla"
                value={nombrePlantilla}
                onChange={(e) => setNombrePlantilla(e.target.value)}
              />
              <Checkbox label="Con partidas" checked={conPartidas} onChange={(e) => setConPartidas(e.target.checked)} />
              <Button
                loading={guardando}
                disabled={!puedeGuardarPlantilla || nombrePlantilla.trim().length < 2}
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
              </Button>
            </div>
            {!puedeGuardarPlantilla ? <p className={styles.pista}>Se habilita al guardarse el borrador.</p> : null}
          </Grupo>
        </div>
      ) : null}
    </section>
  );
}
