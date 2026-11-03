/**
 * Cómo se acomoda el editor. Depende del ancho que le deja Core y no del de la ventana: el menú
 * lateral se come hasta 280 px, así que una pantalla de 1536 px deja menos de lo que parece.
 */
export type AcomodoEditor = {
  /** 3: equipos, lienzo y panel. 2: lienzo y panel, con los equipos en cajón. 1: uno debajo de otro. */
  columnas: 1 | 2 | 3;
  /** Lo que cabe abajo del lienzo: en una fila, con textos cortos, en dos filas o lo mínimo. */
  lienzo: "ancho" | "medio" | "angosto" | "celular";
  /** Las herramientas de dibujo ya no caben a la vista y van dentro de «Dibujar». */
  barraCompacta: boolean;
};

const ANCHO_PANELES = { 1: 0, 2: 320, 3: 582 } as const;

export function acomodoDelEditor(ancho: number): AcomodoEditor {
  const columnas = ancho >= 1400 ? 3 : ancho >= 980 ? 2 : 1;
  const px = ancho - ANCHO_PANELES[columnas];
  return {
    columnas,
    lienzo: px >= 851 ? "ancho" : px >= 779 ? "medio" : px >= 560 ? "angosto" : "celular",
    barraCompacta: px < 720,
  };
}
