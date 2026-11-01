"use client";

import CloseIcon from "@mui/icons-material/Close";
import { Button, Input, LinkButton } from "@/components/base";
import { nuevoBloque, type DocumentoCotizacion } from "@/lib/cotizacion-documento";
import { TITULOS_POR_OMISION, type TitulosApartados } from "@/lib/cotizacion-personalizacion";
import type { BloqueAlcance } from "@/lib/cotizaciones-api";
import styles from "./editor.module.css";

type Cambiar = (cambio: (doc: DocumentoCotizacion) => DocumentoCotizacion) => void;

type Fila =
  | { tipo: "titulo"; clave: keyof TitulosApartados; quitar?: () => void }
  | { tipo: "bloque"; indice: number; titulo: string }
  | { tipo: "fija"; titulo: string };

/**
 * Los puntos del índice de la portada. Vienen llenos por omisión (los del diseño de NEXARA, según lo
 * que se cotiza) y aquí se renombran, se quitan o se agregan; cada uno es un apartado del PDF, así que
 * la portada nunca anuncia algo que el documento no trae. El contenido se edita en «02 Alcance técnico».
 */
export default function PuntosPortada({
  doc,
  cambiar,
  editable,
  sugeridos,
  hayPlanos,
}: {
  doc: DocumentoCotizacion;
  cambiar: Cambiar;
  editable: boolean;
  /** Los puntos por omisión de esta cotización (null mientras no se ha guardado). */
  sugeridos: BloqueAlcance[] | null;
  hayPlanos: boolean;
}) {
  const { secciones, titulos } = doc.opciones;
  const propios = doc.bloques.filter((b) => b.titulo.trim());
  const usaSugeridos = !doc.bloques.length && Boolean(sugeridos?.length);

  /** Al tocar un punto por omisión, la lista pasa a ser de esta cotización, con todo y su texto. */
  const conBloques = (d: DocumentoCotizacion): DocumentoCotizacion =>
    d.bloques.length || !sugeridos?.length
      ? d
      : {
          ...d,
          bloques: sugeridos.map((s) =>
            nuevoBloque({ clave: s.clave, titulo: s.titulo, texto: s.texto ?? "", vinetas: s.vinetas }),
          ),
        };

  const setTitulo = (clave: keyof TitulosApartados, valor: string) =>
    cambiar((d) => ({ ...d, opciones: { ...d.opciones, titulos: { ...d.opciones.titulos, [clave]: valor } } }));

  const setSeccion = (clave: "objetivo" | "alcance", valor: boolean) =>
    cambiar((d) => ({ ...d, opciones: { ...d.opciones, secciones: { ...d.opciones.secciones, [clave]: valor } } }));

  const renombrar = (indice: number, valor: string) =>
    cambiar((d) => {
      const base = conBloques(d);
      const objetivo = base.bloques.filter((b) => b.titulo.trim())[indice];
      return { ...base, bloques: base.bloques.map((b) => (b === objetivo ? { ...b, titulo: valor } : b)) };
    });

  const quitar = (indice: number) =>
    cambiar((d) => {
      const base = conBloques(d);
      const objetivo = base.bloques.filter((b) => b.titulo.trim())[indice];
      const bloques = base.bloques.filter((b) => b !== objetivo);
      // Sin ninguno volverían los de siempre: quitar el último es apagar el alcance.
      return bloques.length
        ? { ...base, bloques }
        : { ...base, bloques, opciones: { ...base.opciones, secciones: { ...base.opciones.secciones, alcance: false } } };
    });

  const agregar = () =>
    cambiar((d) => {
      const base = conBloques(d);
      return {
        ...base,
        bloques: [...base.bloques, nuevoBloque({ titulo: "Nuevo punto" })],
        opciones: { ...base.opciones, secciones: { ...base.opciones.secciones, alcance: true } },
      };
    });

  const restablecer = () =>
    cambiar((d) => ({
      ...d,
      bloques: [],
      opciones: {
        ...d.opciones,
        titulos: { objetivo: "", garantias: "", cotizacion: "" },
        secciones: { ...d.opciones.secciones, objetivo: true, alcance: true },
      },
    }));

  const filas: Fila[] = [];
  if (secciones.objetivo) filas.push({ tipo: "titulo", clave: "objetivo", quitar: () => setSeccion("objetivo", false) });
  if (secciones.alcance) {
    const lista = usaSugeridos ? (sugeridos ?? []) : propios;
    lista.forEach((b, indice) => filas.push({ tipo: "bloque", indice, titulo: b.titulo }));
  }
  if (secciones.planos && hayPlanos) filas.push({ tipo: "fija", titulo: "Planos" });
  if (secciones.terminos && doc.segmento !== "LICITACION") filas.push({ tipo: "titulo", clave: "garantias" });
  filas.push({ tipo: "titulo", clave: "cotizacion" });

  const editado =
    !usaSugeridos || !secciones.objetivo || !secciones.alcance || Object.values(titulos).some((t) => t.trim());

  return (
    <div className={styles.campo}>
      <span className={styles.etiqueta}>Puntos de la portada</span>
      <ol className={styles.puntosPortada}>
        {filas.map((fila, i) => {
          const numero = String(i + 1).padStart(2, "0");
          // La fila se identifica por su lugar: al pasar de sugerido a propio, el campo no pierde el foco.
          const key = fila.tipo === "titulo" ? fila.clave : `${fila.tipo}-${fila.tipo === "bloque" ? fila.indice : "planos"}`;
          return (
            <li key={key} className={styles.puntoPortada}>
              <span className={styles.puntoNumero} aria-hidden="true">
                {numero}.
              </span>
              {fila.tipo === "fija" ? (
                <span className={styles.inputFijo}>{fila.titulo}</span>
              ) : fila.tipo === "titulo" ? (
                <Input
                  aria-label={`Punto ${numero} de la portada`}
                  value={titulos[fila.clave]}
                  placeholder={TITULOS_POR_OMISION[fila.clave]}
                  disabled={!editable}
                  onChange={(e) => setTitulo(fila.clave, e.target.value)}
                />
              ) : (
                <Input
                  aria-label={`Punto ${numero} de la portada`}
                  value={fila.titulo}
                  disabled={!editable}
                  onChange={(e) => renombrar(fila.indice, e.target.value)}
                />
              )}
              {editable && (fila.tipo === "bloque" || (fila.tipo === "titulo" && fila.quitar)) ? (
                <button
                  type="button"
                  className={styles.puntoQuitar}
                  aria-label={`Quitar el punto ${numero}`}
                  title="Quitar de la portada y del PDF"
                  onClick={() => (fila.tipo === "bloque" ? quitar(fila.indice) : fila.tipo === "titulo" ? fila.quitar?.() : undefined)}
                >
                  <CloseIcon sx={{ fontSize: 16 }} />
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>
      {editable ? (
        <div className={styles.puntosAcciones}>
          <Button size="sm" variant="tonal" onClick={agregar}>
            + Agregar punto
          </Button>
          {editado ? <LinkButton onClick={restablecer}>Volver a los puntos de siempre</LinkButton> : null}
        </div>
      ) : null}
      <p className={styles.pista}>El contenido de cada punto se edita en «02 Alcance técnico».</p>
    </div>
  );
}
