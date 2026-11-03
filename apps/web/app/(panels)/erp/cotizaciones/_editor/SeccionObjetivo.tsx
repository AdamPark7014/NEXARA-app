"use client";

import type { DocumentoCotizacion } from "@/lib/cotizacion-documento";
import { textosDeItems } from "@/lib/cotizacion-documento";
import { Campo, Hoja, ListaEditable, TextoAuto } from "./campos";
import styles from "./editor.module.css";

type Cambiar = (cambio: (doc: DocumentoCotizacion) => DocumentoCotizacion) => void;

/**
 * 01 Alcance ejecutivo: introducción, hasta tres beneficios y el resultado esperado.
 *
 * Lo que se deja vacío lo completa el PDF: la entrada y el resultado del segmento, y los beneficios
 * calculados con las partidas (con sus cifras reales). Para que lo escriba la IA está «Redactar con
 * IA», arriba de esta hoja.
 */
export default function SeccionObjetivo({
  doc,
  cambiar,
  editable,
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
  /** Entrada y cierre del segmento. */
  plantilla: { intro: string; cierre: string } | null;
}) {
  const { objetivo } = doc;
  const beneficiosEscritos = textosDeItems(objetivo.beneficios);
  const vacio = !objetivo.intro.trim() && !beneficiosEscritos.length && !objetivo.cierre.trim();

  return (
    <Hoja
      excluida={excluida}
      onIncluir={onIncluir}
      id="objetivo"
      numero="01"
      titulo="Alcance ejecutivo"
      descripcion="Qué gana el cliente, en pocas líneas."
      ayuda="Abre el PDF: introducción, beneficios y resultado esperado en un recuadro. Lo vacío lo completa la plantilla del segmento con las cifras de tus partidas."
    >
      <div className={styles.campos}>
        {vacio && editable ? <p className={styles.pista}>Si lo dejas vacío, el PDF usa el texto general que ves en gris.</p> : null}
        <Campo etiqueta="Introducción" htmlFor="obj-intro">
          <TextoAuto
            id="obj-intro"
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
            numerada={false}
            editable={editable}
            placeholder="Protección activa: disuasión con luz y audio en el perímetro."
            etiquetaAgregar="Agregar beneficio"
            etiquetaElemento="Beneficio"
          />
          {beneficiosEscritos.length > 3 ? (
            <p className={styles.pista}>Mejor tres o menos: lo demás ya lo dice la tabla de partidas.</p>
          ) : null}
        </Campo>

        <Campo etiqueta="Resultado esperado" htmlFor="obj-cierre">
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
