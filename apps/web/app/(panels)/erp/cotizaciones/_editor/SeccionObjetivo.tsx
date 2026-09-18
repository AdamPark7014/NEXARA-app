"use client";

import { useRef, useState } from "react";
import type { ObjetivoPartes } from "@/lib/cotizaciones-api";
import { itemsDesdeTextos, textosDeItems, type DocumentoCotizacion } from "@/lib/cotizacion-documento";
import { Hoja, ListaEditable, TextoAuto, Vacio } from "./campos";
import styles from "./editor.module.css";

type Cambiar = (cambio: (doc: DocumentoCotizacion) => DocumentoCotizacion) => void;

/**
 * 01 Objetivo del proyecto: introducción, beneficios numerados y cierre, como en la propuesta.
 *
 * Lo que se deja vacío lo completa el PDF: la entrada y el cierre del segmento, y los beneficios
 * calculados con las partidas (con sus cifras reales). Aquí se enseña qué pondría.
 */
export default function SeccionObjetivo({
  doc,
  cambiar,
  editable,
  sugerido,
  plantilla,
}: {
  doc: DocumentoCotizacion;
  cambiar: Cambiar;
  editable: boolean;
  /** Lo que el PDF pondría con las partidas actuales (null en una cotización sin guardar). */
  sugerido: ObjetivoPartes | null;
  /** Entrada y cierre del segmento. */
  plantilla: { intro: string; cierre: string } | null;
}) {
  const [confirmar, setConfirmar] = useState(false);
  const introRef = useRef<HTMLTextAreaElement>(null);
  const { objetivo } = doc;
  const beneficiosEscritos = textosDeItems(objetivo.beneficios);
  const vacio = !objetivo.intro.trim() && !beneficiosEscritos.length && !objetivo.cierre.trim();

  const redactar = () => {
    setConfirmar(false);
    cambiar((d) => ({
      ...d,
      objetivo: {
        intro: sugerido?.intro || plantilla?.intro || "",
        beneficios: itemsDesdeTextos(sugerido?.beneficios ?? []),
        cierre: sugerido?.cierre || plantilla?.cierre || "",
      },
    }));
  };

  const pedirBorrador = () => (vacio ? redactar() : setConfirmar(true));

  return (
    <Hoja
      id="objetivo"
      numero="01"
      titulo="Objetivo del proyecto"
      ayuda="Qué gana el cliente. Lo que dejes vacío lo completa el PDF con la plantilla del segmento."
      acciones={
        editable ? (
          <button type="button" className={styles.secondaryBtn} onClick={pedirBorrador}>
            Redactar borrador
          </button>
        ) : null
      }
    >
      {confirmar ? (
        <div className={`${styles.aviso} ${styles.avisoAlerta}`} role="alert">
          <p>¿Reemplazar lo que escribiste con el borrador del segmento y tus partidas?</p>
          <span className={styles.hojaAcciones}>
            <button type="button" className={styles.secondaryBtn} onClick={redactar}>
              Reemplazar
            </button>
            <button type="button" className={styles.ghostBtn} onClick={() => setConfirmar(false)}>
              Conservar lo mío
            </button>
          </span>
        </div>
      ) : null}

      {vacio && editable ? (
        <div className={styles.bloque}>
          <Vacio
            titulo="Empieza con un borrador y ajústalo"
            acciones={
              <>
                <button type="button" className={styles.secondaryBtn} onClick={redactar}>
                  Redactar borrador
                </button>
                <button type="button" className={styles.ghostBtn} onClick={() => introRef.current?.focus()}>
                  Escribir desde cero
                </button>
              </>
            }
          >
            El borrador toma la entrada y el cierre del segmento y arma los beneficios con las cantidades
            de tus partidas («15 equipos nuevos…»), para que el texto y la tabla digan lo mismo.
          </Vacio>
        </div>
      ) : null}

      <div className={styles.campos}>
      <div className={styles.campo}>
      <label className={styles.etiqueta} htmlFor="obj-intro">
        Introducción
      </label>
      <TextoAuto
        id="obj-intro"
        ref={introRef}
        value={objetivo.intro}
        onValor={(v) => cambiar((d) => ({ ...d, objetivo: { ...d.objetivo, intro: v } }))}
        placeholder={plantilla?.intro ?? "Este proyecto permitirá contar con…"}
        disabled={!editable}
      />
      </div>

      <div className={styles.campo}>
      <span className={styles.etiqueta}>Beneficios · «Entre los principales beneficios se encuentran:»</span>
      <ListaEditable
        items={objetivo.beneficios}
        onCambio={(beneficios) => cambiar((d) => ({ ...d, objetivo: { ...d.objetivo, beneficios } }))}
        numerada
        editable={editable}
        placeholder="Mayor cobertura de vigilancia mediante la incorporación de…"
        etiquetaAgregar="Agregar beneficio"
        etiquetaElemento="Beneficio"
      />
      {!beneficiosEscritos.length && sugerido?.beneficios.length ? (
        <div className={styles.sugerido}>
          Si lo dejas vacío, el PDF pone estos (salen de tus partidas):
          <ol>
            {sugerido.beneficios.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ol>
          {editable ? (
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() =>
                cambiar((d) => ({
                  ...d,
                  objetivo: { ...d.objetivo, beneficios: itemsDesdeTextos(sugerido.beneficios) },
                }))
              }
            >
              Usar estos y editarlos
            </button>
          ) : null}
        </div>
      ) : null}
      </div>

      <div className={styles.campo}>
        <label className={styles.etiqueta} htmlFor="obj-cierre">
          Cierre
        </label>
        <TextoAuto
          id="obj-cierre"
          value={objetivo.cierre}
          onValor={(v) => cambiar((d) => ({ ...d, objetivo: { ...d.objetivo, cierre: v } }))}
          placeholder={plantilla?.cierre ?? "Como resultado, el cliente dispondrá de…"}
          disabled={!editable}
        />
      </div>
      </div>
    </Hoja>
  );
}
