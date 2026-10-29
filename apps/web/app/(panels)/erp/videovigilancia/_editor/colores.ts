/** Colores de los niveles DORI en el plano y en la vista de cámara: tokens de estado de Core. */
import type { NivelCobertura } from "@/lib/cctv/optica";

export const COLOR_NIVEL: Readonly<Record<NivelCobertura, string>> = {
  identificacion: "var(--ui-success)",
  reconocimiento: "var(--ui-info)",
  observacion: "var(--ui-warning)",
  deteccion: "var(--ui-neutral)",
  general: "var(--ui-fg-4)",
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
