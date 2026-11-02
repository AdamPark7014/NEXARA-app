/**
 * Qué quiso hacer quien mueve la vista: lo mismo en la maqueta y en el dibujo. Sin three, para que el
 * dibujo 2D no lo cargue.
 */
export type Gesto = "girar" | "deslizar" | "acercar";

export type TipoRueda = "rueda" | "dos-dedos" | "pellizco";
export type EstadoRueda = { dosDedosHasta: number };

/** Tras un gesto de dos dedos, lo que siga en este lapso sigue siendo de dos dedos. */
const MEMORIA_DOS_DEDOS_MS = 400;

/**
 * Qué mandó el navegador. El pellizco llega con Ctrl. Una rueda da saltos de 120 en `wheelDeltaY`,
 * sin moverse de lado; dos dedos dan pasos chicos o lateral. Un paso de 120 a media pasada de dos
 * dedos no vuelve a ser rueda.
 */
export function clasificarRueda(
  e: { ctrlKey: boolean; deltaMode: number; deltaX: number; deltaY: number; wheelDeltaY?: number },
  estado: EstadoRueda,
  ahora: number,
): TipoRueda {
  if (e.ctrlKey) return "pellizco";
  if (e.deltaMode !== 0) return "rueda";
  const w = e.wheelDeltaY;
  const salto = w ? Math.abs(w) >= 120 && Math.abs(w) % 120 === 0 : Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY);
  if (e.deltaX !== 0 || !salto) {
    estado.dosDedosHasta = ahora + MEMORIA_DOS_DEDOS_MS;
    return "dos-dedos";
  }
  if (ahora < estado.dosDedosHasta) {
    estado.dosDedosHasta = ahora + MEMORIA_DOS_DEDOS_MS;
    return "dos-dedos";
  }
  return "rueda";
}

/** Qué hace un botón. El principal hace lo natural de cada vista; los demás, o con tecla, lo otro. */
export function gestoDeBoton(boton: number, teclas: { mayus?: boolean; alt?: boolean; espacio?: boolean }, desdeArriba: boolean): Exclude<Gesto, "acercar"> {
  const principal: Exclude<Gesto, "acercar"> = desdeArriba ? "deslizar" : "girar";
  const otro: Exclude<Gesto, "acercar"> = desdeArriba ? "girar" : "deslizar";
  if (teclas.espacio) return "deslizar";
  if (boton !== 0) return otro;
  return teclas.mayus || teclas.alt ? otro : principal;
}

/** Cuánto acerca: un salto de rueda da 15 %, y un pellizco normal, unos puntos por evento. */
export function factorDeRueda(tipo: "rueda" | "pellizco", deltaY: number): number {
  const d = Math.min(Math.max(deltaY, -120), 120);
  return Math.exp(d * (tipo === "pellizco" ? 0.012 : 0.0016));
}
