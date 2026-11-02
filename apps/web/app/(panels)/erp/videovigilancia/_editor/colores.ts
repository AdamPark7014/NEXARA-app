/** Colores de los niveles DORI en todas las vistas (mockup aprobado 01-11-2026): verde, azul, índigo y violeta. */
import type { NivelCobertura } from "@/lib/cctv/optica";

export const COLOR_NIVEL: Readonly<Record<NivelCobertura, string>> = {
  identificacion: "#0aa870",
  reconocimiento: "#0d8cd9",
  observacion: "#3d5ce6",
  deteccion: "#8c6bd9",
  general: "#9aa3af",
};

export const OPACIDAD_NIVEL: Readonly<Record<NivelCobertura, number>> = {
  identificacion: 0.32,
  reconocimiento: 0.28,
  observacion: 0.28,
  deteccion: 0.2,
  general: 0.12,
};

/** Umbral que se muestra en la leyenda (IEC 62676-4). */
export const LEYENDA_NIVELES: ReadonlyArray<{ nivel: NivelCobertura; etiqueta: string; ppm: string }> = [
  { nivel: "identificacion", etiqueta: "Identificación", ppm: "250 PPM" },
  { nivel: "reconocimiento", etiqueta: "Reconocimiento", ppm: "125 PPM" },
  { nivel: "observacion", etiqueta: "Observación", ppm: "62.5 PPM" },
  { nivel: "deteccion", etiqueta: "Detección", ppm: "25 PPM" },
];
