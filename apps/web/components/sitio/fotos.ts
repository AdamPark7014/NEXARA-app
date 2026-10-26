/**
 * Fotos del sitio en webp por tamaño (las genera `scripts/fotos-sitio.py` en public/fotos/v). El navegador
 * baja la variante que necesita en vez del JPG original de 1–1.6 MP.
 */

/** Ancho real de cada JPG original: las variantes nunca son más grandes que él. */
const ORIGINAL: Record<string, number> = {
  "campo-enlace-antena-ciudad": 1600,
  "campo-instalacion-ap-altura": 720,
  "campo-instalacion-rack": 1280,
  "campo-levantamiento-patio": 1086,
  "campo-mastil-antenas": 1200,
  "control-acceso-terminal-facial": 1066,
  "control-acceso-torniquetes": 1600,
  "equipo-nexara-espalda": 1600,
  "equipo-nexara-polos": 1554,
  "monitoreo-pantallas-cctv": 1600,
  "monitoreo-sala-videowall": 1066,
  "monitoreo-videowall": 1200,
  "rack-servidores-led": 1023,
};

const ANCHOS = [480, 960, 1440];

export type Foto = { src: string; srcSet?: string; sizes?: string };

/** `src` + `srcSet` + `sizes` de una foto de public/fotos (por su nombre sin extensión). */
export function foto(nombre: string, sizes = "(max-width: 734px) 100vw, 50vw"): Foto {
  const original = ORIGINAL[nombre];
  if (!original) return { src: `/fotos/${nombre}.jpg`, sizes };
  const variantes = ANCHOS.map((w) => ({ archivo: w, real: Math.min(w, original) })).filter(
    (v, i, todas) => todas.findIndex((o) => o.real === v.real) === i,
  );
  return {
    src: `/fotos/v/${nombre}-${variantes[Math.min(1, variantes.length - 1)].archivo}.webp`,
    srcSet: variantes.map((v) => `/fotos/v/${nombre}-${v.archivo}.webp ${v.real}w`).join(", "),
    sizes,
  };
}
