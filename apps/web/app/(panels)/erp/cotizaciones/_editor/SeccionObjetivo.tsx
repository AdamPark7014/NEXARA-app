"use client";

import { useRef, useState } from "react";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import { Alert, Button, LinkButton } from "@/components/base";
import type { ObjetivoPartes } from "@/lib/cotizaciones-api";
import { itemsDesdeTextos, textosDeItems, type DocumentoCotizacion } from "@/lib/cotizacion-documento";
import { Campo, Hoja, ListaEditable, TextoAuto, Vacio } from "./campos";
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
  excluida,
  onIncluir,
}: {
  /** Apagada en «Personalizar». */
  excluida?: boolean;
  onIncluir?: () => void;
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
      excluida={excluida}
      onIncluir={onIncluir}
      id="objetivo"
      numero="01"
      titulo="Objetivo del proyecto"
      descripcion="Qué gana el cliente: introducción, beneficios y cierre."
      ayuda="Qué gana el cliente. El PDF lo imprime como introducción, «Entre los principales beneficios se encuentran:» con la lista, y cierre. Lo que dejes vacío lo completa con la plantilla del segmento y las cifras de tus partidas."
      acciones={
        editable ? (
          <Button size="sm" iconStart={<AutoAwesomeOutlinedIcon />} onClick={pedirBorrador}>
            Redactar borrador
          </Button>
        ) : null
      }
    >
      {confirmar ? (
        <Alert
          tone="warning"
          role="alert"
          className={styles.avisoBloque}
          action={
            <span className={styles.hojaAcciones}>
              <Button size="sm" variant="tertiary" onClick={() => setConfirmar(false)}>
                Conservar lo mío
              </Button>
              <Button size="sm" onClick={redactar}>
                Reemplazar
              </Button>
            </span>
          }
        >
          ¿Reemplazar lo que escribiste con el borrador del segmento y tus partidas?
        </Alert>
      ) : null}

      {vacio && editable ? (
        <div className={styles.bloque}>
          <Vacio
            titulo="Empieza con un borrador y ajústalo"
            acciones={
              <>
                <Button size="sm" variant="tonal" iconStart={<AutoAwesomeOutlinedIcon />} onClick={redactar}>
                  Redactar borrador
                </Button>
                <Button size="sm" variant="ghost" onClick={() => introRef.current?.focus()}>
                  Escribir desde cero
                </Button>
              </>
            }
          >
            Con el texto del segmento y las cifras de tus partidas.
          </Vacio>
        </div>
      ) : null}

      <div className={styles.campos}>
        <Campo etiqueta="Introducción" htmlFor="obj-intro">
          <TextoAuto
            id="obj-intro"
            ref={introRef}
            value={objetivo.intro}
            onValor={(v) => cambiar((d) => ({ ...d, objetivo: { ...d.objetivo, intro: v } }))}
            placeholder={plantilla?.intro ?? "Este proyecto permitirá contar con…"}
            disabled={!editable}
          />
        </Campo>

        <Campo etiqueta="Beneficios">
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
              El PDF pondría:
              <ol>
                {sugerido.beneficios.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ol>
              {editable ? (
                <LinkButton
                  onClick={() =>
                    cambiar((d) => ({
                      ...d,
                      objetivo: { ...d.objetivo, beneficios: itemsDesdeTextos(sugerido.beneficios) },
                    }))
                  }
                >
                  Usar estos y editarlos
                </LinkButton>
              ) : null}
            </div>
          ) : null}
        </Campo>

        <Campo etiqueta="Cierre" htmlFor="obj-cierre">
          <TextoAuto
            id="obj-cierre"
            value={objetivo.cierre}
            onValor={(v) => cambiar((d) => ({ ...d, objetivo: { ...d.objetivo, cierre: v } }))}
            placeholder={plantilla?.cierre ?? "Como resultado, el cliente dispondrá de…"}
            disabled={!editable}
          />
        </Campo>
      </div>
    </Hoja>
  );
}
