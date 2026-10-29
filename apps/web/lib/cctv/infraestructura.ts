/**
 * Lo que hay detrás de las cámaras: grabación (disco y ancho de banda), energía PoE y
 * cable UTP. Son estimaciones de diseño para la propuesta; los valores por omisión
 * (bitrate por resolución, holgura, loop de servicio) se pueden cambiar por proyecto.
 *
 * El diseñador de SYSCOM guarda lo mismo en `infra` (holgura 1.2, loop 6 m, retención 30
 * días, H.265, 100 % de actividad) y valida el gabinete por PoE, canales, TB y Mbps.
 */
import { distancia, type Punto } from "./plano";

export type Codec = "h264" | "h265" | "h265+";

export const ETIQUETA_CODEC: Readonly<Record<Codec, string>> = {
  h264: "H.264",
  h265: "H.265",
  "h265+": "H.265+ (inteligente)",
};

/** Cuánto ocupa cada codec frente a H.264 con la misma imagen. */
export const FACTOR_CODEC: Readonly<Record<Codec, number>> = { h264: 1, h265: 0.5, "h265+": 0.3 };

/**
 * Flujo principal típico a 15 cuadros por segundo en H.264 (Mbps), por megapíxeles. Es el
 * que recomiendan los fabricantes para escena con movimiento normal.
 */
const MBPS_H264_POR_MP: ReadonlyArray<[number, number]> = [
  [1, 2],
  [2, 4],
  [3, 5],
  [4, 6],
  [5, 7],
  [6, 8],
  [8, 12],
  [12, 16],
];

/** Mbps de una cámara con su resolución y codec (se interpola entre los escalones). */
export function mbpsCamara(mp: number, codec: Codec, fps = 15): number {
  const tabla = MBPS_H264_POR_MP;
  let base: number;
  if (mp <= tabla[0][0]) base = tabla[0][1] * Math.max(mp, 0.3);
  else if (mp >= tabla[tabla.length - 1][0]) base = (tabla[tabla.length - 1][1] * mp) / tabla[tabla.length - 1][0];
  else {
    const i = tabla.findIndex(([m]) => m >= mp);
    const [m0, b0] = tabla[i - 1];
    const [m1, b1] = tabla[i];
    base = b0 + ((b1 - b0) * (mp - m0)) / (m1 - m0);
  }
  return base * FACTOR_CODEC[codec] * (fps / 15);
}

export type Grabacion = {
  retencionDias: number;
  codec: Codec;
  /** Porcentaje del día que se graba (100 = continuo; 30 = por movimiento, aprox.). */
  actividadPct: number;
  fps?: number;
};

export const GRABACION_POR_OMISION: Grabacion = { retencionDias: 30, codec: "h265", actividadPct: 100, fps: 15 };

/** Terabytes (decimales, como los vende el fabricante) para guardar la retención pedida. */
export function almacenamientoTB(camarasMp: readonly number[], g: Grabacion): number {
  const mbps = camarasMp.reduce((s, mp) => s + mbpsCamara(mp, g.codec, g.fps), 0);
  const segundos = 86_400 * g.retencionDias * (Math.min(Math.max(g.actividadPct, 0), 100) / 100);
  return (mbps * segundos) / 8 / 1_000_000;
}

/** Ancho de banda de grabación que entra al NVR. */
export function anchoBandaMbps(camarasMp: readonly number[], g: Pick<Grabacion, "codec" | "fps">): number {
  return camarasMp.reduce((s, mp) => s + mbpsCamara(mp, g.codec, g.fps), 0);
}

/** Capacidad útil de un disco: el sistema de archivos se come cerca del 7 %. */
export const FACTOR_UTIL_DISCO = 0.93;

/** Cuántos discos de `tamanoTB` hacen falta. */
export function discosNecesarios(tb: number, tamanoTB: number): number {
  if (!(tamanoTB > 0)) return 0;
  return Math.max(1, Math.ceil(tb / (tamanoTB * FACTOR_UTIL_DISCO)));
}

/* ── PoE ────────────────────────────────────────────────────────────────────────── */

/** Consumo típico cuando la ficha no lo trae (W, con IR encendido). */
export const WATTS_POR_TIPO: Readonly<Record<"domo" | "bala" | "ptz" | "panoramica" | "otra", number>> = {
  domo: 6,
  bala: 8,
  ptz: 25,
  panoramica: 12,
  otra: 8,
};

/** Clase PoE que alcanza para un consumo. */
export function clasePoe(watts: number): "802.3af" | "802.3at" | "802.3bt" | "fuera de PoE" {
  if (watts <= 12.95) return "802.3af";
  if (watts <= 25.5) return "802.3at";
  if (watts <= 71.3) return "802.3bt";
  return "fuera de PoE";
}

/** Presupuesto PoE del switch con 20 % de margen. */
export function presupuestoPoe(watts: readonly number[], margen = 1.2): number {
  return watts.reduce((s, w) => s + w, 0) * margen;
}

/* ── Cable ──────────────────────────────────────────────────────────────────────── */

export type ReglasCable = {
  /** Multiplicador por curvas, subidas y amarres (1.2 = 20 % extra). */
  holgura: number;
  /** Metros de reserva en cada punta (loop de servicio). */
  loopServicioM: number;
};

export const REGLAS_CABLE_POR_OMISION: ReglasCable = { holgura: 1.2, loopServicioM: 6 };

/** Largo máximo de un enlace UTP (canal completo, TIA-568). */
export const LIMITE_UTP_M = 100;
/** Enlace permanente: a partir de aquí se avisa. */
export const AVISO_UTP_M = 90;

export const METROS_POR_BOBINA = 305;

/**
 * Metros de cable de una cámara al gabinete: la ruta en planta, más la bajada desde la
 * cámara y la subida al gabinete, por la holgura, más el loop de servicio.
 */
export function largoCable(params: {
  ruta: readonly Punto[];
  metrosPorPx?: number;
  alturaCamaraM: number;
  alturaGabineteM?: number;
  /** Altura del plafón o charola por donde corre el cable. */
  alturaRecorridoM?: number;
  reglas?: ReglasCable;
}): { rutaM: number; totalM: number; estado: "ok" | "aviso" | "excede" } {
  const escala = params.metrosPorPx ?? 1;
  let rutaM = 0;
  for (let i = 1; i < params.ruta.length; i++) rutaM += distancia(params.ruta[i - 1], params.ruta[i]) * escala;
  const recorrido = params.alturaRecorridoM ?? params.alturaCamaraM;
  const verticales =
    Math.abs(recorrido - params.alturaCamaraM) + Math.abs(recorrido - (params.alturaGabineteM ?? 1.5));
  const reglas = params.reglas ?? REGLAS_CABLE_POR_OMISION;
  const totalM = (rutaM + verticales) * reglas.holgura + reglas.loopServicioM;
  const estado = totalM > LIMITE_UTP_M ? "excede" : totalM > AVISO_UTP_M ? "aviso" : "ok";
  return { rutaM, totalM, estado };
}

/** Bobinas de 305 m para un total de metros. */
export function bobinas(totalM: number): number {
  return totalM > 0 ? Math.ceil(totalM / METROS_POR_BOBINA) : 0;
}

/** Canales del NVR comercial que alcanza (4, 8, 16, 32, 64, 128). */
export function canalesNvr(camaras: number): number {
  for (const c of [4, 8, 16, 32, 64, 128]) if (camaras <= c) return c;
  return Math.ceil(camaras / 128) * 128;
}
